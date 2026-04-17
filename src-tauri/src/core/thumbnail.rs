use anyhow::{Context, Result};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::sync::{mpsc, Mutex, RwLock, Semaphore};
use tokio::task::JoinSet;

use crate::db::{DbPool, ThumbnailRepository};
use crate::models::{
    CreateThumbnailRequest, ThumbnailProgress, ThumbnailResult, ThumbnailSize, ThumbnailTask,
};

use image::GenericImageView;

/// 根据 EXIF Orientation 标签修正图片方向（从文件路径）
fn apply_orientation(img: image::DynamicImage, path: &Path) -> image::DynamicImage {
    let file = match std::fs::File::open(path) {
        Ok(f) => f,
        Err(_) => return img,
    };
    let mut bufreader = std::io::BufReader::new(&file);
    let exifreader = exif::Reader::new();
    let exif = match exifreader.read_from_container(&mut bufreader) {
        Ok(e) => e,
        Err(_) => return img,
    };
    
    // 直接处理方向修正
    let orientation = exif.get_field(exif::Tag::Orientation, exif::In::PRIMARY);
    if let Some(orientation) = orientation {
        match orientation.value.get_uint(0) {
            Some(2) => img.fliph(),
            Some(3) => img.rotate180(),
            Some(4) => img.flipv(),
            Some(5) => img.rotate90().fliph(),
            Some(6) => img.rotate90(),
            Some(7) => img.rotate270().fliph(),
            Some(8) => img.rotate270(),
            _ => img,
        }
    } else {
        img
    }
}

/// 根据 EXIF Orientation 标签修正图片方向（从内存 bytes - 优化版）
fn apply_orientation_from_bytes(img: image::DynamicImage, bytes: &[u8]) -> image::DynamicImage {
    // 优化：快速检查是否有EXIF数据
    // JPEG文件中EXIF通常在前64KB内
    if bytes.len() < 6 {
        return img;
    }
    
    // 快速检查JPEG SOI marker + APP1 (EXIF) marker
    // JPEG starts with 0xFF 0xD8, EXIF is in APP1 (0xFF 0xE1)
    if bytes[0] != 0xFF || bytes[1] != 0xD8 {
        // 不是JPEG文件
        return img;
    }
    
    // 查找APP1 marker (0xFF 0xE1)
    let mut i = 2;
    let has_exif = loop {
        if i + 3 >= bytes.len() || i >= 65536 {
            // 超过64KB还没找到，假设没有EXIF
            break false;
        }
        if bytes[i] == 0xFF && bytes[i + 1] == 0xE1 {
            // 检查EXIF header "Exif\0\0"
            if i + 10 < bytes.len() {
                let exif_header = &bytes[i + 4..i + 10];
                if exif_header == b"Exif\0\0" {
                    break true;
                }
            }
        }
        if bytes[i] == 0xFF && (bytes[i + 1] == 0xC0 || bytes[i + 1] == 0xC2) {
            // 找到SOF marker，说明已经过了EXIF段
            break false;
        }
        i += 1;
    };
    
    if !has_exif {
        return img;
    }
    
    // 只有确认有EXIF时才解析
    let mut cursor = std::io::Cursor::new(bytes);
    let exifreader = exif::Reader::new();
    
    let exif = match exifreader.read_from_container(&mut cursor) {
        Ok(e) => e,
        Err(_) => return img,
    };
    
    // 快速读取Orientation值
    let orientation = exif.get_field(exif::Tag::Orientation, exif::In::PRIMARY);
    if let Some(orientation) = orientation {
        match orientation.value.get_uint(0) {
            Some(2) => img.fliph(),
            Some(3) => img.rotate180(),
            Some(4) => img.flipv(),
            Some(5) => img.rotate90().fliph(),
            Some(6) => img.rotate90(),
            Some(7) => img.rotate270().fliph(),
            Some(8) => img.rotate270(),
            _ => img,
        }
    } else {
        img
    }
}

