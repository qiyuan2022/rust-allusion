// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::PathBuf;
use std::sync::Arc;
use tauri::{Manager};
use tokio::sync::{Mutex, RwLock};

mod core;
mod db;
mod models;
mod handlers;
mod vips;

use core::{
    FileMonitor, IndexingWorker, SearchService,ThumbnailService,
};
use db::{DbPool, init_db};
use handlers::*;

/// 应用状态
pub struct AppState {
    pub db: Arc<Mutex<DbPool>>,
    pub file_monitor: Arc<FileMonitor>,
    pub thumbnail_service: Arc<ThumbnailService>,
    pub search_service: Arc<SearchService>,
    pub thumbnail_dir: Arc<RwLock<PathBuf>>,
}

fn main() {
    // tracing_subscriber 不再初始化，tracing 事件通过 tracing 的 log feature 桥接到 tauri-plugin-log

    match vips::initialize() {
        Ok(()) => {
            tracing::info!("libvips version: {}", vips::version());
        }
        Err(e) => {
            tracing::warn!("Failed to initialize libvips: {}", e);
        }
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_persisted_scope::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(
            tauri_plugin_log::Builder::default()
                .targets([
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout),
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::LogDir {
                        file_name: Some("app.log".into()),
                    }),
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Webview),
                ])
                .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepOne)
                .level(if cfg!(debug_assertions) {
                    log::LevelFilter::Debug
                } else {
                    log::LevelFilter::Info
                })
                .level_for("sqlx", log::LevelFilter::Warn)
                .level_for("sqlx::query", log::LevelFilter::Warn)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            // 图片命令
            create_image,
            get_image_by_id,
            get_image_with_tags,
            list_images,
            list_images_with_tags,
            list_images_with_thumbnail,
            get_all_images,
            count_images,
            delete_image,
            // 标签命令
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
            // 位置命令
            create_location,
            get_all_locations,
            update_location,
            delete_location,
            // 导入命令
            scan_folder,
            import_images,
            compute_file_hash,
            scan_location,
            scan_location_with_progress,
            // 缩略图命令
            generate_thumbnail,
            get_thumbnail_path,
            get_or_generate_thumbnail,
            get_or_generate_thumbnail_by_hash,
            get_thumbnail_status,
            generate_all_thumbnails,
            check_thumbnails_integrity,
            fix_missing_thumbnails,
            // 设置命令
            get_setting,
            set_setting,
            get_thumbnail_dir,
            set_thumbnail_dir,
            // 搜索命令
            search_images,
            get_search_index_status,
            rebuild_search_index,
            // 其他命令
            fix_image_dimensions,
            get_db_migration_status,
            import_allusion_data,
            rename_image,
            add_tags_to_images,
            clear_tags_from_images,
            delete_images,
            show_in_folder,
        ])
        .setup(|app| {
            #[cfg(debug_assertions)]
            {
                let window = app.get_webview_window("main").unwrap();
                window.open_devtools();
            }
            
            // 强制隐藏原生标题栏（tauri.conf.json 的 decorations 配置在 Windows 上可能不生效）
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_decorations(false);
            }
            
            // 初始化数据库
            let app_handle = app.handle().clone();
            tauri::async_runtime::block_on(async move {
                match init_db(&app_handle).await {
                    Ok(pool) => {
                        // 创建文件监控器
                        let file_monitor = Arc::new(
                            FileMonitor::new().expect("Failed to create file monitor")
                        );
                        
                        // 从数据库读取缩略图目录设置
                        let thumbnail_dir_setting: Option<String> = sqlx::query_scalar(
                            "SELECT value FROM settings WHERE key = 'thumbnail_dir'"
                        )
                        .fetch_optional(&pool)
                        .await
                        .expect("Failed to read thumbnail_dir setting");
                        
                        let thumbnail_dir = match thumbnail_dir_setting {
                            Some(dir) if !dir.is_empty() => PathBuf::from(dir).join("thumbnails"),
                            _ => app_handle
                                .path()
                                .app_data_dir()
                                .expect("Failed to get app data dir")
                                .join("thumbnails"),
                        };
                        
                        if !thumbnail_dir.exists() {
                            std::fs::create_dir_all(&thumbnail_dir)
                                .expect("Failed to create thumbnails directory");
                        }
                        
                        tracing::info!("Thumbnails directory: {:?}", thumbnail_dir);
                        
                        let thumbnail_dir_arc = Arc::new(RwLock::new(thumbnail_dir));
                        
                        // 创建缩略图服务
                        let (thumbnail_service, _progress_rx) = ThumbnailService::new(
                            pool.clone(),
                            Arc::clone(&thumbnail_dir_arc),
                            4, // 最大并发数
                        );
                        let thumbnail_service = Arc::new(thumbnail_service);
                        
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
                        
                        // 为已有位置恢复文件监控
                        let locations = db::LocationRepository::list_all(&pool).await.unwrap_or_default();
                        for loc in &locations {
                            let path = std::path::Path::new(&loc.path);
                            if let Err(e) = file_monitor.add_location(loc.id, path, loc.is_recursive).await {
                                tracing::warn!("Failed to monitor location {} ({}): {}", loc.id, loc.path, e);
                            }
                        }
                        
                        // 启动后台索引任务
                        let indexing_worker = IndexingWorker::new(Arc::clone(&search_service));
                        indexing_worker.start();
                        
                        // 启动文件监控事件处理后台任务
                        let file_monitor_clone = Arc::clone(&file_monitor);
                        let pool_clone = pool.clone();
                        let thumbnail_service_clone = Arc::clone(&thumbnail_service);
                        let search_service_clone = Arc::clone(&search_service);
                        
                        tokio::spawn(async move {
                            use crate::core::file_monitor::{FileSystemEvent, is_supported_image};
                            use crate::core::importer::ImageImporter;
                            use crate::db::ImageRepository;
                            use crate::models::UpdateImageRequest;
                            
                            while let Some(event) = file_monitor_clone.next_event().await {
                                match event {
                                    FileSystemEvent::Created { path, location_id } => {
                                        if is_supported_image(&path) {
                                            let (importer, _rx) = ImageImporter::with_thumbnail_service(
                                                pool_clone.clone(),
                                                2,
                                                Arc::clone(&thumbnail_service_clone),
                                            );
                                            match importer.import_single(&path, location_id).await {
                                                Ok(image) => {
                                                    let _ = search_service_clone.index_image(image.id).await;
                                                    tracing::info!("Auto-imported new image from file monitor: {:?} (id: {})", path, image.id);
                                                }
                                                Err(e) => {
                                                    tracing::warn!("Failed to auto-import image from file monitor: {:?} - {}", path, e);
                                                }
                                            }
                                        }
                                    }
                                    FileSystemEvent::Modified { path, .. } => {
                                        if is_supported_image(&path) {
                                            match ImageRepository::get_by_path(&pool_clone, path.to_str().unwrap_or("")).await {
                                                Ok(Some(existing)) => {
                                                    if let Ok(metadata) = tokio::fs::metadata(&path).await {
                                                        // 文件仍存在，更新元数据
                                                        let file_size = metadata.len() as i64;
                                                        let file_modified_at = metadata.modified()
                                                            .ok()
                                                            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                                                            .map(|d| d.as_secs() as i64)
                                                            .unwrap_or_else(|| chrono::Utc::now().timestamp());
                                                        
                                                        let req = UpdateImageRequest {
                                                            file_size: Some(file_size),
                                                            file_modified_at: Some(file_modified_at),
                                                            width: None,
                                                            height: None,
                                                            format: None,
                                                            color_space: None,
                                                        };
                                                        
                                                        if let Ok(Some(updated)) = ImageRepository::update(&pool_clone, existing.id, req).await {
                                                            let _ = search_service_clone.index_image(updated.id).await;
                                                            tracing::debug!("Auto-updated image from file monitor: {:?} (id: {})", path, updated.id);
                                                        }
                                                    } else {
                                                        // 文件已不存在（如被删除/重命名到回收站），从数据库移除
                                                        let id = existing.id;
                                                        if let Ok(true) = ImageRepository::delete(&pool_clone, id).await {
                                                            let _ = search_service_clone.remove_image(id).await;
                                                            tracing::info!("Auto-deleted missing image from file monitor: {:?} (id: {})", path, id);
                                                        }
                                                    }
                                                }
                                                _ => {}
                                            }
                                        }
                                    }
                                    FileSystemEvent::Deleted { path, .. } => {
                                        match ImageRepository::get_by_path(&pool_clone, path.to_str().unwrap_or("")).await {
                                            Ok(Some(existing)) => {
                                                let id = existing.id;
                                                if let Ok(true) = ImageRepository::delete(&pool_clone, id).await {
                                                    let _ = search_service_clone.remove_image(id).await;
                                                    tracing::info!("Auto-deleted image from file monitor: {:?} (id: {})", path, id);
                                                }
                                            }
                                            _ => {}
                                        }
                                    }
                                    FileSystemEvent::Batch { paths, location_id } => {
                                        for path in paths {
                                            if is_supported_image(&path) {
                                                if let Ok(metadata) = tokio::fs::metadata(&path).await {
                                                    if metadata.is_file() {
                                                        let (importer, _rx) = ImageImporter::with_thumbnail_service(
                                                            pool_clone.clone(),
                                                            2,
                                                            Arc::clone(&thumbnail_service_clone),
                                                        );
                                                        if let Ok(image) = importer.import_single(&path, location_id).await {
                                                            let _ = search_service_clone.index_image(image.id).await;
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        });
                        
                        app.manage(AppState {
                            db: Arc::new(Mutex::new(pool)),
                            file_monitor,
                            thumbnail_service,
                            search_service,
                            thumbnail_dir: thumbnail_dir_arc,
                        });
                        
                        tracing::info!("Application initialized successfully");
                    }
                    Err(e) => {
                        tracing::error!("Failed to initialize database: {:#}", e);
                    }
                }
            });
            
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
