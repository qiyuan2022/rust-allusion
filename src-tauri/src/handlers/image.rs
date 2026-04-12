use tauri::State;
use crate::models::*;
use crate::db;

pub struct AppState;

#[tauri::command]
pub async fn create_image(
    state: State<'_, crate::AppState>,
    req: CreateImageRequest,
) -> Result<Image, String> {
    let pool = state.db.lock().await;
    db::ImageRepository::create(&pool, req)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_image_by_id(
    state: State<'_, crate::AppState>,
    id: i64,
) -> Result<Option<Image>, String> {
    let pool = state.db.lock().await;
    db::ImageRepository::get_by_id(&pool, id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_image_with_tags(
    state: State<'_, crate::AppState>,
    image_id: i64,
) -> Result<Option<ImageWithTags>, String> {
    let pool = state.db.lock().await;
    db::ImageRepository::get_with_tags(&pool, image_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_images(
    state: State<'_, crate::AppState>,
    offset: i64,
    limit: i64,
) -> Result<Vec<Image>, String> {
    let pool = state.db.lock().await;
    db::ImageRepository::list(&pool, offset, limit)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_images_with_tags(
    state: State<'_, crate::AppState>,
    offset: i64,
    limit: i64,
    sort_by: Option<String>,
    sort_order: Option<String>,
) -> Result<Vec<ImageWithTags>, String> {
    let pool = state.db.lock().await;

    // 解析排序字段
    let sort_column = match sort_by.as_deref() {
        Some("created_at") => "created_at",
        Some("modified_at") => "file_modified_at",
        Some("file_name") => "file_name",
        Some("file_size") => "file_size",
        _ => "file_modified_at",
    };

    // 解析排序方向
    let desc = match sort_order.as_deref() {
        Some("asc") => false,
        Some("desc") => true,
        _ => true,
    };

    let results = db::ImageRepository::list_with_tags_sort(&pool, offset, limit, sort_column, desc)
        .await
        .map_err(|e| e.to_string())?;

    Ok(results.into_iter().map(|(image, tags)| ImageWithTags { image, tags }).collect())
}

#[tauri::command]
pub async fn list_images_with_thumbnail(
    state: State<'_, crate::AppState>,
    offset: i64,
    limit: i64,
    sort_by: Option<String>,
    sort_order: Option<String>,
) -> Result<Vec<ImageWithThumbnail>, String> {
    let pool = state.db.lock().await;

    // 解析排序字段
    let sort_column = match sort_by.as_deref() {
        Some("created_at") => "created_at",
        Some("modified_at") => "file_modified_at",
        Some("file_name") => "file_name",
        Some("file_size") => "file_size",
        _ => "file_modified_at",
    };

    // 解析排序方向
    let desc = match sort_order.as_deref() {
        Some("asc") => false,
        Some("desc") => true,
        _ => true,
    };

    let results = db::ImageRepository::list_with_tags_and_thumbnail_sort(
        &pool, offset, limit, sort_column, desc
    )
        .await
        .map_err(|e| e.to_string())?;

    Ok(results.into_iter().map(|(image, tags, thumbnail_path)| {
        ImageWithThumbnail { image, tags, thumbnail_path }
    }).collect())
}

#[tauri::command]
pub async fn get_all_images(
    state: State<'_, crate::AppState>,
    sort_by: Option<String>,
    sort_order: Option<String>,
) -> Result<Vec<ImageWithThumbnail>, String> {
    let pool = state.db.lock().await;

    // 解析排序字段
    let sort_column = match sort_by.as_deref() {
        Some("created_at") => "created_at",
        Some("modified_at") => "file_modified_at",
        Some("file_name") => "file_name",
        Some("file_size") => "file_size",
        _ => "file_modified_at",
    };

    // 解析排序方向
    let desc = match sort_order.as_deref() {
        Some("asc") => false,
        Some("desc") => true,
        _ => true,
    };

    // 使用带缩略图的方法
    let results = db::ImageRepository::get_all_with_tags_and_thumbnail(&pool, sort_column, desc)
        .await
        .map_err(|e| e.to_string())?;

    Ok(results.into_iter().map(|(image, tags, thumbnail_path)| {
        ImageWithThumbnail { image, tags, thumbnail_path }
    }).collect())
}

#[tauri::command]
pub async fn count_images(state: State<'_, crate::AppState>) -> Result<i64, String> {
    let pool = state.db.lock().await;
    db::ImageRepository::count(&pool)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_image(state: State<'_, crate::AppState>, id: i64) -> Result<bool, String> {
    let pool = state.db.lock().await;
    db::ImageRepository::delete(&pool, id)
        .await
        .map_err(|e| e.to_string())
}
