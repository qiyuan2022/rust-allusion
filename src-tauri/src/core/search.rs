use anyhow::Result;
use std::ops::Bound;
use std::path::PathBuf;
use std::sync::Arc;
use tantivy::{
    collector::TopDocs,
    directory::MmapDirectory,
    doc,
    query::{AllQuery, BooleanQuery, Occur, QueryParser, RangeQuery, TermQuery},
    schema::{
        Field, IndexRecordOption, Schema, TextFieldIndexing, TextOptions, Value, FAST, INDEXED, STORED,
        STRING,
    },
    tokenizer::{LowerCaser, SimpleTokenizer, TextAnalyzer},
    Index, IndexReader, IndexWriter, ReloadPolicy, Term,
};
use tokio::sync::RwLock;

/// 搜索文档结构
#[derive(Debug, Clone)]
pub struct ImageDocument {
    pub image_id: i64,
    pub path: String,
    pub file_name: String,
    pub tags: Vec<String>,       // 标签名称（用于显示）
    pub tag_ids: Vec<i64>,       // 标签ID（用于搜索）
    pub width: u32,
    pub height: u32,
    pub format: String,
    pub created_at: i64,
    pub file_modified_at: i64,
}

/// 搜索查询
#[derive(Debug, Clone, Default)]
pub struct SearchQuery {
    pub text: Option<String>,
    pub tag_ids: Vec<i64>,
    pub exclude_tag_ids: Vec<i64>,
    pub date_from: Option<i64>,
    pub date_to: Option<i64>,
    pub min_width: Option<u32>,
    pub min_height: Option<u32>,
    pub formats: Vec<String>,
    pub sort_by: SortField,
    pub limit: usize,
    pub offset: usize,
}

/// 排序字段
#[derive(Debug, Clone, Copy, Default)]
pub enum SortField {
    #[default]
    Relevance,
    CreatedAt,
    ModifiedAt,
    FileName,
    FileSize,
}

/// 搜索结果
#[derive(Debug, Clone)]
pub struct SearchResult {
    pub image_id: i64,
    pub score: f32,
    pub highlights: Vec<String>,
}

/// 搜索结果集
#[derive(Debug, Clone)]
pub struct SearchResults {
    pub total: usize,
    pub hits: Vec<SearchResult>,
    pub has_more: bool,
}

/// 图片搜索索引
pub struct ImageSearchIndex {
    index: Index,
    reader: IndexReader,
    _schema: Schema,
    // 字段缓存
    field_image_id: Field,
    field_path: Field,
    field_file_name: Field,
    field_tags: Field,
    field_tag_ids: Field,  // 标签ID字段（用于精确搜索）
    field_width: Field,
    field_height: Field,
    field_format: Field,
    field_created_at: Field,
    field_modified_at: Field,
}

impl ImageSearchIndex {
    /// 创建或打开索引
    pub fn open(index_dir: PathBuf) -> Result<Self> {
        // 确保目录存在
        std::fs::create_dir_all(&index_dir)?;

        let (schema, fields) = Self::build_schema();

        let index = if Index::exists(&MmapDirectory::open(&index_dir)?)? {
            // 尝试打开现有索引并检查 schema 是否兼容
            let existing_index = Index::open_in_dir(&index_dir)?;
            let existing_schema = existing_index.schema();
            
            // 检查是否包含必需的字段
            let has_tag_ids = existing_schema.get_field("tag_ids").is_ok();
            
            if has_tag_ids {
                // Schema 兼容，使用现有索引
                existing_index
            } else {
                // Schema 不兼容，删除旧索引并重新创建
                tracing::warn!("Search index schema outdated, rebuilding...");
                drop(existing_index);
                std::fs::remove_dir_all(&index_dir)?;
                std::fs::create_dir_all(&index_dir)?;
                Index::create_in_dir(&index_dir, schema.clone())?
            }
        } else {
            Index::create_in_dir(&index_dir, schema.clone())?
        };

        // 配置自定义分词器
        let tokenizer = TextAnalyzer::builder(SimpleTokenizer::default())
            .filter(LowerCaser)
            .build();
        index.tokenizers().register("custom", tokenizer);

        let reader = index
            .reader_builder()
            .reload_policy(ReloadPolicy::Manual)
            .try_into()?;

        Ok(Self {
            index,
            reader,
            _schema: schema,
            field_image_id: fields.0,
            field_path: fields.1,
            field_file_name: fields.2,
            field_tags: fields.3,
            field_tag_ids: fields.4,
            field_width: fields.5,
            field_height: fields.6,
            field_format: fields.7,
            field_created_at: fields.8,
            field_modified_at: fields.9,
        })
    }

