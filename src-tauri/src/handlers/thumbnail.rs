use tauri::State;
use std::sync::Arc;
use std::path::{Path, PathBuf};
use crate::models::*;
use crate::db::{self};
use crate::core::ThumbnailGenerator;

/// 【Hash 直接拼接方案】获取缩略图，不存在则生成
/// 
/// 特点：
/// 1. 不查询数据库缩略图表，直接根据 hash 拼接路径检查文件
/// 2. 文件存在直接返回路径
/// 3. 文件不存在则调用生成服务创建缩略图
/// 
/// 特点：
/// 1. 不查询数据库缩略图表
/// 2. 直接根据 hash 拼接路径检查文件
/// 3. 文件不存在时调用生成服务创建缩略图
#[tauri::command]
pub async fn get_or_generate_thumbnail_by_hash(
    state: State<'_, crate::AppState>,
    image_id: i64,
    hash: String,
    image_path: String,
    size_type: String,
    thumbnail_dir: Option<String>,
) -> Result<Option<String>, String> {
    // 优先使用传入的自定义目录，否则使用当前设置目录
    let thumb_dir = if let Some(custom_dir) = thumbnail_dir {
        PathBuf::from(custom_dir)
    } else {
        state.thumbnail_dir.read().await.clone()
    };

    // 构造缩略图文件名：{hash}_{size}.jpg（缩略图统一使用 jpg 格式）
    let filename = format!("{}_{}.jpg", hash, size_type);
    let thumb_path = thumb_dir.join(&filename);

    // 如果文件已存在，直接返回路径（不再检查数据库，前端会缓存）
    if thumb_path.exists() {
        return Ok(Some(thumb_path.to_string_lossy().to_string()));
    }

    // 文件不存在，需要生成缩略图
    let size = ThumbnailSize::from_str(&size_type)
        .ok_or_else(|| format!("Invalid size type: {}", size_type))?;

    let result = state
        .thumbnail_service
        .generate_now(image_id, &image_path, &hash, size)
        .await
        .map_err(|e| e.to_string())?;

    if result.success {
        Ok(result.path)
    } else {
        tracing::warn!("Failed to generate thumbnail for hash {}: {:?}", hash, result.error);
        Ok(None)
    }
}

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

    // 先查询图片获取 hash
    let image = db::ImageRepository::get_by_id(&pool, image_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Image not found".to_string())?;

    let thumbnail = db::ThumbnailRepository::get_by_hash_and_size(&pool, &image.hash, &size_type)
        .await
        .map_err(|e| e.to_string())?;

    let thumb_dir = state.thumbnail_dir.read().await;
    Ok(thumbnail.map(|t| thumb_dir.join(&t.path).to_string_lossy().to_string()))
}

