# P2-18: 陷阱 + 门机关系统 — 任务清单

**增量 ID**: P2-18
**日期**: 2026-07-01
**状态**: 完成

## Phase 1 — 数据模型与运行时骨架 ✅

- [x] **Task 1.1** — `src/maze/types.ts`：新增 TrapKind/KeyColor union + readonly tuples + guards；Trap/Door interfaces；Pickup.keyColor?；MazeData.traps/doors；EditorTool 加 'trap'/'door'
- [x] **Task 1.2** — `src/maze/JsonMazeProvider.ts`：新增 parseTraps/parseDoors
- [x] **Task 1.3** — `src/engine/ParchmentState.ts`：给 maybeRecordDamage 加 forceType? 参数

## Phase 2 — 引擎 + 规则 ✅

- [x] **Task 2.1** — `src/game/Rules.ts`：新增 findTrapAt / computeSlowMultiplier；扩展 UseItemResult + onUseItem
- [x] **Task 2.2** — `src/engine/Game.ts`：__SCRATCH_openDoors + openedDoors + openDoor() + trap 检测 + speed 重算
- [x] **Task 2.3** — `src/engine/Scene.ts`：trap mesh + door mesh + SceneRefs 扩展
- [x] **Task 2.4** — `src/store/gameStore.ts`：slowUntil / getPlayerSpeedMultiplier / useItem 门解锁
- [x] **Task 2.5** — `src/ui/GameCanvas.tsx`：bridge 挂载 onDoorUnlocked / onTrapHit / getPlayerSpeedMultiplier

## Phase 3 — 编辑器 store + UI ✅

- [x] **Task 3.1** — `src/store/editorHistory.ts`：EditorSelection union 加 trap/door
- [x] **Task 3.2** — `src/store/editorStore.ts`：placeTrap/placeDoor/updateTrap/updateDoor + isOccupied + deleteSelected
- [x] **Task 3.3** — `src/ui/editor/EditorTopBar.tsx` + `EditorToolbar.tsx`：trap/door 工具按钮
- [x] **Task 3.4** — `src/ui/editor/EditorViewport.tsx`：handleCellClick + buildLookups + minimap glyphs
- [x] **Task 3.5** — `src/ui/editor/EditorPropertiesPanel.tsx`：TrapForm + DoorForm
- [x] **Task 3.6** — `src/styles/theme.css`：trap/door chip + minimap cell colors

## Phase 4 — i18n + UI 集成 ✅

- [x] **Task 4.1** — `src/i18n/resources/{zh,en}.ts`：新增 ~30 个 trap/door key
- [x] **Task 4.2** — `src/ui/components/InventoryBar.tsx`：key color swatch
- [x] **Task 4.3** — `src/ui/editor/EditorHelpDrawer.tsx`：陷阱+门机关条目

## Phase 5 — 测试 + 文档 ✅

- [x] **Task 5.1** — 单元测试：types (isTrapKind/isKeyColor) / JsonMazeProvider (parseTraps/parseDoors) / Rules (findTrapAt/computeSlowMultiplier/onUseItem key+door) / ParchmentState (forceType) / editorStore (placeTrap/placeDoor/updateTrap/updateDoor/deleteSelected)
- [x] **Task 5.2** — 组件测试：EditorViewport (trap/door tool + select + glyph) / EditorPropertiesPanel (TrapForm/DoorForm + delete + missing-key warn) / InventoryBar (key color swatch) / EditorHelpDrawer (trap/door entries)
- [x] **Task 5.3** — E2E：doors-traps.spec.ts
- [x] **Task 5.4** — 增量文档：spec.md + plan.md
- [ ] **Task 5.5** — `docs/roadmap.md`：锚点 + 勾选 + 顶部状态

## Phase 6 — 回归

- [ ] 全量回归：typecheck + test + build
- [ ] 手动验证：编辑器放置 → 保存 → 游玩 → 羊皮纸留痕 → 开门 → 通关
