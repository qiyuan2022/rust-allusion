use serde::{Deserialize, Serialize};

/// 搜索查询参数
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SearchQueryRequest {
    pub text: Option<String>,
    #[serde(default)]
    pub tag_ids: Vec<i64>,
    #[serde(default)]
    pub exclude_tag_ids: Vec<i64>,
    pub date_from: Option<i64>,
    pub date_to: Option<i64>,
    pub min_width: Option<u32>,
    pub min_height: Option<u32>,
    #[serde(default)]
    pub formats: Vec<String>,
    #[serde(default)]
    pub sort_by: SortBy,
    #[serde(default = "default_limit")]
    pub limit: usize,
    #[serde(default)]
    pub offset: usize,
}

fn default_limit() -> usize {
    50
}

/// 排序方式
#[derive(Debug, Clone, Copy, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum SortBy {
    #[default]
    Relevance,
    CreatedAt,
    ModifiedAt,
    FileName,
    FileSize,
}

/// 搜索结果
#[derive(Debug, Clone, Serialize)]
pub struct SearchResultItem {
    pub image_id: i64,
    pub score: f32,
    pub highlights: Vec<String>,
}

/// 搜索结果响应
#[derive(Debug, Clone, Serialize)]
pub struct SearchResponse {
    pub total: usize,
    pub hits: Vec<SearchResultItem>,
    pub has_more: bool,
}

/// 索引状态
#[derive(Debug, Clone, Serialize)]
pub struct IndexStatus {
    pub indexed_count: usize,
    pub total_images: usize,
    pub is_up_to_date: bool,
}

/// 高级搜索条件
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdvancedSearchRequest {
    pub conditions: Vec<SearchCondition>,
    #[serde(default)]
    pub match_mode: MatchMode,
    pub sort_by: Option<SortBy>,
    pub limit: Option<usize>,
    pub offset: Option<usize>,
}

/// 搜索条件
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "value")]
pub enum SearchCondition {
    /// 文本搜索（文件名、路径）
    Text(String),
    /// 标签过滤
    Tag(i64),
    /// 排除标签
    ExcludeTag(i64),
    /// 时间范围
    DateRange { from: Option<i64>, to: Option<i64> },
    /// 尺寸范围
    SizeRange {
        min_width: Option<u32>,
        min_height: Option<u32>,
        max_width: Option<u32>,
        max_height: Option<u32>,
    },
    /// 格式过滤
    Format(String),
}

/// 匹配模式
#[derive(Debug, Clone, Copy, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum MatchMode {
    /// 所有条件必须满足 (AND)
    All,
    /// 任一条件满足即可 (OR)
    #[default]
    Any,
}

impl From<SortBy> for crate::core::SortField {
    fn from(sort_by: SortBy) -> Self {
        match sort_by {
            SortBy::Relevance => crate::core::SortField::Relevance,
            SortBy::CreatedAt => crate::core::SortField::CreatedAt,
            SortBy::ModifiedAt => crate::core::SortField::ModifiedAt,
            SortBy::FileName => crate::core::SortField::FileName,
            SortBy::FileSize => crate::core::SortField::FileSize,
        }
    }
}

impl From<SearchQueryRequest> for crate::core::SearchQuery {
    fn from(req: SearchQueryRequest) -> Self {
        Self {
            text: req.text,
            tag_ids: req.tag_ids,
            exclude_tag_ids: req.exclude_tag_ids,
            date_from: req.date_from,
            date_to: req.date_to,
            min_width: req.min_width,
            min_height: req.min_height,
            formats: req.formats,
            sort_by: req.sort_by.into(),
            limit: req.limit,
            offset: req.offset,
        }
    }
}

impl From<crate::core::SearchResults> for SearchResponse {
    fn from(results: crate::core::SearchResults) -> Self {
        Self {
            total: results.total,
            hits: results
                .hits
                .into_iter()
                .map(|h| SearchResultItem {
                    image_id: h.image_id,
                    score: h.score,
                    highlights: h.highlights,
                })
                .collect(),
            has_more: results.has_more,
        }
    }
}
