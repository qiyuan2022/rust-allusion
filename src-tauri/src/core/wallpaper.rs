use std::path::{Path, PathBuf};
use anyhow::{Context, Result};
use image::GenericImageView;

/// 裁剪图片并保存为高质量 JPEG
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
    let x = x.min(orig_width - 1);
    let y = y.min(orig_height - 1);
    let width = width.min(orig_width - x);
    let height = height.min(orig_height - y);

    // 裁剪
    let cropped = img.crop_imm(x, y, width, height);

    // 确保输出目录存在
    if let Some(parent) = output.parent() {
        std::fs::create_dir_all(parent)?;
    }

    // 保存为 JPEG（高质量）
    let rgb_img = cropped.to_rgb8();
    let mut file = std::fs::File::create(output)
        .with_context(|| format!("Failed to create output file: {:?}", output))?;

    let mut encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut file, 95);
    encoder
        .encode(&rgb_img, width, height, image::ExtendedColorType::Rgb8)
        .context("Failed to encode JPEG")?;

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

/// Windows: 使用 SystemParametersInfo 设置桌面壁纸
#[cfg(target_os = "windows")]
pub fn set_desktop_wallpaper(image_path: &Path) -> Result<()> {
    let _path_str = image_path
        .as_os_str()
        .to_str()
        .ok_or_else(|| anyhow::anyhow!("Invalid path encoding"))?;

    // 使用绝对路径
    let abs_path = std::fs::canonicalize(image_path)
        .unwrap_or_else(|_| image_path.to_path_buf());
    let abs_path_str = abs_path
        .as_os_str()
        .to_str()
        .ok_or_else(|| anyhow::anyhow!("Invalid path encoding"))?;

    // 使用 PowerShell 设置壁纸（更可靠，支持各种格式）
    let ps_script = format!(
        r#"
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Wallpaper {{
    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    public static extern int SystemParametersInfo(int uAction, int uParam, string lpvParam, int fuWinIni);
}}
"@
[Wallpaper]::SystemParametersInfo(20, 0, "{}", 3)
"#,
        abs_path_str.replace("\\", "\\\\").replace("\"", "\\\"")
    );

    let output = std::process::Command::new("powershell")
        .args(["-ExecutionPolicy", "Bypass", "-Command", &ps_script])
        .output()
        .context("Failed to run PowerShell to set wallpaper")?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(anyhow::anyhow!("PowerShell failed: {}", stderr));
    }

    tracing::info!("Wallpaper set via PowerShell: {:?}", abs_path);
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
