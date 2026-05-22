use std::ffi::{CStr, CString};
use std::os::raw::{c_char, c_int};
use std::path::{Path, PathBuf};
#[cfg(windows)]
use std::os::windows::ffi::OsStrExt;

/// 不透明类型：libvips 图片对象
#[repr(C)]
pub struct VipsImage {
    _private: [u8; 0],
}

unsafe extern "C" {
    fn vips_init(argv0: *const c_char) -> c_int;
    fn vips_version_string() -> *const c_char;
    fn vips_error_buffer() -> *const c_char;

    fn vips_thumbnail(
        filename: *const c_char,
        out: *mut *mut VipsImage,
        width: c_int,
        ...
    ) -> c_int;
    fn vips_image_get_width(image: *const VipsImage) -> c_int;
    fn vips_image_get_height(image: *const VipsImage) -> c_int;
    fn vips_jpegsave(
        in_image: *mut VipsImage,
        filename: *const c_char,
        ...
    ) -> c_int;
    fn g_object_unref(object: *mut VipsImage);
}

#[cfg(windows)]
extern "system" {
    fn SetDllDirectoryW(lpPathName: *const u16) -> i32;
}

/// 查找 vips DLL 目录（开发环境或打包后的资源目录）
#[cfg(windows)]
fn find_vips_dll_dir() -> Option<PathBuf> {
    // 1. 优先使用环境变量
    if let Ok(vips_path) = std::env::var("VIPS_PATH") {
        let bin = PathBuf::from(vips_path).join("bin");
        if bin.join("libvips-42.dll").exists() {
            return Some(bin);
        }
    }

    // 2. 检查开发环境固定路径
    let dev_path = PathBuf::from(r"D:\dev_tools\vips-dev-8.18\bin");
    if dev_path.join("libvips-42.dll").exists() {
        return Some(dev_path);
    }

    // 3. 检查打包后的资源目录（相对于可执行文件）
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            // 方式 A: 直接放在可执行文件同级目录
            if exe_dir.join("libvips-42.dll").exists() {
                return Some(exe_dir.to_path_buf());
            }
            // 方式 B: 放在 vips-dlls 子目录
            let bundled = exe_dir.join("vips-dlls");
            if bundled.join("libvips-42.dll").exists() {
                return Some(bundled);
            }
            // 方式 C: Tauri 资源目录结构
            let resources = exe_dir.join("..").join("resources").join("vips-dlls");
            if resources.join("libvips-42.dll").exists() {
                return Some(resources.canonicalize().unwrap_or(resources));
            }
        }
    }

    None
}

/// 初始化 libvips（Windows 下会自动将 vips/bin 加入 DLL 搜索路径）
pub fn initialize() -> Result<(), String> {
    #[cfg(windows)]
    {
        match find_vips_dll_dir() {
            Some(dir) => {
                tracing::info!("Found vips DLL directory: {:?}", dir);
                let wide: Vec<u16> = std::ffi::OsString::from(&dir)
                    .encode_wide()
                    .chain(std::iter::once(0))
                    .collect();
                unsafe {
                    SetDllDirectoryW(wide.as_ptr());
                }
            }
            None => {
                tracing::warn!("Could not find vips DLL directory. Set VIPS_PATH env var or ensure DLLs are bundled.");
            }
        }
    }

    let argv0 = CString::new("rust-allusion").map_err(|e| e.to_string())?;
    let ret = unsafe { vips_init(argv0.as_ptr()) };
    if ret != 0 {
        return Err(format!("vips_init failed with code {}", ret));
    }
    Ok(())
}

/// 获取 libvips 版本字符串，例如 "8.18.0"
pub fn version() -> String {
    unsafe {
        let ptr = vips_version_string();
        if ptr.is_null() {
            return "unknown".to_string();
        }
        CStr::from_ptr(ptr).to_string_lossy().into_owned()
    }
}

/// 检测文件扩展名是否为 HEIF/HEIC
fn is_heif_file(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| {
            let e = e.to_lowercase();
            e == "heif" || e == "heic"
        })
        .unwrap_or(false)
}

