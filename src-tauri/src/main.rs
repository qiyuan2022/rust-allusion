// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::PathBuf;
use std::sync::Arc;
use tauri::{Manager, State};
use tokio::sync::Mutex;

mod core;
mod db;
mod models;

use core::{
    FileMonitor, ImageImporter, IndexStats, IndexingWorker, SearchService, ThumbnailGenerator,
    ThumbnailService,
};
use db::{DbPool, init_db, ImageRepository};
use models::*;

/// 应用状态
pub struct AppState {
    pub db: Arc<Mutex<DbPool>>,
    pub file_monitor: Arc<FileMonitor>,
    pub thumbnail_service: Arc<ThumbnailService>,
    pub search_service: Arc<SearchService>,
}

// ==================== 图片相关命令 ====================

#[tauri::command]
async fn create_image(
    state: State<'_, AppState>,
    req: CreateImageRequest,
) -> Result<Image, String> {
    let pool = state.db.lock().await;
    db::ImageRepository::create(&pool, req)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_image_by_id(
    state: State<'_, AppState>,
    id: i64,
) -> Result<Option<Image>, String> {
    let pool = state.db.lock().await;
    db::ImageRepository::get_by_id(&pool, id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_image_with_tags(
    state: State<'_, AppState>,
    image_id: i64,
) -> Result<Option<ImageWithTags>, String> {
    let pool = state.db.lock().await;
    db::ImageRepository::get_with_tags(&pool, image_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn list_images(
    state: State<'_, AppState>,
    offset: i64,
    limit: i64,
) -> Result<Vec<Image>, String> {
    let pool = state.db.lock().await;
    db::ImageRepository::list(&pool, offset, limit)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn list_images_with_tags(
    state: State<'_, AppState>,
    offset: i64,
    limit: i64,
    sort_by: Option<String>,
    sort_order: Option<String>,
) -> Result<Vec<ImageWithTags>, String> {
    let pool = state.db.lock().await;
    
    // 解析排序字段
    let sort_column = match sort_by.as_deref() {
        Some("created_at") => "created_at",
        Some("modified_at") => "file_modified_at",
        Some("file_name") => "file_name",
        Some("file_size") => "file_size",
        _ => "file_modified_at",
    };
    
    // 解析排序方向
    let desc = match sort_order.as_deref() {
        Some("asc") => false,
        Some("desc") => true,
        _ => true,
    };
    
    let results = db::ImageRepository::list_with_tags_sort(&pool, offset, limit, sort_column, desc)
        .await
        .map_err(|e| e.to_string())?;
    
    Ok(results.into_iter().map(|(image, tags)| ImageWithTags { image, tags }).collect())
}

#[tauri::command]
async fn list_images_with_thumbnail(
    state: State<'_, AppState>,
    offset: i64,
    limit: i64,
    sort_by: Option<String>,
    sort_order: Option<String>,
) -> Result<Vec<ImageWithThumbnail>, String> {
    let pool = state.db.lock().await;
    
    // 解析排序字段
    let sort_column = match sort_by.as_deref() {
        Some("created_at") => "created_at",
        Some("modified_at") => "file_modified_at",
        Some("file_name") => "file_name",
        Some("file_size") => "file_size",
        _ => "file_modified_at", // 默认
    };
    
    // 解析排序方向
    let desc = match sort_order.as_deref() {
        Some("asc") => false,
        Some("desc") => true,
        _ => true, // 默认降序
    };
    
    let results = db::ImageRepository::list_with_tags_and_thumbnail_sort(
        &pool, offset, limit, sort_column, desc
    )
        .await
        .map_err(|e| e.to_string())?;
    
    Ok(results.into_iter().map(|(image, tags, thumbnail_path)| {
        ImageWithThumbnail { image, tags, thumbnail_path }
    }).collect())
}

#[tauri::command]
async fn get_all_images(
    state: State<'_, AppState>,
    sort_by: Option<String>,
    sort_order: Option<String>,
) -> Result<Vec<ImageWithThumbnail>, String> {
    let pool = state.db.lock().await;
    
    // 解析排序字段
    let sort_column = match sort_by.as_deref() {
        Some("created_at") => "created_at",
        Some("modified_at") => "file_modified_at",
        Some("file_name") => "file_name",
        Some("file_size") => "file_size",
        _ => "file_modified_at",
    };
    
    // 解析排序方向
    let desc = match sort_order.as_deref() {
        Some("asc") => false,
        Some("desc") => true,
        _ => true,
    };
    
    // 使用带缩略图的方法
    let results = db::ImageRepository::get_all_with_tags_and_thumbnail(&pool, sort_column, desc)
        .await
        .map_err(|e| e.to_string())?;
    
    Ok(results.into_iter().map(|(image, tags, thumbnail_path)| {
        ImageWithThumbnail { image, tags, thumbnail_path }
    }).collect())
}

#[tauri::command]
async fn count_images(state: State<'_, AppState>) -> Result<i64, String> {
    let pool = state.db.lock().await;
    db::ImageRepository::count(&pool)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn delete_image(state: State<'_, AppState>, id: i64) -> Result<bool, String> {
    let pool = state.db.lock().await;
    db::ImageRepository::delete(&pool, id)
        .await
        .map_err(|e| e.to_string())
}

// ==================== 标签相关命令 ====================

#[tauri::command]
async fn create_tag(
    state: State<'_, AppState>,
    req: CreateTagRequest,
) -> Result<Tag, String> {
    let pool = state.db.lock().await;
    db::TagRepository::create(&pool, req)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_all_tags(state: State<'_, AppState>) -> Result<Vec<Tag>, String> {
    let pool = state.db.lock().await;
    db::TagRepository::list_all(&pool)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_tag_tree(state: State<'_, AppState>) -> Result<Vec<TagTreeNode>, String> {
    let pool = state.db.lock().await;
    db::TagRepository::get_tree(&pool)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn update_tag(
    state: State<'_, AppState>,
    id: i64,
    req: UpdateTagRequest,
) -> Result<Option<Tag>, String> {
    let pool = state.db.lock().await;
    db::TagRepository::update(&pool, id, req)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn delete_tag(state: State<'_, AppState>, id: i64) -> Result<bool, String> {
    let pool = state.db.lock().await;
    db::TagRepository::delete(&pool, id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn add_tag_to_image(
    state: State<'_, AppState>,
    image_hash: String,
    tag_id: i64,
) -> Result<(), String> {
    let pool = state.db.lock().await;
    db::ImageRepository::add_tag(&pool, &image_hash, tag_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn remove_tag_from_image(
    state: State<'_, AppState>,
    image_hash: String,
    tag_id: i64,
) -> Result<bool, String> {
    let pool = state.db.lock().await;
    db::ImageRepository::remove_tag(&pool, &image_hash, tag_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn add_tags_to_image(
    state: State<'_, AppState>,
    image_hash: String,
    tag_ids: Vec<i64>,
) -> Result<usize, String> {
    let pool = state.db.lock().await;
    db::TagRepository::add_tags_to_image(&pool, &image_hash, tag_ids)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn remove_tags_from_image(
    state: State<'_, AppState>,
    image_hash: String,
    tag_ids: Vec<i64>,
) -> Result<usize, String> {
    let pool = state.db.lock().await;
    db::TagRepository::remove_tags_from_image(&pool, &image_hash, tag_ids)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_image_tags(
    state: State<'_, AppState>,
    image_hash: String,
) -> Result<Vec<Tag>, String> {
    let pool = state.db.lock().await;
    db::TagRepository::get_tags_for_image(&pool, &image_hash)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn clear_image_tags(
    state: State<'_, AppState>,
    image_hash: String,
) -> Result<(), String> {
    let pool = state.db.lock().await;
    db::ImageRepository::clear_tags(&pool, &image_hash)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn move_tag(
    state: State<'_, AppState>,
    id: i64,
    new_parent_id: Option<i64>,
) -> Result<Option<Tag>, String> {
    let pool = state.db.lock().await;
    db::TagRepository::move_tag(&pool, id, new_parent_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_tagged_images(
    state: State<'_, AppState>,
    tag_id: i64,
    offset: i64,
    limit: i64,
) -> Result<Vec<Image>, String> {
    let pool = state.db.lock().await;
    db::ImageRepository::get_by_tag(&pool, tag_id, offset, limit)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_images_by_tags(
    state: State<'_, AppState>,
    tag_ids: Vec<i64>,
    match_mode: String, // "any" (OR) or "all" (AND)
    offset: i64,
    limit: i64,
) -> Result<Vec<Image>, String> {
    let pool = state.db.lock().await;
    
    let result = if match_mode == "all" {
        db::ImageRepository::get_by_tags_and(&pool, tag_ids, offset, limit).await
    } else {
        db::ImageRepository::get_by_tags_or(&pool, tag_ids, offset, limit).await
    };
    
    result.map_err(|e| e.to_string())
}

// ==================== 位置相关命令 ====================

#[tauri::command]
async fn create_location(
    state: State<'_, AppState>,
    req: CreateLocationRequest,
) -> Result<Location, String> {
    let pool = state.db.lock().await;
    db::LocationRepository::create(&pool, req)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_all_locations(state: State<'_, AppState>) -> Result<Vec<Location>, String> {
    let pool = state.db.lock().await;
    db::LocationRepository::list_all(&pool)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn update_location(
    state: State<'_, AppState>,
    id: i64,
    req: UpdateLocationRequest,
) -> Result<Option<Location>, String> {
    let pool = state.db.lock().await;
    db::LocationRepository::update(&pool, id, req)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn delete_location(state: State<'_, AppState>, id: i64) -> Result<bool, String> {
    let pool = state.db.lock().await;
    db::LocationRepository::delete(&pool, id)
        .await
        .map_err(|e| e.to_string())
}

// ==================== 导入相关命令 ====================

#[tauri::command]
async fn scan_folder(
    state: State<'_, AppState>,
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

// ==================== 缩略图相关命令 ====================

#[tauri::command]
async fn generate_thumbnail(
    state: State<'_, AppState>,
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
async fn get_thumbnail_path(
    state: State<'_, AppState>,
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
async fn get_thumbnail_status(
    state: State<'_, AppState>,
    image_id: i64,
) -> Result<ThumbnailStatus, String> {
    let pool = state.db.lock().await;
    
    db::ThumbnailRepository::get_thumbnail_status(&pool, image_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn generate_all_thumbnails(
    state: State<'_, AppState>,
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

/// 检查缩略图完整性（数据库记录 vs 实际文件）
#[tauri::command]
async fn check_thumbnails_integrity(
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    use std::path::Path;
    
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

/// 修复缺失的缩略图（删除无效记录并重新生成）
#[tauri::command]
async fn fix_missing_thumbnails(
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    use std::path::Path;
    
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
                        "small" => models::ThumbnailSize::Small,
                        "medium" => models::ThumbnailSize::Medium,
                        "large" => models::ThumbnailSize::Large,
                        _ => models::ThumbnailSize::Small,
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

#[tauri::command]
async fn import_images(
    state: State<'_, AppState>,
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
async fn compute_file_hash(path: String) -> Result<String, String> {
    let path = std::path::Path::new(&path);
    core::importer::compute_file_hash(path).await
        .map_err(|e| e.to_string())
}

// ==================== 位置扫描命令 ====================

#[tauri::command]
async fn scan_location(
    state: State<'_, AppState>,
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
    let image_paths = core::importer::scan_directory(path, location.is_recursive)
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

// ==================== 搜索相关命令 ====================

#[tauri::command]
async fn search_images(
    state: State<'_, AppState>,
    query: SearchQueryRequest,
) -> Result<SearchResponse, String> {
    state
        .search_service
        .search(query.into())
        .await
        .map(|r| r.into())
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_search_index_status(state: State<'_, AppState>) -> Result<IndexStatus, String> {
    let stats = state
        .search_service
        .get_stats()
        .await
        .map_err(|e| e.to_string())?;

    Ok(IndexStatus {
        indexed_count: stats.indexed_count,
        total_images: stats.total_images,
        is_up_to_date: stats.indexed_count == stats.total_images,
    })
}

#[tauri::command]
async fn rebuild_search_index(state: State<'_, AppState>) -> Result<usize, String> {
    state
        .search_service
        .reindex_all()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_db_migration_status(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let pool = state.db.lock().await;
    
    // 检查 _migrations 表
    let migrations: Vec<(i32, String)> = sqlx::query_as("SELECT version, name FROM _migrations ORDER BY version")
        .fetch_all(&*pool)
        .await
        .map_err(|e| e.to_string())?;
    
    // 检查 thumbnails 表是否存在
    let thumbnails_exists: bool = sqlx::query_scalar(
        "SELECT COUNT(*) > 0 FROM sqlite_master WHERE type='table' AND name='thumbnails'"
    )
    .fetch_one(&*pool)
    .await
    .map_err(|e| e.to_string())?;
    
    // 检查 thumbnails 表结构
    let thumbnails_columns: Vec<(String,)> = if thumbnails_exists {
        sqlx::query_as("SELECT name FROM pragma_table_info('thumbnails')")
            .fetch_all(&*pool)
            .await
            .map_err(|e| e.to_string())?
    } else {
        vec![]
    };
    
    Ok(serde_json::json!({
        "migrations": migrations,
        "thumbnails_table_exists": thumbnails_exists,
        "thumbnails_columns": thumbnails_columns.iter().map(|c| &c.0).collect::<Vec<_>>(),
    }))
}

#[tauri::command]
async fn fix_image_dimensions(state: State<'_, AppState>) -> Result<(usize, usize), String> {
    use std::path::Path;
    
    let pool = state.db.lock().await;
    
    let images = ImageRepository::get_without_dimensions(&pool)
        .await
        .map_err(|e| e.to_string())?;
    
    let total = images.len();
    let mut fixed = 0usize;
    
    for image in images {
        let path = Path::new(&image.path);
        
        // 使用 image crate 获取尺寸
        let result = tokio::task::spawn_blocking({
            let path = path.to_path_buf();
            move || {
                // 使用 ::image crate 获取图片信息
                match ::image::io::Reader::open(&path) {
                    Ok(reader) => {
                        match reader.into_dimensions() {
                            Ok((width, height)) => {
                                Some((width as i32, height as i32))
                            }
                            Err(_) => None,
                        }
                    }
                    Err(_) => None,
                }
            }
        }).await;
        
        if let Ok(Some((width, height))) = result {
            if let Ok(true) = ImageRepository::update_dimensions(&pool, image.id, width, height, None).await {
                fixed += 1;
            }
        }
    }
    
    Ok((fixed, total))
}

#[tauri::command]
async fn rename_image(
    state: State<'_, AppState>,
    image_id: i64,
    new_name: String,
) -> Result<(), String> {
    use std::fs;
    use std::path::Path;
    
    let pool = state.db.lock().await;
    
    // 获取图片信息
    let image = ImageRepository::get_by_id(&pool, image_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or("Image not found")?;
    
    let old_path = Path::new(&image.path);
    let parent = old_path.parent().ok_or("Invalid path")?;
    let extension = old_path.extension().and_then(|e| e.to_str()).unwrap_or("");
    
    // 构建新路径
    let new_filename = if extension.is_empty() {
        new_name.clone()
    } else {
        format!("{}.{}", new_name, extension)
    };
    let new_path = parent.join(&new_filename);
    
    // 重命名文件
    fs::rename(&old_path, &new_path).map_err(|e| format!("Failed to rename file: {}", e))?;
    
    // 更新数据库
    let new_path_str = new_path.to_string_lossy().to_string();
    ImageRepository::update_path(&pool, image_id, &new_path_str, &new_filename)
        .await
        .map_err(|e| e.to_string())?;
    
    Ok(())
}

#[tauri::command]
async fn add_tags_to_images(
    state: State<'_, AppState>,
    image_ids: Vec<i64>,
    tag_ids: Vec<i64>,
) -> Result<usize, String> {
    let pool = state.db.lock().await;
    
    // 获取所有图片的 hash
    let mut hashes = Vec::new();
    for image_id in &image_ids {
        if let Ok(Some(image)) = ImageRepository::get_by_id(&pool, *image_id).await {
            hashes.push(image.hash);
        }
    }
    
    // 批量添加标签
    let mut total_added = 0;
    for hash in &hashes {
        for tag_id in &tag_ids {
            if ImageRepository::add_tag(&pool, hash, *tag_id).await.is_ok() {
                total_added += 1;
            }
        }
    }
    
    Ok(total_added)
}

#[tauri::command]
async fn clear_tags_from_images(
    state: State<'_, AppState>,
    image_ids: Vec<i64>,
) -> Result<(), String> {
    let pool = state.db.lock().await;
    
    // 获取所有图片的 hash 并清除标签
    for image_id in &image_ids {
        if let Ok(Some(image)) = ImageRepository::get_by_id(&pool, *image_id).await {
            let _ = ImageRepository::clear_tags(&pool, &image.hash).await;
        }
    }
    
    Ok(())
}

#[tauri::command]
async fn delete_images(
    state: State<'_, AppState>,
    image_ids: Vec<i64>,
    delete_source_file: bool,
) -> Result<(), String> {
    use std::fs;
    
    let pool = state.db.lock().await;
    
    for image_id in &image_ids {
        // 获取图片信息
        if let Ok(Some(image)) = ImageRepository::get_by_id(&pool, *image_id).await {
            // 如果需要，删除源文件
            if delete_source_file {
                let _ = fs::remove_file(&image.path);
            }
            
            // 删除数据库记录
            ImageRepository::delete(&pool, *image_id)
                .await
                .map_err(|e| e.to_string())?;
        }
    }
    
    Ok(())
}

fn main() {
    tracing_subscriber::fmt::init();
    
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            // 图片
            create_image,
            get_image_by_id,
            get_image_with_tags,
            list_images,
            list_images_with_tags,
            list_images_with_thumbnail,
            get_all_images,
            count_images,
            delete_image,
            // 标签
            create_tag,
            get_all_tags,
            get_tag_tree,
            update_tag,
            delete_tag,
            add_tag_to_image,
            remove_tag_from_image,
            add_tags_to_image,
            remove_tags_from_image,
            get_image_tags,
            clear_image_tags,
            move_tag,
            get_tagged_images,
            get_images_by_tags,
            // 位置
            create_location,
            get_all_locations,
            update_location,
            delete_location,
            // 导入
            scan_folder,
            import_images,
            compute_file_hash,
            // 位置扫描
            scan_location,
            // 缩略图
            generate_thumbnail,
            get_thumbnail_path,
            get_thumbnail_status,
            generate_all_thumbnails,
            check_thumbnails_integrity,
            fix_missing_thumbnails,
            // 搜索
            search_images,
            get_search_index_status,
            rebuild_search_index,
            fix_image_dimensions,
            get_db_migration_status,
            // 右键菜单
            rename_image,
            add_tags_to_images,
            clear_tags_from_images,
            delete_images,
        ])
        .setup(|app| {
            #[cfg(debug_assertions)]
            {
                let window = app.get_webview_window("main").unwrap();
                window.open_devtools();
            }
            
            // 初始化数据库
            let app_handle = app.handle().clone();
            tauri::async_runtime::block_on(async move {
                match init_db(&app_handle).await {
                    Ok(pool) => {
                        // 创建文件监控器
                        let file_monitor = FileMonitor::new()
                            .expect("Failed to create file monitor");
                        
                        // 创建缩略图目录
                        let thumbnail_dir = app_handle
                            .path()
                            .app_data_dir()
                            .expect("Failed to get app data dir")
                            .join("thumbnails");
                        
                        if !thumbnail_dir.exists() {
                            std::fs::create_dir_all(&thumbnail_dir)
                                .expect("Failed to create thumbnails directory");
                        }
                        
                        tracing::info!("Thumbnails directory: {:?}", thumbnail_dir);
                        
                        // 创建缩略图服务
                        let (thumbnail_service, _progress_rx) = ThumbnailService::new(
                            pool.clone(),
                            thumbnail_dir,
                            4, // 最大并发数
                        );
                        
                        // 创建搜索服务
                        let search_index_dir = app_handle
                            .path()
                            .app_data_dir()
                            .expect("Failed to get app data dir")
                            .join("search_index");
                        
                        let search_service = SearchService::new(
                            pool.clone(),
                            search_index_dir,
                        ).expect("Failed to create search service");
                        
                        let search_service = Arc::new(search_service);
                        
                        // 启动后台索引任务
                        let indexing_worker = IndexingWorker::new(Arc::clone(&search_service));
                        indexing_worker.start();
                        
                        app.manage(AppState {
                            db: Arc::new(Mutex::new(pool)),
                            file_monitor: Arc::new(file_monitor),
                            thumbnail_service: Arc::new(thumbnail_service),
                            search_service,
                        });
                        
                        tracing::info!("Application initialized successfully");
                    }
                    Err(e) => {
                        tracing::error!("Failed to initialize database: {}", e);
                    }
                }
            });
            
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
