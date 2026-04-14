use anyhow::Result;
use sqlx::SqlitePool;

use crate::models::{
    CreateImageRequest, Image, ImageWithTags, Tag, UpdateImageRequest,
};

/// 用于获取图片及其标签的临时结构体
#[derive(sqlx::FromRow)]
struct ImageWithTagsRow {
    id: i64,
    path: String,
    hash: String,
    file_name: String,
    file_size: i64,
    file_modified_at: i64,
    width: Option<i32>,
    height: Option<i32>,
    format: Option<String>,
    color_space: Option<String>,
    created_at: i64,
    updated_at: i64,
    tag_ids: Option<String>,
    tag_names: Option<String>,
    tag_colors: Option<String>,
}

impl ImageWithTagsRow {
    fn to_image(&self) -> Image {
        Image {
            id: self.id,
            path: self.path.clone(),
            hash: self.hash.clone(),
            file_name: self.file_name.clone(),
            file_size: self.file_size,
            file_modified_at: self.file_modified_at,
            width: self.width,
            height: self.height,
            format: self.format.clone(),
            color_space: self.color_space.clone(),
            created_at: self.created_at,
            updated_at: self.updated_at,
        }
    }
    
    fn to_tags(&self) -> Vec<Tag> {
        let mut tags = Vec::new();
        
        if let (Some(ids), Some(names), Some(colors)) = 
            (&self.tag_ids, &self.tag_names, &self.tag_colors) {
            let id_parts: Vec<&str> = ids.split(',').collect();
            let name_parts: Vec<&str> = names.split(',').collect();
            let color_parts: Vec<&str> = colors.split(',').collect();
            
            for i in 0..id_parts.len() {
                if let Ok(id) = id_parts[i].parse::<i64>() {
                    tags.push(Tag {
                        id,
                        name: name_parts.get(i).unwrap_or(&"").to_string(),
                        color: color_parts.get(i).unwrap_or(&"#3b82f6").to_string(),
                        parent_id: None,
                        created_at: 0,
                        updated_at: 0,
                    });
                }
            }
        }
        
        tags
    }
}

/// 用于获取图片、标签和缩略图路径的临时结构体
#[derive(sqlx::FromRow)]
struct ImageWithThumbnailRow {
    id: i64,
    path: String,
    hash: String,
    file_name: String,
    file_size: i64,
    file_modified_at: i64,
    width: Option<i32>,
    height: Option<i32>,
    format: Option<String>,
    color_space: Option<String>,
    created_at: i64,
    updated_at: i64,
    tag_ids: Option<String>,
    tag_names: Option<String>,
    tag_colors: Option<String>,
    thumbnail_path: Option<String>,
}

impl ImageWithThumbnailRow {
    fn to_image(&self) -> Image {
        Image {
            id: self.id,
            path: self.path.clone(),
            hash: self.hash.clone(),
            file_name: self.file_name.clone(),
            file_size: self.file_size,
            file_modified_at: self.file_modified_at,
            width: self.width,
            height: self.height,
            format: self.format.clone(),
            color_space: self.color_space.clone(),
            created_at: self.created_at,
            updated_at: self.updated_at,
        }
    }
    
    fn to_tags(&self) -> Vec<Tag> {
        let mut tags = Vec::new();
        
        if let (Some(ids), Some(names), Some(colors)) = 
            (&self.tag_ids, &self.tag_names, &self.tag_colors) {
            let id_parts: Vec<&str> = ids.split(',').collect();
            let name_parts: Vec<&str> = names.split(',').collect();
            let color_parts: Vec<&str> = colors.split(',').collect();
            
            for i in 0..id_parts.len() {
                if let Ok(id) = id_parts[i].parse::<i64>() {
                    tags.push(Tag {
                        id,
                        name: name_parts.get(i).unwrap_or(&"").to_string(),
                        color: color_parts.get(i).unwrap_or(&"#3b82f6").to_string(),
                        parent_id: None,
                        created_at: 0,
                        updated_at: 0,
                    });
                }
            }
        }
        
        tags
    }
}

