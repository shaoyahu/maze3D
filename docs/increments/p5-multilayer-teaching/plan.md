# P5-multi-layer-teaching — 实施计划

**Spec**: `docs/increments/p5-multilayer-teaching/spec.md`
**复杂度**: Medium
**日期**: 2026-08-12

## 文件改动总览

| 文件 | 操作 | 原因 |
|---|---|---|
| `src/maze/types.ts` | UPDATE | MazeData 加 `walls2d?: CellType[][][]` 字段 |
| `src/maze/JsonMazeProvider.ts` | UPDATE | 解析 + 严格 validate `walls2d` + `start/exit.level` + transitions |
| `src/engine/Game.ts` | UPDATE | `_grid.get` 优先读 `maze.walls2d[level]` |
| `src/engine/Scene.ts` | UPDATE | `resolvePerLayerWalls` 优先读 `maze.walls2d` |
| `src/ui/LevelSelect.tsx` | UPDATE | 删 H3 useEffect |
| `public/levels/teaching-multilayer-01.json` | NEW | 2 层教学关卡 |
| `src/i18n/resources/en.ts` | UPDATE | +5 `tutorial.teachingMultilayer01.stepN` keys |
| `src/i18n/resources/zh.ts` | UPDATE | +5 同上 |
| `tests/unit/maze/JsonMazeProvider.test.ts` | UPDATE | +7 multi-layer JSON case |
| `tests/unit/maze/builtInLevels.test.ts` | UPDATE | EXPECTED_BUILT_IN_IDS 加 `teaching-multilayer-01` |
| `tests/unit/maze/types.multiLevel.test.ts` | UPDATE | 2 case 加 `walls2d` |
| `tests/component/levelSelect.multiLevel.test.tsx` | UPDATE | H3 fix case 反映新行为 |

## 任务清单

### Task 1: 数据层 — MazeData.walls2d
- [x] **Action**: `src/maze/types.ts` `MazeData` interface 加 `walls2d?: CellType[][][]` 字段 + 注释解释何时用
- [x] **Validate**: `npx tsc --noEmit -p tsconfig.app.json` 0 error

### Task 2: JsonMazeProvider 解析 walls2d
- [x] **Action**: `JsonMazeProvider.validateMaze` 在 walls 解析后加 `walls2d` 解析块:validate length === levelCount + 每层 shape
- [x] **Action**: `levelCount > 1` 但无 `walls2d` → throw `LevelLoadError: 'requires walls2d field'`
- [x] **Validate**: `npx vitest run tests/unit/maze/JsonMazeProvider.test.ts`

### Task 3: validate start/exit.level
- [x] **Action**: parseEntityLevel 后加 bounds check `0 <= level < levelCount`
- [x] **Action**: start/exit on-wall 检查改用 per-layer walls(walls2d[level] or walls fallback)
- [x] **Validate**: typecheck + test

### Task 4: validate transitions 完整
- [x] **Action**: 替换原本 cast-only `transitions` 解析,加完整 validate:
  - id 是非空 string + 唯一
  - level / toLevel 是 integer 在 `[0, levelCount)`
  - x/z/toX/toZ integer 在 `[0, width/depth)`,toX/toZ 默认 to x/z
  - kind 是 5 字面量之一
  - 源/目标 cell 不在 per-layer wall 上
- [x] **Validate**: typecheck + test

### Task 5: engine 优先读 walls2d
- [x] **Action**: `src/engine/Game.ts` `_grid.get` 优先 `maze.walls2d[level]`,fallback 到 cache + `walls`
- [x] **Action**: `src/engine/Scene.ts` `resolvePerLayerWalls` 优先 `maze.walls2d`,fallback 到 cache + `walls`
- [x] **Validate**: typecheck + 全量 vitest(2D 模式零回归)

### Task 6: LevelSelect 删 H3 fix
- [x] **Action**: `src/ui/LevelSelect.tsx` 删 `useEffect(() => { if (levelSource === 'teaching' && levelCount !== 1) setLevelCount(1); }, [levelSource, levelCount])`
- [x] **Action**: 留注释解释为什么不再需要(engine 读 JSON 的 levelCount,validateSelection for teaching 不传 options)
- [x] **Validate**: typecheck + 全量 vitest