/// 缩略图生成器
pub struct ThumbnailGenerator {
    pool: DbPool,
    /// 缩略图存储目录（支持运行时更改）
    thumbnail_dir: Arc<RwLock<PathBuf>>,
    /// 并发限制
    semaphore: Arc<Semaphore>,
    /// 进度发送通道
    progress_tx: mpsc::Sender<ThumbnailProgress>,
    /// 是否取消生成
    cancelled: Arc<Mutex<bool>>,
    /// 图片质量 (1-100)
    quality: i32,
}

/// 生成结果统计
#[derive(Debug)]
pub struct GenerationStats {
    pub total: usize,
    pub succeeded: usize,
    pub failed: usize,
    pub skipped: usize,
}

impl ThumbnailGenerator {
    /// 创建新的缩略图生成器
    pub fn new(
        pool: DbPool,
        thumbnail_dir: Arc<RwLock<PathBuf>>,
        max_concurrent: usize,
    ) -> (Self, mpsc::Receiver<ThumbnailProgress>) {
        let (progress_tx, progress_rx) = mpsc::channel(100);
        
        let generator = Self {
            pool,
            thumbnail_dir,
            semaphore: Arc::new(Semaphore::new(max_concurrent)),
            progress_tx,
            cancelled: Arc::new(Mutex::new(false)),
            quality: 85,
        };
        
        (generator, progress_rx)
    }
    
    /// 设置图片质量
    pub fn with_quality(mut self, quality: i32) -> Self {
        self.quality = quality.clamp(1, 100);
        self
    }
    
    /// 生成单张图片的缩略图
    pub async fn generate_single(
        &self,
        image_id: i64,
        image_path: &str,
        image_hash: &str,
        size: ThumbnailSize,
        force: bool,
    ) -> Result<ThumbnailResult> {
        let task = ThumbnailTask {
            image_id,
            image_path: image_path.to_string(),
            image_hash: image_hash.to_string(),
            size,
        };
        
        let thumb_dir = self.thumbnail_dir.read().await;
        
        // 检查是否已存在且文件有效（使用 hash 作为键）
        if !force && ThumbnailRepository::exists(&self.pool, image_hash, size.as_str()).await? {
            let thumbnail = ThumbnailRepository::get_by_hash_and_size(
                &self.pool,
                image_hash,
                size.as_str(),
            )
            .await?;
            
            if let Some(t) = thumbnail {
                // DB 中存的是相对路径，拼接为绝对路径
                let abs_path = thumb_dir.join(&t.path);
                // 检查文件是否存在且大小大于0（避免空文件）
                if abs_path.exists() {
                    match std::fs::metadata(&abs_path) {
                        Ok(metadata) if metadata.len() > 0 => {
                            return Ok(ThumbnailResult {
                                task,
                                success: true,
                                path: Some(abs_path.to_string_lossy().to_string()),
                                width: Some(t.width),
                                height: Some(t.height),
                                file_size: Some(metadata.len() as i64),
                                error: None,
                            });
                        }
                        Ok(_) => {
                            // 文件存在但大小为0，删除并重新生成
                            tracing::warn!("Empty thumbnail file found, regenerating: {:?}", abs_path);
                            let _ = std::fs::remove_file(&abs_path);
                            let _ = ThumbnailRepository::delete_by_image_hash(&self.pool, image_hash).await;
                        }
                        Err(e) => {
                            tracing::warn!("Failed to read thumbnail metadata: {}, regenerating", e);
                            let _ = ThumbnailRepository::delete_by_image_hash(&self.pool, image_hash).await;
                        }
                    }
                } else {
                    // 文件不存在，删除数据库记录
                    let _ = ThumbnailRepository::delete_by_image_hash(&self.pool, image_hash).await;
                }
            }
        }
        
        // 执行生成
        drop(thumb_dir);
        self.process_task(&task).await
    }
    
