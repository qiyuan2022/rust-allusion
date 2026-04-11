use serde::{Deserialize, Serialize};
use sqlx::FromRow;

/// 缩略图尺寸类型
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ThumbnailSize {
    /// 小尺寸缩略图: 200px
    Small,
    /// 中尺寸缩略图: 500px
    Medium,
    /// 大尺寸缩略图: 1000px
    Large,
}

impl ThumbnailSize {
    /// 获取缩略图的目标尺寸（增加尺寸以提高清晰度）
    pub fn target_size(&self) -> i32 {
        match self {
            ThumbnailSize::Small => 400,   // 从 200 增加到 400
            ThumbnailSize::Medium => 800,  // 从 500 增加到 800
            ThumbnailSize::Large => 1600,  // 从 1000 增加到 1600
        }
    }

    /// 从字符串解析
    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "small" => Some(ThumbnailSize::Small),
            "medium" => Some(ThumbnailSize::Medium),
            "large" => Some(ThumbnailSize::Large),
            _ => None,
        }
    }

    /// 转换为字符串
    pub fn as_str(&self) -> &'static str {
        match self {
            ThumbnailSize::Small => "small",
            ThumbnailSize::Medium => "medium",
            ThumbnailSize::Large => "large",
        }
    }
}

/// 缩略图记录
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Thumbnail {
    pub id: i64,
    pub image_id: i64,
    pub size_type: String,
    pub path: String,
    pub width: i32,
    pub height: i32,
    pub file_size: i64,
    pub created_at: i64,
}

/// 创建缩略图请求
#[derive(Debug, Clone, Deserialize)]
pub struct CreateThumbnailRequest {
    pub image_id: i64,
    pub size_type: String,
    pub path: String,
    pub width: i32,
    pub height: i32,
    pub file_size: i64,
}

/// 缩略图生成任务
#[derive(Debug, Clone)]
pub struct ThumbnailTask {
    pub image_id: i64,
    pub image_path: String,
    pub image_hash: String,
    pub size: ThumbnailSize,
}

/// 缩略图生成结果
#[derive(Debug, Clone)]
pub struct ThumbnailResult {
    pub task: ThumbnailTask,
    pub success: bool,
    pub path: Option<String>,
    pub width: Option<i32>,
    pub height: Option<i32>,
    pub file_size: Option<i64>,
    pub error: Option<String>,
}

/// 缩略图状态
#[derive(Debug, Clone, Serialize)]
pub struct ThumbnailStatus {
    pub image_id: i64,
    pub has_small: bool,
    pub has_medium: bool,
    pub has_large: bool,
    pub small_path: Option<String>,
    pub medium_path: Option<String>,
    pub large_path: Option<String>,
}

/// 缩略图生成进度
#[derive(Debug, Clone, Serialize)]
pub struct ThumbnailProgress {
    pub total: usize,
    pub completed: usize,
    pub failed: usize,
    pub current_image: Option<String>,
    pub percentage: u8,
}
