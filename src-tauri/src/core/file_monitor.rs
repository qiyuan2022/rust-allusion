use anyhow::{Context, Result};
use notify::{Config, Event, RecommendedWatcher, RecursiveMode, Watcher};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::sync::{mpsc, Mutex, RwLock};

/// 文件系统监控引擎
pub struct FileMonitor {
    /// 监控的文件夹列表 (location_id -> 监控实例)
    watchers: Arc<RwLock<HashMap<i64, MonitorInstance>>>,
    /// 事件发送通道
    event_tx: mpsc::Sender<FileSystemEvent>,
    /// 事件接收通道
    event_rx: Arc<Mutex<mpsc::Receiver<FileSystemEvent>>>,
    /// 防抖定时器 (路径 -> 上次修改时间)
    debounce_map: Arc<RwLock<HashMap<PathBuf, std::time::Instant>>>,
    /// 防抖间隔
    debounce_duration: std::time::Duration,
}

/// 监控实例
struct MonitorInstance {
    _watcher: RecommendedWatcher,
    path: PathBuf,
}

/// 文件系统事件
#[derive(Debug, Clone)]
pub enum FileSystemEvent {
    /// 文件创建
    Created { path: PathBuf, location_id: i64 },
    /// 文件修改
    Modified { path: PathBuf, location_id: i64 },
    /// 文件删除
    Deleted { path: PathBuf, location_id: i64 },
    /// 批量事件（目录重命名等）
    Batch { paths: Vec<PathBuf>, location_id: i64 },
}

impl FileMonitor {
    /// 创建新的文件监控器
    pub fn new() -> Result<Self> {
        let (event_tx, event_rx) = mpsc::channel(1000);
        
        Ok(Self {
            watchers: Arc::new(RwLock::new(HashMap::new())),
            event_tx,
            event_rx: Arc::new(Mutex::new(event_rx)),
            debounce_map: Arc::new(RwLock::new(HashMap::new())),
            debounce_duration: std::time::Duration::from_millis(500),
        })
    }
    
    /// 添加监控位置
    pub async fn add_location(&self, location_id: i64, path: &Path, recursive: bool) -> Result<()> {
        // 检查路径是否存在
        if !path.exists() {
            return Err(anyhow::anyhow!("Path does not exist: {:?}", path));
        }
        
        // 检查是否已在监控
        {
            let watchers = self.watchers.read().await;
            if watchers.contains_key(&location_id) {
                tracing::warn!("Location {} is already being monitored", location_id);
                return Ok(());
            }
        }
        
        // 创建事件发送通道的克隆
        let event_tx = self.event_tx.clone();
        let location_id_clone = location_id;
        let path_clone = path.to_path_buf();
        
        // 创建 notify watcher
        let watcher = notify::recommended_watcher(move |res: Result<Event, notify::Error>| {
            match res {
                Ok(event) => {
                    let paths: Vec<_> = event.paths.clone();
                    
                    // 根据事件类型处理
                    match event.kind {
                        notify::EventKind::Create(_) => {
                            for path in paths {
                                let _ = event_tx.try_send(FileSystemEvent::Created {
                                    path,
                                    location_id: location_id_clone,
                                });
                            }
                        }
                        notify::EventKind::Modify(_) => {
                            for path in paths {
                                let _ = event_tx.try_send(FileSystemEvent::Modified {
                                    path,
                                    location_id: location_id_clone,
                                });
                            }
                        }
                        notify::EventKind::Remove(_) => {
                            for path in paths {
                                let _ = event_tx.try_send(FileSystemEvent::Deleted {
                                    path,
                                    location_id: location_id_clone,
                                });
                            }
                        }
                        _ => {
                            // 其他类型的事件作为批量事件处理
                            if !paths.is_empty() {
                                let _ = event_tx.try_send(FileSystemEvent::Batch {
                                    paths,
                                    location_id: location_id_clone,
                                });
                            }
                        }
                    }
                }
                Err(e) => {
                    tracing::error!("Watch error for location {}: {}", location_id_clone, e);
                }
            }
        })?;
        
        // 创建监控实例
        let mut instance = MonitorInstance {
            _watcher: watcher,
            path: path.to_path_buf(),
        };
        
        // 开始监控（使用 notify 的 Watcher trait）
        // 注意：这里我们使用一个独立的 watcher 实例
        let mode = if recursive {
            RecursiveMode::Recursive
        } else {
            RecursiveMode::NonRecursive
        };
        
        // 重新创建 watcher 以获取可变引用
        let event_tx2 = self.event_tx.clone();
        let location_id_clone2 = location_id;
        let mut watcher2 = notify::recommended_watcher(move |res: Result<Event, notify::Error>| {
            if let Ok(event) = res {
                let paths: Vec<_> = event.paths.clone();
                for path in paths {
                    let _ = event_tx2.try_send(FileSystemEvent::Created {
                        path,
                        location_id: location_id_clone2,
                    });
                }
            }
        })?;
        
        watcher2.watch(path, mode)?;
        
        instance._watcher = watcher2;
        
        // 保存监控实例
        {
            let mut watchers = self.watchers.write().await;
            watchers.insert(location_id, instance);
        }
        
        tracing::info!(
            "Started monitoring location {}: {:?} (recursive: {})",
            location_id,
            path,
            recursive
        );
        
        Ok(())
    }
    
