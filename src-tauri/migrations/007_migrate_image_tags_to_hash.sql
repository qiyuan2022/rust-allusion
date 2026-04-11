-- Migration: 007_migrate_image_tags_to_hash
-- Description: Change image_tags table to use image_hash instead of image_id for persistent tagging
-- Created: 2026-04-09

-- 创建新的标签关联表（使用 hash，不依赖 images 表）
CREATE TABLE IF NOT EXISTS image_tags_v2 (
    image_hash TEXT NOT NULL,
    tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    PRIMARY KEY (image_hash, tag_id)
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_image_tags_v2_hash ON image_tags_v2(image_hash);
CREATE INDEX IF NOT EXISTS idx_image_tags_v2_tag ON image_tags_v2(tag_id);

-- 迁移数据：将现有的 image_id 转换为 hash
INSERT OR IGNORE INTO image_tags_v2 (image_hash, tag_id, created_at)
SELECT i.hash, it.tag_id, it.created_at
FROM image_tags it
JOIN images i ON it.image_id = i.id;

-- 删除旧表
DROP TABLE IF EXISTS image_tags;

-- 重命名新表
ALTER TABLE image_tags_v2 RENAME TO image_tags;

-- 重新创建索引（因为重命名后索引名需要更新）
CREATE INDEX IF NOT EXISTS idx_image_tags_hash ON image_tags(image_hash);
CREATE INDEX IF NOT EXISTS idx_image_tags_tag ON image_tags(tag_id);
