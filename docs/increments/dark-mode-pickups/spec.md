# 深色模式 + 新 pickup 类型 — 设计文档（Spec）

**Slug**: dark-mode-pickups
**状态**: draft
**日期**:2026-06-08
**对应路线图项**: P2-2
**依赖**:—
**复杂度**: Medium

##1.概述
两个独立但同时落地的视觉 /玩法增强：
（a）深色模式切换，让玩家从明亮风格切到低光氛围；
（b）扩展 pickup 类型从仅 `time` 到 `health` 与 `key`，同时启用 InventoryBar 的"按1 /2 使用物品"机制。

##2.目标 / 非目标

###目标
- `settingsStore.darkMode` 默认 `false`，Settings界面有切换
- 深色模式启用后：场景光照换冷色调、雾色加深、HUD 用暗色 CSS变量
- 新增 `pickup.type: "health"`：拾取后恢复1点生命（最大3）
- 新增 `pickup.type: "key"`：拾取后入库存，按"E"或"1"使用一次打开最近的锁门（无锁门时不消耗）
- `InventoryBar`槽位激活：第一个非空槽按"1"使用，第二个按"2"
- 三种 pickup 在视觉上明显区分（颜色 /形状）
-拾取动画保持 MVP 的简单移除即可

### 非目标
- 新增第三种槽位（仍2-slot）
- `key`对应"锁门" cell 类型（仅作为预留，留给后续增量）
- 深色模式 +白天模式以外的第三种主题
- 自动按时间切换主题

##3. 用户故事
- 作为夜猫子玩家，我想要切换深色模式，以便夜间不刺眼
- 作为动作玩家，我想要拾取 health 包，以便在被击中时恢复
- 作为解谜向玩家，我想要拾取 key，以便打开锁门（未来）

##4. 功能需求
- FR-1：`settingsStore` 新增字段 `darkMode: boolean`，persisted
- FR-2：Settings界面新增深色模式切换控件（Switch / Toggle）
- FR-3：`Scene.ts`监听 `darkMode`，切换 ambient + directional light强度与色温，启用深色雾
- FR-4：`theme.css` 新增 `data-theme="dark"`变量集合；`App.tsx`根节点根据 `darkMode` 设置 `data-theme`
- FR-5：`Rules.ts`扩展 pickup handler：`health`调 `damage(-1)`，`key` 入 inventory slot0
- FR-6：`InventoryBar.tsx`：显示当前 slot0 / slot1 内容；高亮可激活的槽位
- FR-7：`InputManager.ts`：监听数字键1 /2，触发对应 slot 的 `useItem` action
- FR-8：`gameStore` 新增 `inventory: Array<{type, value}>`字段；`useItem(slot)` action
- FR-9：三种 pickup 在 Three.js场景中用不同颜色：time 金黄、health 红、key蓝
- FR-10：HUD 的 `HealthBar.tsx` 在 `health`拾取时播放短暂 +1动画（可选）

##5. 数据 /类型变更

###新增 /修改的类型
- `src/maze/types.ts`：
 - `PickupType` 已预留 `health` 与 `key`，无需改动 union
- `src/store/settingsStore.ts`：
 - 新增 `darkMode: boolean`
- `src/store/gameStore.ts`：
 - 新增 `inventory: Array<{type: PickupType; value: number} | null>`长度2
 - 新增 action `useItem(slot:0 |1)`

###边界检查
-引擎层 `Rules.ts`接收 `useItem`事件，但不直接依赖 `settingsStore`（通过引擎事件总线）

##6.引擎 /架构影响

###受影响文件
| 文件 |改动 |说明 |
|---|---|---|
| `src/store/settingsStore.ts` | UPDATE | 新增 `darkMode`字段 |
| `src/store/gameStore.ts` | UPDATE | 新增 `inventory` + `useItem` |
| `src/game/Rules.ts` | UPDATE |扩展 pickup 与 useItem 处理 |
| `src/engine/Scene.ts` | UPDATE |监听 darkMode切换光照 /雾 |
| `src/engine/InputManager.ts` | UPDATE |数字键1 /2 → useItem事件 |
| `src/engine/events.ts` | UPDATE | 新增 `USE_ITEM`事件 |
| `src/entities/Pickup.ts` | UPDATE | 按 type选 mesh颜色 |
| `src/ui/Settings.tsx` | UPDATE | 深色模式开关 |
| `src/ui/components/InventoryBar.tsx` | UPDATE | 显示库存槽位 |
| `src/styles/theme.css` | UPDATE | 新增 `data-theme="dark"`变量 |
| `src/App.tsx` | UPDATE | 根据 `darkMode` 设置 `data-theme` |

