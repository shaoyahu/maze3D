# P2-7 Custom Dialog System — 实施前分析

**状态**: 进行中
**关联文档**: [spec.md](./spec.md) · [plan.md](./plan.md)
**覆盖范围**: 实施期代码现状盘点 + Task 7/8 剩余工作 + 风险与建议

---

## 1. 读取范围

本报告基于对以下 5 个文件的逐行分析：

| 文件 | 角色 | 行数 |
|---|---|---|
| `src/ui/editor/EditorPage.tsx` | 编辑器页面：草稿恢复 + 自动保存 + 快捷键 + 退出确认 | 182 |
| `src/ui/editor/EditorToolbar.tsx` | 工具栏：7 工具 + undo/redo + 新建/保存/导入/导出 + 状态文本 | 353 |
| `tests/component/editor/EditorToolbar.test.tsx` | 工具栏组件测试 | 404 |
| `tests/component/levelSelect.uiRevamp.test.tsx` | P2-6 cascading 测试 | 239 |
| `tests/component/menus.test.tsx` | 菜单组件测试 | 262 |

> 另: `src/ui/useConfirm.ts` 与 `tests/component/dialog.test.tsx` 的内容在更早的 session 中读过，本报告不再展开，仅在引用模式时提及。

---

## 2. 文件行为速览

### 2.1 `src/ui/editor/EditorPage.tsx`

**生命周期层挂的事**:

- **草稿恢复（mount）**: state-driven 两段 effect
  - 第一段: `draftPromptedRef` 锁 + `localStorage.getItem('maze3d.editorDraft.v1')` 探测，把 `showDraftPrompt` 翻为 `true`。
  - 第二段: 在 `showDraftPrompt === true` 时用 `await confirm({...})` 弹「恢复草稿」/「放弃」二选项。
  - 用 `cancelled` 闭包变量在 effect cleanup 时丢弃迟到的 resolve，避免 StrictMode 双调用的脏写。
- **autosave**: 对 `level` 引用变化做 2s debounce (`AUTOSAVE_DELAY_MS = 2000`)，触发 `saveDraft()`。
- **键盘快捷键**: document 级 `keydown` 监听 `Cmd/Ctrl+Z`、`Cmd/Ctrl+Shift+Z`、`Ctrl/Y`；通过 `isUndoRedoTarget` 跳过 `INPUT` / `TEXTAREA` / `SELECT` / `contentEditable`。
- **退出（handleExit）**: 已迁移为 3 选项 `await confirm({...})`
  - `保存并退出` (value=save): 调 `saveLevel()`，失败则 `return` 留在编辑器。
  - `放弃修改` (value=discard): 落到清理 draft + `onExit`。
  - `继续编辑` (value=cancel): `return`，留在编辑器。
  - `null` (Esc / backdrop / 卸载): 视作 cancel，留在编辑器。

**对外常量**:

- `DIRTY_EXIT_TITLE = '未保存的修改'`
- `DIRTY_EXIT_MESSAGE = '当前关卡有未保存的修改，请选择操作（继续编辑 = 留在此页）。'`

> 设计意图: 测试可以 pin 文案，防止后续 drift。注释中明确说明这是「3-option dirty-exit dialog」替换了「2-option window.confirm collapse」。

**可观察的设计选择**:

1. `dirty` 状态在 `handleExit` 中通过 `useEditorStore.getState().dirty` 现场读，**不订阅**——这意味着调用瞬间的快照，不会因 effect 渲染之间的翻转而走错分支。
2. 3 选项 confirm 在当前 UI 中是「理论不可达」——`保存并退出` 按钮路径会先自己 `saveLevel()`，dirty=false 才走 handleExit 的 3 选项分支。这是 plan 已记录的死角，不影响功能。
3. handleExit 清理 draft 的逻辑被 `if (typeof localStorage !== 'undefined')` 包裹，防御 SSR / 测试环境的 globalThis 缺失。

### 2.2 `src/ui/editor/EditorToolbar.tsx`

