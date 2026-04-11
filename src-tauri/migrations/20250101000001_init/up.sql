-- 初始化数据库 Schema

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

-- 标签表（支持层级）
CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    parent_id INTEGER REFERENCES tags(id) ON DELETE CASCADE,
    color TEXT DEFAULT '#3b82f6',
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

-- 标签父子关系索引
CREATE INDEX IF NOT EXISTS idx_tags_parent ON tags(parent_id);

-- 图片标签关联表
CREATE TABLE IF NOT EXISTS image_tags (
    image_id INTEGER NOT NULL REFERENCES images(id) ON DELETE CASCADE,
    tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    PRIMARY KEY (image_id, tag_id)
);

-- 标签关联索引
CREATE INDEX IF NOT EXISTS idx_image_tags_image ON image_tags(image_id);
CREATE INDEX IF NOT EXISTS idx_image_tags_tag ON image_tags(tag_id);

-- 监控文件夹表
CREATE TABLE IF NOT EXISTS locations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    path TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    is_recursive INTEGER NOT NULL DEFAULT 1,
    is_active INTEGER NOT NULL DEFAULT 1,
    image_count INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

-- 缩略图缓存表
CREATE TABLE IF NOT EXISTS thumbnails (
    image_id INTEGER PRIMARY KEY REFERENCES images(id) ON DELETE CASCADE,
    small_path TEXT,
    medium_path TEXT,
    large_path TEXT,
    small_size INTEGER DEFAULT 200,
    medium_size INTEGER DEFAULT 800,
    large_size INTEGER DEFAULT 1600,
    status INTEGER NOT NULL DEFAULT 0, -- 0: pending, 1: done, 2: error
    error_message TEXT,
    generated_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

-- 应用设置表
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

-- 插入默认设置
INSERT OR IGNORE INTO settings (key, value) VALUES
    ('theme', 'system'),
    ('language', 'zh-CN'),
    ('thumbnail_quality', '80'),
    ('thumbnail_small_size', '200'),
    ('thumbnail_medium_size', '800'),
    ('thumbnail_large_size', '1600'),
    ('max_concurrent_thumbnails', '4');