pub struct ImageRepository;

impl ImageRepository {
    /// 创建图片
    pub async fn create(pool: &SqlitePool, req: CreateImageRequest) -> Result<Image> {
        let now = chrono::Utc::now().timestamp();
        
        let image = sqlx::query_as::<_, Image>(
            r#"
            INSERT INTO images (path, hash, file_name, file_size, file_modified_at, width, height, format, color_space, created_at, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)
            RETURNING *
            "#
        )
        .bind(&req.path)
        .bind(&req.hash)
        .bind(&req.file_name)
        .bind(req.file_size)
        .bind(req.file_modified_at)
        .bind(req.width)
        .bind(req.height)
        .bind(req.format)
        .bind(req.color_space)
        .bind(now)
        .fetch_one(pool)
        .await?;
        
        Ok(image)
    }
    
    /// 根据 ID 获取图片
    pub async fn get_by_id(pool: &SqlitePool, id: i64) -> Result<Option<Image>> {
        let image = sqlx::query_as::<_, Image>("SELECT * FROM images WHERE id = ?1")
            .bind(id)
            .fetch_optional(pool)
            .await?;
        
        Ok(image)
    }
    
    /// 根据路径获取图片
    pub async fn get_by_path(pool: &SqlitePool, path: &str) -> Result<Option<Image>> {
        let image = sqlx::query_as::<_, Image>("SELECT * FROM images WHERE path = ?1")
            .bind(path)
            .fetch_optional(pool)
            .await?;
        
        Ok(image)
    }
    
    /// 根据哈希获取图片（用于去重）
    pub async fn get_by_hash(pool: &SqlitePool, hash: &str) -> Result<Vec<Image>> {
        let images = sqlx::query_as::<_, Image>("SELECT * FROM images WHERE hash = ?1")
            .bind(hash)
            .fetch_all(pool)
            .await?;
        
        Ok(images)
    }
    
    /// 列出所有图片（支持分页）
    pub async fn list(pool: &SqlitePool, offset: i64, limit: i64) -> Result<Vec<Image>> {
        Self::list_with_sort(pool, offset, limit, "file_modified_at", true).await
    }
    
    /// 列出所有图片（支持分页和排序）
    pub async fn list_with_sort(
        pool: &SqlitePool, 
        offset: i64, 
        limit: i64,
        sort_by: &str,
        desc: bool
    ) -> Result<Vec<Image>> {
        // 验证排序字段，防止 SQL 注入
        let order_column = match sort_by {
            "created_at" => "created_at",
            "modified_at" | "file_modified_at" => "file_modified_at",
            "file_name" => "file_name",
            "file_size" => "file_size",
            _ => "file_modified_at", // 默认
        };
        
        let order_direction = if desc { "DESC" } else { "ASC" };
        
        let query = format!(
            "SELECT * FROM images ORDER BY {} {} LIMIT ?1 OFFSET ?2",
            order_column,
            order_direction
        );
        
        let images = sqlx::query_as::<_, Image>(&query)
            .bind(limit)
            .bind(offset)
            .fetch_all(pool)
            .await?;
        
        Ok(images)
    }
    
    /// 列出所有图片及其标签（支持分页和排序）
    pub async fn list_with_tags_sort(
        pool: &SqlitePool, 
        offset: i64, 
        limit: i64,
        sort_by: &str,
        desc: bool
    ) -> Result<Vec<(Image, Vec<Tag>)>> {
        let images = Self::list_with_sort(pool, offset, limit, sort_by, desc).await?;
        let mut result = Vec::new();
        
        for image in images {
            let tags = Self::get_tags_by_hash(pool, &image.hash).await?;
            result.push((image, tags));
        }
        
        Ok(result)
    }
    
    /// 列出所有图片及其标签和缩略图路径（支持分页）
    pub async fn list_with_tags_and_thumbnail(
        pool: &SqlitePool, 
        offset: i64, 
        limit: i64
    ) -> Result<Vec<(Image, Vec<Tag>, Option<String>)>> {
        Self::list_with_tags_and_thumbnail_sort(pool, offset, limit, "file_modified_at", true).await
    }
    
