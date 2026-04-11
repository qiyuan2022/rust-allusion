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
            INSERT INTO thumbnails (image_id, size_type, path, width, height, file_size, created_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
            RETURNING *
            "#
        )
        .bind(req.image_id)
        .bind(&req.size_type)
        .bind(&req.path)
        .bind(req.width)
        .bind(req.height)
        .bind(req.file_size)
        .bind(now)
        .fetch_one(pool)
        .await
        .with_context(|| format!("Failed to create thumbnail record for image {}", req.image_id))?;
        
        Ok(thumbnail)
    }
    
    /// 根据图片ID和尺寸类型获取缩略图
    pub async fn get_by_image_and_size(
        pool: &SqlitePool,
        image_id: i64,
        size_type: &str,
    ) -> Result<Option<Thumbnail>> {
        let thumbnail = sqlx::query_as::<_, Thumbnail>(
            r#"
            SELECT * FROM thumbnails 
            WHERE image_id = ?1 AND size_type = ?2
            "#
        )
        .bind(image_id)
        .bind(size_type)
        .fetch_optional(pool)
        .await
        .with_context(|| format!("Failed to get thumbnail for image {} size {}", image_id, size_type))?;
        
        Ok(thumbnail)
    }
    
    /// 获取图片的所有缩略图
    pub async fn get_by_image_id(pool: &SqlitePool, image_id: i64) -> Result<Vec<Thumbnail>> {
        let thumbnails = sqlx::query_as::<_, Thumbnail>(
            r#"
            SELECT * FROM thumbnails 
            WHERE image_id = ?1
            ORDER BY 
                CASE size_type
                    WHEN 'small' THEN 1
                    WHEN 'medium' THEN 2
                    WHEN 'large' THEN 3
                    ELSE 4
                END
            "#
        )
        .bind(image_id)
        .fetch_all(pool)
        .await
        .with_context(|| format!("Failed to get thumbnails for image {}", image_id))?;
        
        Ok(thumbnails)
    }
    
    /// 获取缩略图状态（哪些尺寸存在）
    pub async fn get_thumbnail_status(pool: &SqlitePool, image_id: i64) -> Result<ThumbnailStatus> {
        let thumbnails = Self::get_by_image_id(pool, image_id).await?;
        
        let mut status = ThumbnailStatus {
            image_id,
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
    pub async fn exists(pool: &SqlitePool, image_id: i64, size_type: &str) -> Result<bool> {
        let count: i64 = sqlx::query_scalar(
            r#"
            SELECT COUNT(*) FROM thumbnails 
            WHERE image_id = ?1 AND size_type = ?2
            "#
        )
        .bind(image_id)
        .bind(size_type)
        .fetch_one(pool)
        .await?;
        
        Ok(count > 0)
    }
    
    /// 删除指定图片的所有缩略图记录
    pub async fn delete_by_image_id(pool: &SqlitePool, image_id: i64) -> Result<u64> {
        let result = sqlx::query(
            r#"
            DELETE FROM thumbnails WHERE image_id = ?1
            "#
        )
        .bind(image_id)
        .execute(pool)
        .await?;
        
        Ok(result.rows_affected())
    }
    
    /// 删除指定的缩略图记录
    pub async fn delete(pool: &SqlitePool, image_id: i64, size_type: &str) -> Result<bool> {
        let result = sqlx::query(
            r#"
            DELETE FROM thumbnails WHERE image_id = ?1 AND size_type = ?2
            "#
        )
        .bind(image_id)
        .bind(size_type)
        .execute(pool)
        .await?;
        
        Ok(result.rows_affected() > 0)
    }
    
    /// 获取缺少缩略图的图片列表
    pub async fn get_images_without_thumbnails(
        pool: &SqlitePool,
        size_type: &str,
        limit: i64,
    ) -> Result<Vec<(i64, String, String)>> {
        // 返回 (image_id, image_path, image_hash) 列表
        let results: Vec<(i64, String, String)> = sqlx::query_as(
            r#"
            SELECT i.id, i.path, i.hash
            FROM images i
            LEFT JOIN thumbnails t ON i.id = t.image_id AND t.size_type = ?1
            WHERE t.id IS NULL
            LIMIT ?2
            "#
        )
        .bind(size_type)
        .bind(limit)
        .fetch_all(pool)
        .await?;
        
        Ok(results)
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
        image_id: i64,
        size_type: &str,
        new_path: &str,
    ) -> Result<bool> {
        let result = sqlx::query(
            r#"
            UPDATE thumbnails 
            SET path = ?1
            WHERE image_id = ?2 AND size_type = ?3
            "#
        )
        .bind(new_path)
        .bind(image_id)
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
