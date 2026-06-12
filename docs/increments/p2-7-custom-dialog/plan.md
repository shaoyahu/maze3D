# P2-7: 自定义对话框系统 — 实施计划 (Plan)

**Spec**: `docs/increments/p2-7-custom-dialog/spec.md`
**复杂度**: Small
**日期**: 2026-06-12

> 把项目里 5 个 `window.confirm()` 调用点换成自定义主题化对话框。Provider + Hook 模式，5 个调用点零样板。
>
> **范围声明**：本次只动 UI 层（`Dialog` 新建 + `useConfirm` 新建 + 3 个 UI 组件 + 1 个 App 根 + 4 个测试文件）。引擎层、store、关卡编辑器数据契约一律不动。
>
> **用户澄清记录**（已通过 AskUserQuestion 确认）：
> 1. 脏数据退出 → **还原 spec 原始 3 选项**（`保存并退出` / `放弃修改` / `继续编辑`）
> 2. 挂载时草稿恢复 → **state-driven render**（不用 async-in-useEffect）
>
> **设计基线**：
> - `<Dialog>` 原语：Portal 挂到 `document.body`；支持 N 个动作按钮；Esc 关闭；`role="dialog"`
> - `useConfirm()` 钩子：返回 `Promise<value | null>`；Provider 维护单个 current request；并发排队
> - 3 选项脏数据退出：见 `EditorPage` 的 `DIRTY_EXIT_TITLE` / `DIRTY_EXIT_MESSAGE` 常量

## 文件改动总览

| 文件 | 操作 | 原因 |
|---|---|---|
| `src/ui/components/Dialog.tsx` | CREATE | Portal-based 对话框原语：背景层 + 卡片 + N 动作 + Esc 关闭 + 焦点陷阱 + `role="dialog"` |
| `src/ui/useConfirm.ts` | CREATE | `useConfirm()` 钩子 + `<ConfirmProvider>`；支持并发排队 |
| `src/App.tsx` | UPDATE | 根节点挂一次 `<ConfirmProvider>` |
| `src/ui/LevelSelect.tsx` | UPDATE | 替换 line 569 的 `window.confirm`（删除自定义关卡） |
| `src/ui/editor/EditorToolbar.tsx` | UPDATE | 替换 line 125（新建）+ line 166（导入）的 `window.confirm` |
| `src/ui/editor/EditorPage.tsx` | UPDATE | 替换 line 61（草稿恢复）+ line 117（脏数据退出）；`DIRTY_EXIT_PROMPT` 重命名为 `DIRTY_EXIT_TITLE` / `DIRTY_EXIT_MESSAGE` 并复用于 3 选项对话框 |
| `tests/component/dialog.test.tsx` | CREATE | `Dialog` + `useConfirm` 单元测试（≥10 case） |
| `tests/component/editor/EditorPage.test.tsx` | UPDATE | 去掉 `vi.spyOn(window,'confirm')`；改为查询对话框 DOM；保留新文案常量的回归断言 |
| `tests/component/editor/EditorToolbar.test.tsx` | UPDATE | 同样迁移 |
| `tests/component/levelSelect.custom.test.tsx` | UPDATE | 同样迁移 |
| `tests/e2e/editor.spec.ts` | UPDATE | `page.once('dialog', ...)` 替换为按钮点击 |

## testid 清单

**新增**：
- `confirm-dialog` — 整个对话框容器（含背景 + 卡片）
- `confirm-title` — 标题 `<h2>`/`<h3>`
- `confirm-message` — 正文 `<p>`
- `confirm-action-{value}` — 每个动作按钮（`value` 取 button 的 `value` prop，如 `save` / `discard` / `cancel` / `ok` / `yes`）

> 命名沿用项目 "语义 + testid 后缀" 风格（参考 `pause-resume` / `pause-quit` / `delete-custom-{id}`）。

**保留**：所有原 testid（`delete-custom-{id}` / `tool-new` / `tool-import` / `editor-toolbar` 等）不变。

## 任务清单

