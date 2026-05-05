use serde::{Deserialize, Serialize};
use sqlx::FromRow;

/// 标签
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Tag {
    pub id: i64,
    pub name: String,
    pub parent_id: Option<i64>,
    pub color: String,
    pub created_at: i64,
    pub updated_at: i64,
    #[serde(default)]
    #[sqlx(default)]
    pub image_count: i64,
}

/// 标签树节点（包含子标签）
#[derive(Debug, Clone, Serialize)]
pub struct TagTreeNode {
    #[serde(flatten)]
    pub tag: Tag,
    pub children: Vec<TagTreeNode>,
    pub image_count: i64,
}

/// 创建标签请求
#[derive(Debug, Clone, Deserialize)]
pub struct CreateTagRequest {
    pub name: String,
    pub parent_id: Option<i64>,
    pub color: Option<String>,
}

/// 更新标签请求
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateTagRequest {
    pub name: Option<String>,
    pub parent_id: Option<i64>,
    pub color: Option<String>,
}

/// 图片标签关联
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct ImageTag {
    pub image_id: i64,
    pub tag_id: i64,
    pub created_at: i64,
}
