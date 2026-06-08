# P2-2 — 深色模式 + 新 pickup 视觉 + UseItem 数字键（Spec 重写）

**Slug**: dark-mode-pickups
**状态**: ready（重写于 2026-06-08）
**对应路线图项**: P2-2
**复杂度**: Small
**关联决策**: Q1=A（补全差异）、Q3=A（严格不变）

## 1. 概述

两个独立但同 ship 的增强：
- (a) 深色模式切换（明亮 ⇄ 低光氛围）
- (b) 拾取类型从单 `time` 扩到 `time/health/key`，启用 InventoryBar 数字键 useItem

## 2. 范围（Q1 决策：补全差异）

Q1 选定"补全差异"——本 spec 只描述剩余未实现项，不重述全功能。

### 2.1 已实现（不在本次 ship 范围）
- `settingsStore.darkMode: boolean` 字段（persisted）
- `gameStore.inventory: Array<{type, value} | null>`（长度 2）
- `gameStore.damage(delta: number)` action
- `gameStore.pickup` 处理 time/health/key 三个分支
- `PickupType = "time" | "health" | "key"`（types.ts）

### 2.2 本次 ship 范围
详见 §4。

### 2.3 非目标
- 第三种 inventory 槽位（保持 2-slot）
- 锁门 cell 类型（key 预留，留 P2-4a）
- 第三种主题
- 自动按时段切换主题

## 3. Q3 引擎/Store 边界（严格不变）

DoD §14.2 强制规则：引擎层（`src/engine/**`）**不** import 任何 store。

### 3.1 边界清单
- `Scene.ts` 接收 darkMode 通过 props 或事件总线（**不** `import settingsStore`）
- `InputManager.ts` dispatch `USE_ITEM` 事件（**不** `import gameStore`）
- `Rules.ts` 的 `onUseItem` 回调由调用方注入（**不** `import gameStore`）
- App 层（`src/App.tsx`、`src/ui/**`）将 store 数据塞入引擎

### 3.2 验证
CI 必跑：
```bash
grep -r "settingsStore" src/engine/ && echo "FAIL" || echo "OK"
grep -r "gameStore" src/engine/ && echo "FAIL" || echo "OK"
```

## 4. 本次 ship 功能

| ID | 功能 | 主要文件 |
|---|---|---|
| F-1 | 深色模式 CSS 变量集 | `src/styles/theme.css` |
| F-2 | App 同步 darkMode → data-theme | `src/App.tsx` |
| F-3 | `Scene.setDarkMode(bool)`（Q3 严格） | `src/engine/Scene.ts` |
| F-4 | Settings 深色 toggle 控件 | `src/ui/Settings.tsx` |
| F-5 | 数字键 1/2 触发 USE_ITEM | `src/engine/InputManager.ts` |
| F-6 | `gameStore.useItem(slot: 0\|1)` action | `src/store/gameStore.ts` |
| F-7 | `Rules.onUseItem` handler（无锁门 = slot 高亮闪烁） | `src/game/Rules.ts` |
| F-8 | Pickup 三色 mesh（time/健康/key） | `src/entities/Pickup.ts` |
| F-9 | InventoryBar 数字键提示 + slot 高亮 | `src/ui/components/InventoryBar.tsx` |
| F-10 | E2E 覆盖（dark-mode + pickup-types） | `tests/e2e/` |

## 5. UI/UX 行为

### 5.1 深色模式
- toggle 立即生效
- 场景：ambient/directional light 强度与色温切换；启用深色雾（浓度 ≤0.6）
- HUD：CSS 变量切到暗色 palette

### 5.2 UseItem 反馈
- 按 `1`/`2`：对应 slot 非空则触发 `USE_ITEM` 事件
- 无锁门场景（当前所有关卡）：slot 高亮闪烁一次，不报错
- 槽位空：按键无响应

## 6. 验收（DoD 子集）

### 6.1 功能
- [ ] F-1 到 F-10 全部 ship
- [ ] darkMode toggle 立即生效（场景 + HUD）
- [ ] health / key 拾取端到端可触发
- [ ] 数字键 1/2 → useItem 端到端可走通
- [ ] 三种 pickup 视觉可区分

### 6.2 引擎边界
- [ ] `grep -r "settingsStore" src/engine/` 为空
- [ ] `grep -r "gameStore" src/engine/` 为空
- [ ] Pickup 多色 mesh 在 `dispose()` 中释放

### 6.3 测试
- [ ] 单测覆盖率 ≥80%
- [ ] 新增 action/分支单测
- [ ] RTL: Settings / InventoryBar
- [ ] E2E: dark-mode / pickup-types
- [ ] `npm run typecheck` 与 `npm run build` 通过

### 6.4 文档
- [ ] spec §6 全部勾选
- [ ] README Future increments 移除 P2-2
- [ ] roadmap 总任务表 P2-2 全部 [x]
- [ ] spec 状态 ready → done

## 7. 风险

| 风险 | 可能性 | 缓解 |
|---|---|---|
| 深色雾影响可读性 | 中 | 浓度上限 0.6 |
| key 无锁门空响应 | 低 | slot 高亮闪烁反馈 |
| 引擎层误 import store | 中 | CI grep 验证 |

## 8. 参考
- 设计 spec：`docs/superpowers/specs/2026-06-05-maze3d-first-person-game-design.md` §6 Pickups, §7 PickupType
- 路线图：`docs/increments/_template/roadmap.md`
- 决策记录：roadmap §「设计决策记录」Q1、Q3