    /// 构建索引 schema
    fn build_schema() -> (Schema, (Field, Field, Field, Field, Field, Field, Field, Field, Field, Field)) {
        let mut schema_builder = Schema::builder();

        // 图片 ID (存储，用于关联数据库)
        let field_image_id = schema_builder.add_i64_field("image_id", STORED | INDEXED);

        // 文件路径 (存储 + 索引，支持路径搜索)
        let field_path = schema_builder.add_text_field(
            "path",
            TextOptions::default()
                .set_indexing_options(
                    TextFieldIndexing::default()
                        .set_tokenizer("custom")
                        .set_index_option(IndexRecordOption::WithFreqsAndPositions),
                )
                .set_stored(),
        );

        // 文件名 (全文搜索主要字段)
        let field_file_name = schema_builder.add_text_field(
            "file_name",
            TextOptions::default()
                .set_indexing_options(
                    TextFieldIndexing::default()
                        .set_tokenizer("custom")
                        .set_index_option(IndexRecordOption::WithFreqsAndPositions),
                )
                .set_stored(),
        );

        // 标签名称 (字符串数组，用于显示和文本搜索)
        let field_tags = schema_builder.add_text_field("tags", STRING | STORED);

        // 标签ID (i64数组，用于精确匹配标签筛选)
        let field_tag_ids = schema_builder.add_i64_field("tag_ids", INDEXED | FAST | STORED);

        // 尺寸 (用于范围过滤)
        let field_width = schema_builder.add_u64_field("width", INDEXED | FAST | STORED);
        let field_height = schema_builder.add_u64_field("height", INDEXED | FAST | STORED);

        // 格式 (精确匹配)
        let field_format = schema_builder.add_text_field("format", STRING | STORED);

        // 时间戳 (用于排序和范围过滤)
        let field_created_at = schema_builder.add_i64_field("created_at", INDEXED | FAST | STORED);
        let field_modified_at =
            schema_builder.add_i64_field("modified_at", INDEXED | FAST | STORED);

        let schema = schema_builder.build();

        (
            schema,
            (
                field_image_id,
                field_path,
                field_file_name,
                field_tags,
                field_tag_ids,
                field_width,
                field_height,
                field_format,
                field_created_at,
                field_modified_at,
            ),
        )
    }

    /// 获取写入器
    pub fn writer(&self) -> Result<IndexWriter> {
        // 50MB 堆内存限制
        Ok(self.index.writer(50_000_000)?)
    }

    /// 添加/更新文档
    pub fn add_document(&self, writer: &mut IndexWriter, doc: &ImageDocument) -> Result<()> {
        let mut tantivy_doc = doc!(
            self.field_image_id => doc.image_id as i64,
            self.field_path => doc.path.clone(),
            self.field_file_name => doc.file_name.clone(),
            self.field_width => doc.width as u64,
            self.field_height => doc.height as u64,
            self.field_format => doc.format.clone(),
            self.field_created_at => doc.created_at,
            self.field_modified_at => doc.file_modified_at,
        );

        // 添加标签名称（多值字段，用于文本搜索）
        for tag in &doc.tags {
            tantivy_doc.add_text(self.field_tags, tag.clone());
        }

        // 添加标签ID（多值字段，用于精确筛选）
        for tag_id in &doc.tag_ids {
            tantivy_doc.add_i64(self.field_tag_ids, *tag_id);
        }
        
        tracing::debug!(
            "Indexing image {} with tag_ids: {:?}",
            doc.image_id,
            doc.tag_ids
        );

        // 删除旧文档（如果存在）
        let term = Term::from_field_i64(self.field_image_id, doc.image_id as i64);
        writer.delete_term(term);

        // 添加新文档
        writer.add_document(tantivy_doc)?;

        Ok(())
    }