    /// 批量生成缩略图
    pub async fn generate_batch(
        &self,
        tasks: Vec<ThumbnailTask>,
    ) -> Result<GenerationStats> {
        let total = tasks.len();
        let mut succeeded = 0usize;
        let mut failed = 0usize;
        let mut skipped = 0usize;
        
        let mut processed = 0usize;
        
        // 使用 JoinSet 并发处理
        let mut join_set = JoinSet::new();
        let tasks = Arc::new(Mutex::new(tasks));
        
        // 启动多个工作线程
        let num_workers = std::cmp::min(4, total.max(1));
        for _ in 0..num_workers {
            let tasks_clone = Arc::clone(&tasks);
            let generator_clone = self.clone_generator();
            
            join_set.spawn(async move {
                let mut local_results = Vec::new();
                
                loop {
                    // 检查是否取消
                    if *generator_clone.cancelled.lock().await {
                        break;
                    }
                    
                    // 获取下一个任务
                    let task = {
                        let mut tasks_guard = tasks_clone.lock().await;
                        tasks_guard.pop()
                    };
                    
                    if let Some(task) = task {
                        // 获取信号量许可（限制并发）
                        let _permit = generator_clone.semaphore.acquire().await.unwrap();
                        
                        // 处理任务
                        let result = generator_clone.process_task(&task).await;
                        local_results.push((task, result));
                    } else {
                        break;
                    }
                }
                
                local_results
            });
        }
        
        // 收集结果
        while let Some(results) = join_set.join_next().await {
            for (task, result) in results? {
                processed += 1;
                
                match &result {
                    Ok(r) => {
                        if r.success {
                            if r.path.is_some() {
                                succeeded += 1;
                            } else {
                                skipped += 1;
                            }
                        } else {
                            failed += 1;
                        }
                    }
                    Err(_) => {
                        failed += 1;
                    }
                }
                
                // 发送进度更新
                let percentage = ((processed as f64 / total as f64) * 100.0) as u8;
                let progress = ThumbnailProgress {
                    total,
                    completed: succeeded + skipped,
                    failed,
                    current_image: Some(task.image_path.clone()),
                    percentage,
                };
                
                let _ = self.progress_tx.try_send(progress);
            }
        }
        
        // 发送最终进度
        let _ = self.progress_tx.try_send(ThumbnailProgress {
            total,
            completed: succeeded + skipped,
            failed,
            current_image: None,
            percentage: 100,
        });
        
        tracing::info!(
            "Thumbnail generation completed: {} succeeded, {} failed, {} skipped",
            succeeded,
            failed,
            skipped
        );
        
        Ok(GenerationStats {
            total,
            succeeded,
            failed,
            skipped,
        })
    }
    
    /// 为单张图片生成所有尺寸的缩略图
    pub async fn generate_all_sizes(
        &self,
        image_id: i64,
        image_path: &str,
        image_hash: &str,
    ) -> Result<Vec<ThumbnailResult>> {
        let sizes = vec![
            ThumbnailSize::Small,
            ThumbnailSize::Medium,
            ThumbnailSize::Large,
        ];
        
        let mut results = Vec::new();
        
        for size in sizes {
            let result = self
                .generate_single(image_id, image_path, image_hash, size, false)
                .await?;
            results.push(result);
        }
        
        Ok(results)
    }
    
    /// 处理单个缩略图任务
    async fn process_task(&self, task: &ThumbnailTask) -> Result<ThumbnailResult> {
        let source_path = Path::new(&task.image_path);
        
        // 检查源文件是否存在
        if !source_path.exists() {
            return Ok(ThumbnailResult {
                task: task.clone(),
                success: false,
                path: None,
                width: None,
                height: None,
                file_size: None,
                error: Some("Source file not found".to_string()),
            });
        }
        
        // 生成输出路径（绝对路径用于写文件，相对路径用于存数据库）
        let output_filename = format!("{}_{}.jpg", task.image_hash, task.size.as_str());
        let thumb_dir = self.thumbnail_dir.read().await;
        let output_path = thumb_dir.join(&output_filename);
        drop(thumb_dir);
        
        // 确保缩略图目录存在
        if let Some(parent) = output_path.parent() {
            if !parent.exists() {
                let _ = std::fs::create_dir_all(parent);
            }
        }
        
        // 生成缩略图
        match self
            .create_thumbnail(source_path, &output_path, task.size)
            .await
        {
            Ok((width, height)) => {
                // 获取生成的文件大小
                let file_size = std::fs::metadata(&output_path)
                    .map(|m| m.len() as i64)
                    .unwrap_or(0);
                
                let abs_path_str = output_path.to_string_lossy().to_string();
                
                // 保存到数据库（使用 hash 作为关联键，path 存相对路径/文件名）
                let req = CreateThumbnailRequest {
                    image_hash: task.image_hash.clone(),
                    size_type: task.size.as_str().to_string(),
                    path: output_filename.clone(),
                    width,
                    height,
                    file_size,
                };
                
                if let Err(e) = ThumbnailRepository::create(&self.pool, req).await {
                    tracing::warn!("Failed to save thumbnail record: {}", e);
                }
                
                Ok(ThumbnailResult {
                    task: task.clone(),
                    success: true,
                    path: Some(abs_path_str),
                    width: Some(width),
                    height: Some(height),
                    file_size: Some(file_size),
                    error: None,
                })
            }
            Err(e) => {
                tracing::warn!(
                    "Failed to generate thumbnail for {:?}: {}",
                    source_path,
                    e
                );
                
                Ok(ThumbnailResult {
                    task: task.clone(),
                    success: false,
                    path: None,
                    width: None,
                    height: None,
                    file_size: None,
                    error: Some(e.to_string()),
                })
            }
        }
    }
    
