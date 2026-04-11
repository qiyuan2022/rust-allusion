-- Migration: 006_create_settings_table
-- Description: Create settings table and insert defaults
-- Created: 2024-01-01

-- 应用设置表
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

-- 插入默认设置
INSERT OR IGNORE INTO settings (key, value) VALUES ('theme', 'system');
INSERT OR IGNORE INTO settings (key, value) VALUES ('language', 'zh-CN');
INSERT OR IGNORE INTO settings (key, value) VALUES ('thumbnail_quality', '80');
INSERT OR IGNORE INTO settings (key, value) VALUES ('thumbnail_small_size', '200');
INSERT OR IGNORE INTO settings (key, value) VALUES ('thumbnail_medium_size', '800');
INSERT OR IGNORE INTO settings (key, value) VALUES ('thumbnail_large_size', '1600');
INSERT OR IGNORE INTO settings (key, value) VALUES ('max_concurrent_thumbnails', '4');
