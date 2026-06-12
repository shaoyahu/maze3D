# P2-7: 自定义对话框系统（替换原生 window.confirm）— 设计文档 (Spec)

**Slug**: `p2-7-custom-dialog`
**状态**: approved (待实施)
**日期**: 2026-06-12
**对应路线图项**: P2-7
**依赖**: 无（独立 UI 改进）
**复杂度**: Small
**相关文件**: `src/ui/components/Dialog.tsx` (新建), `src/ui/useConfirm.ts` (新建), `src/App.tsx`, `src/ui/LevelSelect.tsx`, `src/ui/editor/EditorPage.tsx`, `src/ui/editor/EditorToolbar.tsx`, `tests/component/dialog.test.tsx` (新建), 3 个既有组件测试文件, `tests/e2e/editor.spec.ts`

> 详细 step-by-step + 行号见 `plan.md`。本文档聚焦 **what** 与 **why**。

---

## 1. 概述

当前项目在 5 个调用点使用浏览器原生的 `window.confirm()` 弹窗（LevelSelect 删除自定义关卡、EditorPage 草稿恢复、EditorPage 脏数据退出、EditorToolbar 新建关卡、EditorToolbar 导入关卡）。原生弹窗：

- **视觉风格与项目主题脱节**：跟随操作系统/浏览器，浅色 / 深色主题切换对它无效
- **阻塞事件循环**：在 `useEffect` 之类的位置没法 await，EditorPage 已有注释抱怨
- **样式不可定制**：按钮文案 / 颜色 / 危险提示全固定
- **无法表达 N 选项**：spec 里 P0 注释 (`EditorPage.tsx:10-16`) 早就想用"保存 / 不保存 / 取消"三选项，原生 confirm 是二元的，被迫降级

本次构建一个轻量的、与项目主题对齐的对话框系统，把 5 个调用点全部迁过去。**不动引擎层 / store / 数据契约**。

## 2. 目标 / 非目标

### 2.1 目标

- 提供一个 `Dialog` 原语组件（基于 React Portal），支持标题 / 内容 / N 个动作按钮 / Esc 关闭 / 背景点击关闭 / `role="dialog"` / 焦点陷阱
- 提供 `useConfirm()` 钩子，签名 `await confirm(options) => value | null`，在 App 根挂一次 Provider，所有调用点零样板
- 替换全部 5 个 `window.confirm()` 调用点
- 还原脏数据退出提示的 spec 原始三选项意图（`保存并退出` / `放弃修改` / `继续编辑`）
- 主题：浅色 + 深色模式均与现有 `--panel` / `--border` / `--accent` / `--danger` 变量对齐
- 测试：所有原 `vi.spyOn(window,'confirm')` 与 Playwright `page.on('dialog', ...)` 路径迁移到 DOM 查询；新增 `Dialog` + `useConfirm` 单测

### 2.2 非目标

- 不引入第三方 UI 库（无 headlessui / radix-ui / chakra）
- 不做完整 WAI-ARIA roving tabindex；只做"打开时聚焦第一个按钮 + Esc 关闭 + 最小焦点循环"
- 不做输入型 prompt（本次不需要）
- 不做 toast / snackbar（如果未来需要是 P2-8 候选）
- 不动编辑器草稿 / autosave 行为本身

## 3. 设计决策

### 3.1 API 风格：imperative hook + portal

对比 3 种方案后选 imperative hook + 单点 Provider：

| 方案 | 优点 | 缺点 | 选定 |
|---|---|---|---|
| **A. `useConfirm()` + `<ConfirmProvider>`** | 5 个调用点零样板；对话框 DOM 单点；portal 跳出父级 z-index | 多一个 Provider；并发调用要排队 | ✅ |
| B. 每个调用点自己 `useState` + inline `<Dialog>` | 概念局部 | 5 处重复 open/close 状态机；难集中改样式 | |
| C. 同步 `window.confirm` polyfill | 改动最小 | 仍是阻塞调用；无法做 N 选项 | |

### 3.2 挂载：React Portal 到 `document.body`