### Task 0: 基础类型 + Provider 容器
- [ ] **Action**: `src/ui/useConfirm.ts` 定义：
  ```ts
  export interface ConfirmAction {
    label: string;
    value: string;          // 'ok' / 'cancel' / 'save' / 'discard' / ...
    variant?: 'primary' | 'secondary' | 'danger';
  }
  export interface ConfirmOptions {
    title: string;
    message: string;
    actions: ConfirmAction[];   // 至少 1 个；首个按钮 = 默认焦点
    danger?: boolean;            // 影响卡片描边颜色
  }
  export function useConfirm(): (opts: ConfirmOptions) => Promise<string | null>;
  export function ConfirmProvider(props: { children: ReactNode }): JSX.Element;
  ```
- [ ] **Mirror**: 沿用 `src/store/levelStore.ts` 的 zustand 风格（不强制 zustand，这里用 useState 即可）
- [ ] **Test**: 由 Task 2 覆盖
- [ ] **Validate**: `npx tsc --noEmit`

### Task 1: `Dialog` 原语 — TDD（RED 优先）
- [ ] **Action**: 先在 `tests/component/dialog.test.tsx` 写 6+ case，确认全部失败（RED）：
  1. `open=false` 时不渲染任何东西
  2. `open=true` 时渲染 title/message/actions；`role="dialog"` 与 `aria-labelledby` 正确
  3. 点击 action 按钮 → 触发 `onAction(value)` 后 `onClose`
  4. Esc 键 → 触发 `onClose`（resolve 为 `null`）
  5. 背景点击 → 触发 `onClose`
  6. 打开时第一个 action 自动 focus；`tabIndex` 循环在 action 列表内
  7. 当 `danger=true` 时卡片边框用 `var(--danger)`
- [ ] **Mirror**: 沿用 `src/ui/PauseOverlay.tsx:66-69` 的 backdrop 颜色 `rgba(0,0,0,0.6)`；沿用 `Button` 组件的 `variant` 用法
- [ ] **Test**: 7 case 全部先 RED
- [ ] **Validate**: `pnpm test tests/component/dialog.test.tsx`

### Task 2: `Dialog` 实现 — GREEN
- [ ] **Action**: 实现 `src/ui/components/Dialog.tsx`：
  - `ReactDOM.createPortal(..., document.body)`
  - 背景层：`position:fixed; inset:0; background:rgba(0,0,0,0.6); display:flex; align-items:center; justify-content:center; z-index:1000`
  - 卡片：`background:var(--panel); border:1px solid var(--danger, var(--border)); border-radius:8px; padding:20px; max-width:480px; min-width:320px; display:flex; flex-direction:column; gap:12px`
  - 复用 `<Button>` 渲染 actions；布局 `display:flex; gap:8px; justify-content:flex-end`
  - 单一 `useEffect` 注册/卸载 keydown 监听；Esc 触发 `onClose`
  - 打开时 `useEffect` 内 `firstButtonRef.current?.focus()`；`onKeyDown` 内手写 Tab 循环
- [ ] **Mirror**: 与 `PauseOverlay` / `GameOverOverlay` 的 inline-style 模式一致；不引外部 CSS-in-JS
- [ ] **Test**: 7 case 全部 GREEN
- [ ] **Validate**: `pnpm test tests/component/dialog.test.tsx` 全绿；Dialog.tsx 行覆盖 ≥ 90%

### Task 3: `useConfirm` 钩子 — TDD
- [ ] **Action**: 扩展 `tests/component/dialog.test.tsx` 加 4 case：
  1. 初始不渲染任何对话框
  2. 调用 `confirm({...})` 后出现对话框，文案与传入一致
  3. 点击 action → Promise 解析为该 action 的 `value`；对话框消失
  4. 多次 `confirm()` 并发调用排队（FIFO），前一个关闭后渲染下一个
  5. Provider 卸载时未完成 Promise 解析为 `null`
- [ ] **Validate**: 全部先 RED

### Task 4: `useConfirm` 实现 — GREEN + Provider 挂载
- [ ] **Action**: 实现 `src/ui/useConfirm.ts`：
  - `useState<ConfirmOptions | null>` 存当前请求
  - `useRef<((v: string | null) => void) | null>` 存当前 resolver
  - `useRef<Array<{opts, resolve}>>` 存等待队列
  - `useConfirm()` 返回的 `confirm()` 包装：入队 → 触发 setState 显示
  - `ConfirmProvider` 渲染 `<Dialog open={!!current} ... />`，动作点击调用 `resolve(value)` 然后 `setCurrent(queue.shift() ?? null)`
  - unmount 时清空队列并全部 resolve `null`