    /// 获取所有图片及其标签（用于前端虚拟滚动）
    pub async fn get_all_with_tags(
        pool: &SqlitePool,
        sort_by: &str,
        desc: bool
    ) -> Result<Vec<(Image, Vec<Tag>)>> {
        // 验证排序字段
        let order_column = match sort_by {
            "created_at" => "i.created_at",
            "modified_at" | "file_modified_at" => "i.file_modified_at",
            "file_name" => "i.file_name",
            "file_size" => "i.file_size",
            _ => "i.file_modified_at",
        };
        
        let order_direction = if desc { "DESC" } else { "ASC" };
        
        // 使用单个查询获取所有图片及其标签（通过 GROUP_CONCAT 优化）
        let query = format!(
            r#"
            SELECT 
                i.*,
                GROUP_CONCAT(t.id) as tag_ids,
                GROUP_CONCAT(t.name) as tag_names,
                GROUP_CONCAT(t.color) as tag_colors
            FROM images i
            LEFT JOIN image_tags it ON i.hash = it.image_hash
            LEFT JOIN tags t ON it.tag_id = t.id
            GROUP BY i.id
            ORDER BY {} {}
            "#,
            order_column, order_direction
        );
        
        let rows = sqlx::query_as::<_, ImageWithTagsRow>(&query)
            .fetch_all(pool)
            .await?;
        
        let mut result = Vec::new();
        for row in rows {
            let image = row.to_image();
            let tags = row.to_tags();
            result.push((image, tags));
        }
        
        Ok(result)
    }
    
    /// 列出所有图片及其标签和缩略图路径（支持分页和排序）
    pub async fn list_with_tags_and_thumbnail_sort(
        pool: &SqlitePool, 
        offset: i64, 
        limit: i64,
        sort_by: &str,
        desc: bool
    ) -> Result<Vec<(Image, Vec<Tag>, Option<String>)>> {
        let images = Self::list_with_sort(pool, offset, limit, sort_by, desc).await?;
        let mut result = Vec::new();
        
        for image in images {
            let tags = Self::get_tags_by_hash(pool, &image.hash).await?;
            
            // 获取 small 缩略图路径
            let thumbnail_path: Option<String> = sqlx::query_scalar(
                r#"
                SELECT path FROM thumbnails 
                WHERE image_hash = ?1 AND size_type = 'small'
                "#
            )
            .bind(&image.hash)
            .fetch_optional(pool)
            .await?;
            
            result.push((image, tags, thumbnail_path));
        }
        
        Ok(result)
    }
    
    /// 获取所有图片及其标签和缩略图路径（支持排序）
    pub async fn get_all_with_tags_and_thumbnail(
        pool: &SqlitePool,
        sort_column: &str,
        desc: bool,
    ) -> Result<Vec<(Image, Vec<Tag>, Option<String>)>> {
        let order_direction = if desc { "DESC" } else { "ASC" };
        
        let query = format!(
            r#"
            SELECT 
                i.*,
                GROUP_CONCAT(t.id) as tag_ids,
                GROUP_CONCAT(t.name) as tag_names,
                GROUP_CONCAT(t.color) as tag_colors,
                tn.path as thumbnail_path
            FROM images i
            LEFT JOIN image_tags it ON i.hash = it.image_hash
            LEFT JOIN tags t ON it.tag_id = t.id
            LEFT JOIN thumbnails tn ON i.hash = tn.image_hash AND tn.size_type = 'small'
            GROUP BY i.id
            ORDER BY {} {}
            "#,
            sort_column, order_direction
        );
        
        let rows = sqlx::query_as::<_, ImageWithThumbnailRow>(&query)
            .fetch_all(pool)
            .await?;
        
        let mut result = Vec::new();
        for row in rows {
            let image = row.to_image();
            let tags = row.to_tags();
            result.push((image, tags, row.thumbnail_path));
        }
        
        Ok(result)
    }
    
