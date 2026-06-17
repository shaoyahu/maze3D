# D 域评审 — Maze Subsystem (post-P2-13, 2026-06-17)

**Slug**: 2026-06-17-D-maze-subsystem-post-p2-13
**日期**: 2026-06-17
**评审窗口**: `main` HEAD = `ad94abe feat(p2-13): 编辑器文件夹系统 + 左侧栏重构 + 胜利标签键修复`
**前置评审**: [2026-06-17-D-maze-subsystem(P2-11)](./2026-06-17-D-maze-subsystem.md)(D 域 10 条 baseline)
**评审方式**: 子代理直接评审(D 域只返回 summary,本文件由主代理汇总)

---

## §0 范围 & 方法

- **范围**:`src/maze/{types,JsonMazeProvider,AlgorithmMazeProvider,EditorMazeProvider,importExport,builtInLevels,reachability,enemySpawner}.ts` + `src/maze/generators/*` + `public/levels/*.json` + `tests/unit/maze/**`
- **P2-13 改动清单**(本域相关):
  - `src/maze/types.ts` (+6) — `folderId?: string` 单一字段
  - `src/maze/JsonMazeProvider.ts` (+6) — folderId 透传(`types.ts:136-141` + `:252-256, 290`)
- **P2-11 → P2-13 修复 commit**:`2296ef2`(validateMaze 透传 P2-11 字段 + VictoryType 联合)
- **边界检查**:`grep -rE "from ['\"]react|react-dom|zustand|\.\./store" src/maze/generators/` → **0 匹配 ✓**
- **generators 纯函数性**:4 个生成器 + `_expandThickWall` 共 5 个文件 0 finding

---

## §1 总览

| 严重度 | 本次 | 上次(P2-11) | 备注 |
|---|---|---|---|
| CRITICAL | 0 | 2 | D-CRITICAL-1/2 全部已修 |
| HIGH | 0 | 3 | D-H-1/2/3 全部继承未修 |
| MEDIUM | 2 | 3 | D-M-1 算法 pickup 堵出口(继承)+ D-M-2 _expandThickWall size=1 死循环(继承) |
| LOW | 2 | 2 | D-L-1 SCHEMA_VERSION 双源(继承)+ D-L-2 isEnemyAggression 守卫缺失(新增)+ D-L-3 tutorialSteps 元素深校验 + D-L-4 importExport roundtrip 测试缺(新增) |
| **总计** | **4** | **10** | 净减 6(主要因 2 个 CRITICAL 关闭) |

**P2-11 → P2-13 关键修复**:
- D-CRITICAL-1(上轮):validateMaze 静默吞 P2-11 字段 → `2296ef2` 修(透传 5 个 P2-11 字段 + folderId)+ `levels.test.ts:108-139` 加 it.each 17 case 断言
- D-CRITICAL-2(上轮):VictoryType 联合缺 'caught-by-enemy' → `2296ef2` 修(union + VICTORY_TYPE_VALUES 同步排序)
- D-H-1/2/3(上轮 3 个 HIGH)全部继承未修,留作 P3 清理候选

---

## §2 上轮 finding 修复状态核验

