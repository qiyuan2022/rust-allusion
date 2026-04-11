use serde::{Deserialize, Serialize};
use sqlx::FromRow;

/// 监控文件夹
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Location {
    pub id: i64,
    pub path: String,
    pub name: String,
    pub is_recursive: bool,
    pub is_active: bool,
    pub image_count: i64,
    pub created_at: i64,
    pub updated_at: i64,
}

/// 创建位置请求
#[derive(Debug, Clone, Deserialize)]
pub struct CreateLocationRequest {
    pub path: String,
    pub name: String,
    pub is_recursive: Option<bool>,
}

/// 更新位置请求
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateLocationRequest {
    pub name: Option<String>,
    pub is_recursive: Option<bool>,
    pub is_active: Option<bool>,
}