    /// 获取图片总数
    pub async fn count(pool: &SqlitePool) -> Result<i64> {
        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM images")
            .fetch_one(pool)
            .await?;
        
        Ok(count)
    }
    
    /// 更新图片
    pub async fn update(pool: &SqlitePool, id: i64, req: UpdateImageRequest) -> Result<Option<Image>> {
        let now = chrono::Utc::now().timestamp();
        
        let image = sqlx::query_as::<_, Image>(
            r#"
            UPDATE images SET
                file_size = COALESCE(?1, file_size),
                file_modified_at = COALESCE(?2, file_modified_at),
                width = COALESCE(?3, width),
                height = COALESCE(?4, height),
                format = COALESCE(?5, format),
                color_space = COALESCE(?6, color_space),
                updated_at = ?7
            WHERE id = ?8
            RETURNING *
            "#
        )
        .bind(req.file_size)
        .bind(req.file_modified_at)
        .bind(req.width)
        .bind(req.height)
        .bind(req.format)
        .bind(req.color_space)
        .bind(now)
        .bind(id)
        .fetch_optional(pool)
        .await?;
        
        Ok(image)
    }
    
    /// 根据路径删除图片
    pub async fn delete_by_path(pool: &SqlitePool, path: &str) -> Result<bool> {
        let result = sqlx::query("DELETE FROM images WHERE path = ?1")
            .bind(path)
            .execute(pool)
            .await?;
        
        Ok(result.rows_affected() > 0)
    }
    
    /// 获取图片及其标签（通过 hash 关联，持久化存储）
    pub async fn get_with_tags(pool: &SqlitePool, id: i64) -> Result<Option<ImageWithTags>> {
        let Some(image) = Self::get_by_id(pool, id).await? else {
            return Ok(None);
        };
        
        let tags = sqlx::query_as::<_, Tag>(
            r#"
            SELECT t.* FROM tags t
            INNER JOIN image_tags it ON t.id = it.tag_id
            WHERE it.image_hash = ?1
            ORDER BY t.name
            "#
        )
        .bind(&image.hash)
        .fetch_all(pool)
        .await?;
        
        Ok(Some(ImageWithTags { image, tags }))
    }
    
    /// 通过 hash 获取图片标签
    pub async fn get_tags_by_hash(pool: &SqlitePool, hash: &str) -> Result<Vec<Tag>> {
        let tags = sqlx::query_as::<_, Tag>(
            r#"
            SELECT t.* FROM tags t
            INNER JOIN image_tags it ON t.id = it.tag_id
            WHERE it.image_hash = ?1
            ORDER BY t.name
            "#
        )
        .bind(hash)
        .fetch_all(pool)
        .await?;
        
        Ok(tags)
    }
    
    /// 添加标签到图片（通过 hash，持久化存储）
    pub async fn add_tag(pool: &SqlitePool, hash: &str, tag_id: i64) -> Result<()> {
        let now = chrono::Utc::now().timestamp();
        
        sqlx::query(
            "INSERT OR IGNORE INTO image_tags (image_hash, tag_id, created_at) VALUES (?1, ?2, ?3)"
        )
        .bind(hash)
        .bind(tag_id)
        .bind(now)
        .execute(pool)
        .await?;
        
        Ok(())
    }
    
    /// 从图片移除标签（通过 hash）
    pub async fn remove_tag(pool: &SqlitePool, hash: &str, tag_id: i64) -> Result<bool> {
        let result = sqlx::query("DELETE FROM image_tags WHERE image_hash = ?1 AND tag_id = ?2")
            .bind(hash)
            .bind(tag_id)
            .execute(pool)
            .await?;
        
        Ok(result.rows_affected() > 0)
    }
    
    /// 清空图片的所有标签（通过 hash）
    pub async fn clear_tags(pool: &SqlitePool, hash: &str) -> Result<()> {
        sqlx::query("DELETE FROM image_tags WHERE image_hash = ?1")
            .bind(hash)
            .execute(pool)
            .await?;
        
        Ok(())
    }
    
