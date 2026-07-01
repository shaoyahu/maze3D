# P2-17: 编辑器教程手册 — 设计文档

**增量 ID**: P2-17
**优先级**: P1
**前置依赖**: P2-4b (编辑器), P2-8 (i18n)
**复杂度**: Small–Medium
**日期**: 2026-06-30

## 背景

关卡编辑器目前只有一个 `EditorHelpDrawer`（`?` 按钮打开的 cheat-sheet），包含 4 个简洁表格/列表（工具总览、快捷键、5 步流程、验收清单）。这对快速查阅够用，但对不熟悉编辑器的用户缺乏系统引导。

## 目标

新增一个**教程手册**组件，以分章节阅读模式详细引导用户学习编辑器各项功能。

## 设计决策

### 1. 独立组件 vs 扩展 EditorHelpDrawer

**选择：新增独立组件**

- EditorHelpDrawer 是快速查阅的 cheat-sheet，内容精简、一屏可见
- 教程手册内容量大（6 章 22 节），需要分章节导航
- 两者定位不同，合并会破坏 cheat-sheet 的简洁性

### 2. 阅读模式

**选择：分章节阅读模式（左侧目录 + 右侧内容 + 上一章/下一章导航）**

- 居中 modal 布局，左侧 200px TOC sidebar + 右侧内容区
- 底部 Prev/Next 按钮线性导航
- 移动端（≤640px）TOC 折叠为 `<select>` dropdown

### 3. 入口

**选择：两处入口并存**

- Viewport `?` 按钮 → EditorHelpDrawer（cheat-sheet，不变）
- TopBar `📖` 按钮 → EditorTutorialManual（教程手册，新增）

### 4. 状态管理

**选择：`manualOpen` 在 EditorPage（非 editorStore）**

- 纯 UI 状态，不影响 dirty / history / save
- EditorPage 拥有状态，通过 props 传递给 EditorTopBar 和 EditorViewport

### 5. ESC 键冲突

**选择：`stopPropagation` + `anyOverlayOpen` 守卫**

- 手册 ESC handler 用 `e.stopPropagation()` 阻止冒泡
- EditorViewport 新增 `anyOverlayOpen` prop，扩展 ESC 守卫条件
- 与现有 `helpOpen` 守卫模式一致

## 章节内容规划

| 章 | 标题 | 节数 | 内容概要 |
|---|---|---|---|
| Ch1 | 入门 | 3 | 创建关卡 / 画布导航 / 保存与退出 |
| Ch2 | 工具详解 | 5 | 选择 / 墙体与通道 / 起点与终点 / 道具 / 敌人与平移 |
| Ch3 | 属性面板 | 3 | 关卡元数据 / 胜利规则 / 道具与敌人属性 |
| Ch4 | 设计技巧 | 4 | 路径设计 / 难度平衡 / 常见错误 / 验收自检 |
| Ch5 | 测试与发布 | 3 | 验证 / 导出与导入 / 分享关卡 |
| Ch6 | 高级功能 | 4 | 敌人巡逻路径 / 存活模式 / 羊皮纸地图 / 文件夹管理 |

## 技术规格

- **组件**: `EditorTutorialManual` — portal-based modal
- **z-index**: 1300（在 EditorHelpDrawer 1200 之上）
- **i18n**: `editor.manual.*` 命名空间，约 56 个 key
- **CSS**: `.editor-manual__*` BEM 命名，全局 theme.css
- **无障碍**: `role="dialog"`, `aria-modal="true"`, `aria-labelledby`
- **关闭方式**: ESC / backdrop click / close button
