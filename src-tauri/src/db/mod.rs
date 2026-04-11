use anyhow::Result;
use sqlx::{sqlite::SqlitePoolOptions, Pool, Sqlite};
use tauri::{AppHandle, Manager};

pub mod image_repository;
pub mod location_repository;
pub mod migration;
pub mod migration_manager;
pub mod tag_repository;
pub mod thumbnail_repository;

pub use image_repository::ImageRepository;
pub use location_repository::LocationRepository;
pub use migration_manager::MigrationManager;
pub use tag_repository::TagRepository;
pub use thumbnail_repository::ThumbnailRepository;

/// 数据库连接池
pub type DbPool = Pool<Sqlite>;

/// 初始化数据库
pub async fn init_db(app_handle: &AppHandle) -> Result<DbPool> {
    // 获取应用数据目录
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .expect("Failed to get app data dir");
    
    tracing::info!("App data directory: {:?}", app_dir);
    
    // 确保目录存在
    if !app_dir.exists() {
        std::fs::create_dir_all(&app_dir)?;
        tracing::info!("Created app data directory");
    }
    
    let db_path = app_dir.join("allusion.db");
    
    // 关键：如果数据库文件不存在，先创建空文件
    if !db_path.exists() {
        tracing::info!("Creating empty database file...");
        std::fs::File::create(&db_path)?;
    }
    
    let db_url = format!("sqlite:{}", db_path.to_str().unwrap());
    tracing::info!("Database URL: {}", db_url);
    
    // 创建连接池
    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect(&db_url)
        .await?;
    
    // 初始化迁移文件（从资源复制到应用目录）
    let migrations_dir = MigrationManager::init_migrations(app_handle).await?;
    tracing::info!("Migrations directory: {:?}", migrations_dir);
    
    // 运行迁移
    migration::run_migrations(&pool, migrations_dir.to_str().unwrap()).await?;
    
    tracing::info!("Database initialized successfully");
    
    Ok(pool)
}

/// 手动执行 SQL（用于调试）
pub async fn execute_sql(pool: &DbPool, sql: &str) -> Result<()> {
    sqlx::query(sql).execute(pool).await?;
    Ok(())
}

/// 检查数据库是否需要迁移
pub async fn needs_migration(app_handle: &AppHandle) -> Result<bool> {
    // 检查迁移文件是否需要更新
    if MigrationManager::needs_update(app_handle)? {
        return Ok(true);
    }
    
    // 获取应用数据目录
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .expect("Failed to get app data dir");
    
    let db_path = app_dir.join("allusion.db");
    
    if !db_path.exists() {
        return Ok(true); // 新数据库需要初始化
    }
    
    let db_url = format!("sqlite:{}", db_path.to_str().unwrap());
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect(&db_url)
        .await?;
    
    // 获取迁移目录
    let migrations_dir = MigrationManager::get_migrations_dir(app_handle)?;
    let needs = migration::check_migrations(&pool, migrations_dir.to_str().unwrap()).await?;
    
    pool.close().await;
    
    Ok(needs)
}

/// 重置数据库（谨慎使用！会删除所有数据）
pub async fn reset_database(app_handle: &AppHandle) -> Result<()> {
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .expect("Failed to get app data dir");
    
    let db_path = app_dir.join("allusion.db");
    
    if db_path.exists() {
        std::fs::remove_file(&db_path)?;
        tracing::info!("Database file removed");
    }
    
    // 重新初始化
    init_db(app_handle).await?;
    
    Ok(())
}

/// 获取数据库统计信息
pub async fn get_db_stats(pool: &DbPool) -> Result<serde_json::Value> {
    let image_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM images")
        .fetch_one(pool)
        .await?;
    
    let tag_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM tags")
        .fetch_one(pool)
        .await?;
    
    let location_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM locations")
        .fetch_one(pool)
        .await?;
    
    Ok(serde_json::json!({
        "image_count": image_count,
        "tag_count": tag_count,
        "location_count": location_count,
    }))
}
