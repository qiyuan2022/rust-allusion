-- Migration: 008_migrate_thumbnails_structure
-- Description: Migrate old thumbnails table structure to new per-size structure
-- Created: 2024-04-09

-- 备份旧表
ALTER TABLE thumbnails RENAME TO thumbnails_old;

-- 创建新表结构（每种尺寸独立一行）
CREATE TABLE thumbnails (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    image_id INTEGER NOT NULL REFERENCES images(id) ON DELETE CASCADE,
    size_type TEXT NOT NULL, -- 'small', 'medium', 'large'
    path TEXT NOT NULL,      -- 缩略图文件路径
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    file_size INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    UNIQUE(image_id, size_type)
);

-- 创建索引
CREATE INDEX idx_thumbnails_image_id ON thumbnails(image_id);
CREATE INDEX idx_thumbnails_size_type ON thumbnails(size_type);

-- 迁移 small 缩略图数据
INSERT INTO thumbnails (image_id, size_type, path, width, height, file_size, created_at)
SELECT 
    image_id,
    'small' as size_type,
    small_path as path,
    200 as width,  -- 默认值，旧表没有存储实际尺寸
    200 as height,
    COALESCE(small_size, 0) as file_size,
    COALESCE(generated_at, strftime('%s', 'now')) as created_at
FROM thumbnails_old
WHERE small_path IS NOT NULL AND small_path != '';

-- 迁移 medium 缩略图数据
INSERT INTO thumbnails (image_id, size_type, path, width, height, file_size, created_at)
SELECT 
    image_id,
    'medium' as size_type,
    medium_path as path,
    500 as width,  -- 默认值
    500 as height,
    COALESCE(medium_size, 0) as file_size,
    COALESCE(generated_at, strftime('%s', 'now')) as created_at
FROM thumbnails_old
WHERE medium_path IS NOT NULL AND medium_path != '';

-- 迁移 large 缩略图数据
INSERT INTO thumbnails (image_id, size_type, path, width, height, file_size, created_at)
SELECT 
    image_id,
    'large' as size_type,
    large_path as path,
    1000 as width,  -- 默认值
    1000 as height,
    COALESCE(large_size, 0) as file_size,
    COALESCE(generated_at, strftime('%s', 'now')) as created_at
FROM thumbnails_old
WHERE large_path IS NOT NULL AND large_path != '';

-- 删除旧表
DROP TABLE thumbnails_old;
