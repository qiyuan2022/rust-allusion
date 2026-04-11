好的，以下是针对 **Allusion 复刻版** 的详细技术选型方案，基于 **Rust + Tauri** 技术栈，目标是在保持 Allusion 优雅设计的同时，实现 10万+ 图片的高性能管理。

---

## 一、整体架构

```
┌─────────────────────────────────────────┐
│           Tauri (Frontend)              │
│  ┌─────────┐ ┌─────────┐ ┌──────────┐  │
│  │  React  │ │ 虚拟滚动 │ │ 缩略图   │  │
│  │   +     │ │ 列表    │ │ 懒加载   │  │
│  │  Tailwind│ │         │          │  │
│  └─────────┘ └─────────┘ └──────────┘  │
├─────────────────────────────────────────┤
│           Tauri Bridge                  │
│    (IPC: Commands + Events)             │
├─────────────────────────────────────────┤
│           Rust Core (Backend)           │
│  ┌─────────┐ ┌─────────┐ ┌──────────┐  │
│  │ 文件监控 │ │ 缩略图  │ │ 数据库   │  │
│  │ 引擎    │ │ 引擎    │ │ 引擎    │  │
│  └─────────┘ └─────────┘ └──────────┘  │
│  ┌─────────┐ ┌─────────┐ ┌──────────┐  │
│  │ 标签系统 │ │ 搜索    │ │ 导入导出 │  │
│  │         │ │ 引擎    │ │ 管理    │  │
│  └─────────┘ └─────────┘ └──────────┘  │
└─────────────────────────────────────────┘
```

---

## 二、分层技术选型

### 2.1 前端层 (Tauri Frontend)

| 组件 | 选型 | 理由 |
|------|------|------|
| **框架** | **React 18** | 生态成熟，虚拟滚动库丰富 |
| **语言** | **TypeScript** | 类型安全，与 Rust 类型可通过 tauri-bindgen 对齐 |
| **样式** | **Tailwind CSS** | 原子化 CSS，快速实现 Allusion 的简洁设计 |
| **状态管理** | **Zustand** | 轻量级，避免 Redux  boilerplate |
| **虚拟滚动** | **react-window** 或 **@tanstack/react-virtual** | 处理 10万+ 列表项不卡顿 |
| **图片懒加载** | **原生 Intersection Observer** + 自定义占位符 | 减少初始内存占用 |
| **缩略图显示** | **Canvas 2D** 或 **WebGL** (必要时) | 高性能渲染大量小图 |

**关键优化**：
- 使用 `content-visibility: auto` 优化长列表渲染
- 缩略图使用 `URL.createObjectURL` 加载本地文件，避免 base64 内存开销
- 实现图片占位符系统（模糊渐进加载）

---

### 2.2 Tauri 桥接层

| 组件 | 选型 | 配置 |
|------|------|------|
| **IPC 通信** | Tauri Commands + Events | 大数据传输使用 `Channel` 流式传输 |
| **文件系统访问** | Tauri FS API + 自定义 Rust 命令 | 前端不直接操作文件，通过 Rust 中转 |
| **窗口管理** | Tauri Window API | 多窗口支持（预览窗口、导入进度窗口） |

**性能关键配置**：
```rust
// tauri.conf.json
{
  "tauri": {
    "allowlist": {
      "protocol": {
        "asset": true,  // 自定义 asset:// 协议加载本地缩略图
        "assetScope": ["$APPDATA/thumbnails/**"]
      }
    },
    "bundle": {
      "active": true,
      "targets": "all"
    }
  }
}
```

---

### 2.3 Rust 核心层（重点）

#### A. 异步运行时

| 选型 | **tokio** (full feature) | 理由 |
|------|--------------------------|------|
| 版本 | `tokio = { version = "1", features = ["full"] }` | 标准异步运行时，生态完善 |
| 线程池 | `tokio::task::spawn_blocking` 用于 CPU 密集型任务 | 缩略图生成不阻塞 async 线程 |

#### B. 文件系统监控

