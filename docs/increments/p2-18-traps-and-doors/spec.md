# P2-18: 陷阱 + 门机关系统 — 设计规格

**增量 ID**: P2-18
**日期**: 2026-07-01
**状态**: 完成

## 目标

为关卡编辑器新增两类地图元素——陷阱 (trap) 和门 (door)，使关卡作者能构建"绕开陷阱 + 解谜 + 资源取舍"的玩法，而不仅限于"走到出口"。

## 新增元素

### 陷阱 (Trap)

| 类型 | 效果 | 羊皮纸印记 | 可调参数 |
|---|---|---|---|
| 火坑 (fire) | 扣血 | burn | damage (默认 1) |
| 水洼 (water) | 减速 50%，持续 N 秒 | water | slowDurationSec (默认 1.5) |

- 静态 cell 元素，玩家走上去即触发
- 与敌人伤害共享 `maybeRecordDamage` 的 0.5s 窗口 + 不重叠规则
- 水洼减速通过 `gameStore.slowUntil` + `getPlayerSpeedMultiplier()` 桥接到引擎

### 门 (Door) + 钥匙 (Key)

| 钥匙颜色 | 门外观 | 效果 |
|---|---|---|
| 红 / 蓝 / 绿 / 黄 | 金属灰 box 占 cell | 闭合门 = wall，钥匙消耗后门打开 (mesh 隐藏) |

- 钥匙是 `Pickup` 的 `type: 'key'` + 可选 `keyColor?: KeyColor`
- `Rules.onUseItem` 扫描 maze.doors 找同色闭合门，返回 `unlockedDoorId`
- 门解锁状态存于 `Game.openedDoors: Set<string>`，每次 `startLevel` 重置
- 编辑器 DoorForm 显示"缺钥匙"警告（非阻断）

## 架构决策

1. **闭合门 = wall**: `WallGrid.get` 保持 `0 | 1` 二值，闭合门通过 `__SCRATCH_openDoors` 模块级 mirror 在 `_grid.get` closure 中 OR 进来
2. **门运行时状态不写回 MazeData**: 刷新可复现，关卡 JSON 同构
3. **`maybeRecordDamage` 复用**: 加 `forceType?` 参数，陷阱伤害与敌人伤害走同一管线
4. **陷阱检测写在 `Rules.ts`**: 纯函数 + 引擎 bridge 回调，便于单测
5. **钥匙仍是拾取类型**: `Pickup.keyColor` 可选，未填 keyColor 的旧关卡行为不变

## 运行时数据流

```
Player walks onto trap cell
  → Game.update() calls findTrapAt() (Rules.ts)
  → fire: bridge.onTrapHit('fire', damage) → gameStore.damage()
         + recordParchmentDamage(cell, 'burn')
  → water: bridge.onTrapHit('water', duration) → gameStore.setSlowUntil()
           + recordParchmentDamage(cell, 'water')

Player presses 1-5 to use key
  → gameStore.useItem(slot) calls onUseItem() (Rules.ts)
  → onUseItem finds matching door → returns { unlockedDoorId }
  → store calls bridge.onDoorUnlocked(id)
  → GameBridge → game.openDoor(id)
  → Game.openDoor: openedDoors.add(id) + door mesh.visible = false
  → Next frame: _grid.get sees opened door → returns 0 (passable)
```

## 编辑器交互

- **工具栏**: 🔥 陷阱 (T) / 🚪 门 (D)
- **放置规则**: 拒绝 wall/start/exit/已占格，设置 `lastErrorKey`
- **TrapForm**: kind 下拉 (fire/water) + 条件 Stepper (damage 或 slowDuration)
- **DoorForm**: keyColor 下拉 + 坐标只读 + 缺钥匙 warn chip
- **选择**: `EditorSelection` 新增 `{ kind: 'trap'; id }` / `{ kind: 'door'; id }`
- **Minimap**: trap 火(warm orange) / 水(cool blue) / door(metal gray) 像素
- **帮助抽屉**: 工具表 +1 trap 行 +1 door 行，验收清单 +1 条

## 涉及文件

### 域模型

- `src/maze/types.ts` — TrapKind/KeyColor union + guards + Trap/Door interface + Pickup.keyColor + MazeData.traps/doors + EditorTool trap/door
- `src/maze/JsonMazeProvider.ts` — parseTraps/parseDoors

### 引擎 + 规则

- `src/game/Rules.ts` — findTrapAt / computeSlowMultiplier / onUseItem key+door
- `src/engine/Game.ts` — __SCRATCH_openDoors / openedDoors / openDoor() / trap 检测 / speed 重算
- `src/engine/Scene.ts` — trap mesh + door mesh + SceneRefs.traps/doors
- `src/engine/ParchmentState.ts` — maybeRecordDamage forceType?

### Store + Bridge

- `src/store/gameStore.ts` — slowUntil / getPlayerSpeedMultiplier / useItem 门解锁
- `src/ui/GameCanvas.tsx` — bridge onDoorUnlocked / onTrapHit / getPlayerSpeedMultiplier

### 编辑器 UI

- `src/store/editorHistory.ts` — EditorSelection trap/door
- `src/store/editorStore.ts` — placeTrap/placeDoor/updateTrap/updateDoor + isOccupied + deleteSelected
- `src/ui/editor/EditorTopBar.tsx` — TOOL_HINT_KEYS trap/door
- `src/ui/editor/EditorToolbar.tsx` — TOOLS +2 项
- `src/ui/editor/EditorViewport.tsx` — handleCellClick + buildLookups + glyphs + minimap
- `src/ui/editor/EditorPropertiesPanel.tsx` — TrapForm + DoorForm
- `src/ui/editor/EditorHelpDrawer.tsx` — 工具表 + 验收清单
- `src/styles/theme.css` — chip + minimap 样式
- `src/ui/components/InventoryBar.tsx` — key color swatch

### i18n

- `src/i18n/resources/zh.ts` — ~30 个新 key
- `src/i18n/resources/en.ts` — ~30 个新 key
