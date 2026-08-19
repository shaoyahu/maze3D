# P5-multi-layer-teaching — 多层迷宫教学关卡 + 数据层扩展

**Slug**: p5-multilayer-teaching
**状态**: draft → in-review → approved → done
**日期**: 2026-08-12
**对应路线图项**: P5 候选(教学关卡补全多层迷宫教学)
**依赖**: P3-1 (multi-level mazes) + P3-1d (multi-transitions 5 kind) ship 状态
**复杂度**: Medium

## 1. 概述

P3-1 + P3-1d 已经让 engine 支持多层迷宫 + 5 kind transitions(stair / hole / ladder),但**没有任何教学关卡教玩家跨层移动**。如果用户第一次进编辑器或随机模式选了 `levelCount: 2+`,会一头雾水:
- 找不到出口
- 不理解为什么走到某格就自动上/下层
- HUD 上的 L 标记在变但不知道为啥

本 increment 做两件事:
1. **加一个 2 层小教学关卡** `teaching-multilayer-01.json`,让玩家一步步跨层找到出口
2. **扩展 MazeData 数据层** `walls2d?: CellType[][][]` 让 hand-crafted 多层 JSON 在 engine 里渲染正确(目前 hand-crafted 多层会"两层渲染一样",P3-1 没修这个)

locked contracts:
- **数据层**:`MazeData.walls2d` 可选字段,当 `levelCount > 1` 时**必填**;每层 shape 跟 `walls` 一致(同一 width × depth,0/1 cell)
- **JsonMazeProvider**:`walls2d` 解析 + 严格 validate;`start.level` / `exit.level` 必须在 `[0, levelCount)`;每个 transition 完整 validate(level/toLevel 在 bounds, 源/目标 cell 在 bounds + 不在墙上,id 唯一)
- **Engine**:`Scene.resolvePerLayerWalls` + `Game._grid.get` **先读 `maze.walls2d`** 再 fallback 到 procedural provider 的 cache + `[walls]`
- **教学关卡**:`teaching-multilayer-01` 5×5 2 层 + 1 stair-up transition;start L0, exit L1;tutorial 5 步教跨层 mechanic
- **H3 fix 移除**:LevelSelect 不再强制 teaching rail 的 `levelCount=1` — engine 读 JSON 的 `levelCount` (现在可能 > 1)

## 2. 目标 / 非目标

### 目标
- 加 1 个手写 2 层教学关卡
- 教学 banner 5 步:介绍 / 找楼梯 / 上楼 / 找出口 / 成功
- 扩展 MazeData 让 hand-crafted 多层 JSON 在 engine 渲染正确
- 严格 reject `levelCount > 1` 但无 `walls2d` 的 JSON(防"两层渲染一样"bug)

### 非目标
- 编辑器支持多 layer 关卡(独立 P5 增量,P5-2)
- 3D 敌人渲染(spec §11.1 P+ 候选,本 increment 不动)
- 6 层或以上教学(本 increment 只到 2 层)

## 3. 用户故事
- 作为玩家,我第一次进 `teaching-multilayer-01`,看到教学 banner 介绍多层概念
- 我按 WASD 走,找到楼梯,踩上去,被引擎升到 L1
- 我看到 HUD 的 L 标记从 L1 变 L2(1-indexed display)
- 我在 L1 找到出口,通关
- 作为 JSON author,我写多 layer 关卡用 `walls2d` 字段,validator 严格 reject 错 shape

## 4. 功能需求

### FR-1: 数据层扩展
- `MazeData.walls2d?: CellType[][][]` 可选字段
- `walls2d` 长度 = `levelCount`,每层 `width × depth` 0/1 cell
- 引擎 collision (`_grid.get`) + render (`resolvePerLayerWalls`) 都先读 `walls2d`,fallback 到 procedural cache + `[walls]`

### FR-2: 教学关卡 `teaching-multilayer-01.json`
- 5×5 grid,2 层
- L0: 起点 (0,0) → 楼梯 (2,2),winding path
- L1: 楼梯 landing (2,2) → 出口 (4,4),open area + 几个 wall 装饰
- 1 个 `stair-up` transition (L0→L1, 同 (x,z))
- tutorial 5 步(见 FR-3)