    /// 创建缩略图文件（核心图片处理逻辑 - image crate 原版，保留备用）
    async fn create_thumbnail_image_rs(
        &self,
        source: &Path,
        output: &Path,
        size: ThumbnailSize,
    ) -> Result<(i32, i32)> {
        let target_size = size.target_size() as u32;
        let quality = self.quality;

        let source = source.to_path_buf();
        let output = output.to_path_buf();

        // 在阻塞线程池中执行图片处理
        let result = tokio::task::spawn_blocking(move || -> Result<(i32, i32)> {
            let start_time = std::time::Instant::now();
            tracing::debug!("Processing thumbnail: {:?}", source);

            // 1. 读取文件到内存
            let bytes = std::fs::read(&source)
                .map_err(|e| anyhow::anyhow!("Failed to read image: {}", e))?;
            let t1 = start_time.elapsed();
            tracing::info!("[PERF] File read: {} bytes, elapsed: {:?}", bytes.len(), t1);

            // 2. 直接从内存解码
            let img = image::load_from_memory(&bytes)
                .map_err(|e| anyhow::anyhow!("Failed to decode image: {}", e))?;
            let t2 = start_time.elapsed();
            let (orig_width, orig_height) = img.dimensions();
            tracing::info!("[PERF] Image decoded: {}x{}, decode elapsed: {:?}", orig_width, orig_height, t2 - t1);

            let needs_resize = orig_width > target_size || orig_height > target_size;

            // 3. 应用EXIF方向修正
            let img = apply_orientation_from_bytes(img, &bytes);
            let t3 = start_time.elapsed();
            tracing::info!("[PERF] EXIF applied, elapsed: {:?}", t3 - t2);

            // 4. 计算目标尺寸
            let (new_width, new_height) = if orig_width > orig_height {
                let ratio = target_size as f32 / orig_width as f32;
                (target_size, (orig_height as f32 * ratio).max(1.0) as u32)
            } else {
                let ratio = target_size as f32 / orig_height as f32;
                ((orig_width as f32 * ratio).max(1.0) as u32, target_size)
            };
            let new_width = new_width.max(1);
            let new_height = new_height.max(1);

            // 5. 缩放并转换为RGB（使用Nearest滤波器提升速度）
            let rgb_img = if needs_resize {
                img.resize(new_width, new_height, image::imageops::FilterType::Nearest)
                    .to_rgb8()
            } else {
                img.to_rgb8()
            };
            let t4 = start_time.elapsed();
            let (actual_width, actual_height) = rgb_img.dimensions();
            tracing::info!("[PERF] Resize + to_rgb8: {}x{}, elapsed: {:?}", actual_width, actual_height, t4 - t3);

            // 6. 创建临时文件路径
            let temp_output = output.with_extension("tmp");

            // 7. 写入JPEG文件
            let mut temp_file = std::fs::File::create(&temp_output)
                .with_context(|| format!("Failed to create temp file: {:?}", temp_output))?;

            let mut encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(
                &mut temp_file,
                quality as u8,
            );

            encoder
                .encode(
                    &rgb_img,
                    actual_width,
                    actual_height,
                    image::ExtendedColorType::Rgb8,
                )
                .map_err(|e| anyhow::anyhow!("Failed to encode JPEG: {}", e))?;
            let t4 = start_time.elapsed();
            tracing::info!("[PERF] JPEG encode: elapsed: {:?}", t4 - t3);

            // 8. 重命名为最终文件
            if let Err(e) = std::fs::rename(&temp_output, &output) {
                let _ = std::fs::remove_file(&temp_output);
                return Err(e).with_context(|| format!("Failed to rename temp file: {:?}", output));
            }
            let t5 = start_time.elapsed();
            tracing::info!("[PERF] File rename: elapsed: {:?}", t5 - t4);

            tracing::info!(
                "Thumbnail created: {:?} -> {}x{} (target: {}), total: {:?}",
                output,
                actual_width,
                actual_height,
                target_size,
                start_time.elapsed()
            );

            Ok((actual_width as i32, actual_height as i32))
        })
        .await
        .map_err(|e| anyhow::anyhow!("Task panicked: {}", e))?;

        result
    }

