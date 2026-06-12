# 深色模式 + 新 pickup 类型 — 实施计划（Plan）

**Spec**: `docs/increments/dark-mode-pickups/spec.md`
**复杂度**: Small
**日期**: 2026-06-08（最后更新 2026-06-08）

> 与 `spec.md` 保持同步。任务清单对应 roadmap 总任务表 #3-#14（#1 升级 roadmap、#2 重写 spec 是元任务，不在此列）。

## 文件改动总览

| 文件 | 操作 | 原因 |
|---|---|---|
| `src/styles/theme.css` | UPDATE | 新增 `:root[data-theme="dark"]` 变量集 + `@keyframes inventory-flash` |
| `src/App.tsx` | UPDATE | useEffect 同步 `settingsStore.darkMode → data-theme` |
| `src/engine/Scene.ts` | UPDATE | 加 `setDarkMode(bool)` + LIGHT/DARK_PALETTE + FogExp2 |
| `src/ui/Settings.tsx` | UPDATE | 「外观」分组 + darkMode checkbox |
| `src/engine/InputManager.ts` | UPDATE | Digit1/Digit2 → bridge.onUseItem |
| `src/engine/Game.ts` | UPDATE | GameBridge 加 5 个 store-free accessor + setDarkMode 接线 |
| `src/ui/GameCanvas.tsx` | UPDATE | bridge impl 提供 5 个 accessor + onUseItem 调 store |
| `src/store/gameStore.ts` | UPDATE | `useItem(slot)` action + `useItemFlash` 字段 |
| `src/game/Rules.ts` | UPDATE | 纯函数 `onUseItem(slot, inventory, maze)` |
| `src/entities/Pickup.ts` | CREATE | `PICKUP_COLORS` map + `createPickupMaterial(type)` 工厂 |
| `src/ui/components/InventoryBar.tsx` | UPDATE | 数字角标 + 填槽高亮 + flash overlay |
| `tests/unit/gameStore.test.ts` | EXTEND | 5 个 useItem cases |
| `tests/unit/rules.test.ts` | EXTEND | 5 个 onUseItem cases |
| `tests/unit/pickup.test.ts` | CREATE | 4 个 PICKUP_COLORS / createPickupMaterial cases |
| `tests/unit/scene.test.ts` | EXTEND | 3 个 setDarkMode cases |
| `tests/component/settings.test.tsx` | CREATE | 3 个 Settings darkMode toggle cases |
| `tests/component/inventoryBar.test.tsx` | CREATE | 5 个 InventoryBar flash + digit cases |
| `tests/e2e/dark-mode.spec.ts` | CREATE | toggle 切 data-theme 验证 |
| `tests/e2e/pickup-types.spec.ts` | CREATE | health/key/time 端到端拾取 + useItem |
| `public/levels/level-tiny-pickups.json` | CREATE | 5x1 走廊，3 种 pickup 各一 |
| `vitest.config.ts` | UPDATE | `coverage.include: ['src/**']`（避免 e2e 0% 拖整体） |

## 任务清单

### Task 1: `theme.css` 加 `[data-theme="dark"]` 变量集 + flash keyframe
- **Action**：追加 `:root[data-theme="dark"] { ... }`（冷调蓝、near-black bg）；追加 `@keyframes inventory-flash`（opacity 1→0）
- **Validate**：`document.documentElement.dataset.theme = 'dark'` 手动切换可见

### Task 2: `App.tsx` 同步 darkMode → data-theme
- **Action**：在 App 加 useEffect 读 `settingsStore.darkMode`，设置 `document.documentElement.dataset.theme`
- **Validate**：toggle 后 `dataset.theme` 立即变

### Task 3: `Scene.ts` 加 `setDarkMode(bool)`（Q3 严格）
- **Action**：`SceneRefs` 接口加 `setDarkMode`；buildScene 内部用 `applyPalette` 闭包切换 LIGHT/DARK_PALETTE + FogExp2
- **Mirror**：Q3 — 不 import 任何 store
- **Validate**：`grep -r "settingsStore\|gameStore" src/engine/` 为空

### Task 4: `Settings.tsx` 加 darkMode toggle（"外观"分组）
- **Action**：在 Settings 加 `<fieldset><legend>外观</legend>` 包裹深色模式 checkbox
- **Validate**：RTL `tests/component/settings.test.tsx` 3 cases

### Task 5: `InputManager.ts` 监听 Digit1/Digit2
- **Action**：加 `onUseItem(fn)` setter；onKeyDown 监听 Digit1→0, Digit2→1（带 `!e.repeat`）
- **Validate**：单测 mock keydown 事件（inputManager.test.ts 已有覆盖）

### Task 6: `gameStore.useItem(slot)` action
- **Action**：screen 守卫 → 调 `Rules.onUseItem` → 若 flash 则 bump `useItemFlash.version`
- **Validate**：5 个 useItem 单测

### Task 7: `Rules.onUseItem` 纯函数
- **Action**：返回 `{ flash, consumed }`；maze null / slot 空 / slot 越界 → flash:false；否则 flash:true, consumed:false（未来 P2-4a 锁门时翻 consumed）
- **Validate**：5 个 onUseItem 单测

### Task 8: `entities/Pickup.ts` 三色
- **Action**：`PICKUP_COLORS` 导出 + `createPickupMaterial(type)` 工厂
- **Validate**：4 个 Pickup 单测；Scene.ts 用它替代 inline `pickupMat`

### Task 9: `InventoryBar` 数字键 + flash
- **Action**：始终显示 `i+1` 角标；填槽用 `var(--accent)` 高亮边；`useItemFlash.slot === i` 时渲 flash overlay（`key={version}` 重挂载触发 CSS 动画）
- **Validate**：5 个 InventoryBar RTL cases

### Task 10: E2E 覆盖
- **Action**：
  - `dark-mode.spec.ts`：切 checkbox 验 `data-theme`
  - `pickup-types.spec.ts`：脉冲走 5x1 走廊，验 `key` 文本可见 + 按 Digit1 + 走到出口
- **Validate**：`npm run test:e2e` 5/5 pass

### Task 11: 文档同步
- **Action**：
  - README Controls 加 1/2 useItem；Future increments 移除 P2-2 完成的项
  - spec.md 状态 ready → done；§6 全部勾选
  - roadmap.md P2-2 行 → done；锚点块清空活跃增量
  - spec §6.3「新增 action/分支单测」+「RTL: Settings / InventoryBar」+「单测覆盖率 ≥80%」全部落实
- **Validate**：本 plan.md 也同步到新 14 任务结构

## 验证

```bash
npx tsc --noEmit              # typecheck
npm run build                 # production build
npm test                      # 171 单测 pass
npm run test:e2e              # 5 e2e pass
npx vitest run --coverage     # ≥80% lines/statements, ≥75% funcs/branches
# Q3 验证
grep -r "settingsStore\|gameStore" src/engine/ && echo "FAIL" || echo "OK"
```

## 风险

| 风险 | 可能性 | 缓解 |
|---|---|---|
| 深色雾影响可读性 | 中 | 浓度上限 0.6（当前 0.05） |
| key 无锁门空响应 | 低 | slot 高亮闪烁反馈 |
| 引擎层误 import store | 中 | CI grep 验证（已 pass） |
| InventoryBar flash 不可见 | 低 | CSS `forwards` 保持终态，e2e 覆盖；RTL 验证 useItemFlash 触发后 flash overlay 存在 |

## 验收

- [x] 所有任务勾选完成
- [x] 验证命令全部通过
- [x] spec §6 完成清单全部勾选
- [x] README.md / roadmap.md / spec.md / plan.md 同步更新