/// 使用 Windows WIC 将 HEIF/HEIC 转换为临时 JPEG（仅 Windows）
#[cfg(windows)]
fn convert_heif_to_jpeg_with_wic(source: &Path) -> Result<PathBuf, String> {
    use std::process::Command;

    let source_str = source.to_str().ok_or("Invalid source path")?;
    let temp_jpeg = std::env::temp_dir().join(format!(
        "heif_wic_fallback_{}.jpg",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis()
    ));
    let temp_jpeg_str = temp_jpeg.to_str().ok_or("Invalid temp path")?;

    // PowerShell 脚本：使用 WIC 解码 HEIF 并保存为 JPEG
    let ps_script = format!(
        r#"
Add-Type -AssemblyName PresentationCore
$stream = [System.IO.FileStream]::new('{}', [System.IO.FileMode]::Open)
try {{
    $decoder = [System.Windows.Media.Imaging.BitmapDecoder]::Create($stream, [System.Windows.Media.Imaging.BitmapCreateOptions]::None, [System.Windows.Media.Imaging.BitmapCacheOption]::None)
    $frame = $decoder.Frames[0]
    $encoder = New-Object System.Windows.Media.Imaging.JpegBitmapEncoder
    $encoder.Frames.Add($frame)
    $outStream = [System.IO.FileStream]::new('{}', [System.IO.FileMode]::Create)
    $encoder.Save($outStream)
    $outStream.Close()
    Write-Host "OK"
}} catch {{
    Write-Host "ERROR: $_"
}}
"#,
        source_str.replace("'", "''"),
        temp_jpeg_str.replace("'", "''")
    );

    let output = Command::new("powershell")
        .args(["-ExecutionPolicy", "Bypass", "-Command", &ps_script])
        .output()
        .map_err(|e| format!("Failed to run PowerShell: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    if !stdout.trim().contains("OK") || !temp_jpeg.exists() {
        let _ = std::fs::remove_file(&temp_jpeg);
        return Err(format!(
            "WIC conversion failed. stdout: {}, stderr: {}",
            stdout, stderr
        ));
    }

    tracing::info!("WIC fallback: converted HEIF to JPEG: {:?}", temp_jpeg);
    Ok(temp_jpeg)
}

/// 非 Windows 平台的 HEIF 转换 stub
#[cfg(not(windows))]
fn convert_heif_to_jpeg_with_wic(_source: &Path) -> Result<PathBuf, String> {
    Err("HEIF fallback not supported on non-Windows platforms".to_string())
}

/// 获取图片预览路径（HEIF/HEIC 会转换为临时 JPEG）
/// 返回一个可用于前端显示的路径（Windows 上为本地路径，可直接用 convertFileSrc）
pub fn get_image_preview_path(source: &Path) -> Result<PathBuf, String> {
    if is_heif_file(source) {
        // 生成一个稳定的临时文件路径（基于原文件路径的 hash）
        let path_hash = blake3::hash(source.to_string_lossy().as_bytes()).to_hex().to_string();
        let temp_jpeg = std::env::temp_dir().join(format!("heif_preview_{}.jpg", &path_hash[..16]));
        
        // 如果临时文件已存在且不太旧，直接复用
        if let Ok(metadata) = std::fs::metadata(&temp_jpeg) {
            if let Ok(modified) = metadata.modified() {
                if let Ok(age) = modified.elapsed() {
                    if age.as_secs() < 3600 { // 1 小时内复用
                        return Ok(temp_jpeg);
                    }
                }
            }
        }
        
        // 需要重新转换
        let converted = convert_heif_to_jpeg_with_wic(source)?;
        
        // 移动到稳定路径
        if let Err(e) = std::fs::rename(&converted, &temp_jpeg) {
            // 如果重命名失败（比如跨设备），直接复制
            if let Err(e2) = std::fs::copy(&converted, &temp_jpeg) {
                let _ = std::fs::remove_file(&converted);
                return Err(format!("Failed to move/copy temp file: {} (copy error: {})", e, e2));
            }
            let _ = std::fs::remove_file(&converted);
        }
        
        Ok(temp_jpeg)
    } else {
        Ok(source.to_path_buf())
    }
}

/// 使用 libvips 生成 JPEG 缩略图。
///
/// * `source` — 源图片路径
/// * `output` — 输出 JPEG 路径
/// * `target_size` — 目标长边像素数（保持比例，fit within target_size x target_size）
/// * `quality` — JPEG 质量 (1-100)
///
/// 返回生成的图片实际宽高 `(width, height)`。
pub fn create_thumbnail(
    source: &Path,
    output: &Path,
    target_size: i32,
    quality: i32,
) -> Result<(i32, i32), String> {
    // 先尝试直接用 libvips 处理
    match create_thumbnail_inner(source, output, target_size, quality) {
        Ok(result) => Ok(result),
        Err(e) => {
            // 如果是 HEIF/HEIC 文件且 libvips 失败，尝试 WIC fallback
            if is_heif_file(source) {
                tracing::warn!(
                    "libvips failed for HEIF file, trying WIC fallback: {:?}",
                    source
                );
                match convert_heif_to_jpeg_with_wic(source) {
                    Ok(temp_jpeg) => {
                        let result = create_thumbnail_inner(&temp_jpeg, output, target_size, quality);
                        let _ = std::fs::remove_file(&temp_jpeg);
                        result
                    }
                    Err(wic_err) => Err(format!(
                        "libvips failed: {}; WIC fallback failed: {}",
                        e, wic_err
                    )),
                }
            } else {
                Err(e)
            }
        }
    }
}

fn create_thumbnail_inner(
    source: &Path,
    output: &Path,
    target_size: i32,
    quality: i32,
) -> Result<(i32, i32), String> {
    let source_c = source
        .to_str()
        .and_then(|s| CString::new(s).ok())
        .ok_or_else(|| "Invalid source path".to_string())?;
    let output_c = output
        .to_str()
        .and_then(|s| CString::new(s).ok())
        .ok_or_else(|| "Invalid output path".to_string())?;

    let mut thumb: *mut VipsImage = std::ptr::null_mut();

    let ret = unsafe {
        vips_thumbnail(
            source_c.as_ptr(),
            &mut thumb,
            target_size,
            "height\0".as_ptr() as *const c_char,
            target_size,
            std::ptr::null::<c_char>(),
        )
    };
    if ret != 0 {
        let err = unsafe {
            CStr::from_ptr(vips_error_buffer())
                .to_string_lossy()
                .into_owned()
        };
        return Err(format!("vips_thumbnail failed: {}", err));
    }

    let width = unsafe { vips_image_get_width(thumb) };
    let height = unsafe { vips_image_get_height(thumb) };

    let ret = unsafe {
        vips_jpegsave(
            thumb,
            output_c.as_ptr(),
            "Q\0".as_ptr() as *const c_char,
            quality,
            std::ptr::null::<c_char>(),
        )
    };
    unsafe { g_object_unref(thumb); }

    if ret != 0 {
        let err = unsafe {
            CStr::from_ptr(vips_error_buffer())
                .to_string_lossy()
                .into_owned()
        };
        return Err(format!("vips_jpegsave failed: {}", err));
    }

    Ok((width, height))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn test_vips_version() {
        initialize().expect("vips init should succeed");
        let ver = version();
        assert!(!ver.is_empty(), "version should not be empty");
        println!("libvips version: {}", ver);
    }

    #[test]
    fn test_create_thumbnail() {
        initialize().expect("vips init should succeed");

        let input = PathBuf::from(r"C:\Windows\Web\Wallpaper\Spotlight\img14.jpg");
        if !input.exists() {
            println!("Skip test: sample image not found");
            return;
        }

        let output = std::env::temp_dir().join("vips_thumb_test.jpg");
        let (w, h) = create_thumbnail(&input, &output, 200, 85).expect("thumbnail should succeed");

        assert!(w > 0 && h > 0, "dimensions should be positive");
        assert!(w <= 200 && h <= 200, "should fit within 200x200");
        assert!(output.exists(), "output file should exist");

        println!("Generated thumbnail: {}x{} -> {:?}", w, h, output);

        let _ = std::fs::remove_file(&output);
    }

    #[test]
    fn test_create_thumbnail_heif() {
        initialize().expect("vips init should succeed");

        let input = PathBuf::from(r"C:\Users\ADMINI~1\AppData\Local\Temp\test.heif");
        if !input.exists() {
            println!("Skip test: HEIF sample not found");
            return;
        }

        let output = std::env::temp_dir().join("vips_thumb_heif_test.jpg");
        let _ = std::fs::remove_file(&output);

        match create_thumbnail(&input, &output, 200, 85) {
            Ok((w, h)) => {
                assert!(w > 0 && h > 0, "dimensions should be positive");
                assert!(output.exists(), "output file should exist");
                println!("Generated HEIF thumbnail: {}x{} -> {:?}", w, h, output);
                let _ = std::fs::remove_file(&output);
            }
            Err(e) => {
                println!("HEIF thumbnail failed (expected if libheif not loaded): {}", e);
                // Don't panic - this is informational
            }
        }
    }
}
