use anyhow::{Result, Context};
use sqlx::SqlitePool;
use std::collections::HashMap;

use crate::models::{CreateTagRequest, Tag, TagTreeNode, UpdateTagRequest};

pub struct TagRepository;

impl TagRepository {
    /// 创建标签
    pub async fn create(pool: &SqlitePool, req: CreateTagRequest) -> Result<Tag> {
        let now = chrono::Utc::now().timestamp();
        let color = req.color.unwrap_or_else(|| "#3b82f6".to_string());
        
        let tag = sqlx::query_as::<_, Tag>(
            r#"
            INSERT INTO tags (name, parent_id, color, created_at, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?4)
            RETURNING *
            "#
        )
        .bind(&req.name)
        .bind(req.parent_id)
        .bind(&color)
        .bind(now)
        .fetch_one(pool)
        .await?;
        
        Ok(tag)
    }
    
    /// 根据 ID 获取标签
    pub async fn get_by_id(pool: &SqlitePool, id: i64) -> Result<Option<Tag>> {
        let tag = sqlx::query_as::<_, Tag>("SELECT * FROM tags WHERE id = ?1")
            .bind(id)
            .fetch_optional(pool)
            .await?;
        
        Ok(tag)
    }
    
    /// 根据名称获取标签
    pub async fn get_by_name(pool: &SqlitePool, name: &str) -> Result<Option<Tag>> {
        let tag = sqlx::query_as::<_, Tag>("SELECT * FROM tags WHERE name = ?1")
            .bind(name)
            .fetch_optional(pool)
            .await?;
        
        Ok(tag)
    }
    
    /// 列出所有标签
    pub async fn list_all(pool: &SqlitePool) -> Result<Vec<Tag>> {
        let tags = sqlx::query_as::<_, Tag>("SELECT * FROM tags ORDER BY name")
            .fetch_all(pool)
            .await?;
        
        Ok(tags)
    }
    
    /// 获取顶级标签（无父标签）
    pub async fn list_roots(pool: &SqlitePool) -> Result<Vec<Tag>> {
        let tags = sqlx::query_as::<_, Tag>(
            "SELECT * FROM tags WHERE parent_id IS NULL ORDER BY name"
        )
        .fetch_all(pool)
        .await?;
        
        Ok(tags)
    }
    
    /// 获取子标签
    pub async fn list_children(pool: &SqlitePool, parent_id: i64) -> Result<Vec<Tag>> {
        let tags = sqlx::query_as::<_, Tag>(
            "SELECT * FROM tags WHERE parent_id = ?1 ORDER BY name"
        )
        .bind(parent_id)
        .fetch_all(pool)
        .await?;
        
        Ok(tags)
    }
    
