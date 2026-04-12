use tauri::State;
use std::sync::Arc;
use crate::core::{ImageImporter};
use crate::db;

#[tauri::command]
pub async fn scan_folder(
    state: State<'_, crate::AppState>,
    path: String,
    recursive: bool,
) -> Result<Vec<String>, String> {
    let path = std::path::Path::new(&path);

    // 使用 FileMonitor 的扫描功能
    let files = state.file_monitor.scan_directory(path, recursive, 0).await
        .map_err(|e| e.to_string())?;

    // 转换为字符串路径
    let paths: Vec<String> = files
        .into_iter()
        .filter_map(|p| p.to_str().map(|s| s.to_string()))
        .collect();

    Ok(paths)
}

#[tauri::command]
pub async fn import_images(
    state: State<'_, crate::AppState>,
    paths: Vec<String>,
    location_id: i64,
) -> Result<serde_json::Value, String> {
    let pool = state.db.lock().await.clone();
    let thumbnail_service = Arc::clone(&state.thumbnail_service);

    // 转换路径
    let path_bufs: Vec<std::path::PathBuf> = paths.into_iter()
        .map(|p| std::path::PathBuf::from(p))
        .collect();

    // 创建带有缩略图服务的导入器
    let (importer, _progress_rx) = ImageImporter::with_thumbnail_service(
        pool,
        4,
        thumbnail_service
    );

    // 在后台运行导入
    let import_task = tokio::spawn(async move {
        importer.import_batch(path_bufs, location_id).await
    });

    // 等待导入完成
    match import_task.await {
        Ok(Ok(result)) => {
            Ok(serde_json::json!({
                "success": true,
                "imported": result.images.len(),
                "failed": result.failures.len(),
                "skipped": result.skipped.len(),
            }))
        }
        Ok(Err(e)) => Err(e.to_string()),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub async fn compute_file_hash(path: String) -> Result<String, String> {
    let path = std::path::Path::new(&path);
    crate::core::importer::compute_file_hash(path).await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn scan_location(
    state: State<'_, crate::AppState>,
    location_id: i64,
) -> Result<serde_json::Value, String> {
    let pool = state.db.lock().await.clone();

    // 获取位置信息
    let location = db::LocationRepository::get_by_id(&pool, location_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Location not found".to_string())?;

    // 扫描文件夹获取图片路径
    let path = std::path::Path::new(&location.path);
    let image_paths = crate::core::importer::scan_directory(path, location.is_recursive)
        .await
        .map_err(|e| e.to_string())?;

    if image_paths.is_empty() {
        return Ok(serde_json::json!({
            "success": true,
            "scanned": 0,
            "imported": 0,
            "failed": 0,
            "skipped": 0,
        }));
    }

    // 导入图片（使用缩略图服务）
    let thumbnail_service = Arc::clone(&state.thumbnail_service);
    let (importer, _progress_rx) = ImageImporter::with_thumbnail_service(
        pool.clone(),
        4,
        thumbnail_service
    );

    let import_task = tokio::spawn(async move {
        importer.import_batch(image_paths, location_id).await
    });

    match import_task.await {
        Ok(Ok(result)) => {
            // 更新位置的图片计数
            let count = db::ImageRepository::count_by_location(&pool, location_id)
                .await
                .unwrap_or(0);
            let _ = db::LocationRepository::update_image_count(&pool, location_id, count).await;

            Ok(serde_json::json!({
                "success": true,
                "scanned": result.images.len() + result.failures.len() + result.skipped.len(),
                "imported": result.images.len(),
                "failed": result.failures.len(),
                "skipped": result.skipped.len(),
            }))
        }
        Ok(Err(e)) => Err(e.to_string()),
        Err(e) => Err(e.to_string()),
    }
}
