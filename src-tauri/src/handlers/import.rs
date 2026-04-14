use tauri::State;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use crate::core::{ImageImporter, ImportProgress};
use crate::db;

/// 扫描文件夹（基础版）
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

/// 批量导入图片（基础版）
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

/// 计算文件哈希
#[tauri::command]
pub async fn compute_file_hash(path: String) -> Result<String, String> {
    let path = std::path::Path::new(&path);
    crate::core::importer::compute_file_hash(path).await
        .map_err(|e| e.to_string())
}

/// 扫描位置（带进度反馈）
/// 
/// 使用 Channel 向前端发送实时进度，支持取消操作
#[tauri::command]
pub async fn scan_location_with_progress(
    state: State<'_, crate::AppState>,
    location_id: i64,
    on_progress: tauri::ipc::Channel<ImportProgress>,
) -> Result<ImportProgress, String> {
    let pool = state.db.lock().await.clone();

    // 获取位置信息
    let location = db::LocationRepository::get_by_id(&pool, location_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Location not found".to_string())?;

    // 创建取消标志
    let cancelled = Arc::new(AtomicBool::new(false));
    let cancelled_clone = Arc::clone(&cancelled);

    // 包装进度发送函数
    let send_progress = move |progress: ImportProgress| -> Result<(), ()> {
        if cancelled_clone.load(Ordering::Relaxed) {
            return Err(());
        }
        on_progress.send(progress).map_err(|_| ())
    };

    // 扫描文件夹（边扫描边发送进度）
    let path = std::path::Path::new(&location.path);
    let mut image_paths = Vec::new();
    
    let walker = if location.is_recursive {
        walkdir::WalkDir::new(path)
    } else {
        walkdir::WalkDir::new(path).max_depth(1)
    };

    for entry in walker.into_iter().filter_map(|e| e.ok()) {
        // 检查是否取消
        if cancelled.load(Ordering::Relaxed) {
            return Ok(ImportProgress::cancelled(0, 0, 0, 0));
        }

        let entry_path = entry.path();
        
        if !entry.file_type().is_file() {
            continue;
        }
        
        if is_supported_image(entry_path) {
            image_paths.push(entry_path.to_path_buf());
            
            // 每扫描到 50 个文件发送一次进度
            if image_paths.len() % 50 == 0 {
                let _ = send_progress(ImportProgress::scanning(
                    image_paths.len(),
                    Some(entry_path)
                ));
            }
        }
    }

    // 发送扫描完成进度
    let _ = send_progress(ImportProgress {
        phase: crate::core::ImportPhase::Scanning,
        total: image_paths.len(),
        processed: image_paths.len(),
        succeeded: 0,
        failed: 0,
        skipped: 0,
        current_file: None,
        percentage: 100,
        message: Some(format!("扫描完成，共发现 {} 个文件", image_paths.len())),
    });

    if image_paths.is_empty() {
        return Ok(ImportProgress::completed(0, 0, 0, 0));
    }

    // 导入图片
    let total = image_paths.len();
    let mut succeeded = 0usize;
    let mut failed = 0usize;
    let mut skipped = 0usize;

    // 使用信号量限制并发数
    let semaphore = Arc::new(tokio::sync::Semaphore::new(4));

    for (idx, image_path) in image_paths.iter().enumerate() {
        // 检查是否取消
        if cancelled.load(Ordering::Relaxed) {
            return Ok(ImportProgress::cancelled(idx, succeeded, failed, skipped));
        }

        let _permit = semaphore.acquire().await.map_err(|e| e.to_string())?;

        // 导入单个文件
        match import_single_with_progress(
            &pool,
            image_path,
            location_id,
            Arc::clone(&state.thumbnail_service),
        ).await {
            Ok(import_result) => {
                match import_result {
                    SingleImportResult::New => succeeded += 1,
                    SingleImportResult::Existing => skipped += 1,
                }
            }
            Err(_) => {
                failed += 1;
            }
        }

        drop(_permit);

        // 每处理 10 个文件或每 1 秒发送一次进度
        if idx % 10 == 0 || idx == total - 1 {
            let progress = ImportProgress::importing(
                total,
                idx + 1,
                succeeded,
                failed,
                skipped,
                Some(image_path),
            );
            
            if send_progress(progress).is_err() {
                // 如果发送失败（前端取消），停止导入
                cancelled.store(true, Ordering::Relaxed);
                return Ok(ImportProgress::cancelled(idx + 1, succeeded, failed, skipped));
            }
        }
    }

    // 更新位置的图片计数
    let count = db::ImageRepository::count_by_location(&pool, &location.path)
        .await
        .unwrap_or(0);
    let _ = db::LocationRepository::update_image_count(&pool, location_id, count).await;

    // 发送完成进度
    let final_progress = ImportProgress::completed(total, succeeded, failed, skipped);
    let _ = send_progress(final_progress.clone());

    Ok(final_progress)
}

/// 单文件导入结果
enum SingleImportResult {
    New,
    Existing,
}

/// 导入单个文件（简化版，用于带进度的扫描）
async fn import_single_with_progress(
    pool: &sqlx::SqlitePool,
    path: &std::path::Path,
    _location_id: i64,
    thumbnail_service: Arc<crate::core::ThumbnailService>,
) -> Result<SingleImportResult, String> {
    use crate::db::{ImageRepository, ThumbnailRepository};
    use crate::models::{CreateImageRequest, ThumbnailSize};
    
    // 计算文件哈希
    let hash = crate::core::importer::compute_file_hash(path)
        .await
        .map_err(|e| e.to_string())?;
    
    // 检查是否已存在
    if let Some(existing) = ImageRepository::get_by_path(pool, path.to_str().unwrap())
        .await
        .map_err(|e| e.to_string())?
    {
        // 【懒加载方案】不补充生成缺失的缩略图，留到首次访问时生成
        // let has_thumbnail = ThumbnailRepository::exists(pool, existing.id, "small")
        //     .await
        //     .unwrap_or(true);
        // 
        // if !has_thumbnail {
        //     let existing_id = existing.id;
        //     let existing_path = existing.path.clone();
        //     let existing_hash = existing.hash.clone();
        //     
        //     tokio::spawn(async move {
        //         let _ = thumbnail_service
        //             .generate_now(existing_id, &existing_path, &existing_hash, ThumbnailSize::Small)
        //             .await;
        //     });
        // }
        
        return Ok(SingleImportResult::Existing);
    }
    
    // 获取文件元数据
    let metadata = tokio::fs::metadata(path)
        .await
        .map_err(|e| e.to_string())?;
    
    let file_name = path.file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();
    let file_size = metadata.len() as i64;
    let file_modified_at = metadata.modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs() as i64)
        .unwrap_or_else(|| chrono::Utc::now().timestamp());
    
    // 获取图片尺寸
    let (width, height, format) = get_image_dimensions(path).await.unwrap_or((None, None, None));
    
    // 创建图片记录
    let req = CreateImageRequest {
        path: path.to_str().unwrap().to_string(),
        hash,
        file_name,
        file_size,
        file_modified_at,
        width,
        height,
        format,
        color_space: None,
    };
    
    let image = ImageRepository::create(pool, req)
        .await
        .map_err(|e| e.to_string())?;
    
    // 【懒加载方案】导入时不生成缩略图，留到首次访问时生成
    // let image_id = image.id;
    // let image_path = image.path.clone();
    // let image_hash = image.hash.clone();
    // 
    // tokio::spawn(async move {
    //     let _ = thumbnail_service
    //         .generate_now(image_id, &image_path, &image_hash, ThumbnailSize::Small)
    //         .await;
    // });
    
    Ok(SingleImportResult::New)
}

