use std::path::{Path, PathBuf};
use anyhow::{Context, Result};
use image::GenericImageView;

/// 裁剪图片并保存为 BMP
///
/// 使用 BMP 格式，因为它是 Windows 的原生位图格式，兼容性最好。
/// 虽然文件较大，但可以确保 Windows 桌面壁纸 API 能正确识别和渲染。
pub fn crop_and_save(
    source: &Path,
    output: &Path,
    x: u32,
    y: u32,
    width: u32,
    height: u32,
) -> Result<(u32, u32)> {
    // 读取原图
    let img = image::open(source)
        .with_context(|| format!("Failed to open image: {:?}", source))?;

    let (orig_width, orig_height) = img.dimensions();

    // 边界修正
    let x = x.min(orig_width.saturating_sub(1));
    let y = y.min(orig_height.saturating_sub(1));
    let width = width.min(orig_width - x);
    let height = height.min(orig_height - y);

    // 裁剪
    let cropped = img.crop_imm(x, y, width, height);

    // 确保输出目录存在
    if let Some(parent) = output.parent() {
        std::fs::create_dir_all(parent)?;
    }

    // 保存为 BMP（Windows 原生格式，绝对兼容）
    let rgb_img = cropped.to_rgb8();
    rgb_img
        .save_with_format(output, image::ImageFormat::Bmp)
        .with_context(|| format!("Failed to save BMP: {:?}", output))?;

    Ok((width, height))
}

/// 获取图片的预览路径（HEIF/HEIC 会自动转换为 JPEG）
pub fn get_source_path_for_processing(source: &Path) -> Result<PathBuf> {
    let ext = source
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase());

    if ext.as_deref() == Some("heif") || ext.as_deref() == Some("heic") {
        crate::vips::get_image_preview_path(source)
            .map_err(|e| anyhow::anyhow!("Failed to convert HEIF: {}", e))
    } else {
        Ok(source.to_path_buf())
    }
}

/// Windows: 使用 SystemParametersInfoW 设置桌面壁纸
///
/// 直接使用 Rust FFI 调用 Windows API，不通过 PowerShell，避免：
/// 1. PowerShell 进程开销
/// 2. 路径转义问题
/// 3. 脚本执行权限问题
#[cfg(target_os = "windows")]
pub fn set_desktop_wallpaper(image_path: &Path) -> Result<()> {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;

    // 确保文件存在
    if !image_path.exists() {
        return Err(anyhow::anyhow!(
            "Wallpaper file not found: {:?}",
            image_path
        ));
    }

    // 使用绝对路径（不使用 canonicalize，避免 \\?\ 前缀）
    let abs_path = if image_path.is_absolute() {
        image_path.to_path_buf()
    } else {
        std::env::current_dir()
            .map_err(|e| anyhow::anyhow!("Failed to get current dir: {}", e))?
            .join(image_path)
    };

    // 转换为宽字符路径
    let wide: Vec<u16> = OsStr::new(&abs_path)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();

    // SPI_SETDESKWALLPAPER = 20
    // SPIF_UPDATEINIFILE = 0x01
    // SPIF_SENDCHANGE = 0x02
    const SPI_SETDESKWALLPAPER: u32 = 20;
    const SPIF_UPDATEINIFILE: u32 = 0x01;
    const SPIF_SENDCHANGE: u32 = 0x02;

    let result = unsafe {
        windows_sys::Win32::UI::WindowsAndMessaging::SystemParametersInfoW(
            SPI_SETDESKWALLPAPER,
            0,
            wide.as_ptr() as *mut _,
            SPIF_UPDATEINIFILE | SPIF_SENDCHANGE,
        )
    };

    if result == 0 {
        let err_code = unsafe { windows_sys::Win32::Foundation::GetLastError() };
        return Err(anyhow::anyhow!(
            "SystemParametersInfoW failed with error code: {}",
            err_code
        ));
    }

    tracing::info!(
        "Wallpaper set via SystemParametersInfoW: {:?}",
        abs_path
    );
    Ok(())
}

/// macOS: 使用 osascript 设置桌面壁纸
#[cfg(target_os = "macos")]
pub fn set_desktop_wallpaper(image_path: &Path) -> Result<()> {
    let path_str = image_path
        .to_str()
        .ok_or_else(|| anyhow::anyhow!("Invalid path"))?;

    let script = format!(
        r#"tell application "Finder" to set desktop picture to POSIX file "{}""#,
        path_str.replace('"', "\\\"")
    );

    let output = std::process::Command::new("osascript")
        .arg("-e")
        .arg(&script)
        .output()
        .context("Failed to execute osascript")?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(anyhow::anyhow!("osascript failed: {}", stderr));
    }

    Ok(())
}

/// Linux (GNOME): 使用 gsettings 设置桌面壁纸
#[cfg(target_os = "linux")]
pub fn set_desktop_wallpaper(image_path: &Path) -> Result<()> {
    let path_str = image_path
        .to_str()
        .ok_or_else(|| anyhow::anyhow!("Invalid path"))?;

    let output = std::process::Command::new("gsettings")
        .args([
            "set",
            "org.gnome.desktop.background",
            "picture-uri",
            &format!("file://{}", path_str),
        ])
        .output()
        .context("Failed to execute gsettings")?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(anyhow::anyhow!("gsettings failed: {}", stderr));
    }

    Ok(())
}
