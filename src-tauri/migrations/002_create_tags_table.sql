-- Migration: 002_create_tags_table
-- Description: Create tags table and indexes
-- Created: 2024-01-01

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