/// 检查是否是支持的图片格式
fn is_supported_image(path: &std::path::Path) -> bool {
    let supported_extensions = [
        "jpg", "jpeg", "png", "gif", "webp", "bmp", "tiff", "tif",
        "raw", "cr2", "nef", "arw", "dng", "heic", "heif",
        "psd", "kra", "svg",
    ];
    
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| {
            let ext_lower = ext.to_lowercase();
            supported_extensions.contains(&ext_lower.as_str())
        })
        .unwrap_or(false)
}

/// 获取图片尺寸
async fn get_image_dimensions(
    path: &std::path::Path
) -> Result<(Option<i32>, Option<i32>, Option<String>), ()> {
    let format = path.extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase());
    
    let path = path.to_path_buf();
    let result = tokio::task::spawn_blocking(move || {
        match image::ImageReader::open(&path) {
            Ok(reader) => {
                match reader.format() {
                    Some(fmt) => {
                        let format_str = match fmt {
                            image::ImageFormat::Jpeg => Some("jpeg".to_string()),
                            image::ImageFormat::Png => Some("png".to_string()),
                            image::ImageFormat::Gif => Some("gif".to_string()),
                            image::ImageFormat::WebP => Some("webp".to_string()),
                            image::ImageFormat::Tiff => Some("tiff".to_string()),
                            image::ImageFormat::Bmp => Some("bmp".to_string()),
                            _ => None,
                        };
                        
                        match reader.into_dimensions() {
                            Ok((width, height)) => (Some(width as i32), Some(height as i32), format_str),
                            Err(_) => (None, None, format_str),
                        }
                    }
                    None => (None, None, None),
                }
            }
            Err(_) => (None, None, None),
        }
    }).await;
    
    match result {
        Ok((width, height, fmt)) => Ok((width, height, fmt.or(format))),
        Err(_) => Ok((None, None, format)),
    }
}

/// 兼容旧版扫描命令（无进度反馈）
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
            let count = db::ImageRepository::count_by_location(&pool, &location.path)
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
