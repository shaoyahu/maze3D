# P2-17: 编辑器教程手册 — 任务清单

**增量 ID**: P2-17
**日期**: 2026-06-30

## 任务清单

### Task 1: i18n 资源 ✅

- [x] `src/i18n/resources/zh.ts` 和 `en.ts` 新增 `editor.manual.*` 命名空间
- [x] 6 章标题 + 6 章简介 + 22 节标题 + 22 节 body + 4 导航 key = ~56 key
- [x] body 内容使用 `\n` 分段
- [x] keyParity 测试通过

### Task 2: CSS 样式 ✅

- [x] `src/styles/theme.css` 新增 `.editor-manual__*` 块
- [x] backdrop (z-1300, fade) + panel (centered, scale animation)
- [x] header + title + close + body + toc + content + nav
- [x] `[data-theme="dark"]` 适配
- [x] `@media (max-width: 640px)` 响应式（TOC → dropdown）

### Task 3: EditorTutorialManual 组件 ✅

- [x] 创建 `src/ui/editor/EditorTutorialManual.tsx`
- [x] Props: `{ open: boolean; onClose: () => void; }`
- [x] CHAPTERS 常量 + activeChapter state
- [x] createPortal + backdrop + panel + TOC + content + nav
- [x] ESC handler (stopPropagation) + backdrop click + close button
- [x] 无障碍: role="dialog", aria-modal, aria-labelledby
- [x] body `\n` split → 多 `<p>` 渲染

### Task 4: 集成 ✅

- [x] `EditorTopBar.tsx`: 新增 `onTutorialManual` prop + 📖 按钮
- [x] `EditorPage.tsx`: 新增 `manualOpen` state + 渲染 `EditorTutorialManual` + 传递 `anyOverlayOpen`
- [x] `EditorViewport.tsx`: 新增 `anyOverlayOpen` prop + 扩展 ESC 守卫

### Task 5: 组件测试 ✅

- [x] 创建 `tests/component/EditorTutorialManual.test.tsx`
- [x] 15 test case: no-render / TOC / chapter-switch / Prev-Next / disabled / ESC / backdrop / close / aria / mobile-dropdown

### Task 6: 回归验证 + 文档同步 ✅

- [x] `npm run typecheck` 通过
- [x] `npm test` 通过 (85 files / 1128 tests pass)
- [x] `npm run build` 通过
- [x] `docs/roadmap.md` P2-17 行已加入
- [x] `README.md` 已更新
- [x] `docs/increments/p2-17-editor-tutorial-manual/` spec.md + plan.md 已创建

## 验证结果

```
npm run typecheck  → 0 errors
npm test           → 85 files, 1128 passed, 1 skipped
npm run build      → ✓ built in 1.28s
```

## 文件改动汇总

| 文件 | 操作 | 行数变化 |
|---|---|---|
| `src/ui/editor/EditorTutorialManual.tsx` | CREATE | +189 |
| `src/ui/editor/EditorTopBar.tsx` | UPDATE | +12 |
| `src/ui/editor/EditorPage.tsx` | UPDATE | +8 |
| `src/ui/editor/EditorViewport.tsx` | UPDATE | +5 |
| `src/i18n/resources/zh.ts` | UPDATE | +280 |
| `src/i18n/resources/en.ts` | UPDATE | +280 |
| `src/styles/theme.css` | UPDATE | +120 |
| `tests/component/EditorTutorialManual.test.tsx` | CREATE | +147 |