/// 【懒加载方案】获取缩略图路径，如果不存在则生成
/// 
/// 这个命令用于前端按需加载缩略图：
/// 1. 检查缩略图是否已存在
/// 2. 如果不存在，同步生成缩略图
/// 3. 返回缩略图路径（或 null 如果生成失败）
#[tauri::command]
pub async fn get_or_generate_thumbnail(
    state: State<'_, crate::AppState>,
    image_id: i64,
    size_type: String,
) -> Result<Option<String>, String> {
    let pool = state.db.lock().await.clone();
    let thumb_dir = state.thumbnail_dir.read().await.clone();

    // 获取图片信息
    let image = db::ImageRepository::get_by_id(&pool, image_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Image not found".to_string())?;

    // 1. 先检查缩略图是否已存在（使用 hash 查询）
    if let Some(thumbnail) = db::ThumbnailRepository::get_by_hash_and_size(&pool, &image.hash, &size_type)
        .await
        .map_err(|e| e.to_string())?
    {
        // 检查文件是否真实存在（DB 中存的是相对路径）
        let abs_path = thumb_dir.join(&thumbnail.path);
        if abs_path.exists() {
            return Ok(Some(abs_path.to_string_lossy().to_string()));
        }
        // 文件不存在，需要重新生成
    }

    // 2. 解析尺寸类型
    let size = ThumbnailSize::from_str(&size_type)
        .ok_or_else(|| format!("Invalid size type: {}", size_type))?;

    // 3. 生成缩略图
    let result = state
        .thumbnail_service
        .generate_now(image_id, &image.path, &image.hash, size)
        .await
        .map_err(|e| e.to_string())?;

    if result.success {
        Ok(result.path)
    } else {
        // 生成失败，返回 null（前端可以显示占位符）
        tracing::warn!("Failed to generate thumbnail for image {}: {:?}", image_id, result.error);
        Ok(None)
    }
}

#[tauri::command]
pub async fn get_thumbnail_status(
    state: State<'_, crate::AppState>,
    image_id: i64,
) -> Result<ThumbnailStatus, String> {
    let pool = state.db.lock().await;

    // 先查询图片获取 hash
    let image = db::ImageRepository::get_by_id(&pool, image_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Image not found".to_string())?;

    let mut status = db::ThumbnailRepository::get_thumbnail_status(&pool, &image.hash)
        .await
        .map_err(|e| e.to_string())?;

    // 将相对路径拼接为绝对路径
    let thumb_dir = state.thumbnail_dir.read().await;
    status.small_path = status.small_path.map(|p| thumb_dir.join(&p).to_string_lossy().to_string());
    status.medium_path = status.medium_path.map(|p| thumb_dir.join(&p).to_string_lossy().to_string());
    status.large_path = status.large_path.map(|p| thumb_dir.join(&p).to_string_lossy().to_string());

    Ok(status)
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

    // 获取当前缩略图目录
    let thumbnail_dir = state.thumbnail_dir.read().await.clone();
    let thumbnail_dir_arc = Arc::new(tokio::sync::RwLock::new(thumbnail_dir));

    let (generator, _progress_rx) = ThumbnailGenerator::new(pool.clone(), thumbnail_dir_arc, 2);
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
    let thumbnail_dir = state.thumbnail_dir.read().await.clone();

    // 获取所有缩略图记录（使用 image_hash）
    let records = sqlx::query_as::<_, (String, String, String, i64)>(
        "SELECT image_hash, size_type, path, file_size FROM thumbnails"
    )
    .fetch_all(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    let record_count = records.len();
    let mut missing_files = Vec::new();
    let mut empty_files = Vec::new();
    let mut valid_count = 0;

    for (image_hash, size_type, path_str, _db_size) in records {
        // DB 中存的是相对路径，拼接为绝对路径再检查
        let abs_path = thumbnail_dir.join(&path_str);

        if !abs_path.exists() {
            missing_files.push(serde_json::json!({
                "image_hash": image_hash,
                "size_type": size_type,
                "path": abs_path.to_string_lossy().to_string()
            }));
        } else {
            match std::fs::metadata(&abs_path) {
                Ok(metadata) => {
                    let actual_size = metadata.len() as i64;
                    if actual_size == 0 {
                        empty_files.push(serde_json::json!({
                            "image_hash": image_hash,
                            "size_type": size_type,
                            "path": abs_path.to_string_lossy().to_string()
                        }));
                    } else {
                        valid_count += 1;
                    }
                }
                Err(e) => {
                    missing_files.push(serde_json::json!({
                        "image_hash": image_hash,
                        "size_type": size_type,
                        "path": format!("{} (read error: {})", abs_path.to_string_lossy(), e)
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
    let thumbnail_dir = state.thumbnail_dir.read().await.clone();

    // 获取所有缩略图记录（使用 image_hash）
    let records = sqlx::query_as::<_, (String, String, String)> (
        "SELECT image_hash, size_type, path FROM thumbnails"
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut deleted_count = 0;
    let mut regenerated_count = 0;
    let mut failed_count = 0;
    let mut failed_list = Vec::new();

    for (image_hash, size_type, path_str) in records {
        // DB 中存的是相对路径，拼接为绝对路径
        let abs_path = thumbnail_dir.join(&path_str);

        // 检查文件是否存在且有效
        let needs_regen = if !abs_path.exists() {
            true
        } else {
            match std::fs::metadata(&abs_path) {
                Ok(metadata) => metadata.len() == 0,
                Err(_) => true,
            }
        };

        if needs_regen {
            // 删除无效的数据库记录（使用 hash）
            if let Err(e) = sqlx::query("DELETE FROM thumbnails WHERE image_hash = ?1 AND size_type = ?2")
                .bind(&image_hash)
                .bind(&size_type)
                .execute(&pool)
                .await
            {
                tracing::warn!("Failed to delete invalid thumbnail record: {}", e);
            }
            deleted_count += 1;

            // 获取原图信息（通过 hash 查找）
            match db::ImageRepository::get_by_hash(&pool, &image_hash).await {
                Ok(images) if !images.is_empty() => {
                    let image = &images[0];
                    let image_id = image.id;
                    
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
                                tracing::info!("Regenerated thumbnail for hash {} ({})", image_hash, size_type);
                            } else {
                                failed_count += 1;
                                failed_list.push(serde_json::json!({
                                    "image_hash": image_hash,
                                    "size_type": size_type,
                                    "error": result.error.unwrap_or_else(|| "Unknown error".to_string())
                                }));
                            }
                        }
                        Err(e) => {
                            failed_count += 1;
                            failed_list.push(serde_json::json!({
                                "image_hash": image_hash,
                                "size_type": size_type,
                                "error": e.to_string()
                            }));
                        }
                    }
                }
                Ok(_) => {
                    tracing::warn!("Image hash {} not found, cannot regenerate thumbnail", image_hash);
                    failed_count += 1;
                }
                Err(e) => {
                    tracing::warn!("Failed to get image by hash {}: {}", image_hash, e);
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
