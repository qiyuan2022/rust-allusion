use tauri::State;
use crate::models::*;

#[tauri::command]
pub async fn search_images(
    state: State<'_, crate::AppState>,
    query: SearchQueryRequest,
) -> Result<SearchResponse, String> {
    state
        .search_service
        .search(query.into())
        .await
        .map(|r| r.into())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_search_index_status(state: State<'_, crate::AppState>) -> Result<IndexStatus, String> {
    let stats = state
        .search_service
        .get_stats()
        .await
        .map_err(|e| e.to_string())?;

    Ok(IndexStatus {
        indexed_count: stats.indexed_count,
        total_images: stats.total_images,
        is_up_to_date: stats.indexed_count == stats.total_images,
    })
}

#[tauri::command]
pub async fn rebuild_search_index(state: State<'_, crate::AppState>) -> Result<usize, String> {
    state
        .search_service
        .reindex_all()
        .await
        .map_err(|e| e.to_string())
}
