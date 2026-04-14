-- Migration: 009_make_thumbnail_paths_relative
-- Description: 将 thumbnails 表中的 path 从绝对路径改为相对路径（仅文件名）
-- Created: 2024-01-16

-- 1. 确保 thumbnail_dir 设置存在
INSERT OR IGNORE INTO settings (key, value) VALUES ('thumbnail_dir', '');

-- 2. 把所有缩略图路径统一改为相对文件名（格式已知：{hash}_{size}.jpg）
UPDATE thumbnails SET path = image_hash || '_' || size_type || '.jpg';