| 选型 | **notify** | 理由 |
|------|------------|------|
| 版本 | `notify = "6.1.1"` | 跨平台文件系统事件（inotify/FSEvents/ReadDirectoryChangesW）|
| 优化 | 使用 `PollWatcher` 作为备选，处理网络驱动器 | 某些场景下轮询更可靠 |
| 防抖 | 自定义防抖层（500ms 聚合事件） | 避免批量操作时的风暴 |

#### C. 图像处理（关键决策点）

有两个选择，推荐 **方案 B** 用于生产：

| | 方案 A：纯 Rust | 方案 B：libvips 绑定（推荐）|
|--|----------------|---------------------------|
| **库** | `image` crate | `libvips` + `rustyvips` / 自定义 FFI |
| **性能** | 中等（纯 Rust，安全） | **极高**（C 库，行业标杆）|
| **格式支持** | 基础（JPEG/PNG/GIF/WebP） | 全面（RAW/PSD/AI/PDF 等）|
| **内存占用** | 中等 | 低（流式处理，不加载全图）|
| **并发** | 需手动实现 | 内置线程池 |
| **复杂度** | 低 | 中等（需处理 C 依赖）|

**推荐配置（libvips）**：
```toml
[dependencies]
# 图像处理
libvips = "1.5"  # 或 rustyvips / 自定义绑定

# 备选：纯 Rust 方案
image = { version = "0.25", default-features = false, features = ["jpeg", "png", "webp", "gif"] }
webp = "0.3"  # WebP 编码
fastblur = "0.2"  # 快速模糊（占位符用）
```

**缩略图生成策略**：
```rust
// 伪代码示意
pub struct ThumbnailEngine {
    // libvips 线程池
    vips: VipsInstance,
    // 限制并发数（根据 CPU 核心数）
    semaphore: Arc<Semaphore>,
    // 输出目录
    cache_dir: PathBuf,
}

impl ThumbnailEngine {
    pub async fn generate(&self, path: &Path, size: u32) -> Result<PathBuf> {
        // 1. 检查缓存（SQLite 记录 + 文件存在性）
        // 2. 获取信号量许可（限制并发）
        // 3. 使用 libvips 生成缩略图（不加载全图到内存）
        // 4. 保存到缓存目录
        // 5. 更新数据库记录
    }
}
```

#### D. 数据库

| 选型 | **SQLite** + **DuckDB**（混合） | 理由 |
|------|----------------------------------|------|
| 主数据库 | `rusqlite` 或 `sqlx` | 元数据、标签、文件索引 |
| 搜索优化 | `sqlite-fts5` 或 `DuckDB` | 全文搜索、复杂聚合查询 |
| 缓存 | `moka`（内存缓存） | 热点数据内存缓存，减少 DB 查询 |

**推荐配置**：
```toml
[dependencies]
sqlx = { version = "0.7", features = ["runtime-tokio", "sqlite", "migrate"] }
moka = { version = "0.12", features = ["future"] }  # 异步缓存
serde = { version = "1.0", features = ["derive"] }
```

**数据库 Schema 设计**：
```sql
-- 核心表
CREATE TABLE images (
    id INTEGER PRIMARY KEY,
    path TEXT UNIQUE NOT NULL,  -- 文件路径（索引）
    hash TEXT NOT NULL,         -- 文件哈希（去重、变更检测）
    size INTEGER,               -- 文件大小
    modified_at INTEGER,        -- 修改时间（时间戳）
    width INTEGER,              -- 图片宽度
    height INTEGER,             -- 图片高度
    format TEXT,                -- 格式（JPEG/PNG/...）
    color_space TEXT,           -- 色彩空间
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- 标签系统（支持层级标签）
CREATE TABLE tags (
    id INTEGER PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    parent_id INTEGER REFERENCES tags(id),
    color TEXT                  -- 标签颜色
);

CREATE TABLE image_tags (
    image_id INTEGER REFERENCES images(id) ON DELETE CASCADE,
    tag_id INTEGER REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (image_id, tag_id)
);

-- 缩略图缓存记录
CREATE TABLE thumbnails (
    image_id INTEGER PRIMARY KEY REFERENCES images(id) ON DELETE CASCADE,
    small_path TEXT,            -- 200px
    medium_path TEXT,           -- 800px
    large_path TEXT,            -- 1600px
    generated_at INTEGER,
    status INTEGER              -- 0:pending, 1:done, 2:error
);

-- 全文搜索（FTS5）
CREATE VIRTUAL TABLE images_fts USING fts5(
    path, 
    tags,  -- 关联标签文本
    content='images',
    content_rowid='id'
);
```

