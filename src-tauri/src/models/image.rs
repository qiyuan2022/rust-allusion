use serde::{Deserialize, Serialize};
use sqlx::FromRow;

/// 图片元数据
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Image {
    pub id: i64,
    pub path: String,
    pub hash: String,
    pub file_name: String,
    pub file_size: i64,
    pub file_modified_at: i64,
    pub width: Option<i32>,
    pub height: Option<i32>,
    pub format: Option<String>,
    pub color_space: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

/// 创建图片请求
#[derive(Debug, Clone, Deserialize)]
pub struct CreateImageRequest {
    pub path: String,
    pub hash: String,
    pub file_name: String,
    pub file_size: i64,
    pub file_modified_at: i64,
    pub width: Option<i32>,
    pub height: Option<i32>,
    pub format: Option<String>,
    pub color_space: Option<String>,
}

/// 更新图片请求
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateImageRequest {
    pub file_size: Option<i64>,
    pub file_modified_at: Option<i64>,
    pub width: Option<i32>,
    pub height: Option<i32>,
    pub format: Option<String>,
    pub color_space: Option<String>,
}

/// 带标签的图片
#[derive(Debug, Clone, Serialize)]
pub struct ImageWithTags {
    #[serde(flatten)]
    pub image: Image,
    pub tags: Vec<crate::models::Tag>,
}

/// 带缩略图路径的图片（用于前端展示）
#[derive(Debug, Clone, Serialize)]
pub struct ImageWithThumbnail {
    #[serde(flatten)]
    pub image: Image,
    pub tags: Vec<crate::models::Tag>,
    /// 缩略图路径（small 尺寸）
    pub thumbnail_path: Option<String>,
}
