use anyhow::{Context, Result};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

/// 迁移文件管理器
/// 负责在开发和生产环境中管理迁移文件的位置
pub struct MigrationManager;

impl MigrationManager {
    /// 获取迁移目录路径
    /// 生产环境：返回应用数据目录下的 migrations
    /// 开发环境：返回项目源码目录下的 migrations
    pub fn get_migrations_dir(app_handle: &AppHandle) -> Result<PathBuf> {
        let app_dir = app_handle
            .path()
            .app_data_dir()
            .context("Failed to get app data dir")?;
        
        let migrations_dir = app_dir.join("migrations");
        
        // 确保目录存在
        if !migrations_dir.exists() {
            std::fs::create_dir_all(&migrations_dir)
                .context("Failed to create migrations directory")?;
        }
        
        Ok(migrations_dir)
    }
    
    /// 初始化迁移文件
    /// 生产环境：从打包资源中提取
    /// 开发环境：直接使用源码目录
    pub async fn init_migrations(app_handle: &AppHandle) -> Result<PathBuf> {
        // 开发环境：优先使用源码目录
        if let Ok(dev_path) = Self::find_dev_migrations().await {
            tracing::info!("Using development migrations: {:?}", dev_path);
            return Ok(dev_path);
        }
        
        // 生产环境：从资源中提取
        if let Ok(resource_dir) = app_handle.path().resource_dir() {
            let resource_migrations = resource_dir.join("migrations");
            
            if resource_migrations.exists() {
                tracing::info!("Found migrations in resources: {:?}", resource_migrations);
                
                let app_migrations = Self::get_migrations_dir(app_handle)?;
                
                // 复制新的或更新的迁移文件
                Self::copy_migrations(&resource_migrations, &app_migrations)?;
                
                return Ok(app_migrations);
            }
        }
        
        Err(anyhow::anyhow!(
            "Could not find migrations directory. "
        ))
    }
    
    /// 从资源目录复制迁移文件到应用数据目录
    fn copy_migrations(from: &Path, to: &Path) -> Result<()> {
        let entries = std::fs::read_dir(from)
            .context("Failed to read source migrations directory")?;
        
        let mut copied_count = 0;
        let mut skipped_count = 0;
        
        for entry in entries {
            let entry = entry?;
            let path = entry.path();
            
            // 只复制 .sql 文件
            if path.extension().map(|e| e == "sql").unwrap_or(false) {
                let file_name = path.file_name().unwrap();
                let dest = to.join(file_name);
                
                // 检查是否需要复制（文件不存在或源文件更新）
                let should_copy = if dest.exists() {
                    let src_meta = std::fs::metadata(&path)?;
                    let dest_meta = std::fs::metadata(&dest)?;
                    
                    src_meta.modified()? > dest_meta.modified()?
                } else {
                    true
                };
                
                if should_copy {
                    std::fs::copy(&path, &dest)
                        .with_context(|| format!(
                            "Failed to copy migration file: {:?}",
                            file_name
                        ))?;
                    copied_count += 1;
                    tracing::debug!("Copied migration: {:?}", file_name);
                } else {
                    skipped_count += 1;
                }
            }
        }
        
        tracing::info!(
            "Migrations sync completed: {} copied, {} skipped",
            copied_count,
            skipped_count
        );
        
        Ok(())
    }
    
