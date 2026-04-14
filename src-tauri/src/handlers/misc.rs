use tauri::State;
use std::fs;
use std::path::Path;
use std::collections::HashSet;
use crate::db;
use crate::models::Image;

/// 在文件管理器中显示指定文件（选中该文件）
#[tauri::command]
pub async fn show_in_folder(path: String) -> Result<(), String> {
    let path = Path::new(&path);
    
    if !path.exists() {
        return Err(format!("文件不存在: {}", path.display()));
    }

    if !path.is_file() {
        return Err("路径不是文件".to_string());
    }

    // 获取父目录
    let parent = path.parent().ok_or("无法获取父目录")?;
    
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .args(["/select,", path.to_str().ok_or("路径包含无效字符")?])
            .spawn()
            .map_err(|e| format!("打开资源管理器失败: {}", e))?;
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg("-R")
            .arg(path)
            .spawn()
            .map_err(|e| format!("打开 Finder 失败: {}", e))?;
    }

    #[cfg(target_os = "linux")]
    {
        // Linux 下尝试使用 xdg-open 打开父目录
        std::process::Command::new("xdg-open")
            .arg(parent)
            .spawn()
            .map_err(|e| format!("打开文件管理器失败: {}", e))?;
    }

    Ok(())
}

#[tauri::command]
pub async fn fix_image_dimensions(state: State<'_, crate::AppState>) -> Result<(usize, usize), String> {
    let pool = state.db.lock().await;

    let images = db::ImageRepository::get_without_dimensions(&pool)
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
            if let Ok(true) = db::ImageRepository::update_dimensions(&pool, image.id, width, height, None).await {
                fixed += 1;
            }
        }
    }

    Ok((fixed, total))
}