**职责**: 7 个工具按钮 (select/wall/start/exit/pickup/enemy/pan) + undo/redo + 关卡名输入 + 新建/保存/保存并退出/导出/导入 + 状态文本。

**P2-7 相关**:

- `handleNew` 与 `handleImportChange` 在 `dirty === true` 时调 `useConfirm()` 弹「未保存的修改」二选项 confirm。
- `handleSave` / `handleSaveAndExit` 把 `saveLevel()` 返回的 `result.error` 直接拼进 status 文案 (`'保存失败：${result.error}'`)——F-2026-06-12-S1 的修复点。
- `lastError` 来自 store (F-2026-06-12-H1: silent-reject 反馈) 有 3s 自动清除 timer (`LAST_ERROR_DISPLAY_MS = 3000`)。
- `useAutoSave` 钩子带 `onAutoSaved` / `onAutoSaveError` 回调，在 status 区域展示 `'已自动保存 HH:MM:SS'` 或 `'自动保存失败：…'`。
- F-2026-06-12-B1: dirty 上升沿清掉旧的「已保存」本地 status，防止「已保存 + ● 未保存」同时出现。

**可观察的设计选择**:

1. `formatHHMMSS` 用 `Date#getHours/Minutes/Seconds` 本地时区显示，注释里写明「单时区」是 OK 的，但没显式声明 `Intl.DateTimeFormat`，对跨时区协作不友好。
2. 状态类型 `Status = { kind: 'idle' } | { kind: 'ok'; message } | { kind: 'error'; message }` 在渲染时和 `lastError` 合成 `display`，用 IIFE 包裹，逻辑稍绕但可读性尚可。
3. `onSaveAndExit?.() ?? onExit?.()` 这个 fallback 表达式略反直觉——`onSaveAndExit` 为 `undefined` 时会执行 `onExit?.()`，这与 P2-7 plan 中「toolbar 自带 save 后再 onSaveAndExit」的预期对齐，但读起来需要一行注释。

### 2.3 `tests/component/editor/EditorToolbar.test.tsx`

**规模**: 27 个 case。

**P2-7 已迁移的部分**: 所有原本 spy `window.confirm` 的 case 都改成了 `screen.getByTestId('confirm-action-ok')` / `confirm-action-cancel` 按钮点击 + `act(async)`。

**值得抄的 Pattern**:

- `renderEditor` helper 把 `<EditorToolbar />` 包在 `<ConfirmProvider>` 里。
- autosave 用 `vi.useFakeTimers()` + `vi.advanceTimersByTime(30_000)`。
- 直接 `useEditorStore.setState({...})` 灌 store，省掉 UI 触发链。
- 日期断言用 `vi.setSystemTime(...)` 注入固定时间，避免 `Date.now()` flaky。

**残留 spy**: `New button calls newLevel(15, 15) without confirm when not dirty` (line 124) 仍然 spy `window.confirm`，测的是「不调原生 confirm」的负向断言——可以保留也可以删，是有意识的小冗余。

### 2.4 `tests/component/levelSelect.uiRevamp.test.tsx`

**规模**: 12 个 case。

**覆盖**: 4 选 1 主 dropdown、teaching / random / custom / seed 4 个 source 的子控件、mode=survive 的 4 个 survive 控制 (input + 4 chip)、input 越界 clamp + `aria-invalid`、progressive 取消隐藏 max-input、start-button 在 invalid 状态下 disabled。

**P2-7 的关键约束**: P2-6 之后保留的 P2-5 legacy testid 容器仍在使用，P2-7 不能破坏:

- `level-select-root`
- `procedural-controls`
- `mode-select`
- `enemy-count-select`
- `size-select`
- `progressive-spawn`
- `custom-levels-group`
- `specified-seed-section`

**值得抄的 Pattern**: `start-button` 在 teaching+empty 或 seed+invalid hex 时 `disabled`，click 不 reject——case 11/12 用 `expect(btn).toBeDisabled(); fireEvent.click(btn); expect(onPick).not.toHaveBeenCalled();` 的负向断言。

### 2.5 `tests/component/menus.test.tsx`

