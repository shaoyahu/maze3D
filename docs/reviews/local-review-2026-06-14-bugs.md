# Local Review — 2026-06-14 (focus: 潜在 bug)

**Mode:** Local Review (uncommitted changes vs HEAD)
**Branch:** main
**Scope:** 编辑器重构（顶部栏 / 左侧抽屉 / 视口 / 属性面板 / 状态栏 / store）
**Decision:** REQUEST CHANGES — 1 HIGH, 2 MEDIUM, 2 LOW

---

## Summary

变更主要将旧 `EditorToolbar.tsx` 拆分为 `EditorTopBar` + `EditorLeftDrawer`，
并对编辑器视觉/交互做了较大重构（新字体、芯片化状态栏、视口 hover/缩放/平移、
敌人路径"点击新增节点"交互）。`editorStore` 增加 `appendEnemyPathNode` 与
auto-carve 行为。

类型检查通过，146 个 editor 单测全部通过。但有一处 **HIGH** 实质性逻辑
问题（敌人路径节点数据在 `editorStore` 中不再走 `commitLevel`/dirty 路径
的兼容路径，但 enemy 在 wall 上的判定有缺陷）—详见 H1。

---

## Findings

### CRITICAL
None.

### HIGH

#### H1. `appendEnemyPathNode` 与 `placeEnemy` 在边界条件下产生重复路径节点

- **File:** `src/store/editorStore.ts:594-617`、`src/store/editorStore.ts:554-589`
- **Category:** Correctness
- **Detail:**
  - `placeEnemy`（line 558）使用 `clamp(x + 1, 0, width - 1)` 生成 secondX；
    当用户在最右一列（`x === width - 1`）放置敌人时，`secondX === x`，
    于是 `path = [(x,z), (x,z)]`——两个节点相同。`validateMaze` 不会因此
    报错（仅校验 inBounds + 非 wall），但 polyline 渲染为 0 长度且
    箭头标记 (`marker-end`) 朝向不确定。
  - `appendEnemyPathNode` 接受任何 inBounds 坐标，**包括最后一节点的相同坐标**。
    用户连续点击同一格子，path 会出现连续相同节点，导致敌人 AI（巡逻状态机）
    与 SVG marker 渲染在零长度段上行为未定义。
- **Fix:**
  - `appendEnemyPathNode` 中跳过 last node 与新 node 相同的 append：
    ```ts
    const target = level.enemies.find((e) => e.id === enemyId);
    if (!target) return;
    const last = target.path[target.path.length - 1];
    if (last && last.x === nx && last.z === nz) return;
    ```
  - `placeEnemy` 中处理 `secondX === x` 的边界：用 `Math.max(0, x - 1)`
    fallback，保证两节点必定不同。

### MEDIUM

#### M1. `EditorTopBar.handleSaveAndExit` — `?? onExit?.()` 让两个回调可能都被调用

- **File:** `src/ui/editor/EditorTopBar.tsx:115`
- **Category:** Correctness
- **Detail:**
  ```ts
  onSaveAndExit?.() ?? onExit?.();
  ```
  `onSaveAndExit?.()` 调用后返回值是 `undefined`（所有 props 都是 `void` 函数）。
  `undefined ?? x` 触发 `x`，导致**当父组件同时传入 `onSaveAndExit` 与 `onExit`
  时，两个回调都会被调用**。在 `EditorPage` 中两个回调都指向同一个 `handleExit`
  （line 151），目前是幂等的（第二次执行时 `dirty=false`，走清 draft 分支），
  但如果将来 `handleExit` 加入埋点 / toast，会被打两次。
- **Fix:**
  ```ts
  if (onSaveAndExit) onSaveAndExit();
  else onExit?.();
  ```

#### M2. `EditorPage.handleExit` 中删除了关键解释性注释，使隐式 fall-through 难以维护

- **File:** `src/ui/editor/EditorPage.tsx:130-148`
- **Category:** Maintainability
- **Detail:** 旧版（HEAD）有显式注释 "discard path falls through to clear-draft + onExit"；
  新版删除了所有内联注释，现在 `if (choice === 'cancel' || choice === null) return;`
  与 `if (choice === 'save') { ... }` 之后**自然 fall-through 到清 draft + onExit**
  这一隐式 discard 路径，对维护者不友好。删除大量解释性注释是本次 diff 的
  一大风险点（`P2-7: 3-option dirty-exit dialog...` 这条注释承担着把
  3 选项 vs window.confirm 2 选项历史交付物粘起来的作用）。
- **Fix:** 保留至少一行 fall-through 标注：`// 'discard' falls through: clear draft + exit`。

### LOW

#### L1. `index.html` 引入 Google Fonts 但没有降级链路

- **File:** `index.html:7-12`
- **Category:** Performance / Privacy
- **Detail:**
  - 离线 / 国内网络访问 fonts.googleapis.com 会非常慢，导致 FOIT；
    `display=swap` 已在 link 上加（OK）但缺少本地兜底。
  - 单纯接入 Google Fonts 不是漏洞，但请确认是否符合项目隐私 / 离线策略。
- **Fix:** 考虑使用 `@fontsource/sora` 等本地包，或在 CSS 中提供
  系统字体堆栈作为 fallback（已部分提供）。可作为下次单独评估。

#### L2. `EditorViewport.tsx:184` — `Number.isNaN` 检查不足以应对空字符串数据集

- **File:** `src/ui/editor/EditorViewport.tsx:179-191`
- **Category:** Correctness (defensive)
- **Detail:** `Number('')` 为 `0`，不是 NaN——如果某天有人在外部包装 `<div data-x="">`
  （hover 落到非格子 div 时），代码会把 hover 标记到 `(0,0)`。当前 grid 结构
  保证只有真正的 cell 拥有 `data-x`，但断言 `target.dataset.x !== undefined`
  并不能拦截空串。
- **Fix:** `if (target.dataset.x && target.dataset.z)` —— 空串 falsy。

---

## Validation Results

| Check | Result |
|---|---|
| Type check (`tsc --noEmit`) | **Pass** |
| Lint | Skipped (未配置 `npm run lint`) |
| Tests (`vitest run tests/unit/store/editorStore tests/component/editor`) | **Pass (146/146)** |
| Build | Skipped |

---

## Files Reviewed

| Type | File |
|---|---|
| Modified | `index.html` |
| Modified | `src/store/editorStore.ts` |
| Modified | `src/styles/theme.css` |
| Modified | `src/ui/editor/EditorPage.tsx` |
| Modified | `src/ui/editor/EditorPropertiesPanel.tsx` |
| Modified | `src/ui/editor/EditorStatusBar.tsx` |
| Modified | `src/ui/editor/EditorViewport.tsx` |
| Deleted  | `src/ui/editor/EditorToolbar.tsx` |
| Added    | `src/ui/editor/EditorTopBar.tsx` |
| Added    | `src/ui/editor/EditorLeftDrawer.tsx` |
| Modified | `tests/component/editor/EditorStatusBar.test.tsx` |
| Modified | `tests/component/editor/EditorViewport.test.tsx` |
| Modified | `tests/component/editor/a11y.test.tsx` |
| Modified | `tests/unit/store/editorStore.test.ts` |
| Deleted  | `tests/component/editor/EditorToolbar.test.tsx` |
| Added    | `tests/component/editor/EditorLeftDrawer.test.tsx` |