    /// 获取标签树（完全非递归实现）
    pub async fn get_tree(pool: &SqlitePool) -> Result<Vec<TagTreeNode>> {
        // 获取所有标签
        let all_tags = Self::list_all(pool).await?;
        
        // 构建父子关系映射
        let mut children_map: HashMap<i64, Vec<i64>> = HashMap::new();
        let mut root_ids = Vec::new();
        let mut tag_map: HashMap<i64, Tag> = HashMap::new();
        
        for tag in all_tags {
            let tag_id = tag.id;
            if let Some(parent_id) = tag.parent_id {
                children_map.entry(parent_id).or_default().push(tag_id);
            } else {
                root_ids.push(tag_id);
            }
            tag_map.insert(tag_id, tag);
        }
        
        // 获取所有标签的图片计数
        let mut image_counts: HashMap<i64, i64> = HashMap::new();
        for tag_id in tag_map.keys() {
            let count = Self::get_image_count(pool, *tag_id).await?;
            image_counts.insert(*tag_id, count);
        }
        
        // 构建树（自底向上）
        let mut nodes: HashMap<i64, TagTreeNode> = HashMap::new();
        
        // 先创建所有叶子节点
        for (tag_id, tag) in &tag_map {
            let children = children_map.get(tag_id).cloned().unwrap_or_default();
            if children.is_empty() {
                // 叶子节点
                nodes.insert(*tag_id, TagTreeNode {
                    tag: tag.clone(),
                    children: Vec::new(),
                    image_count: image_counts.get(tag_id).copied().unwrap_or(0),
                });
            }
        }
        
        // 使用栈处理非叶子节点
        let mut to_process: Vec<i64> = children_map.keys().copied().collect();
        
        while !to_process.is_empty() {
            let mut processed = Vec::new();
            
            for parent_id in &to_process {
                let child_ids = children_map.get(parent_id).unwrap();
                let mut all_children_ready = true;
                let mut child_nodes = Vec::new();
                
                for child_id in child_ids {
                    if let Some(child_node) = nodes.get(child_id) {
                        child_nodes.push(child_node.clone());
                    } else {
                        all_children_ready = false;
                        break;
                    }
                }
                
                if all_children_ready {
                    let parent_tag = tag_map.get(parent_id).unwrap().clone();
                    let direct_count = image_counts.get(parent_id).copied().unwrap_or(0);
                    let children_count: i64 = child_nodes.iter().map(|n| n.image_count).sum();
                    
                    nodes.insert(*parent_id, TagTreeNode {
                        tag: parent_tag,
                        children: child_nodes,
                        image_count: direct_count + children_count,
                    });
                    processed.push(*parent_id);
                }
            }
            
            if processed.is_empty() {
                break; // 避免无限循环
            }
            
            to_process.retain(|id| !processed.contains(id));
        }
        
        // 收集根节点
        let mut result = Vec::new();
        for root_id in root_ids {
            if let Some(node) = nodes.get(&root_id) {
                result.push(node.clone());
            }
        }
        
        Ok(result)
    }
    
    /// 更新标签
    pub async fn update(pool: &SqlitePool, id: i64, req: UpdateTagRequest) -> Result<Option<Tag>> {
        let now = chrono::Utc::now().timestamp();
        
        let tag = sqlx::query_as::<_, Tag>(
            r#"
            UPDATE tags SET
                name = COALESCE(?1, name),
                parent_id = COALESCE(?2, parent_id),
                color = COALESCE(?3, color),
                updated_at = ?4
            WHERE id = ?5
            RETURNING *
            "#
        )
        .bind(req.name)
        .bind(req.parent_id)
        .bind(req.color)
        .bind(now)
        .bind(id)
        .fetch_optional(pool)
        .await?;
        
        Ok(tag)
    }
    
    /// 删除标签
    pub async fn delete(pool: &SqlitePool, id: i64) -> Result<bool> {
        let result = sqlx::query("DELETE FROM tags WHERE id = ?1")
            .bind(id)
            .execute(pool)
            .await?;
        
        Ok(result.rows_affected() > 0)
    }
    
