# Rust Allusion

使用 **Tauri v2** + **React** 构建的高性能本地图片管理应用。支持目录监控、标签管理、全文搜索和缩略图预览，可流畅管理数万张图片。

---

## 技术栈

### 前端

| 技术 | 版本 | 用途 |
|------|------|------|
| React | ^19.0 | UI 框架 |
| TypeScript | ^5.0 | 类型安全 |
| Vite | ^5.0 | 构建工具 |
| Tailwind CSS | ^3.4 | 原子化样式 |
| @fluentui/react-components | ^9.73 | UI 组件库 |
| @tanstack/react-virtual | ^3.13 | 虚拟滚动 |
| Zustand | ^5.0 | 状态管理 |

### 后端（Rust）

| 技术 | 版本 | 用途 |
|------|------|------|
| Tauri | 2.0 | 桌面应用框架 |
| Tokio | 1.x | 异步运行时 |
| SQLx | 0.8 | SQLite 异步 ORM |
| Tantivy | 0.22 | 全文搜索引擎 |
| notify | 6.1 | 文件系统监控 |
| blake3 | 1.5 | 文件哈希（去重） |
| image | 0.25 | 图片尺寸解析 |
| libvips | - | 缩略图生成（系统依赖） |

---

## 核心功能

### 目录管理
- 添加本地文件夹作为 **Location**，支持递归/非递归监控
- 启动时自动扫描关闭期间的新增/删除文件
- 运行时通过文件系统事件实时监控变更

### 图片导入与去重
- 支持格式：`jpg`, `jpeg`, `png`, `gif`, `webp`, `bmp`, `tiff`, `raw`, `cr2`, `nef`, `arw`, `dng`, `heic`, `heif`, `psd`, `kra`, `svg`
- 基于 **BLAKE3** 流式哈希去重
- 批量导入带进度反馈（可取消）

### 标签系统
- 树形层级标签（支持嵌套）
- 单张/批量打标签
- 标签筛选（单选、多选、Ctrl 多选）

### 搜索
- **Tantivy** 全文搜索引擎
- 支持文件名/路径模糊搜索
- 标签组合过滤
- 后台增量索引，实时同步

### 缩略图
- 懒加载 + 虚拟滚动，只渲染可见区域
- 后台异步生成，首次访问时创建
- 自定义 `asset://` 协议加载本地缩略图

### 画廊浏览
- 虚拟滚动支持大量图片不卡顿
- 瀑布流布局，自适应列数
- 多选模式（Shift/Ctrl）
- 图片详情页（元数据、标签编辑）

---

## 快速开始

### 环境要求