    /// 创建缩略图文件（核心图片处理逻辑 - libvips 版）
    async fn create_thumbnail(
        &self,
        source: &Path,
        output: &Path,
        size: ThumbnailSize,
    ) -> Result<(i32, i32)> {
        let target_size = size.target_size();
        let quality = self.quality as i32;

        let source = source.to_path_buf();
        let output = output.to_path_buf();

        let result = tokio::task::spawn_blocking(move || -> Result<(i32, i32)> {
            let start_time = std::time::Instant::now();
            tracing::debug!("Processing thumbnail with libvips: {:?}", source);

            let temp_output = output.with_extension("tmp");

            match crate::vips::create_thumbnail(&source, &temp_output, target_size, quality) {
                Ok((w, h)) => {
                    if let Err(e) = std::fs::rename(&temp_output, &output) {
                        let _ = std::fs::remove_file(&temp_output);
                        return Err(e).with_context(|| format!("Failed to rename temp file: {:?}", output));
                    }
                    tracing::info!(
                        "Thumbnail created with libvips: {:?} -> {}x{} (target: {}), total: {:?}",
                        output,
                        w,
                        h,
                        target_size,
                        start_time.elapsed()
                    );
                    Ok((w, h))
                }
                Err(e) => {
                    let _ = std::fs::remove_file(&temp_output);
                    Err(anyhow::anyhow!("libvips thumbnail failed: {}", e))
                }
            }
        })
        .await
        .map_err(|e| anyhow::anyhow!("Task panicked: {}", e))?;

        result
    }
    
    /// 取消生成
    pub async fn cancel(&self) {
        *self.cancelled.lock().await = true;
        tracing::info!("Thumbnail generation cancellation requested");
    }
    
    /// 克隆生成器（用于并发任务）
    fn clone_generator(&self) -> Self {
        Self {
            pool: self.pool.clone(),
            thumbnail_dir: Arc::clone(&self.thumbnail_dir),
            semaphore: Arc::clone(&self.semaphore),
            progress_tx: self.progress_tx.clone(),
            cancelled: Arc::clone(&self.cancelled),
            quality: self.quality,
        }
    }
    
    /// 设置新的缩略图目录
    pub async fn set_thumbnail_dir(&self, new_dir: PathBuf) {
        let mut dir = self.thumbnail_dir.write().await;
        *dir = new_dir;
        tracing::info!("Thumbnail generator directory updated to {:?}", *dir);
    }
    
    /// 获取缩略图路径
    pub async fn get_thumbnail_path(&self, image_hash: &str, size: ThumbnailSize) -> PathBuf {
        let filename = format!("{}_{}.jpg", image_hash, size.as_str());
        self.thumbnail_dir.read().await.join(filename)
    }
    
