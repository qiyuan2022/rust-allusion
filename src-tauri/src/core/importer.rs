use anyhow::{Context, Result};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::sync::{mpsc, Mutex, Semaphore};
use tokio::task::JoinSet;
use serde::Serialize;

use crate::core::ThumbnailService;
use crate::db::{ImageRepository, ThumbnailRepository};
use crate::models::{CreateImageRequest, Image, ThumbnailSize};
use sqlx::SqlitePool;

/// 图片导入器
pub struct ImageImporter {
    /// 数据库连接池
    pool: SqlitePool,
    /// 并发限制（避免过多同时处理）
    semaphore: Arc<Semaphore>,
    /// 进度发送通道
    progress_tx: mpsc::Sender<ImportProgress>,
    /// 是否取消导入
    cancelled: Arc<Mutex<bool>>,
    /// 缩略图服务
    thumbnail_service: Option<Arc<ThumbnailService>>,
}

/// 导入阶段
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ImportPhase {
    /// 扫描文件夹
    Scanning,
    /// 导入图片
    Importing,
    /// 完成
    Completed,
    /// 已取消
    Cancelled,
}

/// 导入进度
#[derive(Debug, Clone, Serialize)]
pub struct ImportProgress {
    /// 当前阶段
    pub phase: ImportPhase,
    /// 总文件数
    pub total: usize,
    /// 已处理数
    pub processed: usize,
    /// 成功数
    pub succeeded: usize,
    /// 失败数
    pub failed: usize,
    /// 跳过的文件数
    pub skipped: usize,
    /// 当前处理的文件
    pub current_file: Option<String>,
    /// 进度百分比 (0-100)
    pub percentage: u8,
    /// 阶段特定消息
    pub message: Option<String>,
}

impl ImportProgress {
    /// 创建扫描阶段的进度
    pub fn scanning(scanned: usize, current_path: Option<&Path>) -> Self {
        Self {
            phase: ImportPhase::Scanning,
            total: 0,
            processed: scanned,
            succeeded: 0,
            failed: 0,
            skipped: 0,
            current_file: current_path.map(|p| p.to_string_lossy().to_string()),
            percentage: 0,
            message: Some(format!("已发现 {} 个文件", scanned)),
        }
    }
    
    /// 创建导入阶段的进度
    pub fn importing(
        total: usize,
        processed: usize,
        succeeded: usize,
        failed: usize,
        skipped: usize,
        current_file: Option<&Path>,
    ) -> Self {
        let percentage = if total > 0 {
            ((processed as f64 / total as f64) * 100.0) as u8
        } else {
            0
        };
        
        Self {
            phase: ImportPhase::Importing,
            total,
            processed,
            succeeded,
            failed,
            skipped,
            current_file: current_file.map(|p| p.file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| p.to_string_lossy().to_string())),
            percentage,
            message: None,
        }
    }
    
    /// 创建完成状态
    pub fn completed(total: usize, succeeded: usize, failed: usize, skipped: usize) -> Self {
        Self {
            phase: ImportPhase::Completed,
            total,
            processed: total,
            succeeded,
            failed,
            skipped,
            current_file: None,
            percentage: 100,
            message: Some(format!(
                "导入完成：成功 {}, 失败 {}, 跳过 {}",
                succeeded, failed, skipped
            )),
        }
    }
    
    /// 创建取消状态
    pub fn cancelled(processed: usize, succeeded: usize, failed: usize, skipped: usize) -> Self {
        Self {
            phase: ImportPhase::Cancelled,
            total: processed,
            processed,
            succeeded,
            failed,
            skipped,
            current_file: None,
            percentage: 0,
            message: Some("已取消".to_string()),
        }
    }
}

/// 导入结果
#[derive(Debug)]
pub struct ImportResult {
    /// 成功导入的图片
    pub images: Vec<Image>,
    /// 失败的文件
    pub failures: Vec<(PathBuf, String)>,
    /// 跳过的文件（已存在）
    pub skipped: Vec<PathBuf>,
}

impl ImageImporter {
    /// 创建新的导入器
    pub fn new(pool: SqlitePool, max_concurrent: usize) -> (Self, mpsc::Receiver<ImportProgress>) {
        let (progress_tx, progress_rx) = mpsc::channel(100);
        
        let importer = Self {
            pool,
            semaphore: Arc::new(Semaphore::new(max_concurrent)),
            progress_tx,
            cancelled: Arc::new(Mutex::new(false)),
            thumbnail_service: None,
        };
        
        (importer, progress_rx)
    }
    
    /// 创建带有缩略图服务的导入器
    pub fn with_thumbnail_service(
        pool: SqlitePool,
        max_concurrent: usize,
        thumbnail_service: Arc<ThumbnailService>,
    ) -> (Self, mpsc::Receiver<ImportProgress>) {
        let (progress_tx, progress_rx) = mpsc::channel(100);
        
        let importer = Self {
            pool,
            semaphore: Arc::new(Semaphore::new(max_concurrent)),
            progress_tx,
            cancelled: Arc::new(Mutex::new(false)),
            thumbnail_service: Some(thumbnail_service),
        };
        
        (importer, progress_rx)
    }
    