###边界检查
-引擎层不直接 `import settingsStore`；通过事件或 props传入 `darkMode`
- 新增 Three.js资源（pickup 不同颜色的 mesh）需在 `dispose()` 中释放

##7. UI /UX变更

###屏幕 /组件改动
- `Settings.tsx`：新增"外观"分组，含深色模式 toggle
- `InventoryBar.tsx`：两个槽位显示当前物品图标（time / health / key）+数字键提示
- `HUD.tsx`：当 `darkMode=true` 时，HUD 用暗色变量

###交互流程
1.玩家打开 Settings →切换深色模式
2.立即生效：场景变暗，HUD变暗
3.玩家进入关卡
4.走过 health pickup →生命+1（视觉动画）
5.走过 key pickup → 入 slot0
6. 按"1"键 → 使用 key（当前无锁门，不消耗，仅动画反馈）

##8.错误处理

###新增错误码
- 无新错误码；沿用 `GameError`体系

###兜底行为
- localStorage不可用 → darkMode退化为内存状态（沿用 `persist.ts`）
- `useItem` 时槽位为空 → 不响应按键（无错误）
- darkMode切换时若 `Scene.ts` 未初始化 → 仅更新 store，等下次 `startLevel` 时应用

##9. 测试策略

###单元测试
- `settingsStore.test.ts`：darkMode切换持久化
- `gameStore.test.ts`：`useItem`状态机
- `rules.test.ts`：health / key pickup 处理分支
- `InventoryBar.test.tsx`：RTL渲染空 / 非空槽位

###组件测试
- `Settings.tsx` RTL：darkMode切换控件存在且可点
- `InventoryBar.tsx` RTL：slot 内容显示正确

### E2E 测试
- `dark-mode.spec.ts`：切换 darkMode 后 HUD颜色变化
- `pickup-types.spec.ts`：health 与 key拾取路径

##10.风险

|风险 |可能性 |缓解 |
|---|---|---|
| 深色雾影响可读性 | 中 |调雾浓度上限为0.6，确保墙后不可见但前方可达 |
| key 无对应锁门导致按键空响应 | 低 | 按键时给视觉反馈（slot 高亮闪烁），不报错 |
|颜色冲突（time 与现有墙色相近） | 低 | time 用偏黄绿色，区别于墙的灰白 |

##11. 完成清单（拷贝自 `_template/dod.md`）

###11.1 功能验收
- [] FR-1 到 FR-10全部实现
- [] 深色模式可在 Settings 中切换并立即生效
- [] health / key pickup端到端可触发
- [] InventoryBar 显示与按键1 /2使用端到端可走通

###11.2引擎 /架构边界
- [] 引擎层不 `import settingsStore`（验证 `grep "settingsStore" src/engine/ -r` 为空）
- [] 无新增 `MazeProvider`实现
- [] Pickup 不同颜色的 mesh 在 `dispose()` 中释放

###11.3 测试
- [] 单测覆盖率 ≥80%
- [] 新增 Zustand action / Rule 分支单测
- [] RTL:Settings / InventoryBar
- [] E2E:dark-mode / pickup-types
- [] `npm run typecheck` 与 `npm run build` 通过

###11.4文档
- [] `docs/increments/dark-mode-pickups/spec.md`已写入（本文件）
- [] `docs/increments/dark-mode-pickups/plan.md`待写
- [] README.md 的"Future increments"中标 P2-2 完成时移走
- [] spec §7 类型 union反映新字段

###11.5持久化与兼容
- [] `settingsStore.darkMode`持久化（schema兼容：缺失字段默认 false）
- [] `gameStore.inventory` 不持久化（运行时）
- [] 浏览器刷新后 darkMode 设置保留

###11.6 安全与健壮性
- [] 用户输入（toggle）走 store action，无原始 setState
- [] 无 console.log残留
- [] 无硬编码资源 URL

##12. 参考
- 设计 spec:`docs/superpowers/specs/2026-06-05-maze3d-first-person-game-design.md` §6 Pickups, §7 PickupType
- DoD模板:`docs/increments/_template/dod.md`
-路线图:`docs/increments/_template/roadmap.md`
