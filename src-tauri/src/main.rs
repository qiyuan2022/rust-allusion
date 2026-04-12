// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Arc;
use tauri::{Manager};
use tokio::sync::Mutex;

mod core;
mod db;
mod models;
mod handlers;

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
}

fn main() {
    tracing_subscriber::fmt::init();
    
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
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
            // 缩略图命令
            generate_thumbnail,
            get_thumbnail_path,
            get_thumbnail_status,
            generate_all_thumbnails,
            check_thumbnails_integrity,
            fix_missing_thumbnails,
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
