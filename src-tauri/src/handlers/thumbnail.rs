use tauri::State;
use std::sync::Arc;
use std::path::{Path, PathBuf};
use crate::models::*;
use crate::db;
use crate::core::ThumbnailGenerator;

#[tauri::command]
pub async fn generate_thumbnail(
    state: State<'_, crate::AppState>,
    image_id: i64,
    size_type: String,
) -> Result<serde_json::Value, String> {
    // 获取图片信息
    let pool = state.db.lock().await.clone();
    let image = db::ImageRepository::get_by_id(&pool, image_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Image not found".to_string())?;

    // 解析尺寸类型
    let size = ThumbnailSize::from_str(&size_type)
        .ok_or_else(|| format!("Invalid size type: {}", size_type))?;

    // 生成缩略图
    let result = state
        .thumbnail_service
        .generate_now(image_id, &image.path, &image.hash, size)
        .await
        .map_err(|e| e.to_string())?;

    Ok(serde_json::json!({
        "success": result.success,
        "path": result.path,
        "width": result.width,
        "height": result.height,
        "error": result.error,
    }))
}

#[tauri::command]
pub async fn get_thumbnail_path(
    state: State<'_, crate::AppState>,
    image_id: i64,
    size_type: String,
) -> Result<Option<String>, String> {
    let pool = state.db.lock().await;

    let thumbnail = db::ThumbnailRepository::get_by_image_and_size(&pool, image_id, &size_type)
        .await
        .map_err(|e| e.to_string())?;

    Ok(thumbnail.map(|t| t.path))
}

#[tauri::command]
pub async fn get_thumbnail_status(
    state: State<'_, crate::AppState>,
    image_id: i64,
) -> Result<ThumbnailStatus, String> {
    let pool = state.db.lock().await;

    db::ThumbnailRepository::get_thumbnail_status(&pool, image_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn generate_all_thumbnails(
    state: State<'_, crate::AppState>,
    image_id: i64,
) -> Result<serde_json::Value, String> {
    let pool = state.db.lock().await.clone();

    // 获取图片信息
    let image = db::ImageRepository::get_by_id(&pool, image_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Image not found".to_string())?;

    // 获取应用数据目录下的缩略图目录
    let thumbnail_dir = dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("allusion-rs")
        .join("thumbnails");

    let (generator, _progress_rx) = ThumbnailGenerator::new(pool.clone(), thumbnail_dir, 2);
    let generator = Arc::new(generator);

    let results = generator
        .generate_all_sizes(image_id, &image.path, &image.hash)
        .await
        .map_err(|e| e.to_string())?;

    let success_count = results.iter().filter(|r| r.success).count();
    let fail_count = results.len() - success_count;

    Ok(serde_json::json!({
        "success": success_count == 3,
        "total": results.len(),
        "succeeded": success_count,
        "failed": fail_count,
        "results": results.iter().map(|r| {
            serde_json::json!({
                "size": r.task.size.as_str(),
                "success": r.success,
                "path": r.path,
                "width": r.width,
                "height": r.height,
            })
        }).collect::<Vec<_>>(),
    }))
}

#[tauri::command]
pub async fn check_thumbnails_integrity(
    state: State<'_, crate::AppState>,
) -> Result<serde_json::Value, String> {
    let pool = state.db.lock().await;

    // 获取缩略图目录
    let thumbnail_dir = dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("allusion-rs")
        .join("thumbnails");

    // 获取所有缩略图记录
    let records = sqlx::query_as::<_, (i64, String, String, i64)>(
        "SELECT image_id, size_type, path, file_size FROM thumbnails"
    )
    .fetch_all(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    let record_count = records.len();
    let mut missing_files = Vec::new();
    let mut empty_files = Vec::new();
    let mut valid_count = 0;

    for (image_id, size_type, path_str, _db_size) in records {
        let path = Path::new(&path_str);

        if !path.exists() {
            missing_files.push(serde_json::json!({
                "image_id": image_id,
                "size_type": size_type,
                "path": path_str
            }));
        } else {
            match std::fs::metadata(path) {
                Ok(metadata) => {
                    let actual_size = metadata.len() as i64;
                    if actual_size == 0 {
                        empty_files.push(serde_json::json!({
                            "image_id": image_id,
                            "size_type": size_type,
                            "path": path_str
                        }));
                    } else {
                        valid_count += 1;
                    }
                }
                Err(e) => {
                    missing_files.push(serde_json::json!({
                        "image_id": image_id,
                        "size_type": size_type,
                        "path": format!("{} (read error: {})", path_str, e)
                    }));
                }
            }
        }
    }

    // 统计目录中的实际文件数
    let mut actual_file_count = 0;
    if let Ok(entries) = std::fs::read_dir(&thumbnail_dir) {
        for entry in entries.filter_map(|e| e.ok()) {
            let path = entry.path();
            if path.extension().map(|e| e == "jpg").unwrap_or(false) {
                actual_file_count += 1;
            }
        }
    }

    Ok(serde_json::json!({
        "summary": {
            "database_records": record_count,
            "actual_files": actual_file_count,
            "valid_files": valid_count,
            "missing_files": missing_files.len(),
            "empty_files": empty_files.len(),
        },
        "missing_files": missing_files,
        "empty_files": empty_files,
        "thumbnail_dir": thumbnail_dir.to_string_lossy().to_string(),
    }))
}

#[tauri::command]
pub async fn fix_missing_thumbnails(
    state: State<'_, crate::AppState>,
) -> Result<serde_json::Value, String> {
    let pool = state.db.lock().await.clone();
    let thumbnail_service = Arc::clone(&state.thumbnail_service);

    // 获取所有缩略图记录
    let records = sqlx::query_as::<_, (i64, String, String)> (
        "SELECT image_id, size_type, path FROM thumbnails"
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut deleted_count = 0;
    let mut regenerated_count = 0;
    let mut failed_count = 0;
    let mut failed_list = Vec::new();

    for (image_id, size_type, path_str) in records {
        let path = Path::new(&path_str);

        // 检查文件是否存在且有效
        let needs_regen = if !path.exists() {
            true
        } else {
            match std::fs::metadata(path) {
                Ok(metadata) => metadata.len() == 0,
                Err(_) => true,
            }
        };

        if needs_regen {
            // 删除无效的数据库记录
            if let Err(e) = sqlx::query("DELETE FROM thumbnails WHERE image_id = ?1 AND size_type = ?2")
                .bind(image_id)
                .bind(&size_type)
                .execute(&pool)
                .await
            {
                tracing::warn!("Failed to delete invalid thumbnail record: {}", e);
            }
            deleted_count += 1;

            // 获取原图信息
            match db::ImageRepository::get_by_id(&pool, image_id).await {
                Ok(Some(image)) => {
                    // 重新生成缩略图
                    let size = match size_type.as_str() {
                        "small" => ThumbnailSize::Small,
                        "medium" => ThumbnailSize::Medium,
                        "large" => ThumbnailSize::Large,
                        _ => ThumbnailSize::Small,
                    };

                    match thumbnail_service
                        .generate_now(image_id, &image.path, &image.hash, size)
                        .await
                    {
                        Ok(result) => {
                            if result.success {
                                regenerated_count += 1;
                                tracing::info!("Regenerated thumbnail for image {} ({})", image_id, size_type);
                            } else {
                                failed_count += 1;
                                failed_list.push(serde_json::json!({
                                    "image_id": image_id,
                                    "size_type": size_type,
                                    "error": result.error.unwrap_or_else(|| "Unknown error".to_string())
                                }));
                            }
                        }
                        Err(e) => {
                            failed_count += 1;
                            failed_list.push(serde_json::json!({
                                "image_id": image_id,
                                "size_type": size_type,
                                "error": e.to_string()
                            }));
                        }
                    }
                }
                Ok(None) => {
                    tracing::warn!("Image {} not found, cannot regenerate thumbnail", image_id);
                    failed_count += 1;
                }
                Err(e) => {
                    tracing::warn!("Failed to get image {}: {}", image_id, e);
                    failed_count += 1;
                }
            }
        }
    }

    Ok(serde_json::json!({
        "deleted_records": deleted_count,
        "regenerated": regenerated_count,
        "failed": failed_count,
        "failed_list": failed_list,
    }))
}