#### E. 搜索引擎

| 选型 | **Meilisearch 嵌入式** 或 **Tantivy** | 理由 |
|------|----------------------------------------|------|
| Meilisearch | `meilisearch-sdk`（本地 embedded） | 功能全，支持容错搜索、过滤、排序 |
| Tantivy | `tantivy`（纯 Rust） | 更轻量，无外部依赖，适合嵌入式 |

**推荐**：先用 **Tantivy**，必要时升级到 Meilisearch。

```toml
[dependencies]
tantivy = "0.21"  # 全文搜索引擎
```

#### F. 文件哈希与去重

| 选型 | **blake3** | 理由 |
|------|------------|------|
| 哈希算法 | `blake3 = "1.5"` | 极快，适合大文件流式哈希 |
| 相似图片检测 | `imagehash` 或 `perceptual_hash` | 感知哈希，找相似图 |

---

### 2.4 跨平台与打包

| 组件 | 选型 |
|------|------|
| **构建工具** | `cargo` + `pnpm` / `npm` |
| **CI/CD** | GitHub Actions |
| **代码签名** | `signtool` (Windows) / `codesign` (macOS) |
| **自动更新** | Tauri 内置 updater |

---

## 三、性能关键设计模式

### 3.1 启动优化（解决 Allusion 的启动卡顿）

```rust
// 启动时只加载必要数据，后台初始化
pub async fn initialize_app() -> AppState {
    // 1. 快速启动：只加载数据库连接和基础配置
    let db = Database::connect().await;
    
    // 2. 后台任务：文件监控初始化
    let monitor = tokio::spawn(async {
        FileMonitor::new().initialize().await
    });
    
    // 3. 延迟加载：缩略图引擎（按需启动）
    let thumbnail_engine = ThumbnailEngine::lazy();
    
    // 4. 返回可交互状态，后台继续初始化
    AppState { db, monitor, thumbnail_engine }
}
```

### 3.2 内存管理（解决 Allusion 的内存飙升）

| 策略 | 实现 |
|------|------|
| **缩略图 LRU 缓存** | `moka::future::Cache`，限制 1000 张在内存 |
| **图片流式处理** | libvips 的流式 API，不加载全图 |
| **虚拟列表** | 前端只渲染 50 个 DOM 节点 |
| **后台任务限流** | `tokio::sync::Semaphore` 限制并发缩略图生成数（建议 CPU 核心数 * 2）|
| **定期 GC 提示** | 缩略图生成后手动 `drop` 大对象，提示 Rust 释放内存 |

### 3.3 并发模型

```rust
// 线程池划分
┌─────────────────────────────────────┐
│         Tokio Async Runtime         │
│  ┌─────────┐ ┌─────────┐ ┌───────┐ │
│  │ HTTP/API│ │ 文件监控│ │ 搜索  │ │
│  │  处理   │ │  事件   │ │ 索引  │ │
│  └─────────┘ └─────────┘ └───────┘ │
├─────────────────────────────────────┤
│     spawn_blocking (CPU 密集型)       │
│  ┌─────────┐ ┌─────────┐ ┌───────┐ │
│  │ 缩略图  │ │ 图片    │ │ 哈希  │ │
│  │ 生成    │ │ 解码    │ │ 计算  │ │
│  └─────────┘ └─────────┘ └───────┘ │
├─────────────────────────────────────┤
│     Rayon (数据并行，可选)            │
│  ┌─────────┐                        │
│  │ 批量    │                        │
│  │ 处理    │                        │
│  └─────────┘                        │
└─────────────────────────────────────┘
```

---

## 四、推荐的项目结构