    /// 检查缩略图是否存在（文件层面）
    pub async fn thumbnail_file_exists(&self, image_hash: &str, size: ThumbnailSize) -> bool {
        let path = self.get_thumbnail_path(image_hash, size).await;
        path.exists()
    }
    
    /// 清理孤立的缩略图文件
    pub async fn cleanup_orphaned_files(&self) -> Result<usize> {
        let mut removed_count = 0;
        
        // 获取所有缩略图记录
        let all_thumbnails = sqlx::query_as::<_, (String,)>("SELECT path FROM thumbnails")
            .fetch_all(&self.pool)
            .await?;
        
        let thumb_dir = self.thumbnail_dir.read().await;
        let valid_paths: std::collections::HashSet<_> = all_thumbnails
            .into_iter()
            .map(|(path,)| thumb_dir.join(path).to_string_lossy().to_string())
            .collect();
        
        // 遍历缩略图目录
        if let Ok(entries) = std::fs::read_dir(&*thumb_dir) {
            for entry in entries.filter_map(|e| e.ok()) {
                let path = entry.path();
                if path.extension().map(|e| e == "jpg").unwrap_or(false) {
                    let path_str = path.to_string_lossy().to_string();
                    if !valid_paths.contains(&path_str) {
                        if let Err(e) = std::fs::remove_file(&path) {
                            tracing::warn!("Failed to remove orphaned thumbnail: {}", e);
                        } else {
                            removed_count += 1;
                            tracing::debug!("Removed orphaned thumbnail: {:?}", path);
                        }
                    }
                }
            }
        }
        
        tracing::info!("Cleanup completed: removed {} orphaned files", removed_count);
        Ok(removed_count)
    }
}

/// 缩略图服务 - 用于后台队列处理
pub struct ThumbnailService {
    generator: Arc<ThumbnailGenerator>,
    task_tx: mpsc::Sender<ThumbnailTask>,
}

impl ThumbnailService {
    /// 创建缩略图服务并启动后台处理队列
    pub fn new(
        pool: DbPool,
        thumbnail_dir: Arc<RwLock<PathBuf>>,
        max_concurrent: usize,
    ) -> (Self, mpsc::Receiver<ThumbnailProgress>) {
        let (generator, progress_rx) =
            ThumbnailGenerator::new(pool, thumbnail_dir, max_concurrent);
        let generator = Arc::new(generator);
        
        let (task_tx, mut task_rx) = mpsc::channel::<ThumbnailTask>(1000);
        
        // 启动后台处理任务
        let generator_clone = Arc::clone(&generator);
        tokio::spawn(async move {
            let mut batch = Vec::new();
            let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(5));
            
            loop {
                tokio::select! {
                    Some(task) = task_rx.recv() => {
                        batch.push(task);
                        
                        // 批量处理达到 10 个立即处理
                        if batch.len() >= 10 {
                            let tasks = std::mem::take(&mut batch);
                            let _ = generator_clone.generate_batch(tasks).await;
                        }
                    }
                    _ = interval.tick() => {
                        // 每 5 秒处理积累的批量任务
                        if !batch.is_empty() {
                            let tasks = std::mem::take(&mut batch);
                            let _ = generator_clone.generate_batch(tasks).await;
                        }
                    }
                }
            }
        });
        
        (Self { generator, task_tx }, progress_rx)
    }
    
    /// 提交缩略图生成任务到队列
    pub async fn queue_thumbnail(&self, task: ThumbnailTask) -> Result<()> {
        self.task_tx
            .send(task)
            .await
            .map_err(|_| anyhow::anyhow!("Failed to queue thumbnail task"))
    }
    
    /// 立即生成缩略图（不走队列）
    pub async fn generate_now(
        &self,
        image_id: i64,
        image_path: &str,
        image_hash: &str,
        size: ThumbnailSize,
        force: bool,
    ) -> Result<ThumbnailResult> {
        self.generator
            .generate_single(image_id, image_path, image_hash, size, force)
            .await
    }
    
    /// 更新缩略图目录
    pub async fn set_thumbnail_dir(&self, new_dir: PathBuf) {
        self.generator.set_thumbnail_dir(new_dir).await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    // 测试在实际环境中运行
}