    /// 批量添加标签到图片（通过 hash，持久化存储）
    pub async fn add_tags(pool: &SqlitePool, hash: &str, tag_ids: Vec<i64>) -> Result<usize> {
        let now = chrono::Utc::now().timestamp();
        let mut added_count = 0;
        
        for tag_id in tag_ids {
            let result = sqlx::query(
                "INSERT OR IGNORE INTO image_tags (image_hash, tag_id, created_at) VALUES (?1, ?2, ?3)"
            )
            .bind(hash)
            .bind(tag_id)
            .bind(now)
            .execute(pool)
            .await?;
            
            if result.rows_affected() > 0 {
                added_count += 1;
            }
        }
        
        Ok(added_count)
    }
    
    /// 批量为多个图片添加相同标签（通过 hash 列表）
    pub async fn add_tags_to_hashes(
        pool: &SqlitePool,
        hashes: Vec<String>,
        tag_ids: Vec<i64>,
    ) -> Result<usize> {
        let now = chrono::Utc::now().timestamp();
        let mut added_count = 0;
        
        for hash in hashes {
            for tag_id in &tag_ids {
                let result = sqlx::query(
                    "INSERT OR IGNORE INTO image_tags (image_hash, tag_id, created_at) VALUES (?1, ?2, ?3)"
                )
                .bind(&hash)
                .bind(tag_id)
                .bind(now)
                .execute(pool)
                .await?;
                
                if result.rows_affected() > 0 {
                    added_count += 1;
                }
            }
        }
        
        Ok(added_count)
    }
    
    /// 获取指定标签下的图片列表（支持分页）
    pub async fn get_by_tag(
        pool: &SqlitePool,
        tag_id: i64,
        offset: i64,
        limit: i64,
    ) -> Result<Vec<Image>> {
        let images = sqlx::query_as::<_, Image>(
            r#"
            SELECT i.* FROM images i
            INNER JOIN image_tags it ON i.hash = it.image_hash
            WHERE it.tag_id = ?1
            ORDER BY i.file_modified_at DESC
            LIMIT ?2 OFFSET ?3
            "#
        )
        .bind(tag_id)
        .bind(limit)
        .bind(offset)
        .fetch_all(pool)
        .await?;
        
        Ok(images)
    }
    
    /// 获取指定标签下的图片数量（只统计存在的图片）
    pub async fn count_by_tag(pool: &SqlitePool, tag_id: i64) -> Result<i64> {
        let count: i64 = sqlx::query_scalar(
            r#"
            SELECT COUNT(*) FROM image_tags it
            INNER JOIN images i ON it.image_hash = i.hash
            WHERE it.tag_id = ?1
            "#
        )
        .bind(tag_id)
        .fetch_one(pool)
        .await?;
        
        Ok(count)
    }
    
    /// 获取多个标签下的图片（AND 关系）
    pub async fn get_by_tags_and(
        pool: &SqlitePool,
        tag_ids: Vec<i64>,
        offset: i64,
        limit: i64,
    ) -> Result<Vec<Image>> {
        if tag_ids.is_empty() {
            return Self::list(pool, offset, limit).await;
        }
        
        let placeholders: Vec<String> = tag_ids.iter().map(|_| "?".to_string()).collect();
        let in_clause = placeholders.join(",");
        
        let query = format!(
            r#"
            SELECT i.* FROM images i
            INNER JOIN image_tags it ON i.hash = it.image_hash
            WHERE it.tag_id IN ({})
            GROUP BY i.id
            HAVING COUNT(DISTINCT it.tag_id) = {}
            ORDER BY i.file_modified_at DESC
            LIMIT ? OFFSET ?
            "#,
            in_clause,
            tag_ids.len()
        );
        
        let mut query_builder = sqlx::query_as(&query);
        for tag_id in &tag_ids {
            query_builder = query_builder.bind(tag_id);
        }
        
        let images = query_builder
            .bind(limit)
            .bind(offset)
            .fetch_all(pool)
            .await?;
        
        Ok(images)
    }
    