    /// 获取标签下的图片数量（只统计存在的图片）
    pub async fn get_image_count(pool: &SqlitePool, tag_id: i64) -> Result<i64> {
        // 关联 images 表，只统计存在的图片
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
    
    /// 获取标签及其所有子标签的图片数量（非递归实现）
    pub async fn get_total_image_count(pool: &SqlitePool, tag_id: i64) -> Result<i64> {
        // 获取所有子标签ID
        let all_tag_ids = Self::collect_all_child_tag_ids(pool, tag_id).await?;
        
        if all_tag_ids.is_empty() {
            return Ok(0);
        }
        
        // 构建 IN 子句
        let placeholders: Vec<String> = all_tag_ids.iter().map(|_| "?".to_string()).collect();
        let in_clause = placeholders.join(",");
        
        // 关联 images 表，只统计存在的图片
        let query = format!(
            "SELECT COUNT(DISTINCT it.image_hash) FROM image_tags it INNER JOIN images i ON it.image_hash = i.hash WHERE it.tag_id IN ({})",
            in_clause
        );
        
        let mut query_builder = sqlx::query_scalar(&query);
        for id in &all_tag_ids {
            query_builder = query_builder.bind(id);
        }
        
        let count: i64 = query_builder.fetch_one(pool).await?;
        
        Ok(count)
    }
    
    /// 收集标签及其所有子标签ID（非递归实现）
    async fn collect_all_child_tag_ids(pool: &SqlitePool, parent_id: i64) -> Result<Vec<i64>> {
        let mut result = vec![parent_id];
        let mut to_process = vec![parent_id];
        
        while let Some(current_id) = to_process.pop() {
            let children = Self::list_children(pool, current_id).await?;
            for child in children {
                result.push(child.id);
                to_process.push(child.id);
            }
        }
        
        Ok(result)
    }
    
    /// 获取图片的标签（通过 hash）
    pub async fn get_tags_for_image(pool: &SqlitePool, image_hash: &str) -> Result<Vec<Tag>> {
        let tags = sqlx::query_as::<_, Tag>(
            r#"
            SELECT t.* FROM tags t
            INNER JOIN image_tags it ON t.id = it.tag_id
            WHERE it.image_hash = ?1
            ORDER BY t.name
            "#
        )
        .bind(image_hash)
        .fetch_all(pool)
        .await?;
        
        Ok(tags)
    }
    
    /// 移动标签到新父标签
    pub async fn move_tag(pool: &SqlitePool, id: i64, new_parent_id: Option<i64>) -> Result<Option<Tag>> {
        // 检查是否会导致循环引用
        if let Some(parent_id) = new_parent_id {
            if parent_id == id {
                return Err(anyhow::anyhow!("Cannot move tag to itself"));
            }
            
            // 检查新父标签是否是自己或自己的后代
            let mut to_check = vec![parent_id];
            while let Some(current_id) = to_check.pop() {
                if current_id == id {
                    return Err(anyhow::anyhow!("Cannot move tag to its own descendant"));
                }
                
                let children = Self::list_children(pool, current_id).await?;
                for child in children {
                    to_check.push(child.id);
                }
            }
        }
        
        let now = chrono::Utc::now().timestamp();
        
        let tag = sqlx::query_as::<_, Tag>(
            r#"
            UPDATE tags SET
                parent_id = ?1,
                updated_at = ?2
            WHERE id = ?3
            RETURNING *
            "#
        )
        .bind(new_parent_id)
        .bind(now)
        .bind(id)
        .fetch_optional(pool)
        .await?;
        
        Ok(tag)
    }
    
    /// 批量添加标签到图片（通过 hash）
    pub async fn add_tags_to_image(pool: &SqlitePool, image_hash: &str, tag_ids: Vec<i64>) -> Result<usize> {
        let now = chrono::Utc::now().timestamp();
        let mut added_count = 0;
        
        for tag_id in tag_ids {
            let result = sqlx::query(
                "INSERT OR IGNORE INTO image_tags (image_hash, tag_id, created_at) VALUES (?1, ?2, ?3)"
            )
            .bind(image_hash)
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
    
    /// 批量从图片移除标签（通过 hash）
    pub async fn remove_tags_from_image(pool: &SqlitePool, image_hash: &str, tag_ids: Vec<i64>) -> Result<usize> {
        if tag_ids.is_empty() {
            return Ok(0);
        }
        
        let placeholders: Vec<String> = tag_ids.iter().map(|_| "?".to_string()).collect();
        let in_clause = placeholders.join(",");
        
        let query = format!(
            "DELETE FROM image_tags WHERE image_hash = ? AND tag_id IN ({})",
            in_clause
        );
        
        let mut query_builder = sqlx::query(&query).bind(image_hash);
        for tag_id in &tag_ids {
            query_builder = query_builder.bind(tag_id);
        }
        
        let result = query_builder.execute(pool).await?;
        Ok(result.rows_affected() as usize)
    }
}
