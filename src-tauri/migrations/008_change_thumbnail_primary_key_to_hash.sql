-- Migration: 008_change_thumbnail_primary_key_to_hash
-- Description: 将缩略图表的主键从 image_id 改为 image_hash，避免重新导入时丢失记录
-- Created: 2024-01-15

-- 1. 创建新表（使用 image_hash 作为关联键）
CREATE TABLE IF NOT EXISTS thumbnails_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    image_hash TEXT NOT NULL,  -- 使用 hash 作为关联键（而不是 image_id）
    size_type TEXT NOT NULL,   -- 'small', 'medium', 'large'
    path TEXT NOT NULL,        -- 缩略图文件路径
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    file_size INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    UNIQUE(image_hash, size_type)
);

-- 2. 迁移数据（从旧表复制，通过 image_id 关联获取 hash）
-- 注意：如果图片已被删除，对应的缩略图记录会被丢弃
INSERT INTO thumbnails_new (image_hash, size_type, path, width, height, file_size, created_at)
SELECT 
    i.hash,
    t.size_type,
    MAX(t.path) AS path,
    MAX(t.width) AS width,
    MAX(t.height) AS height,
    MAX(t.file_size) AS file_size,
    MAX(t.created_at) AS created_at
FROM thumbnails t
JOIN images i ON t.image_id = i.id
GROUP BY i.hash, t.size_type;

-- 3. 删除旧表
DROP TABLE IF EXISTS thumbnails;

-- 4. 重命名新表
ALTER TABLE thumbnails_new RENAME TO thumbnails;

-- 5. 创建索引
CREATE INDEX IF NOT EXISTS idx_thumbnails_image_hash ON thumbnails(image_hash);
CREATE INDEX IF NOT EXISTS idx_thumbnails_size_type ON thumbnails(size_type);
