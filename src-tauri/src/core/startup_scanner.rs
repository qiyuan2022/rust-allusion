use anyhow::Result;
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use crate::core::importer::ImageImporter;
use crate::core::SearchService;
use crate::core::ThumbnailService;
use crate::db::{ImageRepository, LocationRepository};
use crate::models::Location;
use sqlx::SqlitePool;

/// 启动扫描结果
#[derive(Debug, Default)]
pub struct StartupScanResult {
    pub scanned_locations: usize,
    pub new_files: usize,
    pub deleted_files: usize,
    pub failed_imports: usize,
}

/// 扫描所有 active location，找出应用关闭期间的变更
pub async fn scan_all_locations_on_startup(
    pool: SqlitePool,
    thumbnail_service: Arc<ThumbnailService>,
    search_service: Arc<SearchService>,
) -> Result<StartupScanResult> {
    let locations = LocationRepository::list_active(&pool).await?;
    let mut result = StartupScanResult {
        scanned_locations: locations.len(),
        ..Default::default()
    };

    if locations.is_empty() {
        return Ok(result);
    }

    tracing::info!(
        "Starting background startup scan for {} locations",
        locations.len()
    );

    for location in locations {
        match scan_single_location(
            &pool,
            &location,
            Arc::clone(&thumbnail_service),
            Arc::clone(&search_service),
        )
        .await
        {
            Ok((new, deleted, failed)) => {
                result.new_files += new;
                result.deleted_files += deleted;
                result.failed_imports += failed;
            }
            Err(e) => {
                tracing::warn!(
                    "Failed to scan location {} ({}): {}",
                    location.id,
                    location.path,
                    e
                );
            }
        }
    }

    tracing::info!(
        "Startup scan completed: {} new, {} deleted, {} failed",
        result.new_files,
        result.deleted_files,
        result.failed_imports
    );

    Ok(result)
}

/// 扫描单个 location，返回 (新增数, 删除数, 失败数)
async fn scan_single_location(
    pool: &SqlitePool,
    location: &Location,
    thumbnail_service: Arc<ThumbnailService>,
    search_service: Arc<SearchService>,
) -> Result<(usize, usize, usize)> {
    let path = Path::new(&location.path);

    // 1. 扫描磁盘实际文件
    let disk_paths = scan_disk_files(path, location.is_recursive).await?;

    // 2. 查询数据库中该 location 下的所有路径
    let db_paths = get_db_paths_for_location(pool, &location.path).await?;

    // 3. 求差集
    let disk_set: HashSet<PathBuf> = disk_paths.into_iter().collect();
    let db_set: HashSet<String> = db_paths.into_iter().collect();

    // 新增：磁盘有，DB 无
    let to_add: Vec<PathBuf> = disk_set
        .iter()
        .filter(|p| {
            let path_str = p.to_string_lossy().to_string();
            !db_set.contains(&path_str)
        })
        .cloned()
        .collect();

    // 删除：DB 有，磁盘无
    let to_delete: Vec<String> = db_set
        .into_iter()
        .filter(|p| {
            let path_buf = PathBuf::from(p);
            !disk_set.contains(&path_buf)
        })
        .collect();

    let mut new_count = 0;
    let mut failed_count = 0;
    let to_add_count = to_add.len();

    // 4. 批量导入新增文件
    if !to_add.is_empty() {
        tracing::info!(
            "Location {}: importing {} new files",
            location.id,
            to_add_count
        );

        let (importer, _rx) = ImageImporter::with_thumbnail_service(
            pool.clone(),
            4,
            thumbnail_service,
        );

        match importer.import_batch(to_add, location.id).await {
            Ok(import_result) => {
                new_count = import_result.images.len();
                failed_count = import_result.failures.len();

                // 为新导入的图片建立搜索索引
                for image in &import_result.images {
                    if let Err(e) = search_service.index_image(image.id).await {
                        tracing::warn!(
                            "Failed to index new image {}: {}",
                            image.id,
                            e
                        );
                    }
                }
            }
            Err(e) => {
                failed_count = to_add_count;
                tracing::error!("Batch import failed for location {}: {}", location.id, e);
            }
        }
    }

    // 5. 清理已删除文件
    let mut deleted_count = 0;
    for db_path in &to_delete {
        if let Ok(Some(image)) = ImageRepository::get_by_path(pool, db_path).await {
            let id = image.id;
            if let Ok(true) = ImageRepository::delete(pool, id).await {
                deleted_count += 1;
                if let Err(e) = search_service.remove_image(id).await {
                    tracing::warn!("Failed to remove deleted image {} from search index: {}", id, e);
                }
            }
        }
    }

    if deleted_count > 0 {
        tracing::info!(
            "Location {}: removed {} deleted files from DB",
            location.id,
            deleted_count
        );
    }

    // 6. 更新 image_count
    if let Err(e) = LocationRepository::recalculate_image_count(pool, location.id).await {
        tracing::warn!(
            "Failed to recalculate image count for location {}: {}",
            location.id,
            e
        );
    }

    Ok((new_count, deleted_count, failed_count))
}

/// 扫描磁盘上的图片文件
async fn scan_disk_files(path: &Path, recursive: bool) -> Result<Vec<PathBuf>> {
    use walkdir::WalkDir;

    let mut paths = Vec::new();

    let walker = if recursive {
        WalkDir::new(path)
    } else {
        WalkDir::new(path).max_depth(1)
    };

    for entry in walker.into_iter().filter_map(|e| e.ok()) {
        if !entry.file_type().is_file() {
            continue;
        }
        let entry_path = entry.path();
        if is_supported_image(entry_path) {
            paths.push(entry_path.to_path_buf());
        }
    }

    Ok(paths)
}

/// 获取数据库中某个 location 下的所有路径
async fn get_db_paths_for_location(pool: &SqlitePool, location_path: &str) -> Result<Vec<String>> {
    let pattern = format!("{}%", location_path);

    let paths: Vec<String> = sqlx::query_scalar("SELECT path FROM images WHERE path LIKE ?1")
        .bind(&pattern)
        .fetch_all(pool)
        .await?;

    Ok(paths)
}

/// 检查是否是支持的图片格式
fn is_supported_image(path: &Path) -> bool {
    let supported_extensions = [
        "jpg", "jpeg", "png", "gif", "webp", "bmp", "tiff", "tif", "raw", "cr2", "nef",
        "arw", "dng", "heic", "heif", "psd", "kra", "svg",
    ];

    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| {
            let ext_lower = ext.to_lowercase();
            supported_extensions.contains(&ext_lower.as_str())
        })
        .unwrap_or(false)
}
