-- Migration: 005_create_thumbnails_table
-- Description: Create thumbnails table for thumbnail cache
-- Created: 2024-01-01

-- 缩略图表 - 存储各尺寸缩略图信息
CREATE TABLE IF NOT EXISTS thumbnails (
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

-- 索引
CREATE INDEX IF NOT EXISTS idx_thumbnails_image_id ON thumbnails(image_id);
CREATE INDEX IF NOT EXISTS idx_thumbnails_size_type ON thumbnails(size_type);