- [ ] **Action**: `src/App.tsx` 把 `ConfirmProvider` 挂到最外层（包裹 `uiScreen` 路由部分）
- [ ] **Test**: 5 case 全 GREEN
- [ ] **Validate**: `pnpm test tests/component/dialog.test.tsx` + `pnpm typecheck`

### Task 5: 迁移 `LevelSelect.tsx`（最低风险）
- [ ] **Action**: 替换 line 569：
  ```ts
  // 旧
  onClick={() => {
    if (window.confirm(`删除关卡「${lv.name}」？`)) deleteCustom(lv.id);
  }}
  // 新
  onClick={async () => {
    const ok = await confirm({
      title: '删除关卡',
      message: `确定删除「${lv.name}」？此操作不可撤销。`,
      actions: [
        { label: '取消', value: 'cancel', variant: 'secondary' },
        { label: '删除', value: 'ok', variant: 'danger' },
      ],
      danger: true,
    });
    if (ok === 'ok') deleteCustom(lv.id);
  }}
  ```
- [ ] **Action**: 更新 `tests/component/levelSelect.custom.test.tsx` case 4 & 5：去掉 `vi.spyOn(window, 'confirm')`；改为 `findByTestId('confirm-dialog')` → 点击 `confirm-action-ok` / `confirm-action-cancel`
- [ ] **Action**: 更新 `tests/e2e/editor.spec.ts` "delete a custom level" 测试：去掉 `page.once('dialog', ...)`；改为 `await page.getByTestId('confirm-dialog').getByTestId('confirm-action-ok').click()`
- [ ] **Validate**: 3 个文件测试全绿

### Task 6: 迁移 `EditorToolbar.tsx`
- [ ] **Action**: `handleNew` / `handleImportChange` 改为 `async`；两条提示共用文案：
  ```ts
  const ok = await confirm({
    title: '未保存的修改',
    message: `当前关卡有未保存的修改，确定${isNew ? '新建' : '导入'}？`,
    actions: [
      { label: '取消', value: 'cancel', variant: 'secondary' },
      { label: '确定', value: 'ok', variant: 'primary' },
    ],
  });
  if (ok !== 'ok') return;
  ```
- [ ] **Action**: 更新 `EditorToolbar.test.tsx` line 122-146 的 3 个测试
- [ ] **Validate**: 组件测试全绿

### Task 7: 迁移 `EditorPage.tsx`（最棘手的两处）
- [ ] **Action**:**草稿恢复**（line 61）：
  - 新增 `const [showDraftPrompt, setShowDraftPrompt] = useState(false)`
  - `useEffect` 中 `draftPromptedRef` 守卫保留；存在草稿时 `setShowDraftPrompt(true)`（**不**再 `await`）
  - 渲染阶段 `if (showDraftPrompt) { ... await confirm(...) ... setShowDraftPrompt(false); }`
  - 提示文案：`title: '恢复草稿', message: '发现上次未保存的草稿，是否恢复？'`
- [ ] **Action**:**3 选项脏数据退出**（line 117）：
  - 把 `DIRTY_EXIT_PROMPT` 重命名为 `DIRTY_EXIT_TITLE` + `DIRTY_EXIT_MESSAGE` 两个常量（保留供测试断言）
  - 替换为：
    ```ts
    const choice = await confirm({
      title: DIRTY_EXIT_TITLE,
      message: DIRTY_EXIT_MESSAGE,
      actions: [
        { label: '保存并退出', value: 'save', variant: 'primary' },
        { label: '放弃修改', value: 'discard', variant: 'danger' },
        { label: '继续编辑', value: 'cancel', variant: 'secondary' },
      ],
      danger: false,  // 是 primary 操作不是 danger 操作
    });
    if (choice === 'cancel' || choice === null) return;
    if (choice === 'save') {
      const r = saveLevel();
      if (!r.ok) { setStatus(...); return; }
    }
    // discard 路径：清草稿并退出
    if (typeof localStorage !== 'undefined') localStorage.removeItem(DRAFT_KEY);
    onExit();
    ```
  - 关键：第一个 action `保存并退出` 仍是默认焦点；用户按 Enter 就能"安全退出"，不再有原 P0 注释里说的"取消=不退出 vs 代码实现=不保存并退出"的逻辑漂移