    /// 导入单个文件
    pub async fn import_single(&self, path: &Path, location_id: i64) -> Result<Image> {
        // 计算文件哈希
        let hash = compute_file_hash(path).await?;
        
        // 检查是否已存在（基于路径或哈希）
        if let Some(existing) = ImageRepository::get_by_path(&self.pool, path.to_str().unwrap()).await? {
            tracing::debug!("Image already exists: {:?}", path);
            
            // 补充生成缺失的缩略图
            if let Some(ref thumbnail_service) = self.thumbnail_service {
                let existing_id = existing.id;
                let existing_path = existing.path.clone();
                let existing_hash = existing.hash.clone();
                let pool = self.pool.clone();
                let thumbnail_service = Arc::clone(thumbnail_service);
                
                tokio::spawn(async move {
                    // 检查 small 缩略图是否存在（使用 hash）
                    let has_thumbnail = match ThumbnailRepository::exists(
                        &pool, &existing_hash, "small"
                    ).await {
                        Ok(exists) => exists,
                        Err(e) => {
                            tracing::warn!("Failed to check thumbnail existence for image {}: {}", existing_id, e);
                            return;
                        }
                    };
                    
                    if !has_thumbnail {
                        tracing::info!("Generating missing small thumbnail for existing image {}", existing_id);
                        match thumbnail_service
                            .generate_now(existing_id, &existing_path, &existing_hash, ThumbnailSize::Small)
                            .await
                        {
                            Ok(result) => {
                                if result.success {
                                    tracing::debug!(
                                        "Generated missing small thumbnail for image {}: {:?}",
                                        existing_id,
                                        result.path
                                    );
                                } else {
                                    tracing::warn!(
                                        "Failed to generate missing thumbnail for image {}: {:?}",
                                        existing_id,
                                        result.error
                                    );
                                }
                            }
                            Err(e) => {
                                tracing::warn!(
                                    "Error generating missing thumbnail for image {}: {}",
                                    existing_id,
                                    e
                                );
                            }
                        }
                    }
                });
            }
            
            return Ok(existing);
        }
        
        // 获取文件元数据
        let metadata = tokio::fs::metadata(path).await?;
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
        
        // 尝试获取图片尺寸（可选）
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
            color_space: None, // TODO: 提取色彩空间
        };
        
        let image = ImageRepository::create(&self.pool, req).await?;
        
        // 异步生成 small 缩略图
        if let Some(ref thumbnail_service) = self.thumbnail_service {
            let image_id = image.id;
            let image_path = image.path.clone();
            let image_hash = image.hash.clone();
            let thumbnail_service = Arc::clone(thumbnail_service);
            
            tokio::spawn(async move {
                match thumbnail_service
                    .generate_now(image_id, &image_path, &image_hash, ThumbnailSize::Small)
                    .await
                {
                    Ok(result) => {
                        if result.success {
                            tracing::debug!(
                                "Generated small thumbnail for image {}: {:?}",
                                image_id,
                                result.path
                            );
                        } else {
                            tracing::warn!(
                                "Failed to generate small thumbnail for image {}: {:?}",
                                image_id,
                                result.error
                            );
                        }
                    }
                    Err(e) => {
                        tracing::warn!(
                            "Error generating small thumbnail for image {}: {}",
                            image_id,
                            e
                        );
                    }
                }
            });
        }
        
        tracing::debug!("Imported image: {:?} (id: {})", path, image.id);
        
