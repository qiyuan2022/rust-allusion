use tauri::State;
use crate::models::*;
use crate::db;

#[tauri::command]
pub async fn create_location(
    state: State<'_, crate::AppState>,
    req: CreateLocationRequest,
) -> Result<Location, String> {
    let pool = state.db.lock().await;
    db::LocationRepository::create(&pool, req)
        .await
        .map_err(|e| e.to_string())
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
    let pool = state.db.lock().await;
    db::LocationRepository::delete(&pool, id)
        .await
        .map_err(|e| e.to_string())
}
