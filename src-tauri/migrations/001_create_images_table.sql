-- Migration: 001_create_images_table
-- Description: Create images table and indexes
-- Created: 2024-01-01

-- 图片元数据表
CREATE TABLE IF NOT EXISTS images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    path TEXT UNIQUE NOT NULL,
    hash TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_size INTEGER NOT NULL DEFAULT 0,
    file_modified_at INTEGER NOT NULL DEFAULT 0,
    width INTEGER,
    height INTEGER,
    format TEXT,
    color_space TEXT,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

-- 图片路径索引（加速查询）
CREATE INDEX IF NOT EXISTS idx_images_path ON images(path);

-- 图片哈希索引（去重检测）
CREATE INDEX IF NOT EXISTS idx_images_hash ON images(hash);

-- 图片修改时间索引（排序）
CREATE INDEX IF NOT EXISTS idx_images_modified ON images(file_modified_at);