```
allusion-rs/
├── Cargo.toml                 # Rust workspace
├── tauri.conf.json           # Tauri 配置
├── src/
│   ├── main.rs               # 入口
│   ├── lib.rs                # 库入口
│   ├── commands/             # Tauri 命令（IPC 接口）
│   │   ├── mod.rs
│   │   ├── image.rs          # 图片相关命令
│   │   ├── tag.rs            # 标签命令
│   │   └── search.rs         # 搜索命令
│   ├── core/                 # 核心业务逻辑
│   │   ├── mod.rs
│   │   ├── database.rs       # 数据库管理
│   │   ├── thumbnail.rs      # 缩略图引擎
│   │   ├── monitor.rs        # 文件监控
│   │   ├── search.rs         # 搜索引擎
│   │   └── importer.rs       # 导入逻辑
│   ├── models/               # 数据模型
│   │   ├── mod.rs
│   │   ├── image.rs
│   │   └── tag.rs
│   └── utils/                # 工具函数
│       ├── mod.rs
│       ├── hash.rs
│       └── path.rs
├── src-tauri/                # Tauri 生成文件
├── frontend/                 # React 前端
│   ├── package.json
│   ├── src/
│   │   ├── App.tsx
│   │   ├── components/       # 组件
│   │   │   ├── Gallery/      # 画廊（虚拟滚动）
│   │   │   ├── Sidebar/      # 侧边栏
│   │   │   └── Viewer/       # 图片预览
│   │   ├── hooks/            # 自定义 hooks
│   │   ├── stores/           # Zustand 状态
│   │   └── utils/            # 前端工具
│   └── tailwind.config.js
├── migrations/               # SQLx 数据库迁移
└── tests/                    # 集成测试
```

---

## 五、开发路线图建议

| 阶段 | 目标 | 时间 |
|------|------|------|
| **MVP** | 基础导入、浏览、标签、搜索（1000 张流畅） | 4-6 周 |
| **v0.2** | 缩略图缓存优化、虚拟滚动、10万+ 支持 | 3-4 周 |
| **v0.3** | 文件监控、自动同步、导入导出 | 2-3 周 |
| **v0.4** | 高级搜索、相似图片、性能调优 | 3-4 周 |
| **v1.0** | 跨平台发布、自动更新、插件系统 | 4-6 周 |

---

## 六、关键依赖清单（Cargo.toml）

```toml
[package]
name = "allusion-rs"
version = "0.1.0"
edition = "2021"

[dependencies]
# Tauri
tauri = { version = "1.6", features = ["shell-open", "protocol-asset"] }
tauri-build = { version = "1.6", features = [] }

# Async
tokio = { version = "1.37", features = ["full"] }
futures = "0.3"

# Database
sqlx = { version = "0.7", features = ["runtime-tokio", "sqlite", "migrate", "chrono"] }
moka = { version = "0.12", features = ["future"] }

# 图像处理（二选一，推荐 libvips）
# 方案 A：纯 Rust
image = { version = "0.25", default-features = false, features = ["jpeg", "png", "webp"] }
# 方案 B：libvips（需要系统安装 libvips）
# libvips = "1.5"

# 文件监控
notify = { version = "6.1", default-features = false, features = ["macos_fsevent"] }

# 搜索
tantivy = "0.21"

# 序列化
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"

# 哈希
blake3 = "1.5"
xxhash-rust = { version = "0.8", features = ["xxh3"] }  # 更快，用于内存哈希

# 错误处理
anyhow = "1.0"
thiserror = "1.0"

# 日志
tracing = "0.1"
tracing-subscriber = "0.3"

# 工具
chrono = { version = "0.4", features = ["serde"] }
walkdir = "2.5"
rayon = "1.10"  # 数据并行

[features]
default = ["custom-protocol"]
custom-protocol = ["tauri/custom-protocol"]

[build-dependencies]
tauri-build = { version = "1.6", features = [] }
```

---

这份选型方案平衡了**性能、开发效率和可维护性**。需要我针对某个具体模块（如缩略图引擎或虚拟滚动实现）展开更详细的代码示例吗？