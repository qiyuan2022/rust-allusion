use anyhow::{Context, Result};
use sqlx::SqlitePool;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::RwLock;

use crate::core::search::{ImageDocument, ImageSearchIndex, SearchQuery, SearchResults};

/// 搜索服务
/// 管理搜索索引的创建、更新和查询
pub struct SearchService {
    index: Arc<RwLock<ImageSearchIndex>>,
    pool: SqlitePool,
    index_dir: PathBuf,
}

impl SearchService {
    /// 创建或打开搜索服务
    pub fn new(pool: SqlitePool, index_dir: PathBuf) -> Result<Self> {
        // 确保索引目录存在
        std::fs::create_dir_all(&index_dir)
            .with_context(|| format!("Failed to create index directory: {:?}", index_dir))?;

        let index = ImageSearchIndex::open(index_dir.clone())?;

        Ok(Self {
            index: Arc::new(RwLock::new(index)),
            pool,
            index_dir,
        })
    }

    /// 索引单张图片
    pub async fn index_image(&self, image_id: i64) -> Result<()> {
        let doc = self.fetch_image_document(image_id).await?;
        
        if let Some(doc) = doc {
            let index = self.index.write().await;
            let mut writer = index.writer()?;
            index.add_document(&mut writer, &doc)?;
            index.commit(&mut writer)?;
            tracing::debug!("Indexed image: {}", image_id);
        }

        Ok(())
    }

    /// 批量索引图片
    pub async fn index_images(&self, image_ids: Vec<i64>) -> Result<usize> {
        if image_ids.is_empty() {
            return Ok(0);
        }

        let count = image_ids.len();
        let index = self.index.write().await;
        let mut writer = index.writer()?;

        for image_id in &image_ids {
            if let Some(doc) = self.fetch_image_document(*image_id).await? {
                index.add_document(&mut writer, &doc)?;
            }
        }

        index.commit(&mut writer)?;
        tracing::info!("Indexed {} images", count);

        Ok(count)
    }

    /// 重新索引所有图片
    pub async fn reindex_all(&self) -> Result<usize> {
        // 获取所有图片 ID
        let image_ids: Vec<i64> = sqlx::query_scalar("SELECT id FROM images")
            .fetch_all(&self.pool)
            .await?;

        // 重建索引
        {
            let index = self.index.write().await;
            let mut writer = index.rebuild()?;
            index.commit(&mut writer)?;
        }

        // 重新索引
        self.index_images(image_ids).await
    }

    /// 从索引中删除图片
    pub async fn remove_image(&self, image_id: i64) -> Result<()> {
        let index = self.index.write().await;
        let mut writer = index.writer()?;
        index.delete_document(&mut writer, image_id)?;
        index.commit(&mut writer)?;
        tracing::debug!("Removed image from index: {}", image_id);
        Ok(())
    }

    /// 批量删除
    pub async fn remove_images(&self, image_ids: Vec<i64>) -> Result<()> {
        if image_ids.is_empty() {
            return Ok(());
        }

        let count = image_ids.len();
        let index = self.index.write().await;
        let mut writer = index.writer()?;

        for image_id in &image_ids {
            index.delete_document(&mut writer, *image_id)?;
        }

        index.commit(&mut writer)?;
        tracing::debug!("Removed {} images from index", count);
        Ok(())
    }

    /// 执行搜索
    pub async fn search(&self, query: SearchQuery) -> Result<SearchResults> {
        let index = self.index.read().await;
        index.search(&query)
    }

    /// 获取索引统计
    pub async fn get_stats(&self) -> Result<IndexStats> {
        let index = self.index.read().await;
        let doc_count = index.doc_count()?;

        // 获取数据库图片数量
        let db_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM images")
            .fetch_one(&self.pool)
            .await?;

        Ok(IndexStats {
            indexed_count: doc_count,
            total_images: db_count as usize,
            index_dir: self.index_dir.clone(),
        })
    }

    /// 检查索引是否需要更新
    pub async fn needs_update(&self) -> Result<bool> {
        let stats = self.get_stats().await?;
        Ok(stats.indexed_count != stats.total_images)
    }

    /// 获取索引目录路径
    pub fn index_dir(&self) -> &PathBuf {
        &self.index_dir
    }

    /// 从数据库获取图片文档
    async fn fetch_image_document(&self, image_id: i64) -> Result<Option<ImageDocument>> {
        // 获取图片信息
        let image: Option<(String, String, String, i64, i64, i64, Option<i32>, Option<i32>, String)> = sqlx::query_as(
            r#"
            SELECT path, file_name, hash, file_size, created_at, updated_at, width, height, format
            FROM images
            WHERE id = ?1
            "#
        )
        .bind(image_id)
        .fetch_optional(&self.pool)
        .await?;

        let Some((path, file_name, hash, _file_size, created_at, updated_at, width, height, format)) = image else {
            return Ok(None);
        };

        // 获取图片的标签名称和ID（使用 hash 关联）
        let tag_rows: Vec<(i64, String)> = sqlx::query_as(
            r#"
            SELECT t.id, t.name FROM tags t
            INNER JOIN image_tags it ON t.id = it.tag_id
            WHERE it.image_hash = ?1
            "#
        )
        .bind(&hash)
        .fetch_all(&self.pool)
        .await?;

        let tag_ids: Vec<i64> = tag_rows.iter().map(|(id, _)| *id).collect();
        let tags: Vec<String> = tag_rows.iter().map(|(_, name)| name.clone()).collect();

        Ok(Some(ImageDocument {
            image_id,
            path,
            file_name,
            tags,
            tag_ids,
            width: width.unwrap_or(0) as u32,
            height: height.unwrap_or(0) as u32,
            format: if format.is_empty() { "unknown".to_string() } else { format },
            created_at,
            file_modified_at: updated_at,
        }))
    }
}

/// 索引统计信息
#[derive(Debug, Clone)]
pub struct IndexStats {
    pub indexed_count: usize,
    pub total_images: usize,
    pub index_dir: PathBuf,
}

/// 后台索引任务
pub struct IndexingWorker {
    service: Arc<SearchService>,
}

impl IndexingWorker {
    /// 创建后台索引工作器
    pub fn new(service: Arc<SearchService>) -> Self {
        Self { service }
    }

    /// 启动后台索引任务
    /// 定期检查并索引未索引的图片
    pub fn start(self) {
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(60));

            loop {
                interval.tick().await;

                if let Err(e) = self.process_pending_images().await {
                    tracing::error!("Background indexing failed: {}", e);
                }
            }
        });
    }

    /// 处理待索引的图片
    async fn process_pending_images(&self) -> Result<()> {
        // 获取未索引的图片 ID（简化实现：比较数据库和索引中的数量）
        // 实际应用中可以使用单独的表记录索引状态
        let stats = self.service.get_stats().await?;

        if stats.indexed_count < stats.total_images {
            tracing::info!(
                "Indexing pending: {}/{} images",
                stats.indexed_count,
                stats.total_images
            );

            // 重新索引（简单实现）
            self.service.reindex_all().await?;
        }

        Ok(())
    }

    /// 立即索引指定图片
    pub async fn index_now(&self, image_id: i64) -> Result<()> {
        self.service.index_image(image_id).await
    }
}
