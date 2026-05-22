use std::path::PathBuf;

/// 获取主显示器信息
#[tauri::command]
pub async fn get_primary_monitor_info(
    window: tauri::Window,
) -> Result<serde_json::Value, String> {
    let monitor = window
        .primary_monitor()
        .map_err(|e| format!("Failed to get primary monitor: {}", e))?
        .ok_or("No primary monitor found")?;

    let size = monitor.size();
    let scale_factor = monitor.scale_factor();

    Ok(serde_json::json!({
        "width": size.width as f64 / scale_factor,
        "height": size.height as f64 / scale_factor,
        "scaleFactor": scale_factor,
    }))
}

/// 设置桌面壁纸
///
/// 参数：
/// - image_path: 原图路径
/// - crop_x, crop_y: 裁剪区域左上角坐标（像素）
/// - crop_width, crop_height: 裁剪区域宽高（像素）
#[tauri::command]
pub async fn set_wallpaper(
    image_path: String,
    crop_x: u32,
    crop_y: u32,
    crop_width: u32,
    crop_height: u32,
) -> Result<(), String> {
    let source = std::path::Path::new(&image_path);

    if !source.exists() {
        return Err(format!("Image not found: {}", image_path));
    }

    // 处理 HEIF/HEIC 文件
    let processing_source =
        crate::core::wallpaper::get_source_path_for_processing(source)
            .map_err(|e| format!("Failed to process source image: {}", e))?;

    // 生成临时文件路径（用于壁纸）
    let temp_wallpaper = std::env::temp_dir().join("rust_allusion_wallpaper.jpg");

    // 裁剪并保存
    crate::core::wallpaper::crop_and_save(
        &processing_source,
        &temp_wallpaper,
        crop_x,
        crop_y,
        crop_width,
        crop_height,
    )
    .map_err(|e| format!("Failed to crop image: {}", e))?;

    // 设置为桌面壁纸
    crate::core::wallpaper::set_desktop_wallpaper(&temp_wallpaper)
        .map_err(|e| format!("Failed to set wallpaper: {}", e))?;

    tracing::info!(
        "Wallpaper set successfully: {}x{} from {:?}",
        crop_width,
        crop_height,
        source
    );

    Ok(())
}