- [Node.js](https://nodejs.org/) >= 18
- [pnpm](https://pnpm.io/) >= 10
- [Rust](https://rustup.rs/) >= 1.70
- [libvips](https://www.libvips.org/)（系统依赖，用于缩略图生成）

### 安装依赖

```bash
# 安装前端依赖
pnpm install

# Rust 依赖会在首次运行时自动安装
```

### 开发运行

```bash
# 启动开发服务器（前后端热更新）
pnpm tauri:dev

# 或分开运行
pnpm dev          # 前端 Vite 服务器
pnpm tauri dev    # Tauri 开发模式
```

### 构建发布版

```bash
pnpm tauri:build
```

构建产物位于 `src-tauri/target/release/bundle/`。

---

## 项目结构

```
rust-allusion/
├── src/                        # 前端 (React + TypeScript)
│   ├── api/                    # Tauri Command 调用封装
│   ├── components/             # UI 组件
│   │   ├── Gallery.tsx         # 虚拟滚动画廊
│   │   ├── Sidebar.tsx         # 侧边栏（标签树 + 位置列表）
│   │   ├── ImageViewer.tsx     # 图片预览
│   │   └── ScanProgressDialog.tsx  # 扫描进度弹窗
│   ├── pages/
│   │   └── ImageDetail.tsx     # 图片详情页
│   ├── stores/
│   │   └── gallery.ts          # Zustand 全局状态
│   ├── hooks/                  # 自定义 React Hooks
│   ├── utils/                  # 前端工具函数
│   ├── App.tsx                 # 根组件
│   └── main.tsx                # 入口
│
├── src-tauri/                  # Tauri 后端 (Rust)
│   ├── src/
│   │   ├── main.rs             # 应用入口与初始化
│   │   ├── core/               # 核心业务逻辑
│   │   │   ├── importer.rs     # 图片导入器（扫描、哈希、入库）
│   │   │   ├── startup_scanner.rs  # 启动时后台扫描
│   │   │   ├── file_monitor.rs # 文件系统监控引擎
│   │   │   ├── thumbnail.rs    # 缩略图生成服务
│   │   │   ├── search.rs       # Tantivy 索引核心
│   │   │   └── search_service.rs   # 搜索服务封装
│   │   ├── db/                 # 数据库访问层
│   │   │   ├── mod.rs          # 连接池初始化
│   │   │   ├── image_repository.rs
│   │   │   ├── tag_repository.rs
│   │   │   ├── location_repository.rs
│   │   │   └── thumbnail_repository.rs
│   │   ├── models/             # 数据模型 (Struct)
│   │   ├── handlers/           # Tauri IPC Commands
│   │   └── vips.rs             # libvips 绑定初始化
│   ├── migrations/             # SQLx 数据库迁移文件
│   ├── icons/                  # 应用图标
│   └── Cargo.toml
│
├── docs/                       # 设计文档
│   ├── design.md               # 技术选型方案
│   └── modules.md              # 功能模块拆分
├── public/                     # 静态资源
└── AGENTS.md                   # 项目编码规范
```

---

## 数据库设计

```
images          - 图片元数据（路径、哈希、尺寸、格式等）
tags            - 标签定义（名称、父标签、颜色）
image_tags      - 图片-标签关联（基于图片 hash，非 id）
locations       - 监控目录（路径、递归开关、图片计数）
thumbnails      - 缩略图缓存记录（hash、尺寸类型、路径）
settings        - 应用设置（KV 存储）
```

完整迁移文件见 `src-tauri/migrations/`。

---

## 启动扫描机制

应用在启动时会执行**后台全量对比扫描**，用于补全应用关闭期间发生的文件变更：

1. **延迟 3 秒启动** —— 确保前端先完成初始渲染
2. 遍历所有活跃的 Location
3. 对每个 Location：
   - `walkdir` 扫描磁盘实际文件列表
   - 查询数据库中该 Location 下的所有记录
   - **差集运算**：
     - 磁盘有、DB 无 → 批量导入新增图片
     - DB 有、磁盘无 → 从数据库和搜索索引中移除
4. 完成后通过 Tauri Event 通知前端自动刷新

该任务在 `tokio::spawn` 中执行，**不阻塞**应用启动和正常使用。

---

## 编码规范

详见 [`AGENTS.md`](./AGENTS.md)，核心规范摘要：

- **禁止**使用原生 HTML `title` 属性，统一使用 Fluent UI `Tooltip`
- 工具栏图标统一 `fontSize={24}`，配合 `Button size="medium"`
- 标签展示使用统一的 `TagBadge` 组件（深灰底白字）
- 侧边栏展开/收起使用 `transition-[width] duration-300 ease-in-out`

---

## 开发路线图

| 阶段 | 功能 | 状态 |
|------|------|------|
| 基础架构 | Tauri + React + 数据库初始化 | ✅ |
| 数据层 | 图片/标签/位置 CRUD | ✅ |
| 文件监控 | notify 实时同步 | ✅ |
| 启动扫描 | 后台全量对比扫描 | ✅ |
| 缩略图 | libvips 生成 + 懒加载 | ✅ |
| 标签系统 | 树形层级 + 批量打标签 | ✅ |
| 搜索 | Tantivy 全文搜索 + 标签过滤 | ✅ |
| 画廊 | 虚拟滚动 + 瀑布流 + 多选 | ✅ |
| 高级功能 | 相似图片、导入导出、设置面板 | 🚧 |

---

## License

MIT
