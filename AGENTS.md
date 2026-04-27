# Agent Instructions

## 项目背景

React + TypeScript + Vite 桌面应用，使用 Tauri 作为后端框架。UI 库为 @fluentui/react-components + @fluentui/react-icons，Tailwind CSS 用于样式。

## 核心规范

### 禁止使用原生 HTML `title` 属性

**所有元素的提示信息必须使用 Fluent UI 的 `Tooltip` 组件，不得使用 HTML 原生的 `title` 属性。**

- `title` 属性会产生浏览器默认的黄色小提示框，与 Fluent UI 的现代化设计风格严重不符
- 桌面应用应使用统一的 Tooltip 组件保持视觉一致性
- 文本截断场景：使用 `truncate` + 省略号即可，不需要额外的完整文本提示

**正确示例：**
```tsx
import { Tooltip } from "@fluentui/react-components";

<Tooltip content="刷新" relationship="label">
  <Button icon={<ArrowCounterclockwiseRegular />} />
</Tooltip>
```

**错误示例：**
```tsx
// 禁止使用
<Button title="刷新" />
<div title="完整路径">...</div>
```

### 图标大小规范

- 工具栏/按钮内的图标统一使用 `fontSize={24}`
- Button 组件需配合 `size="medium"` 才能正确显示 24px 图标（`size="small"` 会强制缩放到 20px）
- 列表项、标签等装饰性小图标保持 `w-4 h-4`（16px）

### 标签样式规范

- 所有标签展示使用统一的 `TagBadge` 组件
- 风格：深灰底白字（`bg-gray-800/90`），不使用彩色背景
- 尺寸统一，不区分 `sm`/`md`

### 过渡动画

- 侧边栏展开/收起使用 `transition-[width] duration-300 ease-in-out`
- 区块展开/收起使用 `maxHeight` + `opacity` 组合过渡

## 技术栈

- React 18 + TypeScript + Vite
- @fluentui/react-components (UI 组件)
- @fluentui/react-icons (图标)
- Tailwind CSS (样式)
- Tauri (Rust 后端)
- pnpm (包管理)
