# 生产环境迁移文件部署方案

## 架构设计

```
┌─────────────────────────────────────────────────────────────┐
│                     应用打包 (Build)                         │
│  ┌─────────────────┐      ┌──────────────────────────────┐ │
│  │  可执行文件      │      │  资源目录 (resources)         │ │
│  │  allusion-rs.exe │      │  └── migrations/              │ │
│  └─────────────────┘      │      ├── 001_xxx.sql          │ │
│                           │      ├── 002_xxx.sql          │ │
│                           │      └── ...                   │ │
│                           └──────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                            ↓ 首次启动/更新时复制
┌─────────────────────────────────────────────────────────────┐
│                   应用数据目录 (Runtime)                     │
│  %APPDATA%/com.allusion-rs.app/                             │
│  ├── allusion.db              ← SQLite 数据库文件            │
│  └── migrations/              ← 迁移文件副本                 │
│       ├── 001_xxx.sql                                      │
│       ├── 002_xxx.sql                                      │
│       └── ...                                              │
└─────────────────────────────────────────────────────────────┘
```

## 工作流程

### 1. 打包时 (Build Time)

`tauri.conf.json` 配置：
```json
"bundle": {
  "resources": [
    "migrations/**/*"
  ]
}
```

Tauri 会将 `src-tauri/migrations/` 目录下的所有 `.sql` 文件打包到应用资源中。

### 2. 运行时 (Runtime)

```rust
// 应用启动时自动执行
pub async fn init_db(app_handle: &AppHandle) -> Result<DbPool> {
    // 1. 初始化数据库连接
    let pool = create_connection_pool().await?;
    
    // 2. 从资源目录复制迁移文件到应用数据目录
    let migrations_dir = MigrationManager::init_migrations(app_handle).await?;
    
    // 3. 执行待运行的迁移
    migration::run_migrations(&pool, migrations_dir.to_str().unwrap()).await?;
    
    Ok(pool)
}
```

## 关键特性

### 1. 智能复制

- **首次启动**：所有迁移文件从资源复制到应用目录
- **后续启动**：只复制新增或更新的迁移文件
- **版本控制**：通过文件修改时间判断是否需要更新

### 2. 事务安全

每个迁移在一个数据库事务中执行：
```rust
let mut tx = pool.begin().await?;

// 执行 SQL
sqlx::query(&migration.sql).execute(&mut *tx).await?;

// 记录迁移版本
sqlx::query("INSERT INTO _migrations ...").execute(&mut *tx).await?;

tx.commit().await?;
```

### 3. 环境适配

| 环境 | 迁移文件来源 | 存储位置 |
|------|-------------|---------|
| 开发 | 项目源码目录 | `src-tauri/migrations/` |
| 生产 | 应用资源目录 | `%APPDATA%/.../migrations/` |

## 更新流程

### 场景：发布新版本，添加新表

1. **开发阶段**
   ```bash
   # 创建新的迁移文件
   touch src-tauri/migrations/007_add_new_feature.sql
   
   # 编写 SQL
   echo "CREATE TABLE new_table (...);" > src-tauri/migrations/007_add_new_feature.sql
   ```

2. **打包发布**
   ```bash
   npm run tauri build
   ```
   新迁移文件自动包含在应用包中。

3. **用户更新**
   - 用户安装新版本
   - 应用启动时检测到新的迁移文件
   - 自动复制并执行迁移
   - 数据库结构更新完成

## 调试工具

### 查看迁移状态

```rust
// 检查是否需要迁移
let needs = db::needs_migration(&app_handle).await?;
println!("Needs migration: {}", needs);

// 获取迁移文件列表
let migrations = MigrationManager::list_migrations(&app_handle)?;
for (name, path) in migrations {
    println!("Migration: {}", name);
}
```

### 重置数据库（开发调试）

```rust
// 删除数据库并重新初始化
db::reset_database(&app_handle).await?;
```

### 查看数据库统计

```rust
let stats = db::get_db_stats(&pool).await?;
println!("Images: {}, Tags: {}", stats["image_count"], stats["tag_count"]);
```

## 注意事项

### 1. 不要修改已发布的迁移

```
❌ 错误：修改 001_create_images_table.sql 并发布
✅ 正确：创建 007_update_images_table.sql 进行修改
```

### 2. 迁移文件大小限制

- 单个迁移文件不宜过大（建议 < 1MB）
- 大数据迁移拆分为多个小迁移

### 3. 向下兼容性

- 新迁移不能破坏旧版本功能
- 删除表/列前先确认无依赖

### 4. 备份策略

建议在重大更新前自动备份：

```rust
pub async fn backup_before_migration(app_handle: &AppHandle) -> Result<PathBuf> {
    let app_dir = app_handle.path().app_data_dir()?;
    let db_path = app_dir.join("allusion.db");
    let backup_path = app_dir.join(format!(
        "allusion_backup_{}.db",
        chrono::Local::now().format("%Y%m%d_%H%M%S")
    ));
    
    std::fs::copy(&db_path, &backup_path)?;
    Ok(backup_path)
}
```

## 故障排查

### 问题：迁移文件找不到

**检查步骤**：
1. 确认 `tauri.conf.json` 中 `resources` 配置正确
2. 检查打包后的应用资源目录
3. 查看日志中的路径信息

### 问题：迁移执行失败

**检查步骤**：
1. 检查 SQL 语法是否正确
2. 确认表/列不存在冲突
3. 查看数据库日志

### 问题：生产环境迁移未执行

**检查步骤**：
1. 确认应用有写入 `%APPDATA%` 的权限
2. 检查磁盘空间是否充足
3. 查看应用日志中的错误信息
