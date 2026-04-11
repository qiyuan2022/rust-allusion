use anyhow::Result;
use sqlx::SqlitePool;

use crate::models::{CreateLocationRequest, Location, UpdateLocationRequest};

pub struct LocationRepository;

impl LocationRepository {
    /// 创建监控位置
    pub async fn create(pool: &SqlitePool, req: CreateLocationRequest) -> Result<Location> {
        let now = chrono::Utc::now().timestamp();
        let is_recursive = req.is_recursive.unwrap_or(true);
        
        let location = sqlx::query_as::<_, Location>(
            r#"
            INSERT INTO locations (path, name, is_recursive, is_active, image_count, created_at, updated_at)
            VALUES (?1, ?2, ?3, 1, 0, ?4, ?4)
            RETURNING *
            "#
        )
        .bind(&req.path)
        .bind(&req.name)
        .bind(is_recursive)
        .bind(now)
        .fetch_one(pool)
        .await?;
        
        Ok(location)
    }
    
    /// 根据 ID 获取位置
    pub async fn get_by_id(pool: &SqlitePool, id: i64) -> Result<Option<Location>> {
        let location = sqlx::query_as::<_, Location>("SELECT * FROM locations WHERE id = ?1")
            .bind(id)
            .fetch_optional(pool)
            .await?;
        
        Ok(location)
    }
    
    /// 根据路径获取位置
    pub async fn get_by_path(pool: &SqlitePool, path: &str) -> Result<Option<Location>> {
        let location = sqlx::query_as::<_, Location>("SELECT * FROM locations WHERE path = ?1")
            .bind(path)
            .fetch_optional(pool)
            .await?;
        
        Ok(location)
    }
    
    /// 列出所有位置
    pub async fn list_all(pool: &SqlitePool) -> Result<Vec<Location>> {
        let locations = sqlx::query_as::<_, Location>(
            "SELECT * FROM locations ORDER BY created_at DESC"
        )
        .fetch_all(pool)
        .await?;
        
        Ok(locations)
    }
    
    /// 列出活跃的位置
    pub async fn list_active(pool: &SqlitePool) -> Result<Vec<Location>> {
        let locations = sqlx::query_as::<_, Location>(
            "SELECT * FROM locations WHERE is_active = 1 ORDER BY created_at DESC"
        )
        .fetch_all(pool)
        .await?;
        
        Ok(locations)
    }
    
    /// 更新位置
    pub async fn update(pool: &SqlitePool, id: i64, req: UpdateLocationRequest) -> Result<Option<Location>> {
        let now = chrono::Utc::now().timestamp();
        
        let location = sqlx::query_as::<_, Location>(
            r#"
            UPDATE locations SET
                name = COALESCE(?1, name),
                is_recursive = COALESCE(?2, is_recursive),
                is_active = COALESCE(?3, is_active),
                updated_at = ?4
            WHERE id = ?5
            RETURNING *
            "#
        )
        .bind(req.name)
        .bind(req.is_recursive)
        .bind(req.is_active)
        .bind(now)
        .bind(id)
        .fetch_optional(pool)
        .await?;
        
        Ok(location)
    }
    
    /// 更新图片计数
    pub async fn update_image_count(pool: &SqlitePool, id: i64, count: i64) -> Result<()> {
        let now = chrono::Utc::now().timestamp();
        
        sqlx::query(
            "UPDATE locations SET image_count = ?1, updated_at = ?2 WHERE id = ?3"
        )
        .bind(count)
        .bind(now)
        .bind(id)
        .execute(pool)
        .await?;
        
        Ok(())
    }
    
    /// 删除位置及其关联的图片
    pub async fn delete(pool: &SqlitePool, id: i64) -> Result<bool> {
        // 获取位置路径
        let location = Self::get_by_id(pool, id).await?;
        
        if let Some(loc) = location {
            // 删除该位置下的所有图片（通过路径前缀匹配）
            // 注意：由于 image_tags 现在使用 hash 关联，删除图片不会删除标签关联
            sqlx::query("DELETE FROM images WHERE path LIKE ?1 || '%'")
                .bind(&loc.path)
                .execute(pool)
                .await?;
        }
        
        // 删除位置记录
        let result = sqlx::query("DELETE FROM locations WHERE id = ?1")
            .bind(id)
            .execute(pool)
            .await?;
        
        Ok(result.rows_affected() > 0)
    }
    
    /// 检查路径是否已存在
    pub async fn path_exists(pool: &SqlitePool, path: &str) -> Result<bool> {
        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM locations WHERE path = ?1")
            .bind(path)
            .fetch_one(pool)
            .await?;
        
        Ok(count > 0)
    }
    
    /// 获取位置下的图片数量
    pub async fn get_image_count(pool: &SqlitePool, id: i64) -> Result<i64> {
        let count: i64 = sqlx::query_scalar(
            "SELECT image_count FROM locations WHERE id = ?1"
        )
        .bind(id)
        .fetch_one(pool)
        .await?;
        
        Ok(count)
    }
    
    /// 重新计算位置的图片数量
    pub async fn recalculate_image_count(pool: &SqlitePool, id: i64) -> Result<i64> {
        let location = Self::get_by_id(pool, id).await?;
        
        if let Some(loc) = location {
            let path_pattern = if loc.is_recursive {
                format!("{}%", loc.path)
            } else {
                format!("{}%", loc.path)
            };
            
            // 统计该路径下的图片数量
            let count: i64 = sqlx::query_scalar(
                "SELECT COUNT(*) FROM images WHERE path LIKE ?1"
            )
            .bind(&path_pattern)
            .fetch_one(pool)
            .await?;
            
            Self::update_image_count(pool, id, count).await?;
            
            Ok(count)
        } else {
            Ok(0)
        }
    }
}
