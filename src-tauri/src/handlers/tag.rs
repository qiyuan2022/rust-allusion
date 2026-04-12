use tauri::State;
use crate::models::*;
use crate::db;

#[tauri::command]
pub async fn create_tag(
    state: State<'_, crate::AppState>,
    req: CreateTagRequest,
) -> Result<Tag, String> {
    let pool = state.db.lock().await;
    db::TagRepository::create(&pool, req)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_all_tags(state: State<'_, crate::AppState>) -> Result<Vec<Tag>, String> {
    let pool = state.db.lock().await;
    db::TagRepository::list_all(&pool)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_tag_tree(state: State<'_, crate::AppState>) -> Result<Vec<TagTreeNode>, String> {
    let pool = state.db.lock().await;
    db::TagRepository::get_tree(&pool)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_tag(
    state: State<'_, crate::AppState>,
    id: i64,
    req: UpdateTagRequest,
) -> Result<Option<Tag>, String> {
    let pool = state.db.lock().await;
    db::TagRepository::update(&pool, id, req)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_tag(state: State<'_, crate::AppState>, id: i64) -> Result<bool, String> {
    let pool = state.db.lock().await;
    db::TagRepository::delete(&pool, id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn add_tag_to_image(
    state: State<'_, crate::AppState>,
    image_hash: String,
    tag_id: i64,
) -> Result<(), String> {
    let pool = state.db.lock().await;
    db::ImageRepository::add_tag(&pool, &image_hash, tag_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn remove_tag_from_image(
    state: State<'_, crate::AppState>,
    image_hash: String,
    tag_id: i64,
) -> Result<bool, String> {
    let pool = state.db.lock().await;
    db::ImageRepository::remove_tag(&pool, &image_hash, tag_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn add_tags_to_image(
    state: State<'_, crate::AppState>,
    image_hash: String,
    tag_ids: Vec<i64>,
) -> Result<usize, String> {
    let pool = state.db.lock().await;
    db::TagRepository::add_tags_to_image(&pool, &image_hash, tag_ids)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn remove_tags_from_image(
    state: State<'_, crate::AppState>,
    image_hash: String,
    tag_ids: Vec<i64>,
) -> Result<usize, String> {
    let pool = state.db.lock().await;
    db::TagRepository::remove_tags_from_image(&pool, &image_hash, tag_ids)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_image_tags(
    state: State<'_, crate::AppState>,
    image_hash: String,
) -> Result<Vec<Tag>, String> {
    let pool = state.db.lock().await;
    db::TagRepository::get_tags_for_image(&pool, &image_hash)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn clear_image_tags(
    state: State<'_, crate::AppState>,
    image_hash: String,
) -> Result<(), String> {
    let pool = state.db.lock().await;
    db::ImageRepository::clear_tags(&pool, &image_hash)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn move_tag(
    state: State<'_, crate::AppState>,
    id: i64,
    new_parent_id: Option<i64>,
) -> Result<Option<Tag>, String> {
    let pool = state.db.lock().await;
    db::TagRepository::move_tag(&pool, id, new_parent_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_tagged_images(
    state: State<'_, crate::AppState>,
    tag_id: i64,
    offset: i64,
    limit: i64,
) -> Result<Vec<Image>, String> {
    let pool = state.db.lock().await;
    db::ImageRepository::get_by_tag(&pool, tag_id, offset, limit)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_images_by_tags(
    state: State<'_, crate::AppState>,
    tag_ids: Vec<i64>,
    match_mode: String,
    offset: i64,
    limit: i64,
) -> Result<Vec<Image>, String> {
    let pool = state.db.lock().await;

    let result = if match_mode == "all" {
        db::ImageRepository::get_by_tags_and(&pool, tag_ids, offset, limit).await
    } else {
        db::ImageRepository::get_by_tags_or(&pool, tag_ids, offset, limit).await
    };

    result.map_err(|e| e.to_string())
}