- [ ] **Action**: 更新 `EditorPage.test.tsx` 中相关测试（≥5 case）：
  - 草稿存在 → 出现 `confirm-dialog` 一次（StrictMode 守卫）
  - 点击 `confirm-action-ok`（恢复）→ 加载草稿
  - 点击 `confirm-action-cancel`（放弃）→ 清草稿
  - 脏数据退出点 `save-and-exit` 按钮：先 save 成功再 onExit（不进入对话框）
  - 脏数据退出走 3 选项对话框：3 个 action 各自分支正确
  - 保留 1 个文案常量回归断言（`DIRTY_EXIT_TITLE` / `DIRTY_EXIT_MESSAGE` 必含"保存"/"放弃"/"继续编辑"关键词）
- [ ] **Validate**: `EditorPage.test.tsx` 全绿

### Task 8: 完整回归
- [ ] **Action**: 跑全套：
  - `pnpm typecheck`
  - `pnpm test`
  - `pnpm test:e2e`
  - `grep -rn "window\.\(confirm\|alert\|prompt\)" src/`（必须 0 命中）
- [ ] **Action**: 浅色 / 深色主题各加载一次，目视检查 5 个调用点
- [ ] **Action**: 写 `review.md`（实施日志 + 偏差 + 测试覆盖）
- [ ] **Action**: 更新 `docs/increments/_template/roadmap.md`：
  - 路线图表加一行 `P2-7 | 自定义对话框系统 | P0 | — | Small | docs/increments/p2-7-custom-dialog/`
  - 总任务列表加一段 P2-7 进度
  - 活跃锚点更新到 P2-7
- [ ] **Action**: 提交 + 等用户确认
- [ ] **Validate**: 上述全部 0 错误 0 警告

## 验证

```bash
# 必须全部通过才能标记 P2-7 为 done
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
grep -rn "window\.\(confirm\|alert\|prompt\)" src/   # 必须 0 命中
```

## 风险

| 风险 | 可能性 | 缓解 |
|---|---|---|
| async-in-useEffect 改成 state-driven 后破坏 StrictMode 双触发 | 中 | 保留 `draftPromptedRef`；新增单测覆盖"只触发一次" |
| 3 选项脏数据退出改变编辑器用户可见行为 | 中 | 已是锁定决策；单测钉住 3 个按钮分支 + save 失败短路 |
| 测试文件同时大规模失败 | 低 | Task 5/6/7 一个一个文件迁移，每个 Task 完成时该文件先绿再继续 |
| 焦点陷阱实现超 200-400 行预算 | 低 | Task 2 保持最小：开时聚焦首个按钮；手写 Tab 循环；不做完整 WAI-ARIA roving |
| E2E `delete a custom level` 测试因 Playwright 自动处理原生对话框失败 | 低 | 原测试已显式用 `page.once('dialog', ...)`，替换为按钮点击 |
| `useConfirm` 并发调用错乱 | 低 | Provider 维护 current + 队列；Task 3 单测覆盖 |

## 验收

- [ ] 所有 Task 勾选完成
- [ ] 验证命令全部通过
- [ ] spec §7 完成清单全部勾选
- [ ] `docs/increments/_template/roadmap.md` 的 P2-7 行从 `pending` 改为 `done`
- [ ] 活跃锚点指向 P2-7
- [ ] `review.md` 填写完整

---

## 执行日志（实施时填写）

### 实施日期
YYYY-MM-DD

### 实际改动文件
（与上面"文件改动总览"对照，列出真实改动的文件）

### 遇到的偏差
- spec 中计划 ...，实际做了 ...，原因 ...

### 测试覆盖
- 单元覆盖率：...%
- 新增 / 修改测试：...

### 备注
（任何给后续增量有参考价值的发现）