### Task 7: 教学 JSON + i18n
- [x] **Action**: 创建 `public/levels/teaching-multilayer-01.json`:
  - 5×5 grid, 2 层
  - L0: 起点 (0,0) → 楼梯 (2,2),winding path
  - L1: 楼梯 landing (2,2) → 出口 (4,4)
  - 1 个 stair-up transition
  - 5 步 tutorial (timeout + key-pressed + reached-exit)
- [x] **Action**: `src/i18n/resources/{en,zh}.ts` 加 5 个 keys
- [x] **Validate**: dev server 加载,鼠标验证 banner + 跨层

### Task 8: 测试更新
- [x] **Action**: `tests/unit/maze/JsonMazeProvider.test.ts` 加 7 multi-layer case
- [x] **Action**: `tests/unit/maze/builtInLevels.test.ts` 加 `teaching-multilayer-01` 到 EXPECTED
- [x] **Action**: `tests/unit/maze/types.multiLevel.test.ts` 2 case 加 `walls2d`
- [x] **Action**: `tests/component/levelSelect.multiLevel.test.tsx` H3 case 改新行为描述
- [x] **Validate**: `npx vitest run` 1705 pass + 1 skip

### Task 9: 验证
- [x] `npx tsc --noEmit -p tsconfig.app.json` 0 error
- [x] `npx vitest run` 1705 passed | 1 skipped
- [x] dev server `?id=teaching-multilayer-01&view=2d` 加载,HUD 显示 L1,canvas 渲染

## 验证

```bash
# 必须全部通过
npx tsc --noEmit -p tsconfig.app.json
npx vitest run
```

## 风险

| 风险 | 缓解 |
|---|---|
| JsonMazeProvider 严格 reject break 旧 hand-crafted 多层 | 旧 hand-crafted JSON 都默认 levelCount=1,`walls2d` 缺失不会触发 reject |
| 编辑器 `addLevel` 不真改 walls | 已知:这是 P5-2 editor multi-layer support 的 scope,本 increment 不修 |
| H3 fix 移除后 stale levelCount state leak | teaching rail validateSelection 不传 options,stale state 不进 URL |

## 验收

- [x] 所有 Task 勾选完成
- [x] 验证命令全部通过
- [x] spec §11 完成清单全部勾
- [ ] CLAUDE.md 同步(可推迟)
- [ ] roadmap.md 标 P5-multi-layer-teaching 完成(可推迟)
- [x] 2D 模式行为零回归

## 执行日志

### 实施日期
2026-08-12

### 实际改动文件
- `src/maze/types.ts` — +14 lines (walls2d 字段 + 注释)
- `src/maze/JsonMazeProvider.ts` — +93 lines (parse walls2d + validate start/exit.level + 完整 transition 验证)
- `src/engine/Game.ts` — +9 lines (`_grid.get` 优先读 walls2d)
- `src/engine/Scene.ts` — +12 lines (`resolvePerLayerWalls` 优先读 walls2d)
- `src/ui/LevelSelect.tsx` — +13 lines (删 H3 useEffect + 注释)
- `public/levels/teaching-multilayer-01.json` — NEW (5×5 2 层)
- `src/i18n/resources/{en,zh}.ts` — +5 keys each
- 4 test 文件: +11 case, 改 3 case

### 遇到的偏差
无

### 测试覆盖
- 单元覆盖率: 1705 pass + 1 skip (原 1694 + 11 新)
- 新增: 7 JsonMazeProvider multi-layer case + 1 builtInLevels case
- 改: 2 types.multiLevel + 1 levelSelect H3
- 集成: dev server 端到端验证

### 备注
- 浏览器 E2E 验证 H3 fix + L 标记切换 done(教学关卡 `?id=teaching-multilayer-01&view=2d` 加载成功,HUD 显示"第 1 层")
- P5-2 (editor multi-layer) 是独立增量,本 increment 不动
