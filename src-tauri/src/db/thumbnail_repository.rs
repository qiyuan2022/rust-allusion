use anyhow::{Context, Result};
use sqlx::SqlitePool;

use crate::models::{CreateThumbnailRequest, Thumbnail, ThumbnailStatus};

/// 缩略图数据仓库
pub struct ThumbnailRepository;

impl ThumbnailRepository {
    /// 创建缩略图记录
    pub async fn create(pool: &SqlitePool, req: CreateThumbnailRequest) -> Result<Thumbnail> {
        let now = chrono::Utc::now().timestamp();
        
        let thumbnail = sqlx::query_as::<_, Thumbnail>(
            r#"
            INSERT INTO thumbnails (image_hash, size_type, path, width, height, file_size, created_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
            RETURNING *
            "#
        )
        .bind(&req.image_hash)
        .bind(&req.size_type)
        .bind(&req.path)
        .bind(req.width)
        .bind(req.height)
        .bind(req.file_size)
        .bind(now)
        .fetch_one(pool)
        .await
        .with_context(|| format!("Failed to create thumbnail record for hash {}", req.image_hash))?;
        
        Ok(thumbnail)
    }
    
    /// 创建缩略图记录（如果已存在则忽略）
    pub async fn create_or_ignore(pool: &SqlitePool, req: CreateThumbnailRequest) -> Result<Option<Thumbnail>> {
        let now = chrono::Utc::now().timestamp();
        
        // 使用 INSERT OR IGNORE 避免唯一约束冲突
        let result = sqlx::query_as::<_, Thumbnail>(
            r#"
            INSERT OR IGNORE INTO thumbnails (image_hash, size_type, path, width, height, file_size, created_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
            RETURNING *
            "#
        )
        .bind(&req.image_hash)
        .bind(&req.size_type)
        .bind(&req.path)
        .bind(req.width)
        .bind(req.height)
        .bind(req.file_size)
        .bind(now)
        .fetch_optional(pool)
        .await
        .with_context(|| format!("Failed to create thumbnail record for hash {}", req.image_hash))?;
        
        Ok(result)
    }
    
    /// 根据图片 hash 和尺寸类型获取缩略图
    pub async fn get_by_hash_and_size(
        pool: &SqlitePool,
        image_hash: &str,
        size_type: &str,
    ) -> Result<Option<Thumbnail>> {
        let thumbnail = sqlx::query_as::<_, Thumbnail>(
            r#"
            SELECT * FROM thumbnails 
            WHERE image_hash = ?1 AND size_type = ?2
            "#
        )
        .bind(image_hash)
        .bind(size_type)
        .fetch_optional(pool)
        .await
        .with_context(|| format!("Failed to get thumbnail for hash {} size {}", image_hash, size_type))?;
        
        Ok(thumbnail)
    }
    
    /// 获取图片的所有缩略图（通过 hash）
    pub async fn get_by_image_hash(pool: &SqlitePool, image_hash: &str) -> Result<Vec<Thumbnail>> {
        let thumbnails = sqlx::query_as::<_, Thumbnail>(
            r#"
            SELECT * FROM thumbnails 
            WHERE image_hash = ?1
            ORDER BY 
                CASE size_type
                    WHEN 'small' THEN 1
                    WHEN 'medium' THEN 2
                    WHEN 'large' THEN 3
                    ELSE 4
                END
            "#
        )
        .bind(image_hash)
        .fetch_all(pool)
        .await
        .with_context(|| format!("Failed to get thumbnails for hash {}", image_hash))?;
        
        Ok(thumbnails)
    }
    
    /// 获取缩略图状态（哪些尺寸存在）
    pub async fn get_thumbnail_status(pool: &SqlitePool, image_hash: &str) -> Result<ThumbnailStatus> {
        let thumbnails = Self::get_by_image_hash(pool, image_hash).await?;
        
        let mut status = ThumbnailStatus {
            image_hash: image_hash.to_string(),
            has_small: false,
            has_medium: false,
            has_large: false,
            small_path: None,
            medium_path: None,
            large_path: None,
        };
        
        for thumbnail in thumbnails {
            match thumbnail.size_type.as_str() {
                "small" => {
                    status.has_small = true;
                    status.small_path = Some(thumbnail.path);
                }
                "medium" => {
                    status.has_medium = true;
                    status.medium_path = Some(thumbnail.path);
                }
                "large" => {
                    status.has_large = true;
                    status.large_path = Some(thumbnail.path);
                }
                _ => {}
            }
        }
        
        Ok(status)
    }
    
    /// 检查缩略图是否存在
    pub async fn exists(pool: &SqlitePool, image_hash: &str, size_type: &str) -> Result<bool> {
        let count: i64 = sqlx::query_scalar(
            r#"
            SELECT COUNT(*) FROM thumbnails 
            WHERE image_hash = ?1 AND size_type = ?2
            "#
        )
        .bind(image_hash)
        .bind(size_type)
        .fetch_one(pool)
        .await?;
        
        Ok(count > 0)
    }
    
    /// 删除指定 hash 的所有缩略图记录
    pub async fn delete_by_image_hash(pool: &SqlitePool, image_hash: &str) -> Result<u64> {
        let result = sqlx::query(
            r#"
            DELETE FROM thumbnails WHERE image_hash = ?1
            "#
        )
        .bind(image_hash)
        .execute(pool)
        .await?;
        
        Ok(result.rows_affected())
    }
    
    /// 删除指定的缩略图记录
    pub async fn delete(pool: &SqlitePool, image_hash: &str, size_type: &str) -> Result<bool> {
        let result = sqlx::query(
            r#"
            DELETE FROM thumbnails WHERE image_hash = ?1 AND size_type = ?2
            "#
        )
        .bind(image_hash)
        .bind(size_type)
        .execute(pool)
        .await?;
        
        Ok(result.rows_affected() > 0)
    }
    
    /// 统计缩略图数量
    pub async fn count_by_size(pool: &SqlitePool, size_type: &str) -> Result<i64> {
        let count: i64 = sqlx::query_scalar(
            r#"
            SELECT COUNT(*) FROM thumbnails WHERE size_type = ?1
            "#
        )
        .bind(size_type)
        .fetch_one(pool)
        .await?;
        
        Ok(count)
    }
    
    /// 获取缩略图总数
    pub async fn count_all(pool: &SqlitePool) -> Result<i64> {
        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM thumbnails")
            .fetch_one(pool)
            .await?;
        
        Ok(count)
    }
    
    /// 更新缩略图路径（如果文件被移动）
    pub async fn update_path(
        pool: &SqlitePool,
        image_hash: &str,
        size_type: &str,
        new_path: &str,
    ) -> Result<bool> {
        let result = sqlx::query(
            r#"
            UPDATE thumbnails 
            SET path = ?1
            WHERE image_hash = ?2 AND size_type = ?3
            "#
        )
        .bind(new_path)
        .bind(image_hash)
        .bind(size_type)
        .execute(pool)
        .await?;
        
        Ok(result.rows_affected() > 0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    // 测试需要数据库连接，在实际环境中运行
    // 这里仅作为结构示例
}