    /// 删除文档
    pub fn delete_document(&self, writer: &mut IndexWriter, image_id: i64) -> Result<()> {
        let term = Term::from_field_i64(self.field_image_id, image_id as i64);
        writer.delete_term(term);
        Ok(())
    }

    /// 提交更改
    pub fn commit(&self, writer: &mut IndexWriter) -> Result<()> {
        writer.commit()?;
        self.reader.reload()?;
        Ok(())
    }

    /// 执行搜索
    pub fn search(&self, query: &SearchQuery) -> Result<SearchResults> {
        let searcher = self.reader.searcher();
        let tantivy_query = self.build_query(query)?;

        // 计算实际需要获取的数量
        let limit = query.limit + query.offset;
        let top_docs = TopDocs::with_limit(limit);

        let results = searcher.search(&tantivy_query, &top_docs)?;

        let total = results.len();
        
        tracing::debug!("Search returned {} raw results", total);
        
        let hits: Vec<SearchResult> = results
            .into_iter()
            .skip(query.offset)
            .map(|(score, doc_address)| {
                let doc: tantivy::TantivyDocument = searcher.doc(doc_address).ok()?;
                let image_id: i64 = doc
                    .get_first(self.field_image_id)
                    .and_then(|v| v.as_i64())
                    .unwrap_or(0);
                
                // 获取文档的标签ID用于调试
                let doc_tag_ids: Vec<i64> = doc
                    .get_all(self.field_tag_ids)
                    .filter_map(|v| v.as_i64())
                    .collect();
                
                tracing::debug!(
                    "Found doc: image_id={}, tag_ids={:?}",
                    image_id,
                    doc_tag_ids
                );

                // TODO: 高亮处理
                let highlights = Vec::new();

                Some(SearchResult {
                    image_id,
                    score,
                    highlights,
                })
            })
            .flatten()
            .collect();

        tracing::debug!("Search returned {} hits", hits.len());

        Ok(SearchResults {
            total,
            hits,
            has_more: total > limit,
        })
    }

    /// 构建 Tantivy 查询
    fn build_query(&self, query: &SearchQuery) -> Result<Box<dyn tantivy::query::Query>> {
        let mut sub_queries: Vec<(Occur, Box<dyn tantivy::query::Query>)> = Vec::new();

        tracing::debug!(
            "Building query with text: {:?}, tag_ids: {:?}",
            query.text,
            query.tag_ids
        );

        // 文本搜索
        if let Some(text) = &query.text {
            if !text.is_empty() {
                let query_parser =
                    QueryParser::for_index(&self.index, vec![self.field_file_name, self.field_path]);
                let text_query = query_parser.parse_query(text)?;
                sub_queries.push((Occur::Must, text_query));
            }
        }

        // 标签过滤（使用 tag_ids 字段精确匹配）
        for tag_id in &query.tag_ids {
            let term = Term::from_field_i64(self.field_tag_ids, *tag_id);
            tracing::debug!("Adding tag filter for tag_id: {}", tag_id);
            let tag_query = TermQuery::new(term, IndexRecordOption::Basic);
            sub_queries.push((Occur::Must, Box::new(tag_query)));
        }

        // 排除标签
        for tag_id in &query.exclude_tag_ids {
            let term = Term::from_field_i64(self.field_tag_ids, *tag_id);
            let tag_query = TermQuery::new(term, IndexRecordOption::Basic);
            sub_queries.push((Occur::MustNot, Box::new(tag_query)));
        }

        // 时间范围
        if query.date_from.is_some() || query.date_to.is_some() {
            let schema = self.index.schema();
            let field_name = schema.get_field_name(self.field_modified_at).to_string();
            let from = query.date_from.map(|v| Bound::Included(v)).unwrap_or(Bound::Unbounded);
            let to = query.date_to.map(|v| Bound::Included(v)).unwrap_or(Bound::Unbounded);
            let range_query = RangeQuery::new_i64_bounds(
                field_name,
                from,
                to,
            );
            sub_queries.push((Occur::Must, Box::new(range_query)));
        }

        // 最小尺寸
        if let Some(min_width) = query.min_width {
            let schema = self.index.schema();
            let field_name = schema.get_field_name(self.field_width).to_string();
            let range_query = RangeQuery::new_u64(
                field_name,
                min_width as u64..u64::MAX,
            );
            sub_queries.push((Occur::Must, Box::new(range_query)));
        }

        if let Some(min_height) = query.min_height {
            let schema = self.index.schema();
            let field_name = schema.get_field_name(self.field_height).to_string();
            let range_query = RangeQuery::new_u64(
                field_name,
                min_height as u64..u64::MAX,
            );
            sub_queries.push((Occur::Must, Box::new(range_query)));
        }

        // 格式过滤
        if !query.formats.is_empty() {
            let format_queries: Vec<_> = query
                .formats
                .iter()
                .map(|format| {
                    let term = Term::from_field_text(self.field_format, format);
                    Box::new(TermQuery::new(term, IndexRecordOption::Basic))
                        as Box<dyn tantivy::query::Query>
                })
                .collect();

            // 使用 OR 连接多个格式
            if format_queries.len() == 1 {
                sub_queries.push((Occur::Must, format_queries.into_iter().next().unwrap()));
            } else {
                let boolean_query = BooleanQuery::new(
                    format_queries.into_iter().map(|q| (Occur::Should, q)).collect()
                );
                sub_queries.push((Occur::Must, Box::new(boolean_query)));
            }
        }

        if sub_queries.is_empty() {
            // 空查询匹配所有
            let all_query = AllQuery;
            Ok(Box::new(all_query))
        } else {
            Ok(Box::new(BooleanQuery::new(sub_queries)))
        }
    }