**规模**: 4 个 describe 块，26+ 个 case。

**P2-7 触发点**: `LevelSelect` 已迁移到 `<ConfirmProvider>` 包裹 (lines 44, 71, 81, 96, 107, 118, 131, 148, 169, 188, 205, 216, 229, 239)，但内部 case 都没显式触发 confirm 弹窗 (教学关卡和 seed 路径都不走 confirm)。

**值得抄的 Pattern**: `it.skip(...)` 保留过时 case 的写法 (line 59)，注释里写明「P2-6 后文本已删除，等 P2-7 加新的空状态消息」——这种「等下一个 increment 接续」的做法能避免丢掉历史决策上下文。

---

## 3. P2-7 任务状态地图

按 [plan.md](./plan.md):

| Task | 内容 | 状态 |
|---|---|---|
| 0 | Provider 类型定义 | DONE |
| 1 | Dialog 组件 TDD | DONE |
| 2 | useConfirm 实现 | DONE |
| 3 | App.tsx 挂 ConfirmProvider | DONE |
| 4 | LevelSelect 迁移 | DONE |
| 5 | EditorToolbar 迁移 | DONE |
| 6 | `tests/e2e/editor.spec.ts` 替换 `page.once('dialog')` | **未确认** |
| **7** | **EditorPage 迁移** | **进行中** |
| 8 | 全量回归 + 文档 | 待办 |

**Task 7 内部细分**:

- [x] `handleExit` 迁移到 3 选项 confirm
- [x] 草稿恢复迁移到 state-driven render
- [x] `DIRTY_EXIT_PROMPT` 重命名为 `DIRTY_EXIT_TITLE` + `DIRTY_EXIT_MESSAGE`
- [ ] `tests/component/editor/EditorPage.test.tsx` 同步迁移

---

## 4. Task 7 剩余工作清单

### 4.1 需要替换的旧版模式

`tests/component/editor/EditorPage.test.tsx` 当前依赖:

| 旧模式 | 替换为 |
|---|---|
| `import { EditorPage, DIRTY_EXIT_PROMPT } from '...'` | `import { EditorPage, DIRTY_EXIT_TITLE, DIRTY_EXIT_MESSAGE } from '...'` |
| `vi.spyOn(window, 'confirm').mockReturnValue(true \| false)` | 删除，改用 confirm-dialog 按钮点击 |
| `render(<EditorPage onExit={...} />)` | `<ConfirmProvider><EditorPage .../></ConfirmProvider>` |
| 全局 `vi.useFakeTimers()` | 局部 `vi.useFakeTimers()` 仅用于 autosave debounce test |

### 4.2 新测试文件需要覆盖的 case

| # | 场景 | 关键断言 |
|---|---|---|
| 1 | 渲染容器 | `data-testid="editor-page"` 存在 |
| 2 | 无草稿时不弹 confirm-dialog | mount 后 `queryByTestId('confirm-dialog')` 为 null |
| 3 | 有草稿时弹「恢复草稿」 | mount 后 `findByTestId('confirm-dialog')` + title=「恢复草稿」 |
| 4 | 点「恢复」→ `loadDraft()` + 关闭 dialog | 调用 store 的 `loadDraft` 后 level 引用变了，dialog 消失 |
| 5 | 点「放弃」→ 清 localStorage | `localStorage.getItem('maze3d.editorDraft.v1') === null` |
| 6 | StrictMode 双 effect 守卫 | dev 模式下只弹 1 次 dialog (用 `draftPromptedRef` 锁) |
| 7 | Cmd+Z 触发 undo | level 引用回滚 |
| 8 | Cmd+Shift+Z 触发 redo | level 引用前进 |
| 9 | Ctrl+Y 触发 redo | 同上 |
| 10 | 在 input 焦点时按 Cmd+Z 不触发 | undo 调用次数 = 0 |
| 11 | autosave 2s debounce | 调 `placeWall(1, 0)` 后等 fake timer ≥ 2000ms，store 草稿被写入 |
| 12 | save-and-exit (dirty=true) 绕过 dirty-exit dialog | `onExit` 被调一次，没有 confirm-dialog 出现 |
| 13 | PIN 常量文案 | `DIRTY_EXIT_TITLE` / `DIRTY_EXIT_MESSAGE` 字符串与 plan 一致 |