| ID | 范围 | 修复状态 | 验证 |
|---|---|---|---|
| **F-2026-06-17-D-CRITICAL-1** | validateMaze 静默吞 P2-11 字段 | ✅ **已修** | `JsonMazeProvider.ts:229-290` 透传 i18n / tutorialSteps / hideMinimap / rules.enemyAggression / rules.requireAllPickups + folderId;`tests/unit/maze/levels.test.ts:108-139` it.each 17 case 全过 |
| **F-2026-06-17-D-CRITICAL-2** | `VictoryType` 联合缺 'caught-by-enemy' | ✅ **已修** | `types.ts:10` union + VICTORY_TYPE_VALUES 同步;`algorithmForMode` 三处同步 |
| **F-2026-06-17-D-H-1** | validateMaze 不报"未知字段"警告,加字段无感 | ❌ **未修(继承)** | 同根 D-CRITICAL-1 修复但未加 unknown field warning |
| **F-2026-06-17-D-H-2** | 算法生成关卡出口总在右下角,4 算法共享模式 | ❌ **未修(继承)** | 4 个算法都把 exit 放在右下角 |
| **F-2026-06-17-D-H-3** | editorMazeProvider.loadDraft schemaVersion:0 迁移 | ❌ **未修(继承)** | EditorMazeProvider 抛 `LevelLoadError: unknown schemaVersion`,但调用方只 catch 不展示 |
| **F-2026-06-17-D-M-1** | 算法生成关卡 pickup 位置完全随机,可能堵在出口前 | ❌ **未修(继承)** | 4 个 generator 都随机摆 pickup |
| **F-2026-06-17-D-M-2** | `_expandThickWall` 在 size=1 时会无限循环 | ❌ **未修(继承)** | `size < 3` 没提前报错 |
| **F-2026-06-17-D-M-3** | importExport.serializeLevel 不处理 tutorialSteps | ⚠ **已修(JSON.stringify 透传)** | `JSON.stringify` 透传全 MazeData 字段,tutorialSteps 保留;`nameToPreserve` 仍是 dead code(LOW 继承) |
| **F-2026-06-17-D-L-1** | `SCHEMA_VERSION` 双源(importExport.ts + EditorMazeProvider) | ❌ **未修(继承)** | 两处都写 `'1'`,一致但有重复 |
| **F-2026-06-17-D-L-2** | generator 注释 / AlgorithmMazeProvider.id 注释 | ❌ **未修(继承)** | 纯文档 |

---

## §3 本轮新 finding

### D-M-1(MEDIUM,继承)| `src/maze/AlgorithmMazeProvider.ts` | 算法生成关卡 pickup 位置完全随机,可能堵在出口前
- **影响**: 4 个 generator 都随机摆 pickup,出口前堵了 pickup 时玩家会被迫迂回,影响 progressive 难度递增体验
- **修复**: pickup 位置策略:出口 1 cell 半径内不放 pickup,起点 2 cell 半径内不放
- **F-tag**: `F-2026-06-17-D-M-1`(沿用上轮编号)

### D-M-2(MEDIUM,继承)| `src/maze/generators/_expandThickWall.ts` | `_expandThickWall` 在 size=1 时会无限循环
- **影响**: `size < 3` 没提前报错;虽然 size=1 真发生概率低(generator 都有 size ≥ 5 守卫),但 EditorMazeProvider / importExport 路径不守卫,可能传 size=1 进 generator
- **修复**: 入口加 `if (size < 3) throw new Error('size must be >= 3')`
- **F-tag**: `F-2026-06-17-D-M-2`(沿用上轮编号)

### D-L-3(LOW,新增)| `src/maze/types.ts` | `isEnemyAggression` 守卫缺失
- **影响**: P2-11 新加 `rules.enemyAggression` 字段允许 `'easy' | 'medium' | 'hard'`,但没有 `isEnemyAggression` 守卫函数(对比 `isPickupType` / `isVictoryType` / `isMazeSize` / `isLevelSource` / `isSurviveSeconds` 5 个守卫);`JsonMazeProvider.ts:265-268` 直接 `as` 强转
- **修复**: 在 types.ts 加 `isEnemyAggression(v: unknown): v is EnemyAggression` 守卫 + sanitizeFns 集合
- **F-tag**: `F-2026-06-17-D-L-3`

### D-L-4(LOW,新增)| `tests/unit/maze/importExport.test.ts` | importExport roundtrip 测试缺 P2-11 字段
- **影响**: 当前 importExport.test.ts 主要测 `SCHEMA_VERSION` + 序列化字段透传,但 P2-11 5 字段(i18n / tutorialSteps / hideMinimap / rules.enemyAggression / rules.requireAllPickups)未在 roundtrip 测试中显式断言。修后 level 的 exportEnvelope → import → validate 后字段应保持
- **修复**: 加 it.each P2-11 字段 roundtrip 断言,与 levels.test.ts:108-139 模式对称
- **F-tag**: `F-2026-06-17-D-L-4`