- 避免编辑器/暂停页 `position:absolute` 父容器造成的 stacking context 问题
- 与现有 `PauseOverlay` / `GameOverOverlay` 的 `position:absolute; inset:0` 模式**不一样**（这些是 inline overlay，dialog 是 modal）

### 3.3 草稿恢复的 StrictMode 兼容

保持现有 `draftPromptedRef` 守卫；本次把 `useEffect` 改成"只 setState，由 render 触发 `useConfirm()`"，**避免 async-in-useEffect** 的 footgun。

### 3.4 脏数据退出的 3 选项升级

还原 `EditorPage.tsx:10-16` 注释里说的 spec 原始三选项意图：

| 按钮 | 变体 | 返回值 | 副作用 |
|---|---|---|---|
| 保存并退出 | primary | `'save'` | 调 `saveLevel()`，成功后才 `onExit()`；失败 → 留在编辑器并显示错误状态 |
| 放弃修改 | danger | `'discard'` | 清草稿 → `onExit()` |
| 继续编辑 | secondary | `'cancel'` | 留在编辑器 |

## 4. 文件清单

| 文件 | 操作 |
|---|---|
| `src/ui/components/Dialog.tsx` | CREATE |
| `src/ui/useConfirm.ts` | CREATE |
| `src/App.tsx` | UPDATE（挂 Provider） |
| `src/ui/LevelSelect.tsx` | UPDATE（line 569） |
| `src/ui/editor/EditorToolbar.tsx` | UPDATE（line 125, 166） |
| `src/ui/editor/EditorPage.tsx` | UPDATE（line 61, 117；常量重命名/复用） |
| `tests/component/dialog.test.tsx` | CREATE |
| `tests/component/editor/EditorPage.test.tsx` | UPDATE |
| `tests/component/editor/EditorToolbar.test.tsx` | UPDATE |
| `tests/component/levelSelect.custom.test.tsx` | UPDATE |
| `tests/e2e/editor.spec.ts` | UPDATE |

## 5. 用户澄清记录

通过 `/ecc:plan` + `AskUserQuestion` 已确认：
1. **3 选项脏数据退出**：还原 spec 原始意图（`保存并退出` / `放弃修改` / `继续编辑`）
2. **挂载时草稿恢复**：用 state-driven render，**不**用 async-in-useEffect

## 6. 风险

| 风险 | 可能性 | 缓解 |
|---|---|---|
| `useEffect` 改成 state-driven 破坏 StrictMode 双触发契约 | 中 | 保留 `draftPromptedRef`；新增单测覆盖"只触发一次" |
| 3 选项脏数据退出改变编辑器用户可见行为 | 中 | 已是锁定决策；5 个 case 单测钉住每个按钮分支 |
| 焦点陷阱实现复杂、文件膨胀 | 低 | Phase 1 保持最小：开时聚焦第一个按钮；Tab 在显式列表循环 |
| E2E `delete a custom level` 测试因 Playwright 自动处理原生对话框失败 | 低 | 原测试已显式用 `page.once('dialog', ...)`，替换为按钮点击 |
| `useConfirm` 在并发场景下错乱 | 低 | Provider 维护单个 current request + 队列；测试覆盖 |

## 7. 验收

- [ ] `src/ui/components/Dialog.tsx` + `src/ui/useConfirm.ts` 存在
- [ ] Dialog + useConfirm 单测覆盖率 ≥ 90%
- [ ] `grep -rn "window\.\(confirm\|alert\|prompt\)" src/` 返回 0 条
- [ ] 5 个调用点全部迁移；行为与 spec §3 决策一致
- [ ] 3 个组件测试文件 + 1 个 e2e spec 全部迁移为 DOM 查询
- [ ] 脏数据退出 3 选项的行为被单测钉住
- [ ] 草稿恢复"只触发一次"被单测钉住
- [ ] `pnpm typecheck` + `pnpm test` + `pnpm test:e2e` 全绿
- [ ] 浅色 / 深色主题下视觉一致
- [ ] `docs/increments/_template/roadmap.md` 的 P2-7 行存在且状态从 `pending` 改为 `done`（实施完成后）