    /// 重建索引（全量重建）
    pub fn rebuild(&self) -> Result<IndexWriter> {
        // 删除所有文档
        let mut writer = self.writer()?;
        writer.delete_all_documents()?;
        writer.commit()?;
        self.reader.reload()?;
        Ok(writer)
    }

    /// 获取文档数量
    pub fn doc_count(&self) -> Result<usize> {
        let searcher = self.reader.searcher();
        Ok(searcher.num_docs() as usize)
    }
}

/// 搜索服务
pub struct SearchService {
    index: Arc<RwLock<ImageSearchIndex>>,
}

impl SearchService {
    /// 创建搜索服务
    pub fn new(index_dir: PathBuf) -> Result<Self> {
        let index = ImageSearchIndex::open(index_dir)?;
        Ok(Self {
            index: Arc::new(RwLock::new(index)),
        })
    }

    /// 索引单张图片
    pub async fn index_image(&self, doc: ImageDocument) -> Result<()> {
        let index = self.index.write().await;
        let mut writer = index.writer()?;
        index.add_document(&mut writer, &doc)?;
        index.commit(&mut writer)?;
        Ok(())
    }

    /// 批量索引图片
    pub async fn index_images_batch(&self, docs: Vec<ImageDocument>) -> Result<usize> {
        let count = docs.len();
        let index = self.index.write().await;
        let mut writer = index.writer()?;

        for doc in docs {
            index.add_document(&mut writer, &doc)?;
        }

        index.commit(&mut writer)?;
        Ok(count)
    }

    /// 删除图片索引
    pub async fn remove_image(&self, image_id: i64) -> Result<()> {
        let index = self.index.write().await;
        let mut writer = index.writer()?;
        index.delete_document(&mut writer, image_id)?;
        index.commit(&mut writer)?;
        Ok(())
    }

    /// 执行搜索
    pub async fn search(&self, query: SearchQuery) -> Result<SearchResults> {
        let index = self.index.read().await;
        index.search(&query)
    }

    /// 获取索引文档数量
    pub async fn doc_count(&self) -> Result<usize> {
        let index = self.index.read().await;
        index.doc_count()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_schema_build() {
        let (schema, _) = ImageSearchIndex::build_schema();
        assert_eq!(schema.num_fields(), 9);
    }
}