    /// 在开发环境中查找迁移目录
    async fn find_dev_migrations() -> Result<PathBuf> {
        // 尝试从当前工作目录找
        if let Ok(current_dir) = std::env::current_dir() {
            // 尝试 src-tauri/migrations
            let path = current_dir.join("src-tauri").join("migrations");
            if path.exists() {
                return Ok(path);
            }
            
            // 尝试 migrations（如果已经在 src-tauri 目录）
            let path = current_dir.join("migrations");
            if path.exists() {
                return Ok(path);
            }
            
            // 尝试上级目录
            let path = current_dir.join("..").join("migrations");
            if path.exists() {
                return Ok(path.canonicalize()?);
            }
        }
        
        // 尝试从可执行文件路径找
        if let Ok(exe_path) = std::env::current_exe() {
            if let Some(exe_dir) = exe_path.parent() {
                // 向上查找 migrations
                for depth in 0..5 {
                    let mut path = exe_dir.to_path_buf();
                    for _ in 0..depth {
                        path.push("..");
                    }
                    path.push("migrations");
                    
                    if let Ok(canonical) = path.canonicalize() {
                        if canonical.exists() {
                            return Ok(canonical);
                        }
                    }
                }
            }
        }
        
        Err(anyhow::anyhow!("Could not find migrations directory in development mode"))
    }
    
    /// 检查是否需要更新迁移文件
    pub fn needs_update(app_handle: &AppHandle) -> Result<bool> {
        let resource_dir = app_handle
            .path()
            .resource_dir()
            .context("Failed to get resource dir")?;
        
        let resource_migrations = resource_dir.join("migrations");
        
        if !resource_migrations.exists() {
            // 开发环境，不需要更新检查
            return Ok(false);
        }
        
        let app_migrations = Self::get_migrations_dir(app_handle)?;
        
        // 检查资源目录是否有新的迁移文件
        let resource_entries = std::fs::read_dir(&resource_migrations)?;
        
        for entry in resource_entries {
            let entry = entry?;
            let path = entry.path();
            
            if path.extension().map(|e| e == "sql").unwrap_or(false) {
                let file_name = path.file_name().unwrap();
                let app_file = app_migrations.join(file_name);
                
                if !app_file.exists() {
                    // 发现新迁移文件
                    return Ok(true);
                }
                
                // 检查文件是否更新
                let src_meta = std::fs::metadata(&path)?;
                let dest_meta = std::fs::metadata(&app_file)?;
                
                if src_meta.modified()? > dest_meta.modified()? {
                    return Ok(true);
                }
            }
        }
        
        Ok(false)
    }
    
    /// 获取迁移文件列表
    pub fn list_migrations(app_handle: &AppHandle) -> Result<Vec<(String, PathBuf)>> {
        let migrations_dir = Self::get_migrations_dir(app_handle)?;
        let mut migrations = Vec::new();
        
        let entries = std::fs::read_dir(&migrations_dir)?;
        
        for entry in entries {
            let entry = entry?;
            let path = entry.path();
            
            if path.extension().map(|e| e == "sql").unwrap_or(false) {
                let file_name = path.file_name()
                    .unwrap()
                    .to_string_lossy()
                    .to_string();
                
                migrations.push((file_name, path));
            }
        }
        
        // 按文件名排序
        migrations.sort_by(|a, b| a.0.cmp(&b.0));
        
        Ok(migrations)
    }
    
    /// 读取迁移文件内容
    pub fn read_migration(app_handle: &AppHandle, file_name: &str) -> Result<String> {
        let migrations_dir = Self::get_migrations_dir(app_handle)?;
        let path = migrations_dir.join(file_name);
        
        std::fs::read_to_string(&path)
            .with_context(|| format!("Failed to read migration file: {}", file_name))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_copy_migrations() {
        // 创建临时目录
        let temp_dir = std::env::temp_dir().join("allusion_test");
        let from = temp_dir.join("from");
        let to = temp_dir.join("to");
        
        std::fs::create_dir_all(&from).unwrap();
        std::fs::create_dir_all(&to).unwrap();
        
        // 创建测试文件
        std::fs::write(from.join("001_test.sql"), "CREATE TABLE test;").unwrap();
        std::fs::write(from.join("002_test.sql"), "CREATE TABLE test2;").unwrap();
        
        // 执行复制
        MigrationManager::copy_migrations(&from, &to).unwrap();
        
        // 验证结果
        assert!(to.join("001_test.sql").exists());
        assert!(to.join("002_test.sql").exists());
        
        // 清理
        std::fs::remove_dir_all(&temp_dir).unwrap();
    }
}
