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
}
