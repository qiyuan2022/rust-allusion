use anyhow::{Context, Result};
use sqlx::SqlitePool;
use std::path::Path;

/// 迁移记录
#[derive(Debug)]
pub struct Migration {
    pub version: i32,
    pub name: String,
    pub sql: String,
}

/// 运行所有待执行的迁移
pub async fn run_migrations(pool: &SqlitePool, migrations_dir: &str) -> Result<()> {
    // 确保迁移记录表存在
    create_migrations_table(pool).await?;
    
    // 获取所有迁移文件
    let migrations = load_migrations(migrations_dir)?;
    
    // 获取已执行的迁移版本
    let executed_versions = get_executed_versions(pool).await?;
    
    // 执行待执行的迁移
    for migration in migrations {
        if !executed_versions.contains(&migration.version) {
            tracing::info!(
                "Running migration {}: {}",
                migration.version,
                migration.name
            );
            
            // 在一个事务中执行迁移
            let mut tx = pool.begin().await?;
            
            // 执行 SQL
            sqlx::query(&migration.sql)
                .execute(&mut *tx)
                .await
                .with_context(|| format!(
                    "Failed to execute migration {}: {}",
                    migration.version,
                    migration.name
                ))?;
            
            // 记录迁移已执行
            sqlx::query(
                "INSERT INTO _migrations (version, name, executed_at) VALUES (?1, ?2, ?3)"
            )
            .bind(migration.version)
            .bind(&migration.name)
            .bind(chrono::Utc::now().timestamp())
            .execute(&mut *tx)
            .await?;
            
            tx.commit().await?;
            
            tracing::info!(
                "Migration {} completed successfully",
                migration.version
            );
        } else {
            tracing::debug!(
                "Migration {} already executed, skipping",
                migration.version
            );
        }
    }
    
    Ok(())
}

/// 创建迁移记录表
async fn create_migrations_table(pool: &SqlitePool) -> Result<()> {
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS _migrations (
            version INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            executed_at INTEGER NOT NULL,
            created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
        )
        "#
    )
    .execute(pool)
    .await?;
    
    Ok(())
}

/// 获取已执行的迁移版本
async fn get_executed_versions(pool: &SqlitePool) -> Result<Vec<i32>> {
    let versions: Vec<(i32,)> = sqlx::query_as("SELECT version FROM _migrations")
        .fetch_all(pool)
        .await?;
    
    Ok(versions.into_iter().map(|v| v.0).collect())
}

/// 从目录加载所有迁移文件
fn load_migrations(migrations_dir: &str) -> Result<Vec<Migration>> {
    let mut migrations = Vec::new();
    let path = Path::new(migrations_dir);
    
    if !path.exists() {
        return Err(anyhow::anyhow!(
            "Migrations directory does not exist: {}",
            migrations_dir
        ));
    }
    
    // 读取目录中的所有 .sql 文件
    let entries = std::fs::read_dir(path)?;
    let mut sql_files: Vec<_> = entries
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.path()
                .extension()
                .map(|ext| ext == "sql")
                .unwrap_or(false)
        })
        .collect();
    
    // 按文件名排序（保证执行顺序）
    sql_files.sort_by(|a, b| a.file_name().cmp(&b.file_name()));
    
    for entry in sql_files {
        let file_name = entry.file_name();
        let file_name_str = file_name.to_string_lossy();
        let file_path = entry.path();
        
        // 解析版本号（文件名格式：001_description.sql）
        let version = parse_version(&file_name_str)?;
        let name = parse_name(&file_name_str);
        
        // 读取 SQL 内容
        let sql = std::fs::read_to_string(&file_path)
            .with_context(|| format!("Failed to read migration file: {}", file_path.display()))?;
        
        // 简单验证：检查是否有 SQL 内容
        if sql.trim().is_empty() {
            tracing::warn!("Migration file {} is empty, skipping", file_name_str);
            continue;
        }
        
        migrations.push(Migration {
            version,
            name,
            sql,
        });
    }
    
    // 按版本号排序
    migrations.sort_by_key(|m| m.version);
    
    tracing::info!(
        "Loaded {} migrations from {}",
        migrations.len(),
        migrations_dir
    );
    
    Ok(migrations)
}

/// 从文件名解析版本号（如 001_create_images_table.sql -> 1）
fn parse_version(file_name: &str) -> Result<i32> {
    let parts: Vec<&str> = file_name.split('_').collect();
    if parts.is_empty() {
        return Err(anyhow::anyhow!(
            "Invalid migration file name format: {}",
            file_name
        ));
    }
    
    parts[0]
        .parse::<i32>()
        .with_context(|| format!(
            "Failed to parse version from file name: {}",
            file_name
        ))
}

/// 从文件名解析描述（如 001_create_images_table.sql -> create_images_table）
fn parse_name(file_name: &str) -> String {
    let parts: Vec<&str> = file_name.split('_').collect();
    if parts.len() <= 1 {
        return file_name.to_string();
    }
    
    // 去掉版本号和扩展名
    let name_parts = &parts[1..parts.len() - 1];
    name_parts.join("_")
}

/// 检查是否需要运行迁移
pub async fn check_migrations(pool: &SqlitePool, migrations_dir: &str) -> Result<bool> {
    create_migrations_table(pool).await?;
    
    let executed = get_executed_versions(pool).await?;
    let available = load_migrations(migrations_dir)?;
    
    let pending: Vec<_> = available
        .iter()
        .filter(|m| !executed.contains(&m.version))
        .collect();
    
    Ok(!pending.is_empty())
}

/// 回滚到指定版本（谨慎使用，仅用于开发调试）
pub async fn rollback_to(pool: &SqlitePool, target_version: i32) -> Result<()> {
    tracing::warn!(
        "Rolling back migrations to version {}",
        target_version
    );
    
    // 获取当前版本
    let current: Option<(i32,)> = sqlx::query_as(
        "SELECT MAX(version) FROM _migrations"
    )
    .fetch_optional(pool)
    .await?;
    
    if let Some((current_version,)) = current {
        if current_version <= target_version {
            tracing::info!("Already at or below target version");
            return Ok(());
        }
        
        // 删除迁移记录
        sqlx::query("DELETE FROM _migrations WHERE version > ?1")
            .bind(target_version)
            .execute(pool)
            .await?;
        
        tracing::info!(
            "Rolled back from {} to {}",
            current_version,
            target_version
        );
    }
    
    Ok(())
}