    /// 移除监控位置
    pub async fn remove_location(&self, location_id: i64) -> Result<()> {
        let mut watchers = self.watchers.write().await;
        
        if watchers.remove(&location_id).is_some() {
            tracing::info!("Stopped monitoring location {}", location_id);
        }
        
        Ok(())
    }
    
    /// 获取下一个文件系统事件（带防抖）
    pub async fn next_event(&self) -> Option<FileSystemEvent> {
        let mut rx = self.event_rx.lock().await;
        
        while let Some(event) = rx.recv().await {
            // 检查防抖
            if let Some(path) = event_path(&event) {
                if self.should_debounce(&path).await {
                    tracing::debug!("Debounced event for: {:?}", path);
                    continue;
                }
            }
            
            return Some(event);
        }
        
        None
    }
    
    /// 检查是否需要防抖
    async fn should_debounce(&self, path: &Path) -> bool {
        let now = std::time::Instant::now();
        let mut debounce_map = self.debounce_map.write().await;
        
        if let Some(last_time) = debounce_map.get(path) {
            if now.duration_since(*last_time) < self.debounce_duration {
                // 更新时间为当前，延长防抖窗口
                debounce_map.insert(path.to_path_buf(), now);
                return true;
            }
        }
        
        debounce_map.insert(path.to_path_buf(), now);
        false
    }
    
    /// 获取所有监控的位置
    pub async fn list_monitored_locations(&self) -> Vec<(i64, PathBuf)> {
        let watchers = self.watchers.read().await;
        watchers
            .iter()
            .map(|(id, instance)| (*id, instance.path.clone()))
            .collect()
    }
    
    /// 检查位置是否正在被监控
    pub async fn is_monitoring(&self, location_id: i64) -> bool {
        let watchers = self.watchers.read().await;
        watchers.contains_key(&location_id)
    }
    
    /// 停止所有监控
    pub async fn stop_all(&self) {
        let mut watchers = self.watchers.write().await;
        watchers.clear();
        tracing::info!("Stopped all file monitoring");
    }
    
    /// 扫描文件夹中的所有图片（初始导入）
    pub async fn scan_directory(
        &self,
        path: &Path,
        recursive: bool,
        location_id: i64,
    ) -> Result<Vec<PathBuf>> {
        use walkdir::WalkDir;
        
        let mut image_paths = Vec::new();
        
        let walker = if recursive {
            WalkDir::new(path)
        } else {
            WalkDir::new(path).max_depth(1)
        };
        
        for entry in walker.into_iter().filter_map(|e| e.ok()) {
            let path = entry.path();
            
            // 检查是否是文件
            if !entry.file_type().is_file() {
                continue;
            }
            
            // 检查是否是支持的图片格式
            if is_supported_image(path) {
                image_paths.push(path.to_path_buf());
            }
        }
        
        tracing::info!(
            "Scanned directory {:?}: found {} images",
            path,
            image_paths.len()
        );
        
        Ok(image_paths)
    }
}

/// 从事件中获取路径
fn event_path(event: &FileSystemEvent) -> Option<&Path> {
    match event {
        FileSystemEvent::Created { path, .. } => Some(path),
        FileSystemEvent::Modified { path, .. } => Some(path),
        FileSystemEvent::Deleted { path, .. } => Some(path),
        FileSystemEvent::Batch { .. } => None,
    }
}

/// 检查是否是支持的图片格式
pub fn is_supported_image(path: &Path) -> bool {
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

/// 获取文件 MIME 类型（基于扩展名）
pub fn get_image_mime_type(path: &Path) -> &'static str {
    match path.extension().and_then(|e| e.to_str()) {
        Some(ext) => match ext.to_lowercase().as_str() {
            "jpg" | "jpeg" => "image/jpeg",
            "png" => "image/png",
            "gif" => "image/gif",
            "webp" => "image/webp",
            "bmp" => "image/bmp",
            "tiff" | "tif" => "image/tiff",
            "raw" | "cr2" | "nef" | "arw" | "dng" => "image/x-raw",
            "heic" | "heif" => "image/heic",
            "psd" => "image/vnd.adobe.photoshop",
            "svg" => "image/svg+xml",
            _ => "application/octet-stream",
        },
        None => "application/octet-stream",
    }
}