    /// 获取多个标签下的图片（OR 关系）
    pub async fn get_by_tags_or(
        pool: &SqlitePool,
        tag_ids: Vec<i64>,
        offset: i64,
        limit: i64,
    ) -> Result<Vec<Image>> {
        if tag_ids.is_empty() {
            return Self::list(pool, offset, limit).await;
        }
        
        let placeholders: Vec<String> = tag_ids.iter().map(|_| "?".to_string()).collect();
        let in_clause = placeholders.join(",");
        
        let query = format!(
            r#"
            SELECT DISTINCT i.* FROM images i
            INNER JOIN image_tags it ON i.hash = it.image_hash
            WHERE it.tag_id IN ({})
            ORDER BY i.file_modified_at DESC
            LIMIT ? OFFSET ?
            "#,
            in_clause
        );
        
        let mut query_builder = sqlx::query_as(&query);
        for tag_id in &tag_ids {
            query_builder = query_builder.bind(tag_id);
        }
        
        let images = query_builder
            .bind(limit)
            .bind(offset)
            .fetch_all(pool)
            .await?;
        
        Ok(images)
    }
    
    /// 获取指定位置下的图片数量
    pub async fn count_by_location(pool: &SqlitePool, location_path: &str) -> Result<i64> {
        let count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM images WHERE path LIKE ?1 || '%'"
        )
        .bind(location_path)
        .fetch_one(pool)
        .await?;
        
        Ok(count)
    }
    
    /// 获取所有缺少尺寸信息的图片
    pub async fn get_without_dimensions(pool: &SqlitePool) -> Result<Vec<Image>> {
        let images = sqlx::query_as::<_, Image>(
            "SELECT * FROM images WHERE width IS NULL OR height IS NULL"
        )
        .fetch_all(pool)
        .await?;
        
        Ok(images)
    }
    
    /// 更新图片尺寸信息
    pub async fn update_dimensions(
        pool: &SqlitePool,
        id: i64,
        width: i32,
        height: i32,
        format: Option<String>,
    ) -> Result<bool> {
        let now = chrono::Utc::now().timestamp();
        
        let result = sqlx::query(
            r#"
            UPDATE images SET
                width = ?1,
                height = ?2,
                format = COALESCE(?3, format),
                updated_at = ?4
            WHERE id = ?5
            "#
        )
        .bind(width)
        .bind(height)
        .bind(format)
        .bind(now)
        .bind(id)
        .execute(pool)
        .await?;
        
        Ok(result.rows_affected() > 0)
    }
    
    /// 更新图片路径和文件名
    pub async fn update_path(
        pool: &SqlitePool,
        id: i64,
        path: &str,
        file_name: &str,
    ) -> Result<bool> {
        let now = chrono::Utc::now().timestamp();
        
        let result = sqlx::query(
            r#"
            UPDATE images SET
                path = ?1,
                file_name = ?2,
                updated_at = ?3
            WHERE id = ?4
            "#
        )
        .bind(path)
        .bind(file_name)
        .bind(now)
        .bind(id)
        .execute(pool)
        .await?;
        
        Ok(result.rows_affected() > 0)
    }
    
    /// 删除图片（不删除标签关联，保持持久化）
    pub async fn delete(pool: &SqlitePool, id: i64) -> Result<bool> {
        // 不删除 image_tags 关联，保持标签持久化
        let result = sqlx::query("DELETE FROM images WHERE id = ?1")
            .bind(id)
            .execute(pool)
            .await?;
        
        Ok(result.rows_affected() > 0)
    }
    
    /// 删除图片及其源文件（可选）
    pub async fn delete_with_source(pool: &SqlitePool, id: i64) -> Result<(bool, Option<String>)> {
        // 获取图片路径
        let image = Self::get_by_id(pool, id).await?;
        let path = image.as_ref().map(|img| img.path.clone());
        
        // 删除图片记录（不删除标签关联）
        let deleted = Self::delete(pool, id).await?;
        
        Ok((deleted, path))
    }
}