        Ok(image)
    }
    
    /// 批量导入文件
    pub async fn import_batch(
        &self,
        paths: Vec<PathBuf>,
        location_id: i64,
    ) -> Result<ImportResult> {
        let total = paths.len();
        let mut images = Vec::with_capacity(total);
        let mut failures = Vec::new();
        let mut skipped = Vec::new();
        
        let mut processed = 0usize;
        let mut succeeded = 0usize;
        let mut failed = 0usize;
        
        // 使用 JoinSet 并发处理
        let mut join_set = JoinSet::new();
        let paths = Arc::new(Mutex::new(paths));
        
        // 启动多个任务
        let num_workers = std::cmp::min(4, total);
        for _ in 0..num_workers {
            let paths_clone = Arc::clone(&paths);
            let importer_clone = self.clone_importer();
            let location_id_clone = location_id;
            
            join_set.spawn(async move {
                let mut local_results = Vec::new();
                
                loop {
                    // 检查是否取消
                    if *importer_clone.cancelled.lock().await {
                        break;
                    }
                    
                    // 获取下一个文件
                    let path = {
                        let mut paths_guard = paths_clone.lock().await;
                        paths_guard.pop()
                    };
                    
                    if let Some(path) = path {
                        // 获取信号量许可（限制并发）
                        let _permit = importer_clone.semaphore.acquire().await.unwrap();
                        
                        // 导入文件
                        let result = importer_clone.import_single(&path, location_id_clone).await;
                        local_results.push((path, result));
                    } else {
                        break;
                    }
                }
                
                local_results
            });
        }
        
        // 收集结果
        while let Some(results) = join_set.join_next().await {
            for (path, result) in results? {
                processed += 1;
                
                match result {
                    Ok(image) => {
                        images.push(image);
                        succeeded += 1;
                    }
                    Err(e) => {
                        let error_msg = e.to_string();
                        tracing::warn!("Failed to import {:?}: {}", path, error_msg);
                        failures.push((path.clone(), error_msg));
                        failed += 1;
                    }
                }
                
                // 发送进度更新
                let progress = ImportProgress::importing(
                    total,
                    processed,
                    succeeded,
                    failed,
                    skipped.len(),
                    Some(&path),
                );
                
                let _ = self.progress_tx.try_send(progress);
            }
        }
        
        // 发送最终进度
        let _ = self.progress_tx.try_send(ImportProgress::completed(
            total, succeeded, failed, skipped.len()
        ));
        
        tracing::info!(
            "Batch import completed: {} succeeded, {} failed, {} skipped",
            succeeded,
            failed,
            skipped.len()
        );
        
        Ok(ImportResult {
            images,
            failures,
            skipped,
        })
    }
    
    /// 取消导入
    pub async fn cancel(&self) {
        *self.cancelled.lock().await = true;
        tracing::info!("Import cancellation requested");
    }
    
    /// 克隆导入器（用于并发任务）
    fn clone_importer(&self) -> Self {
        Self {
            pool: self.pool.clone(),
            semaphore: Arc::clone(&self.semaphore),
            progress_tx: self.progress_tx.clone(),
            cancelled: Arc::clone(&self.cancelled),
            thumbnail_service: self.thumbnail_service.clone(),
        }
    }
}

/// 计算文件哈希（BLAKE3）- 使用流式读取，避免大文件内存占用
pub async fn compute_file_hash(path: &Path) -> Result<String> {
    use tokio::io::AsyncReadExt;
    
    // 获取文件大小以选择合适的缓冲区
    let metadata = tokio::fs::metadata(path).await
        .with_context(|| format!("Failed to read metadata: {:?}", path))?;
    let file_size = metadata.len();
    
    let mut file = tokio::fs::File::open(path).await
        .with_context(|| format!("Failed to open file: {:?}", path))?;
    
    let mut hasher = blake3::Hasher::new();
    
    // 根据文件大小动态调整缓冲区：
    // - 小文件 (< 1MB): 64KB 缓冲区
    // - 中等文件 (1MB - 100MB): 256KB 缓冲区  
    // - 大文件 (> 100MB): 1MB 缓冲区
    let buffer_size = match file_size {
        0..=1_048_576 => 64 * 1024,       // 64KB
        1_048_577..=104_857_600 => 256 * 1024, // 256KB
        _ => 1024 * 1024,                  // 1MB
    };
    
    let mut buffer = vec![0u8; buffer_size];
    let mut total_read = 0u64;
    
    loop {
        let n = file.read(&mut buffer).await
            .with_context(|| format!("Failed to read file: {:?}", path))?;
        
        if n == 0 {
            break;
        }
        
        hasher.update(&buffer[..n]);
        total_read += n as u64;
        
        // 每读取 10MB 让出一次执行权，避免长时间阻塞其他任务
        if total_read % (10 * 1024 * 1024) < buffer_size as u64 {
            tokio::task::yield_now().await;
        }
    }
    
    // 验证读取的字节数是否匹配文件大小（确保完整性）
    if total_read != file_size {
        return Err(anyhow::anyhow!(
            "File size mismatch: expected {}, read {}", 
            file_size, total_read
        ));
    }
    
    Ok(hasher.finalize().to_hex().to_string())
}

/// 计算文件哈希（流式，适合大文件）- 现在是 compute_file_hash 的别名
pub async fn compute_file_hash_streaming(path: &Path) -> Result<String> {
    compute_file_hash(path).await
}

/// 获取图片尺寸
async fn get_image_dimensions(path: &Path) -> Result<(Option<i32>, Option<i32>, Option<String>)> {
    // 尝试从文件名解析格式
    let format = path.extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase());
    
    // 使用 image crate 获取图片尺寸
    // 使用 spawn_blocking 避免阻塞异步运行时
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
                        
                        // 只读取图片头部信息，不解码整个图片
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

/// 扫描文件夹中的所有图片
pub async fn scan_directory(path: &Path, recursive: bool) -> Result<Vec<PathBuf>> {
    use walkdir::WalkDir;
    
    let mut image_paths = Vec::new();
    
    let walker = if recursive {
        WalkDir::new(path)
    } else {
        WalkDir::new(path).max_depth(1)
    };
    
    for entry in walker.into_iter().filter_map(|e| e.ok()) {
        let path = entry.path();
        
        if !entry.file_type().is_file() {
            continue;
        }
        
        if is_supported_image(path) {
            image_paths.push(path.to_path_buf());
        }
    }
    
    Ok(image_paths)
}

/// 检查是否是支持的图片格式
fn is_supported_image(path: &Path) -> bool {
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