#[tauri::command]
pub async fn rename_image(
    state: State<'_, crate::AppState>,
    image_id: i64,
    new_name: String,
) -> Result<(), String> {
    let pool = state.db.lock().await;

    // 获取图片信息
    let image = db::ImageRepository::get_by_id(&pool, image_id)
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
    db::ImageRepository::update_path(&pool, image_id, &new_path_str, &new_filename)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn get_db_migration_status(state: State<'_, crate::AppState>) -> Result<serde_json::Value, String> {
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
pub async fn import_allusion_data(
    state: State<'_, crate::AppState>,
    file_path: String,
) -> Result<serde_json::Value, String> {
    let pool = state.db.lock().await;
    tracing::info!("Starting Allusion import from {}", file_path);

    // 读取备份文件
    let content = fs::read_to_string(&file_path)
        .map_err(|e| format!("Failed to read backup file: {}", e))?;

    let backup: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse JSON: {}", e))?;

    // 解析数据
    let all_tables = backup["data"]["data"]
        .as_array()
        .ok_or("Invalid backup format")?;

    // 获取file_tables
    let file_tables = all_tables.iter()
        .find(|t| t["tableName"] == "files")
        .and_then(|t| t["rows"].as_array())
        .ok_or("Files table not found")?;

    tracing::info!("Found files table with {} rows", file_tables.len());

    // 诊断：打印所有表名
    for (idx, table) in all_tables.iter().enumerate() {
        let table_name = table["tableName"].as_str().unwrap_or("unknown");
        let row_count = table["rows"].as_array().map(|r| r.len()).unwrap_or(0);
        tracing::info!("Table {}: name={}, rows={}", idx, table_name, row_count);
    }

    // 获取tags表
    let tag_tables = all_tables.iter()
        .find(|t| t["tableName"] == "tags")
        .and_then(|t| t["rows"].as_array());

    if let Some(tags) = tag_tables {
        tracing::info!("Found tags table with {} rows", tags.len());
        // 打印前3个tag元素用于诊断
        for (idx, tag) in tags.iter().take(3).enumerate() {
            tracing::info!("Tag {}: {:?}", idx, tag);
        }
    } else {
        tracing::warn!("Tags table not found in backup");
    }

    // 构建 tag id 到 tag 名称的映射（id 是 UUID 字符串，不是 i64）
    let mut tag_map = std::collections::HashMap::new();
    if let Some(tags) = tag_tables {
        for tag in tags {
            if let (Some(id), Some(name)) = (tag["id"].as_str(), tag["name"].as_str()) {
                tag_map.insert(id.to_string(), name.to_string());
                tracing::debug!("Mapped tag: {} => {}", id, name);
            } else {
                let id_val = tag["id"].as_str().map(|v| format!("str({})", v)).or_else(|| tag["id"].as_i64().map(|v| format!("i64({})", v))).unwrap_or_else(|| "missing".to_string());
                let name_val = tag["name"].as_str().map(|v| format!("'{}'", v)).unwrap_or_else(|| "missing".to_string());
                tracing::warn!("Failed to parse tag: id_type={}, name_type={}, full={:?}", id_val, name_val, tag);
            }
        }
    }
    tracing::info!("Built tag_map with {} entries", tag_map.len());

    let mut imported = 0;
    let mut skipped = 0;
    let mut errors = Vec::new();
    let mut backup_files_with_tags = 0;

    // 处理每个文件
    for file in file_tables {
        if let Some(absolute_path) = file["absolutePath"].as_str() {
            // 先收集备份文件中的标签名称
            let mut backup_tag_names = Vec::new();
            if let Some(tags) = file["tags"].as_array() {
                for tag_id in tags {
                    if let Some(tag_id_str) = tag_id.as_str() {
                        if let Some(tag_name) = tag_map.get(tag_id_str) {
                            backup_tag_names.push(tag_name.clone());
                        } else {
                            tracing::warn!("Backup tag id {} not found in tag_map", tag_id_str);
                        }
                    }
                }
            }

            // 如果没有标签，跳过此文件
            if backup_tag_names.is_empty() {
                skipped += 1;
                continue;
            }

            backup_files_with_tags += 1;
            tracing::info!("Processing file with tags: {} => {:?}", absolute_path, backup_tag_names);

            let path = Path::new(absolute_path);
            if !path.exists() {
                tracing::warn!("Skipping missing local file: {}", absolute_path);
                skipped += 1;
                continue;
            }

            let hash = match crate::core::importer::compute_file_hash(path).await {
                Ok(h) => h,
                Err(e) => {
                    errors.push(format!("Failed to hash {}: {}", absolute_path, e));
                    continue;
                }
            };

            tracing::info!("Backup tag names for {}: {:?}", absolute_path, backup_tag_names);

            let existing_tags = db::TagRepository::get_tags_for_image(&pool, &hash)
                .await
                .map_err(|e| format!("DB error: {}", e))?;
            let existing_tag_names: HashSet<String> = existing_tags.into_iter().map(|tag| tag.name).collect();
            tracing::info!("Existing tag names for hash {}: {:?}", hash, existing_tag_names);
            let backup_tag_names_set: HashSet<String> = backup_tag_names.iter().cloned().collect();

            let to_add_names: Vec<String> = backup_tag_names_set
                .difference(&existing_tag_names)
                .cloned()
                .collect();
            let to_remove_names: Vec<String> = existing_tag_names
                .difference(&backup_tag_names_set)
                .cloned()
                .collect();

            tracing::info!("For hash {}: to_add_names={:?}, to_remove_names={:?}", hash, to_add_names, to_remove_names);

            // 处理添加标签
            if !to_add_names.is_empty() {
                let mut tag_ids_to_add = Vec::new();
                for tag_name in &to_add_names {
                    let tag = match db::TagRepository::get_by_name(&pool, tag_name).await {
                        Ok(Some(existing_tag)) => existing_tag,
                        Ok(None) => {
                            tracing::info!("Creating new tag {}", tag_name);
                            let create_req = crate::models::CreateTagRequest {
                                name: tag_name.clone(),
                                parent_id: None,
                                color: None,
                            };
                            db::TagRepository::create(&pool, create_req)
                                .await
                                .map_err(|e| format!("Failed to create tag {}: {}", tag_name, e))?
                        }
                        Err(e) => return Err(format!("DB error: {}", e)),
                    };
                    tag_ids_to_add.push(tag.id);
                }
                db::TagRepository::add_tags_to_image(&pool, &hash, tag_ids_to_add)
                    .await
                    .map_err(|e| format!("Failed to add image tags: {}", e))?;
            }

            // 处理移除标签
            if !to_remove_names.is_empty() {
                let mut tag_ids_to_remove = Vec::new();
                for tag_name in &to_remove_names {
                    if let Ok(Some(tag)) = db::TagRepository::get_by_name(&pool, tag_name).await {
                        tag_ids_to_remove.push(tag.id);
                    }
                }
                db::TagRepository::remove_tags_from_image(&pool, &hash, tag_ids_to_remove)
                    .await
                    .map_err(|e| format!("Failed to remove image tags: {}", e))?;
            }

            imported += 1;
        }
    }
    tracing::info!("Finished Allusion import: imported={}, skipped={}, errors={}, backup_files_with_tags={}", imported, skipped, errors.len(), backup_files_with_tags);

    Ok(serde_json::json!({
        "imported": imported,
        "skipped": skipped,
        "errors": errors,
        "backup_files_with_tags": backup_files_with_tags
    }))
}

#[tauri::command]
pub async fn add_tags_to_images(
    state: State<'_, crate::AppState>,
    image_ids: Vec<i64>,
    tag_ids: Vec<i64>,
) -> Result<usize, String> {
    let pool = state.db.lock().await;

    // 获取所有图片的 hash
    let mut hashes = Vec::new();
    for image_id in &image_ids {
        if let Ok(Some(image)) = db::ImageRepository::get_by_id(&pool, *image_id).await {
            hashes.push(image.hash);
        }
    }

    // 批量添加标签
    let mut total_added = 0;
    for hash in &hashes {
        for tag_id in &tag_ids {
            if db::ImageRepository::add_tag(&pool, hash, *tag_id).await.is_ok() {
                total_added += 1;
            }
        }
    }

    Ok(total_added)
}

#[tauri::command]
pub async fn clear_tags_from_images(
    state: State<'_, crate::AppState>,
    image_ids: Vec<i64>,
) -> Result<(), String> {
    let pool = state.db.lock().await;

    // 获取所有图片的 hash 并清除标签
    for image_id in &image_ids {
        if let Ok(Some(image)) = db::ImageRepository::get_by_id(&pool, *image_id).await {
            let _ = db::ImageRepository::clear_tags(&pool, &image.hash).await;
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn delete_images(
    state: State<'_, crate::AppState>,
    image_ids: Vec<i64>,
    delete_source_file: bool,
) -> Result<(), String> {
    let pool = state.db.lock().await;
    let thumbnail_dir = state.thumbnail_dir.read().await;

    for image_id in &image_ids {
        // 获取图片信息
        if let Ok(Some(image)) = db::ImageRepository::get_by_id(&pool, *image_id).await {
            // 删除缩略图文件和记录
            let thumbnail_sizes = ["small", "medium", "large"];
            for size in &thumbnail_sizes {
                // 检查缩略图记录是否存在
                if let Ok(Some(thumbnail)) = db::ThumbnailRepository::get_by_hash_and_size(
                    &pool,
                    &image.hash,
                    size,
                )
                .await
                {
                    // 删除缩略图文件
                    let thumbnail_path = thumbnail_dir.join(&thumbnail.path);
                    if thumbnail_path.exists() {
                        let _ = fs::remove_file(&thumbnail_path);
                    }

                    // 删除缩略图数据库记录
                    let _ = db::ThumbnailRepository::delete(&pool, &image.hash, size).await;
                }
            }

            // 如果需要，删除源文件
            if delete_source_file {
                let _ = fs::remove_file(&image.path);
            }

            // 删除图片数据库记录
            db::ImageRepository::delete(&pool, *image_id)
                .await
                .map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}
