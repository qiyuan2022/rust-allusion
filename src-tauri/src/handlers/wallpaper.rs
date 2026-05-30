use std::path::PathBuf;
use tauri::Manager;

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
    app_handle: tauri::AppHandle,
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

    // 生成壁纸文件路径（使用 Tauri 应用数据目录下的 wallpaper 子目录）
    let wallpaper_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?
        .join("wallpaper");

    std::fs::create_dir_all(&wallpaper_dir)
        .map_err(|e| format!("Failed to create wallpaper dir: {}", e))?;

    let wallpaper_path = wallpaper_dir.join("wallpaper.bmp");

    // 裁剪并保存
    crate::core::wallpaper::crop_and_save(
        &processing_source,
        &wallpaper_path,
        crop_x,
        crop_y,
        crop_width,
        crop_height,
    )
    .map_err(|e| format!("Failed to crop image: {}", e))?;

    // 设置为桌面壁纸
    crate::core::wallpaper::set_desktop_wallpaper(&wallpaper_path)
        .map_err(|e| format!("Failed to set wallpaper: {}", e))?;

    tracing::info!(
        "Wallpaper set successfully: {}x{} from {:?} -> {:?}",
        crop_width,
        crop_height,
        source,
        wallpaper_path
    );

    Ok(())
}