### FR-3: Tutorial 步骤 + i18n
- 5 步,每步 1 行中文 + 英文
- 触发:`timeout 2s` → `key-pressed WASD timeout 15s` → `timeout 25s` → `timeout 30s` → `reached-exit`
- (没"layer-2 到达"specific trigger,用 timeout 替代)

### FR-4: H3 fix 移除
- LevelSelect 不再 `if (levelSource === 'teaching' && levelCount !== 1) setLevelCount(1)`
- 原因:engine 读 JSON 的 `levelCount`;teaching rail 不显示 levelCount picker;stale levelCount state 不会 leak 到 teaching URL(validateSelection 不传 options)

## 5. 数据 / 类型变更

### 修改
- `src/maze/types.ts`:`MazeData` 加 `walls2d?: CellType[][][]` 字段 + 注释
- `src/maze/JsonMazeProvider.ts`:
  - 解析 `walls2d` (validate shape + length + cells)
  - 拒绝 `levelCount > 1` 但无 `walls2d`
  - validate `start.level` / `exit.level` 在 `[0, levelCount)`
  - 替换原本 cast-only `transitions` 解析,加完整 validate(每条 transition 的 level/toLevel/x/z/toX/toZ 在 bounds + 源/目标 cell 不在墙上 + id 唯一 + kind 5 字面量)
  - start/exit on-wall 检查改用 per-layer walls
  - MazeData literal 加 `walls2d` 字段(条件 spread)
- `src/engine/Game.ts`:`_grid.get` 优先读 `maze.walls2d[level]`,fallback 到 cache + `[walls]`
- `src/engine/Scene.ts`:`resolvePerLayerWalls` 优先读 `maze.walls2d`,fallback 到 cache + `[walls]`
- `src/ui/LevelSelect.tsx`:删 H3 useEffect,留注释解释为什么不再需要
- `src/i18n/resources/{en,zh}.ts`:加 5 个 `tutorial.teachingMultilayer01.stepN` keys

### 新增
- `public/levels/teaching-multilayer-01.json`:2 层教学关卡
- 5 个 i18n keys × 2 语言 = 10 新 string
- 11 个新/改 test(JsonMazeProvider 7 + builtInLevels 1 + types.multiLevel 2 + levelSelect 1)
- `src/maze/importExport.ts` export 已自动包含 `walls2d` (literal `...level`),无需改

## 6. 引擎 / 架构影响

| 文件 | 改动 | 说明 |
|---|---|---|
| `src/maze/types.ts` | 改 | +1 optional field |
| `src/maze/JsonMazeProvider.ts` | 改 | +walls2d 解析 + 严格 reject,transitions 严格 validate |
| `src/maze/AlgorithmMazeProvider.ts` | 不动 | procedural cache 路径不变 |
| `src/engine/Game.ts` | 改 | _grid.get 优先读 walls2d |
| `src/engine/Scene.ts` | 改 | resolvePerLayerWalls 优先读 walls2d |
| `src/engine/InputManager.ts` | 不动 | 移动模型 2D-only,fp3d 复用 |
| `src/entities/Player.ts` | 不动 | PlayerState 已有 y 字段 |
| `src/ui/LevelSelect.tsx` | 改 | 删 H3 useEffect |
| `src/maze/importExport.ts` | 不动 | `{ ...level }` 自动带 walls2d |

### 边界
- 引擎层不引入新 react / store 依赖
- 2D 模式全链路零回归(教学关卡默认 2D,既有单层教学关卡不动)
- `walls2d` 只在 `levelCount > 1` 时严格必填,单层 back-compat 完整

## 7. UI / UX 变更
- /levels 加 1 个新卡片(自动从 `public/levels/*.json` glob)
- 卡片标题"层级试炼" / "Layered Trial" + i18n.en
- Tutorial banner 5 步文案
- LevelSelect H3 fix 移除:用户从 seed 切到 teaching,`levelCount` 状态保留(不再 snap 回 1)。Dropdown 仍 `disabled` + hint 可见。

