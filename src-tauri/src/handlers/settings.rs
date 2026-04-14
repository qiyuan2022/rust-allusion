use std::path::{Path, PathBuf};
use tauri::State;

use crate::db::DbPool;

/// 检查 child 是否是 parent 的子目录（或相同）
fn is_subpath(child: &Path, parent: &Path) -> bool {
    child.starts_with(parent)
}

/// 应用状态中的缩略图目录管理辅助函数
pub async fn get_thumbnail_base_dir(pool: &DbPool) -> Result<PathBuf, String> {
    let dir: Option<String> = sqlx::query_scalar(
        "SELECT value FROM settings WHERE key = 'thumbnail_dir'"
    )
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;

    let base = match dir {
        Some(d) if !d.is_empty() => PathBuf::from(d),
        _ => {
            // 返回默认路径的逻辑在调用方（有 AppHandle 时）处理
            // 但作为兜底，使用 dirs::data_dir
            dirs::data_dir()
                .ok_or_else(|| "Failed to get data dir".to_string())?
                .join("com.allusion-rs.app")
        }
    };

    Ok(base.join("thumbnails"))
}

#[tauri::command]
pub async fn get_setting(
    state: State<'_, crate::AppState>,
    key: String,
) -> Result<Option<String>, String> {
    let pool = state.db.lock().await;
    let value: Option<String> = sqlx::query_scalar(
        "SELECT value FROM settings WHERE key = ?1"
    )
    .bind(&key)
    .fetch_optional(&*pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(value)
}

#[tauri::command]
pub async fn set_setting(
    state: State<'_, crate::AppState>,
    key: String,
    value: String,
) -> Result<(), String> {
    let pool = state.db.lock().await;
    sqlx::query(
        "INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, ?3)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"
    )
    .bind(&key)
    .bind(&value)
    .bind(chrono::Utc::now().timestamp())
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn get_thumbnail_dir(
    state: State<'_, crate::AppState>,
) -> Result<String, String> {
    let dir = state.thumbnail_dir.read().await;
    Ok(dir.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn set_thumbnail_dir(
    state: State<'_, crate::AppState>,
    dir: String,
) -> Result<serde_json::Value, String> {
    let new_base = PathBuf::from(&dir);
    let new_dir = new_base.join("thumbnails");

    // 校验：缩略图目录不能是已存在位置的子目录
    let pool = state.db.lock().await;
    let locations = crate::db::LocationRepository::list_all(&pool)
        .await
        .map_err(|e| e.to_string())?;
    for loc in locations {
        let loc_path = Path::new(&loc.path);
        if is_subpath(&new_dir, loc_path) {
            return Err(format!(
                "缩略图目录不能位于已存在位置的子目录中: {}",
                loc.path
            ));
        }
    }
    drop(pool);

    // 获取当前目录（旧目录）
    let old_dir = state.thumbnail_dir.read().await.clone();

    // 创建新目录
    if !new_dir.exists() {
        std::fs::create_dir_all(&new_dir)
            .map_err(|e| format!("Failed to create new thumbnail directory: {}", e))?;
    }

    // 移动旧目录中的 .jpg 文件到新目录
    let mut moved = 0usize;
    let mut failed = 0usize;

    if old_dir.exists() && old_dir != new_dir {
        if let Ok(entries) = std::fs::read_dir(&old_dir) {
            for entry in entries.filter_map(|e| e.ok()) {
                let path = entry.path();
                if path.extension().map(|e| e == "jpg").unwrap_or(false) {
                    let file_name = path.file_name().unwrap_or_default();
                    let dest = new_dir.join(file_name);
                    if let Err(e) = std::fs::rename(&path, &dest) {
                        // rename 跨盘符可能失败，尝试复制后删除
                        if let Err(e2) = std::fs::copy(&path, &dest).and_then(|_| std::fs::remove_file(&path)) {
                            tracing::warn!("Failed to move thumbnail {:?}: {} (copy fallback: {})", path, e, e2);
                            failed += 1;
                        } else {
                            moved += 1;
                        }
                    } else {
                        moved += 1;
                    }
                }
            }
        }
    }

    // 更新数据库设置
    let pool = state.db.lock().await;
    sqlx::query(
        "INSERT INTO settings (key, value, updated_at) VALUES ('thumbnail_dir', ?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"
    )
    .bind(&dir)
    .bind(chrono::Utc::now().timestamp())
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    // 更新 AppState 和 ThumbnailService 中的目录
    {
        let mut app_dir = state.thumbnail_dir.write().await;
        *app_dir = new_dir.clone();
    }
    state.thumbnail_service.set_thumbnail_dir(new_dir.clone()).await;

    tracing::info!(
        "Thumbnail directory changed from {:?} to {:?}, moved: {}, failed: {}",
        old_dir, new_dir, moved, failed
    );

    Ok(serde_json::json!({
        "moved": moved,
        "failed": failed,
        "old_dir": old_dir.to_string_lossy().to_string(),
        "new_dir": new_dir.to_string_lossy().to_string(),
    }))
}