### 4.3 易错点提示

- **草稿恢复测试需要真实定时器 + `waitFor`** (`findByTestId` 内部 polling)。fake timers 会让 `await` 永远等不到。
- **autosave debounce 测试用局部 `vi.useFakeTimers()` + `vi.advanceTimersByTime(2000)`**，不要全局污染，否则 dialog `await` 走不动。
- **StrictMode 守卫测试**在 happy-dom 默认不开 React StrictMode，需要显式 `<React.StrictMode>` 包裹。
- **`onSaveAndExit` 与 `onExit` 的 mock**: 用 `vi.fn()`，避免在 `<EditorPage>` 内部无限递归 (Toolbar 的「保存并退出」按钮 → onSaveAndExit → onExit；如果直接传 onExit，Toolbar 走 fallback 路径，仍然 OK)。

---

## 5. Task 8 交付物清单

按 [plan.md](./plan.md) 末尾的 Validation 段:

```bash
pnpm typecheck                                # 必跑
pnpm test                                     # 必跑
pnpm test:e2e                                 # 必跑 (先看 Task 6 是否已完成)
grep -rn "window\.\(confirm\|alert\|prompt\)" src/   # 必须 0 命中
```

### 5.1 文档交付

**`docs/increments/p2-7-custom-dialog/review.md`**:

- 实现日志 (每个 task 实际改的文件 + commit hash)
- 偏差说明 (plan 与实际实现的差异，例如 3 选项 dirty-exit 在 UI 不可达)
- 测试覆盖率 (dialog.test.tsx + EditorToolbar.test.tsx + EditorPage.test.tsx 的 case 数)
- E2E 复测结果

**`docs/roadmap.md`**:

- 把 P2-7 标记为 done (如果 roadmap 里有进度表)

### 5.2 Task 6 状态待核实

历史 session 摘要里没看到 Task 6 (`tests/e2e/editor.spec.ts` 替换 `page.once('dialog')`) 的完成记录。跑 Task 8 之前先 grep 确认:

```bash
grep -n "page.once('dialog'" tests/e2e/editor.spec.ts
```

---

## 6. 风险与开放问题

| # | 风险 / 问题 | 严重度 | 建议 |
|---|---|---|---|
| 1 | 3 选项 dirty-exit 在 UI 不可达 | 低 | 在 plan 中已记录，在 review.md 里也写明，留待 P2-7 之后的 increment 处理 |
| 2 | `formatHHMMSS` 跨时区不友好 | 低 | 可在后续 polish，不影响 P2-7 验收 |
| 3 | `EditorToolbar.tsx:158` 的 `onSaveAndExit?.() ?? onExit?.()` 反直觉 | 低 | 加一行注释即可，不动逻辑 |
| 4 | `EditorToolbar.test.tsx:124` 残留 `vi.spyOn(window, 'confirm')` | 低 | 有意识的负向断言，保留或删除都可以，建议在 review.md 里拍板 |
| 5 | Task 6 (E2E 替换) 状态未确认 | 中 | Task 8 之前先 grep 确认 |
| 6 | happy-dom + React StrictMode 组合未在现有测试中出现 | 中 | EditorPage 的 case 6 可能是首次显式启用 StrictMode，需要验证 happy-dom 不会因此挂掉 |

---

## 7. 下一步建议

1. **解除约束后**: 一次性把 `EditorPage.test.tsx` 改完并跑 Task 8 全套校验。
2. **等待期间可做**:
   - 起草 `review.md` 骨架 (按第 5.1 节结构)
   - 起草 `roadmap.md` 里 P2-7 行的更新文案
   - 验证 Task 6 状态 (第 5.2 节 grep)
   - 跑 `pnpm typecheck` / `pnpm test tests/component/dialog.test.tsx` 这类只读校验
3. **如需推进**: 告诉我具体哪一项。
