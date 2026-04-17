use std::ffi::{CStr, CString};
use std::os::raw::{c_char, c_int};
use std::path::Path;
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

/// 初始化 libvips（Windows 下会自动将 vips/bin 加入 DLL 搜索路径）
pub fn initialize() -> Result<(), String> {
    #[cfg(windows)]
    {
        let vips_bin = format!(
            r"{}\bin",
            std::env::var("VIPS_PATH")
                .unwrap_or_else(|_| r"D:\dev_tools\vips-dev-8.18".to_string())
        );
        let wide: Vec<u16> = std::ffi::OsString::from(vips_bin)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();
        unsafe {
            SetDllDirectoryW(wide.as_ptr());
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