### 继承未修(无新 finding,记入 P3 候选)

| ID | 范围 | 备注 |
|---|---|---|
| `F-2026-06-17-D-H-1` | validateMaze 不报"未知字段"警告 | D-CRITICAL-1 同根 |
| `F-2026-06-17-D-H-2` | 算法生成关卡出口总在右下角 | 加 4 种出口位置策略(right-bottom / left-top / center / random) |
| `F-2026-06-17-D-H-3` | editorMazeProvider schemaVersion:0 → 1 迁移 | 加 `schemaVersion: 0 → 1` 的迁移函数 |
| `F-2026-06-17-D-L-1` | `SCHEMA_VERSION` 双源(importExport.ts + EditorMazeProvider) | 抽 `src/maze/schemaVersion.ts` 常量模块 |
| `F-2026-06-17-D-L-2` | generator / AlgorithmMazeProvider.id 注释 | 纯文档 |

---

## §4 验证结果

| Check | Result | 说明 |
|---|---|---|
| `npm run typecheck`(`tsc -b --noEmit`) | ✅ Pass | 0 error,0 warning |
| `npx vitest run tests/unit/maze/` | ✅ Pass | 14 files / 177 个全过 |
| 边界 `grep` 引擎 ⇄ UI 隔离 | ✅ 0 匹配 | generators 仍纯函数 |
| 4 个 generators 纯函数性 | ✅ 0 finding | recursiveBacktracker / kruskal / prim / huntAndKill + `_expandThickWall` |
| `_isReachable` 0 引用 | ✅ 确认 | 只有 `isReachable` 导出 |
| `importExport.serializeLevel` 透传 tutorialSteps | ✅ 已确认 | `JSON.stringify` 透传全 MazeData 字段 |
| 4 个 P2-11 字段透传 | ✅ 已修 | `JsonMazeProvider.ts:229-290` + `tests/unit/maze/levels.test.ts:108-139` |

---

## §5 唯一 layering inversion(继承,未修)

- `src/maze/JsonMazeProvider.ts:2` `import { PLAYER_RADIUS } from '../entities/Player'`
- 上轮 H-1 WONTFIX,P2-13 沿用 — `JsonMazeProvider` 应在 `maze` 域内可独立使用,不该依赖 `entities/Player`
- 修复:把 `PLAYER_RADIUS` 移到 `src/maze/constants.ts` 或 `src/utils/constants.ts`,JsonMazeProvider 与 Player 都从这里 import
- F-tag: `F-2026-06-17-D-L-5`(沿用,记入 P3)

---

## §6 Files Reviewed

| 文件 | finding 数 |
|---|---|
| `src/maze/types.ts` | 1 (D-L-3) |
| `src/maze/JsonMazeProvider.ts` | 0(上轮 D-CRITICAL-1 已修)+ 1 (D-L-5 layering inversion 继承) |
| `src/maze/AlgorithmMazeProvider.ts` | 1 (D-M-1 继承) + D-H-2 出口位置(继承) |
| `src/maze/EditorMazeProvider.ts` | 1 (D-H-3 继承) + D-L-1 SCHEMA_VERSION 双源(继承) |
| `src/maze/importExport.ts` | 1 (D-L-4 roundtrip 测试缺) + D-L-1 双源(继承) |
| `src/maze/builtInLevels.ts` | 0 |
| `src/maze/reachability.ts` | 0(已在 C 域 H-1 报告) |
| `src/maze/enemySpawner.ts` | 0(已在 C 域 M-3 报告) |
| `src/maze/generators/*.ts` | 1 (D-M-2 继承) + D-L-2 注释(继承) |
| `public/levels/*.json` | 0(P2-11 字段全过) |
| `tests/unit/maze/**` | 1 (D-L-4 roundtrip 测试) |
| **总计** | **4 (0/0/2/2)** + 7 继承 |
