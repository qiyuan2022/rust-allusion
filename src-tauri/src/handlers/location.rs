use std::path::Path;
use tauri::State;
use crate::models::*;
use crate::db;

/// 检查 child 是否是 parent 的子目录（或相同）
fn is_subpath(child: &Path, parent: &Path) -> bool {
    child.starts_with(parent)
}

#[tauri::command]
pub async fn create_location(
    state: State<'_, crate::AppState>,
    req: CreateLocationRequest,
) -> Result<Location, String> {
    let loc_path = Path::new(&req.path);
    let thumb_dir = state.thumbnail_dir.read().await;

    // 校验：位置不能是缩略图目录或其子目录，也不能包含缩略图目录
    if is_subpath(loc_path, &thumb_dir) || is_subpath(&thumb_dir, loc_path) {
        return Err("位置不能是缩略图目录或其子目录，也不能包含缩略图目录".to_string());
    }
    drop(thumb_dir);

    let pool = state.db.lock().await;
    let existing_locations = db::LocationRepository::list_all(&pool)
        .await
        .map_err(|e| e.to_string())?;

    for existing in existing_locations {
        let existing_path = Path::new(&existing.path);
        // 校验：新位置不能是已有位置的子目录，也不能包含已有位置
        if is_subpath(loc_path, existing_path) {
            return Err(format!(
                "新位置不能位于已存在位置 '{}' 的子目录中",
                existing.path
            ));
        }
        if is_subpath(existing_path, loc_path) {
            return Err(format!(
                "新位置不能包含已存在位置 '{}'",
                existing.path
            ));
        }
    }

    let location = db::LocationRepository::create(&pool, req)
        .await
        .map_err(|e| e.to_string())?;

    // 启动文件监控
    let path = Path::new(&location.path);
    let _ = state.file_monitor.add_location(location.id, path, location.is_recursive).await;

    Ok(location)
}

#[tauri::command]
pub async fn get_all_locations(state: State<'_, crate::AppState>) -> Result<Vec<Location>, String> {
    let pool = state.db.lock().await;
    db::LocationRepository::list_all(&pool)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_location(
    state: State<'_, crate::AppState>,
    id: i64,
    req: UpdateLocationRequest,
) -> Result<Option<Location>, String> {
    let pool = state.db.lock().await;
    db::LocationRepository::update(&pool, id, req)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_location(state: State<'_, crate::AppState>, id: i64) -> Result<bool, String> {
    // 停止文件监控
    let _ = state.file_monitor.remove_location(id).await;

    let pool = state.db.lock().await;
    db::LocationRepository::delete(&pool, id)
        .await
        .map_err(|e| e.to_string())
}
