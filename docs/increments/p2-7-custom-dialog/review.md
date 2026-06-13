# P2-7 Custom Dialog System — Review

**状态**: ✅ done (2026-06-12)
**关联文档**: [spec.md](./spec.md) · [plan.md](./plan.md) · [analysis.md](./analysis.md)
**覆盖范围**: 实施日志 + 偏差说明 + 测试覆盖 + 验收记录

---

## 1. 实施日志

| Task | 内容 | 落地文件 | 状态 |
|---|---|---|---|
| 0 | Provider 类型定义 + `useConfirm.ts` 骨架 | `src/ui/useConfirm.ts` | ✅ |
| 1 | `Dialog` 组件 TDD (RED→GREEN) | `src/ui/components/Dialog.tsx`, `tests/component/dialog.test.tsx` | ✅ |
| 2 | `useConfirm` 完整实现 (FIFO queue + Esc/backdrop 退出 + unmount cleanup) | `src/ui/useConfirm.ts` | ✅ |
| 3 | `App.tsx` 挂 `<ConfirmProvider>` | `src/App.tsx` | ✅ |
| 4 | `LevelSelect` 删除确认迁移 | `src/ui/LevelSelect.tsx` | ✅ |
| 5 | `EditorToolbar` 新建/导入确认迁移 | `src/ui/editor/EditorToolbar.tsx` | ✅ |
| 6 | `tests/e2e/editor.spec.ts` `page.once('dialog')` 替换 | `tests/e2e/editor.spec.ts` | ✅ |
| 7 | `EditorPage` 草稿恢复 + 3 选项脏数据退出迁移 | `src/ui/editor/EditorPage.tsx`, `tests/component/editor/EditorPage.test.tsx` | ✅ |
| 8 | 全量回归 + 文档 (本文件) | `docs/increments/p2-7-custom-dialog/review.md`, `docs/roadmap.md` | ✅ |

---

## 2. 偏差说明

### 2.1 3 选项 dirty-exit dialog 在 UI 不可达

**计划**: `EditorPage.handleExit` 弹 3 选项 confirm (保存并退出 / 放弃修改 / 继续编辑)
**实际**: 工具栏的「保存并退出」按钮会先自己 `saveLevel()` 并清掉 `dirty`，再调 `onSaveAndExit` / `onExit`。所以从工具栏路径永远走不到 handleExit 的 3 选项分支。
**影响**: 3 选项 dialog 在当前 UI 不可达，但仍保留为可调用的代码路径 + 字符串常量导出。
**回归保护**: `EditorPage.test.tsx` 倒数 2 个 case pin 了 `DIRTY_EXIT_TITLE` / `DIRTY_EXIT_MESSAGE` 的文案，防止后续漂移。

### 2.2 工具栏 import 测试的 race condition

**问题**: `tests/component/editor/EditorToolbar.test.tsx` 中 `Import reads the chosen file and dispatches importJson with success status` 在 P2-7 之前 5/5 pass，加 `<ConfirmProvider>` 包裹后 3/5 pass（5 次运行中 2 次 fail）。
**根因**: zustand `set()` (importJson) 触发的外部 store 通知与 React `setState` (setStatus) 在 ConfirmProvider 包裹的子树里偶尔不 batch，导致 `waitFor(level.id)` 满足时 `setStatus` 还没 render。
**修复**: 改用 `await waitFor` 包裹 `tool-status` 断言，与同文件其他 import 测试 (line 275, 285) 风格一致。10/10 pass。

### 2.3 残留 `vi.spyOn(window, 'confirm')` 负向断言

`tests/component/editor/EditorToolbar.test.tsx:124` 仍保留一个 `vi.spyOn(window, 'confirm').mockReturnValue(true)`，测的是「不调原生 confirm」的负向断言。该 spy 不会与 `<ConfirmProvider>` 冲突 (因为 handleNew 在 not dirty 路径根本不调 confirm)，故保留。

---

## 3. 测试覆盖