## 8. 错误处理
- `walls2d.length !== levelCount` → `LevelLoadError: 'walls2d layer count (N) does not match levelCount (M)'`
- `levelCount > 1` 但无 `walls2d` → `LevelLoadError: 'levelCount N requires walls2d field'`
- `start.level / exit.level` OOB → `LevelLoadError: 'start.level (N) out of bounds; expected 0..M-1'`
- transition OOB / wall / dup id → 详细 `LevelLoadError` 消息

## 9. 测试策略

### 单元测试
- `tests/unit/maze/JsonMazeProvider.test.ts` 加 7 case:
  - accepts levelCount=2 + walls2d + stair-up (happy)
  - rejects levelCount>1 without walls2d
  - rejects walls2d length mismatching levelCount
  - rejects OOB start.level / exit.level
  - rejects transition with OOB level
  - rejects transition on wall
  - rejects duplicate transition ids
- `tests/unit/maze/builtInLevels.test.ts` 加 `teaching-multilayer-01` 到 `EXPECTED_BUILT_IN_IDS`
- `tests/unit/maze/types.multiLevel.test.ts` 改 2 case 加 `walls2d`(否则被严格 reject)

### 组件测试
- `tests/component/levelSelect.multiLevel.test.tsx` 改 H3 fix case 反映新行为(`levelCount` 状态保留,不 snap)

### 集成
- dev server 跑 `?id=teaching-multilayer-01&view=2d` 验证:
  - 加载成功
  - HUD 显示 L1 (player 在 L0)
  - 走到楼梯自动升 L1
  - HUD 变 L2 (player 在 L1)
  - 走到 exit 通关

## 10. 风险

| 风险 | 可能性 | 缓解 |
|---|---|---|
| JsonMazeProvider 严格 reject break 旧 hand-crafted 多层 | 低 | 旧 hand-crafted JSON 没有 `levelCount > 1` 字段(都默认 1),`walls2d` 缺失不会触发 reject |
| `walls2d` 给 procedural level(AlgorithmMazeProvider) 设值冲突 | 低 | procedural path 走 cache,不依赖 `walls2d`;校验只针对 hand-crafted path |
| 编辑器现有 `addLevel` 不真改 walls | 高 | 编辑器仍能 levelCount 数字 + UI 但 user 加的 layer 渲染同 L0 — 这是 P5-2 editor 多层 support 的 scope,本 increment 不修 |
| H3 fix 移除后 stale levelCount state leak | 低 | teaching rail validateSelection 不传 options,stale state 不进 URL;engine 读 JSON |

## 11. 完成清单

### 11.1 功能验收
- [x] `teaching-multilayer-01.json` 加载并通关(start L0 → 楼梯 → L1 → exit L1)
- [x] 5 步 tutorial banner 顺序触发
- [x] HUD L 标记跟随 playerLevel 切换
- [x] `MazeData.walls2d` 字段被 engine 读取(hand-crafted 多层渲染正确)
- [x] `levelCount > 1` 无 `walls2d` 严格 reject
- [x] 2D 模式所有既有 test 通过

### 11.2 引擎 / 架构边界
- [x] 引擎层不新增 react / store 依赖
- [x] 2D 模式 Game / Scene / store 公共路径不动
- [x] `walls2d` 走 dispose 路径(per-layer mesh 在 disposeScene 里 walk 一遍)

### 11.3 测试
- [x] +7 JsonMazeProvider 新 case
- [x] +1 builtInLevels case
- [x] 改 2 types.multiLevel case
- [x] 改 1 levelSelect H3 fix case
- [x] 1705 test pass(1 skip)

### 11.4 文档
- [x] spec.md / plan.md 写入
- [ ] CLAUDE.md 同步(可推迟到 P5-2 一起)
- [ ] roadmap.md 标 P5-multi-layer-teaching 完成

## 12. 后续候选 (P5-2)
- **P5-editor-multilayer**:编辑器支持多层迷宫(已有 `levelCount` + `currentLevel` + add/remove + transition ghost UI,缺 `walls2d` 数据层连接)
- **P5-cleanup**:L-1 `getPlayerY()` + L-2 `_mode?: never` dead code + 注释噪音(从 P4 refactor-fp2d 推下来的)
- **3D enemy 球体**:spec §11.1 偏差,留 P+ 候选
