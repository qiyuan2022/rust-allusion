# 数据库迁移说明

## 文件命名规范

迁移文件使用以下命名格式：

```
{版本号}_{描述}.sql
```

例如：
- `001_create_images_table.sql`
- `002_create_tags_table.sql`
- `003_add_user_settings.sql`

## 命名规则

1. **版本号**：3位数字，不足补零（001, 002, 010, 100）
2. **描述**：使用下划线连接的小写字母
3. **扩展名**：必须是 `.sql`

## 执行顺序

迁移按版本号从小到大顺序执行，已执行的迁移会记录在 `_migrations` 表中，不会重复执行。

## 编写新的迁移

1. 在当前最大版本号基础上 +1
2. 创建新的 SQL 文件
3. 编写 `CREATE TABLE IF NOT EXISTS` 或 `ALTER TABLE` 语句
4. 重启应用即可自动执行

## 示例

```sql
-- Migration: 007_add_image_rating
-- Description: Add rating column to images table
-- Created: 2024-01-15

ALTER TABLE images ADD COLUMN rating INTEGER DEFAULT 0;
CREATE INDEX idx_images_rating ON images(rating);
```

## 注意事项

1. **不要修改已执行的迁移文件** - 会导致不一致
2. **保持向后兼容** - 新的迁移不能破坏旧数据
3. **使用 IF NOT EXISTS** - 防止重复执行时报错
4. **添加回滚逻辑**（可选）- 复杂迁移考虑如何回滚

## 开发调试

### 查看迁移状态

```rust
let needs_migration = db::needs_migration(&app_handle).await?;
```

### 重置数据库（会丢失所有数据！）

```rust
db::reset_database(&app_handle).await?;
```

### 手动执行 SQL

```rust
db::execute_sql(&pool, "SELECT * FROM images").await?;
```