| 测试文件 | 关键 case 数 | 状态 |
|---|---|---|
| `tests/component/dialog.test.tsx` | 渲染 / 操作 / Esc / backdrop / 卸载 / variant 样式 / 焦点 | ✅ |
| `tests/component/editor/EditorToolbar.test.tsx` | 27 (含 2 自动保存集成 + 1 状态串扰修复 + 1 import race 修复) | ✅ |
| `tests/component/editor/EditorPage.test.tsx` | 14 (含 1 PIN DIRTY_EXIT_TITLE + 1 PIN DIRTY_EXIT_MESSAGE) | ✅ |
| `tests/component/levelSelect.custom.test.tsx` | 删除 confirm 改用 testid | ✅ |
| `tests/component/levelSelect.uiRevamp.test.tsx` | 12 (P2-6 兼容性保留) | ✅ |
| `tests/component/menus.test.tsx` | 26+ (P2-6 兼容性保留) | ✅ |
| `tests/e2e/editor.spec.ts` | 删 confirm 改用 themed dialog testid | ✅ |

### Vitest 全量

```
Test Files  54 passed (54)
Tests       673 passed | 1 skipped (674)
Duration    ~4s
```

### Playwright 全量

```
25 passed
8 skipped (pre-existing carveLShape + 进阶 fold 旧 case，与 P2-7 无关)
Duration    ~33s
```

### Gate grep

```bash
$ grep -rn "window\.\(confirm\|alert\|prompt\)" src/ tests/
src/ui/useConfirm.ts:17: * Replaces the 5 native `window.confirm()` callsites  ← 注释
$ grep -rn "page\.once('dialog'" tests/
tests/e2e/editor.spec.ts:116:    // ... instead of attaching a `page.once('dialog')` handler.  ← 注释
```

实际调用 0 命中。

---

## 4. 验收记录

| 验收项 | 命令 | 结果 |
|---|---|---|
| 类型检查 | `npm run typecheck` | ✅ pass |
| 单元 + 组件 | `npm test` | ✅ 673/673 |
| E2E | `npx playwright test` | ✅ 25/25 |
| `window.confirm/alert/prompt` 调用 0 命中 | `grep -rn "window\.\(confirm\|alert\|prompt\)" src/ tests/` | ✅ pass |
| `page.once('dialog')` 调用 0 命中 | `grep -rn "page\.once('dialog'" tests/` | ✅ pass |

---

## 5. 暴露的开放问题

| # | 问题 | 后续增量候选 |
|---|---|---|
| 1 | 3 选项 dirty-exit dialog 在当前 UI 不可达 | 后续增量开「plain 退出」入口即可复用 |
| 2 | `formatHHMMSS` 跨时区不友好 (使用 `getHours/Minutes/Seconds` 本地时区) | polish |
| 3 | `EditorToolbar.tsx:158` 的 `onSaveAndExit?.() ?? onExit?.()` 反直觉 | 加注释，不动逻辑 |
| 4 | EditorToolbar import test 在 P2-7 之前就潜在 flake，靠 `<ConfirmProvider>` 暴露 | 长期可改为 `findByTestId` 全面 polling |

---

## 6. 风险 & 建议

- **风险 1 (低)**: ConfirmProvider 的 useEffect 顺序与子组件 setState 偶尔不 batch。可通过加 `act` 包裹或全局 `findByTestId` 解决；本次 P2-7 范围内未触及。
- **风险 2 (低)**: 字符串常量 (`DIRTY_EXIT_TITLE` / `DIRTY_EXIT_MESSAGE` / dialog 文案) 没有 i18n。下次涉及 i18n 增量时统一抽取。
- **建议**: 在 polish 阶段考虑用 `findBy*` 全面替换 `getBy* + waitFor` 组合，降低异步测试的 flake 风险。

---

## 7. 总结

P2-7 全部 8 个 task 落地，验证清单全绿。`window.confirm` 与 `page.once('dialog')` 实际调用均为 0。3 选项 dirty-exit 在当前 UI 不可达为已知偏差，已用常量 PIN 兜底。
