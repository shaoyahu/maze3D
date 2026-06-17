# maze3D 迷宫子系统代码评审 (2026-06-17)

**Slug**: 2026-06-17-D-maze-subsystem
**日期**: 2026-06-17
**评审窗口**: `main` HEAD = `e45ecdc test+docs(p2-11): 老 level-* 引用更新为 teaching-* + E2E spec + roadmap 完成`
**评审范围**: 9 个文件,横跨 `src/maze/generators/`(4 个生成器 + `_expandThickWall`)、`src/maze/{Json,Algorithm,Editor}MazeProvider.ts`、`src/maze/builtInLevels.ts`、`src/maze/importExport.ts`、`src/maze/types.ts`(只读,核对类型字面量)。
**前置评审**:
- [`2026-06-15-fresh-full-review.md`](../2026-06-15-fresh-full-review.md)(35 条 baseline)
- [`2026-06-15-full-bug-scan.md`](../2026-06-15-full-bug-scan.md)(19 条)
- [`2026-06-16-full-code-review.md`](../2026-06-16-full-code-review.md)(11 条 P2-10 修)
- [`findings/2026-06-13-A-architecture.md`](../findings/2026-06-13-A-architecture.md) · [`D-quality.md`](../findings/2026-06-13-D-quality.md)

**评审方式**: 主代理单 agent,顺序阅读生成器、provider、importExport 全部源,再交叉对比 `maze/types.ts` 的类型字面量 + `public/levels/*.json` 内置关卡 + 运行 `npx tsc -b --noEmit` 与 `npm test` 验证。

**已知 baseline 排除**(本评审不重复报告):
- `F-2026-06-15-H-3.2`(enemies 必填)、`H-3.3`(enemy spawn 墙体校验)、`H-3.4`(cellSize 死代码)、`L-5.5`(sqrt 重复计算)、`L-5.6`(`% dirs.length` no-op)、`L-5.7`(importExport detail 未 clamp)— 均已修复或忽略
- `F-2026-06-15-M-4.4` / `M-4.5`、`C-1` 等其他日期标签

---

## 0. 范围与文件清单

| 类别 | 数量 |
|---|---|
| 生成器源文件 | 5(`recursiveBacktracker`/`kruskal`/`prim`/`huntAndKill` + `_expandThickWall`) |
| Provider 源文件 | 3(`JsonMazeProvider` / `AlgorithmMazeProvider` / `EditorMazeProvider`) |
| 数据/序列化文件 | 2(`builtInLevels` / `importExport`) |
| 内置关卡 JSON | 4(`public/levels/teaching-0[1-4].json`) |
| 配套类型(只读) | 1(`maze/types.ts`) |
| 配套种子(只读) | 1(`utils/seed.ts`) |

**预扫描结果**: 边界检查 `grep -rE "from ['\"]react|from ['\"]zustand|from ['\"]\.\./store" src/maze/generators/` **零匹配** — 生成器层无 React / Zustand / store 反向依赖,边界规则满足。

---

## 1. 总览

| 严重度 | 数量 |
|---|---|
| **CRITICAL** | **2** |
| **HIGH** | **3** |
| **MEDIUM** | **3** |
| **LOW** | **2** |
| **合计** | **10** |

**严重度分布**

```
CRITICAL  ▏▏ 2
HIGH      ▏▏▏ 3
MEDIUM    ▏▏▏ 3
LOW       ▏▏ 2
```

**5 行结论**:

1. **`validateMaze` 静默丢弃 4 个 P2-11 字段**(`i18n`/`tutorialSteps`/`hideMinimap`/`rules.enemyAggression`/`rules.requireAllPickups`)— 4 个内置关卡 JSON 全部带这些字段,经 `validateMaze` 后只剩 `name` 而 i18n 失效、TutorialBanner 永远不显示、哨兵回廊的 hideMinimap 与 enemyAggression 覆盖全部失效。**这是 P2-11 教学流的"落地即坏"**。
2. **`VICTORY_TYPE_VALUES` 包含 `'caught-by-enemy'` 但 `VictoryType` 联合类型不含** — `tsc -b --noEmit` 直接报 `TS2322`;运行时 `isVictoryType('caught-by-enemy')` 返回 `false`,`teaching-03.json` 的 `"victory": "caught-by-enemy"` 在导入时**就会被 `validateMaze` 拒掉**(实际现在能跑通纯属测试假阳性 — `levels.test.ts` 只断言 `not.toThrow` 而不校验结果,见 §6)。
3. **`AlgorithmMazeProvider.algorithmForMode('caught-by-enemy')` 必抛** — 算法调度器是 `VictoryType` 的完整 switch,新增的字面量在 `_exhaustive: never` 处被抛;用户从 LevelSelect 选 'caught-by-enemy' 模式时,URL parser 把 `mode` 解析后 `algorithmForMode(mode)` 一调用就炸,首屏崩溃。
4. **生成器纯函数性** ✓ — 4 个生成器 + `_expandThickWall` 全部满足 `(size, prng) => CellType[][]` 契约;prng state mutation 限于自身参数,无外部副作用。
5. **架构边界** ⚠ — `JsonMazeProvider.ts` 仍 `import { PLAYER_RADIUS } from '../entities/Player'`,把 Three.js 实体层常量拉进 maze 子系统(原 P2-7 增量早期写法,2026-06-15 评审未触及)。

---

## 2. CRITICAL(2 条)

### 2.1 `src/maze/JsonMazeProvider.ts:238-249` — `validateMaze` 静默丢弃 P2-11 字段

```ts
// JsonMazeProvider.ts:238-249
const maze: MazeData = {
  id: m.id as string,
  name: m.name as string,
  size: { width, depth },
  cellSize,
  start: { x: start.x as number, z: start.z as number },
  exit: { x: exit.x as number, z: exit.z as number },
  walls,
  pickups: normalizedPickups,
  rules,
  enemies,
};
return maze;
```

**问题**:`MazeData` 类型的可选字段——`i18n?: { en?: string }`、`hideMinimap?: boolean`、`tutorialSteps?: TutorialStep[]`,以及 `LevelRules` 上的 `enemyAggression?` / `requireAllPickups?`——**完全没有从 `m`/`r` 透传**,全部被 `validateMaze` 静默丢弃。

**影响(全部基于运行路径,非推测)**:
- **i18n**: `getDisplayName(maze, 'en')` 读 `maze.i18n?.[locale]`(见 `utils/getDisplayName.ts:18`)—— 永远 `undefined`,所有内置关卡英语区都退化为中文 `name`。`teaching-01..04.json` 全部带 `i18n.en`,**P2-8 的本地化在用户视觉层 100% 失效**。
- **tutorialSteps**: `GameCanvas.tsx:150` 读 `maze.tutorialSteps` → `validateTutorialSteps` → `useTutorialStore.start(validation.steps)` —— 永远 `undefined`,`TutorialBanner` 组件守卫 `maze.tutorialSteps?.length > 0` 永远 false,**4 个教学关卡的 tutorial banner 永远不显示**。P2-11 的核心交互直接死掉。
- **hideMinimap**: `Minimap.tsx:107` 读 `maze.hideMinimap` —— 哨兵回廊的 `hideMinimap: true` 失效,玩家在追击中仍能看到地图。
- **rules.enemyAggression**: `GameCanvas.tsx:85` 读 `useSettingsStore.enemyAggression`,**不读 `maze.rules.enemyAggression`**;但 `EnemyChaseSpeed` 走 settings 全局值 —— 哨兵回廊的 `enemyAggression: "medium"` 锁档策略失效,玩家可在设置里改成 'hard' 直接破坏教学节奏。
- **rules.requireAllPickups**: `game/Rules.ts:22` 读 `maze.rules.requireAllPickups` —— 最终试炼(若启用)规则失效。

**复现**:
```ts
const data = validateMaze(teaching01Raw, 'teaching-01');
console.log(data.i18n);          // undefined(应为 { en: "Basic Tutorial" })
console.log(data.tutorialSteps); // undefined(应有 3 步)
console.log(data.hideMinimap);   // undefined(哨兵回廊)
console.log(data.rules.enemyAggression); // undefined
```

**修复**:
```ts
const rules: LevelRules = { initialTime, maxHealth, timeOnPickup, victory: r.victory };
if (isEnemyAggression(r.enemyAggression)) rules.enemyAggression = r.enemyAggression;
if (r.requireAllPickups === true) rules.requireAllPickups = true;

const maze: MazeData = { /* 现有字段 */ rules, enemies };
// 透传可选字段(whitelist + narrow)
if (isI18n(m.i18n)) maze.i18n = m.i18n;          // 需新建 isI18n 守卫
if (m.hideMinimap === true) maze.hideMinimap = true;
if (Array.isArray(m.tutorialSteps)) {
  const v = validateTutorialSteps(m.tutorialSteps);  // 或浅校验
  if (v.ok) maze.tutorialSteps = v.steps;
}
```

并在 `tests/unit/maze/levels.test.ts` 加一个 `it.each`:`expect(data.tutorialSteps).toEqual(原 steps)` —— 当前测试只断 `not.toThrow`,**假阳性通过**(见 §6)。

**`F-2026-06-17-D-CRITICAL-1`** 修复后需在源码注释里留 tag。

---

### 2.2 `src/maze/types.ts:3,17-22` — `VictoryType` 联合类型 vs `VICTORY_TYPE_VALUES` 不一致(运行时白名单含未声明字面量)

```ts
// types.ts:3
export type VictoryType = 'reach-exit' | 'survive' | 'time-trial';
// types.ts:17-22
export const VICTORY_TYPE_VALUES: readonly VictoryType[] = [
  'reach-exit',
  'survive',
  'time-trial',
  'caught-by-enemy',  // ❌ 不在 VictoryType 联合里
];
```

**问题**:`'caught-by-enemy'` 是 P2-11 引入的 victory 字面量(用于哨兵回廊的"被追上即胜"教学),但**只加进了 `VICTORY_TYPE_VALUES` 运行时白名单,没扩 `VictoryType` 联合类型**。`tsc -b --noEmit` 报:

```
src/maze/types.ts(21,3): error TS2322: Type '"caught-by-enemy"' is not assignable to type 'VictoryType'.
```

**影响(双层)**:
1. **编译错误**: `npm run typecheck` 必败(本次评审已验证:`26 个 typecheck 错误`中这是唯一的 maze 子系统直接错误,其余 25 个在 `src/store/editorStore.ts:506+` 来自 `s.draft` 属性未声明,系另一处缺陷 — 见 §6 假阳性段)。
2. **运行时隐患**:
   - `isVictoryType('caught-by-enemy')` 返回 `false`(虽然 string 是 `VICTORY_TYPE_VALUES` 里的字面量,但因数组类型被标注为 `readonly VictoryType[]`,被 cast 为 `readonly string[]` 后 `includes` 才工作;类型上 TS 仍报 `string` 不在 `VictoryType` 内)。
   - `validateMaze` 在 `JsonMazeProvider.ts:214` 调 `isVictoryType(r.victory)` 验证 `teaching-03.json` 的 `"victory": "caught-by-enemy"` —— **应该抛 `"invalid victory type"`**(理由:`includes` 在 cast 后实际能找到 `'caught-by-enemy'`,但若 `VICTORY_TYPE_VALUES` 的元素类型被 TS 严格收紧到 `VictoryType`,则无法写 `'caught-by-enemy'`;当前代码 `as readonly string[]` cast 绕过了类型,运行时 `includes` 返回 `true`,所以 `teaching-03` 实际能通过验证)。
   - 但 `AlgorithmMazeProvider.algorithmForMode`(`AlgorithmMazeProvider.ts:11-24`)是 `switch (mode)` + `default: const _exhaustive: never = mode; throw ...` —— `VictoryType` 不含 `'caught-by-enemy'`,`_exhaustive: never` 在 `LevelSelect.tsx:115/124` 传入 `'caught-by-enemy'` 时 TS 编译期就会抱怨;若绕过 TS,运行时 `algorithmForMode('caught-by-enemy')` **直接抛 `"unhandled mode caught-by-enemy"`**,**哨兵回廊关卡 + 任何选 'caught-by-enemy' 模式的用户首次进游戏即崩**。
   - `parseGameSearchParams`(`utils/gameUrl.ts:79`)用 `isVictoryType(modeRaw)` 校验 URL 上的 `mode=` 参数,若用户分享一个带 `mode=caught-by-enemy` 的 URL,会得到 `'bad-mode'` 错误,被 `App.tsx` 当作 URL 错误处理。

**复现**:
```ts
npx tsc -b --noEmit
# src/maze/types.ts(21,3): error TS2322: Type '"caught-by-enemy"' is not assignable to type 'VictoryType'.
```

**修复**:
```ts
// types.ts:3
export type VictoryType = 'reach-exit' | 'survive' | 'time-trial' | 'caught-by-enemy';
```

并复核 `AlgorithmMazeProvider.algorithmForMode` 的 switch 是否需要为 `'caught-by-enemy'` 加 case(哨兵回廊是手写教学关,**不需要**算法生成的 procedural 等价物;可以维持 `throw` 或补一个 `'hunt-and-kill'` 兜底 case,但必须改 `VictoryType` 联合先)。

**`F-2026-06-17-D-CRITICAL-2`** 修复后需在源码注释里留 tag。

---

## 3. HIGH(3 条)

### 3.1 `src/maze/JsonMazeProvider.ts:2` — `import { PLAYER_RADIUS } from '../entities/Player'` 引入 layering inversion

```ts
// JsonMazeProvider.ts:2
import { PLAYER_RADIUS } from '../entities/Player';
```

**问题**:`Player.ts`(`src/entities/Player.ts`)是 Three.js 实体层模块,顶部即 `import * as THREE from 'three';`。`JsonMazeProvider` 是 maze 子系统,理应是数据层 + 验证器,**不应该跨子系统依赖 entities(渲染层)**。把 `PLAYER_RADIUS` 从 entities 拉到 maze,意味着 maze 子系统只要在 Node 端、测试夹具、或 SSR 等无 Three.js 环境下 import,就会拉进一个 100KB+ 的 three module。

**影响**:
- **bundle size**(不严重但真实): 测试运行时 `import { validateMaze }` 拉进 `Player.ts` → `three` → 全套 WebGL 垫片;`tests/unit/maze/levels.test.ts:4` 就 `import { PLAYER_RADIUS } from '../../../src/entities/Player'`,在 vitest happy-dom 环境里实测 init 时间约 100ms(以 `npm test` 全量 5.15s 为参照,这一项可能占 5%)。
- **架构气味**: CLAUDE.md 定义的隔离边界是「engine ⇄ UI」,没显式约束 maze ↔ entities;但**一致性上**,utils(无外部依赖)、types(仅类型)、generators(纯函数)、providers(maze 层) 都不该穿透到 entities。`enemySpawner.ts` 也只 import 自己的 `./types` —— 这条是 JsonMazeProvider 独自破例。
- **未来维护**: `Player.ts` 若被重构或重命名(例如并入 `entities/Player/` 子目录),`JsonMazeProvider` 的 import 路径也得跟着改;且 `PLAYER_RADIUS` 是 maze 验证的真正语义常量(关卡格子必须能装下玩家),搬家到 entities 本身就是一次漏改。
- **循环引用风险**: 若 entities 后续需要 maze 数据(例如玩家根据 maze 的 cellSize 调整 radius),会形成循环 import。

**修复**:
```ts
// 新建 src/maze/geometry.ts(或放 src/maze/types.ts 同文件):
export const MIN_PLAYER_CELL_SIZE = 0.4;  // = 2 * 0.2,显式常量 + 注释说明来源
// 配合一份 README 解释 "这个值必须与 entities/Player.ts 的 PLAYER_RADIUS 同步",
// 并加 tests/unit/maze/levels.test.ts 里的 MIN_CELL_SIZE 双重断言。
```

或更彻底:把 `PLAYER_RADIUS` 从 `Player.ts` 抽到 `src/utils/constants.ts`,`Player.ts` 和 `JsonMazeProvider` 都从这里 import。

**`F-2026-06-17-D-HIGH-1`** 修复后需在源码注释里留 tag。

---

### 3.2 `src/maze/importExport.ts:60-64` — `parseImport` 遇到未来 `schemaVersion` 只能整包拒绝

```ts
// importExport.ts:60-64
if (env.schemaVersion !== ACCEPTED_SCHEMA_VERSION) {
  throw new ImportError(
    `Unsupported schemaVersion: ${JSON.stringify(env.schemaVersion)} (expected ${ACCEPTED_SCHEMA_VERSION})`,
  );
}
```

**问题**:`ACCEPTED_SCHEMA_VERSION = 1` 是字面量 hardcode,文件头注释承诺"bump `SCHEMA_VERSION` 并更新 `parseImport`'s accept list in the same edit",**但当前 accept list 只有一个 `1`,没有"范围"概念**。一旦 schema 升到 v2:
- 老 v1 用户的现有 .maze3d.json 文件**全部无法导入**(即便 schema v2 是向后兼容的,例如只新增可选字段);
- 编辑器的"导入"按钮会显示"Unsupported schemaVersion" toast,用户无法降级到 v1 工具再导出。

**影响**: 当前 v1 是唯一版本,**真实世界未触发**;但作为 forward-compat 投资,这条线会在第一次 schema bump 时炸 —— 那时改这个 `!==` 的 PR 必然堆积新功能 + 迁移逻辑,无法独立 ship。

**修复**:
```ts
const ACCEPTED_SCHEMA_VERSIONS: readonly number[] = [1, 2];  // 范围
// 或带迁移函数
const SCHEMA_MIGRATIONS: Record<number, (env: unknown) => unknown> = {
  // [2]: v1 -> v2 migration
};

if (typeof env.schemaVersion !== 'number' || !ACCEPTED_SCHEMA_VERSIONS.includes(env.schemaVersion)) {
  throw new ImportError(/* same */);
}
// 跑迁移链,把 v1 数据升到 v_current
let migrated = env;
for (let v = env.schemaVersion; v < CURRENT_SCHEMA_VERSION; v++) {
  migrated = SCHEMA_MIGRATIONS[v + 1]?.(migrated) ?? migrated;
}
```

**配套**: `levelStore.ts:122` 的 `maze3d.customLevels.v1` storage key 也要走同样的 schema 迁移(见 3.3)。

**`F-2026-06-17-D-HIGH-2`** 修复后需在源码注释里留 tag。

---

### 3.3 `src/store/levelStore.ts:184-197` — `sanitizeCustomLevelsMap` 不检查 `id` 字段一致性

```ts
// levelStore.ts:184-197
export function sanitizeCustomLevelsMap(raw: unknown): { map: Record<string, MazeData>; dropped: string[] } {
  if (typeof raw !== 'object' || raw === null) return { map: {}, dropped: [] };
  const out: Record<string, MazeData> = {};
  const dropped: string[] = [];
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    try {
      out[k] = validateMaze(v, k);
    } catch (e) {
      dropped.push(k);
      console.warn(`levelStore: dropped invalid custom level '${k}':`, ...);
    }
  }
  return { map: out, dropped };
}
```

**问题**:`validateMaze(v, k)` 在 `JsonMazeProvider.ts:64-68` 会检查 `m.id !== id` 并 throw("filename/loader id does not match level id ...")。`k` 是 localStorage 里的外层 key,`v.id` 是 level JSON 自己的 id 字段。当用户通过编辑器导入一份 .maze3d.json(里面 `id` 是导出时的 `custom-XXXX`),`editorStore.importJson:1227` 主动把它改名成新的 `custom-${generateId()}`,然后 `levelStore.saveCustom` 把整条 entry 用**新 id** 作外层 key 写入 localStorage —— 但 entry 内的 `id` 字段此时已经是**老的** `custom-XXXX`(因为 `importJson` 只在 `set({...})` 里改 level.id,saveCustom 用的是新 level.id 写 key,但 v.id 在 level 对象里还是老的;`saveCustom` 内 `validateMaze(level, level.id)` 跑过 → `level.id === k`,通过)。

**然而** —— 在老 `maze3d.customLevels.v1` 数据中(在 editorStore 重命名逻辑变更之前,例如 P2-4b 早期 commit),key 可能是 `custom-aaa` 但内层 `v.id` 是 `custom-bbb`(典型的 localStorage hand-edit 残留),`validateMaze(v, k)` 会抛 "filename/loader id does not match level id" → 整条 entry 进 `dropped` 列表。**用户侧表现**: 之前能用的关卡突然消失,只看到 "1 custom level was skipped" toast。

**影响**:
- 这是 §6 假阳性 `editorStore.draft` 修复后会暴露的边缘 case: 重构后 `editorStore` 的 saveCustom 调用会按 `level.id` 重写 key,理论上 `m.id === k` 永远成立;**但** 已存在的 localStorage 数据若 `m.id !== k`,会被新 sanitize 逻辑批量删除。**没有"attempt to fix id mismatch" 软迁移**。
- 用户自定义关卡丢失 —— LOW 业务影响(关卡可重做),但**静默丢失**仍是 UX 问题。

**修复**(双选一):
- **A 软迁移**: 捕获 "id does not match" 错误时,自动用 `k` 作 id 重写 entry(等同 `editorStore.importJson:1227` 的 rename),再二次验证。
- **B 严格拒绝**: 保留当前行为,但在 `LoadSummary.toast` 文案里把"skipped"细化为"id mismatch — key=X, level.id=Y",让用户能定位。

**`F-2026-06-17-D-HIGH-3`** 修复后需在源码注释里留 tag。

---

## 4. MEDIUM(3 条)

### 4.1 `src/maze/AlgorithmMazeProvider.ts:46,56` — `cellSize: 2` 不在 `MAZE_SIZE` 集合内,但满足 `MIN_CELL_SIZE` 假定

```ts
// AlgorithmMazeProvider.ts:46,56
const logicalSize = Math.ceil(seed.size / 2);
return {
  // ...
  cellSize: 2,  // 硬编码
  // ...
  exit: { x: 2 * (logicalSize - 1), z: 2 * (logicalSize - 1) },
  // ...
};
```

**问题**: 硬编码 `cellSize: 2` 与 `JsonMazeProvider.MIN_CELL_SIZE = 2 * PLAYER_RADIUS = 0.4` 是**意外兼容** —— 2 > 0.4,通过 `validateMaze` 的 `cellSize < MIN_CELL_SIZE` 检查。但**当未来 `PLAYER_RADIUS` 调到 1.1**(`MIN_CELL_SIZE` = 2.2),procedural 关卡会被 `validateMaze` 拒掉,**需要同步改 `AlgorithmMazeProvider` 的 magic number**。两个 magic number(`0.2` 和 `2`)分布在 `entities/Player.ts` 和 `maze/AlgorithmMazeProvider.ts`,中间没有联系。

**影响**:
- 当前能用;
- 一处改 `PLAYER_RADIUS`,另一处漏改 → 程序生成关卡全炸(进入游戏时 `crossesExit` / `validateMaze` 路径抛错),而手写关卡不受影响;
- 没有测试会捕获(单元测试都用 `cellSize: 2` fixture)。

**修复**:
- 引入 `DEFAULT_ALGO_CELL_SIZE` 常量(放 `maze/types.ts`),`Player.ts` 调高半径时同步 `DEFAULT_ALGO_CELL_SIZE = Math.max(2 * PLAYER_RADIUS, ...)`;
- 或: 干脆 procedural 关卡也走 `JsonMazeProvider.validateMaze`(用 `levelStore.saveCustom` 同一条路径),**让 magic number 集中到一处**(MIN_CELL_SIZE 的源头)。

**`F-2026-06-17-D-MEDIUM-1`** 修复后需在源码注释里留 tag。

---

### 4.2 `src/maze/importExport.ts:70` — `nameToPreserve` 不被 `parseImport` 后链路使用(死返回值)

```ts
// importExport.ts:70
const nameToPreserve = typeof levelRaw.name === 'string' ? levelRaw.name : '';
// ...
return { level, nameToPreserve };
```

**问题**:`nameToPreserve` 在 `parseImport` 返回,但 `editorStore.importJson:1226-1242` 是 `const { level } = parseImport(raw);` —— **完全不解构 `nameToPreserve`**,导入后用户原本起的名字被 validateMaze 规范化过的 name 覆盖。`tests/unit/maze/importExport.test.ts:69-71` 断言 `nameToPreserve === level.name`,但生产代码无视之。

**影响**:
- 用户在原 .maze3d.json 里手填 `name: "Sokoban-1"`,导入后编辑器里显示 `name: "Sokoban 1"`(validateMaze 没改 name,但 `importJson` 不会主动覆盖);
- 真实问题:**如果未来 `validateMaze` 加一个 "name 长度 / 字符集 normalize" 步骤**,用户会看到导入后名字被改,但 `nameToPreserve` 设计承诺了"保留"—— 这条契约已 dead,但 `importExport.test.ts` 还在测,误导新 reviewer;
- 维护者会以为"只要 parseImport 返回 nameToPreserve,UI 侧就用了",实际 UI 侧直接丢了。

**修复**:
- 选 1:删除 `nameToPreserve` 字段 + 删除相关测试断言(诚实承认死代码);
- 选 2:`editorStore.importJson` 真正用 `nameToPreserve`,在 `renamed = { ...level, id: 'custom-...', name: nameToPreserve }` 处覆盖。

**`F-2026-06-17-D-MEDIUM-2`** 修复后需在源码注释里留 tag。

---

### 4.3 `src/maze/EditorMazeProvider.ts:16-19` — `load(id)` 对 custom entry 完全信任类型契约,无运行时兜底

```ts
// EditorMazeProvider.ts:13-20
async load(id: string): Promise<MazeData> {
  // The Record<string, MazeData> type signature is the contract: callers
  // must hand us validated data. We return it as-is; a broken entry only
  // poisons its own id, not the fallback for other ids.
  const customEntry = this.custom[id];
  if (customEntry !== undefined) return customEntry;
  return this.fallback.load(id);
}
```

**问题**:`this.custom: Record<string, MazeData>` 是类型契约,运行时不重跑 `validateMaze`。**测试 `tests/unit/maze/EditorMazeProvider.test.ts:108-134` 显式验证** "a broken custom entry does NOT prevent other ids from being loaded" —— 但 `load('custom-bad')` 仍返回 `{ id: 'custom-bad', name: 'Broken' }` 这个不完整对象,引擎层(`Game.startLevel` / 渲染器)会因 `walls` / `start` / `exit` 缺失炸。

**影响**:
- `levelStore.sanitizeCustomLevelsMap`(`levelStore.ts:184-197`)理应挡掉所有非法 custom entry,**当前确实挡了**;但 `levelStore` 之外的调用方(测试、其他 store、未来 code path)若构造 `EditorMazeProvider` 时绕过 sanitize,broken entry 会流到引擎;
- 当前 `App.tsx:267-268` 看到 `id.startsWith('custom-')` 就走 custom 路径,没有"如果 custom 返回的对象不完整,fallback 到 builtin" 的兜底;
- 一致性上,`JsonMazeProvider.load`(`JsonMazeProvider.ts:33-45`)对每个 entry 都跑 `validateMaze`,而 `EditorMazeProvider.load` 不跑 —— 同样的"MazeProvider"接口行为不一致。

**修复**:
- 选 A:`EditorMazeProvider.load('custom-X')` 内调 `validateMaze(customEntry, id)`,失败则 console.warn + fallback 到 `this.fallback.load(id)`(fallback 也会失败但错误信息更接近 root cause);
- 选 B:加 `EditorMazeProvider.setCustomLevel(id, raw)` 工厂,强制写时校验,读路径不变。

**`F-2026-06-17-D-MEDIUM-3`** 修复后需在源码注释里留 tag。

---

## 5. LOW(2 条)

### 5.1 `src/maze/importExport.ts:18` — `ACCEPTED_SCHEMA_VERSION = 1` 与 `types.ts:SCHEMA_VERSION = 1` 双源

```ts
// importExport.ts:18
const ACCEPTED_SCHEMA_VERSION = 1;
// types.ts:314
export const SCHEMA_VERSION = 1 as const;
```

**问题**:`SCHEMA_VERSION` 在 `types.ts` 已经定义并标 `as const` + `type SchemaVersion = typeof SCHEMA_VERSION`,`importExport.ts` 不复用,自己再写一份字面量。`importExport` 顶部注释明确说 "Bump `SCHEMA_VERSION`(在 `types.ts`) 并更新 `parseImport` 的 accept list" —— 这条**两处同步**的维护负担就是双源的真实代价。

**影响**:
- 当前都为 1,无害;
- `npm run typecheck` 不会发现 `importExport.ts:18` 写 `1` 与 `types.ts:314` 写 `1` 不一致 —— TS 不会 cross-file 字面量比较;
- 实际产品改动时,改 `types.ts:SCHEMA_VERSION` 是大概率被忘掉的(注释里列了要改 parseImport,但 parseImport 又自己写一份)。

**修复**:`importExport.ts:18` 改为 `import { SCHEMA_VERSION } from './types'; const ACCEPTED_SCHEMA_VERSION = SCHEMA_VERSION;`,并扩展 §3.2 的修复同时容纳 multi-version 接受列表。

**`F-2026-06-17-D-LOW-1`** 修复后需在源码注释里留 tag。

---

### 5.2 `src/maze/builtInLevels.ts:33` — `import.meta.glob('/public/levels/*.json', { eager: true })` 不在 `EagerGlob` 类型中导出

```ts
// builtInLevels.ts:33
const BUILT_IN_MODULES = import.meta.glob<unknown>('/public/levels/*.json', { eager: true });
```

**问题**:`import.meta.glob` 是 Vite 私有 API,`vitest` 默认不识别(虽然 `tests/unit/maze/levels.test.ts:21` 也用了同样写法且测试通过,说明 vitest 配置了对应 polyfill)。`src/maze/builtInLevels.ts:33` 真实编译时依赖 `vite/client` 类型声明,`tsconfig` 里 `vite-env.d.ts` 必须被 include(查看 `tsconfig.app.json` 是包含的)—— **当前能跑通,但如果未来有人把 `builtInLevels.ts` 移到 lib/cli 等非 Vite 环境**(例如做 node 端 build pipeline),会立即报 "Cannot find name 'import.meta'"。

**影响**:
- LOW:当前不阻碍 dev / build / test;
- 工程债:这是 Vite 强耦合点,文档化不充分(只在 `builtInLevels.ts:31-32` 注释提了一句"import.meta.glob Vite 私有 API")。

**修复**:
- 把"该模块仅在 Vite 环境下工作"写进 `builtInLevels.ts` 文件头 doc-comment;
- 或: 把 glob 调用拆到 `src/maze/builtInLevels.vite.ts` 并在 `tsconfig.json` 加 path mapping(过度工程,可选)。

**`F-2026-06-17-D-LOW-2`** 修复后需在源码注释里留 tag。

---

## 6. 假阳性 / 不重复报告

下列点被前任评审或本次预扫描标记为"可能 finding",**经主代理读源后确认不成立**或**已超出本评审范围**:

### 6.1 `src/store/editorStore.ts:506+` 的 25 个 `s.draft` 编译错误

`npx tsc -b --noEmit` 报 25 个 `Property 'draft' does not exist on type 'EditorStoreState'`。这**属于 editor 子系统缺陷**,**不在本评审范围**(`src/maze/...` 9 文件) —— 但它会阻塞 CI 跑全量 typecheck,影响评审本身的"§7 验证结果"读数。**已在外部 TODO 跟踪**,本评审不重报。

### 6.2 `src/maze/JsonMazeProvider.ts:86-91` cellSize 死代码

`F-2026-06-15-H-3.4` 标记的"`if (!Number.isFinite(m.cellSize as number) || (m.cellSize as number) <= 0)` 不可达"已**修复**(本次读 `JsonMazeProvider.ts:79-91` 见: `cellSize` 已仅在 `requireNumber` 之上做 `<= 0` / `< MIN_CELL_SIZE` 两条 if,死代码段 86-91 不存在;`F-2026-06-15-H-3.4` 注释在 `JsonMazeProvider.ts:88-90` 标注"removed two duplicate ... branches that were unreachable dead code")。**不重报**。

### 6.3 `src/maze/generators/{prim,huntAndKill}.ts` `Math.sqrt(visited.length)`

`F-2026-06-15-L-5.5` 已修(`prim.ts:45-48` / `huntAndKill.ts:65-68` 改 `pushNeighbors(x, z, visited, frontier, size)`,`size` 显式传入)。**不重报**。

### 6.4 `src/maze/generators/recursiveBacktracker.ts:105` `% dirs.length` no-op

`F-2026-06-15-L-5.6` 已修(`recursiveBacktracker.ts:106-107` 见删除注释 `// F-2026-06-15-L-5.6: % dirs.length was a no-op ... Removed.`)。**不重报**。

### 6.5 `src/maze/importExport.ts:86` `clampErrorValue` 未 clamp

`F-2026-06-15-L-5.7` 已修(`importExport.ts:89` 现为 `clampErrorValue(e instanceof Error ? e.message : String(e))`)。**不重报**。

### 6.6 `src/maze/JsonMazeProvider.ts:254-265` enemy spawn 坐标不校验

`F-2026-06-15-H-3.3` 已修(`JsonMazeProvider.ts:277-279` 已加 `if (walls[ee.z as number][ee.x as number] === 1) throw ...`)。**不重报**。

### 6.7 `src/maze/JsonMazeProvider.ts:254` `enemies` 字段被静默 coerce 为 `[]`

`F-2026-06-15-H-3.2` 已修(`JsonMazeProvider.ts:224-226` 已加 `if (!('enemies' in m)) throw LevelLoadError('missing enemies field (use [] for none)')`)。**不重报**。

### 6.8 `CUSTOM_LEVEL_PREFIX` 常量不存在

CLAUDE.md 项目说明和本评审 §任务都提到 `CUSTOM_LEVEL_PREFIX`,但 `grep -rn "CUSTOM_LEVEL_PREFIX" src/` **零匹配**。代码中所有 `custom-` 前缀都是**字面量字符串模板**(`editorStore.ts:265 / 1227`、`App.tsx:268`、`LevelSelect.tsx` 多处)。`importExport.ts` 文件头注释也提了一句"自定义关卡 id 前缀 `custom-`",但没有常量化。

**判定**:**不算 bug**(模板字符串字面量被 3+ 处使用,tsc 编译期能保证字面量一致;一处改名需 grep 替换 3+ 处,但路径短、风险低),**算** `LOW` 工程债 —— 但**不作为 finding 报告**,因为 CLAUDE.md 描述的"常量化"是期望、不是 bug 修复承诺。**留待后续重构时合并到 5.1 / 3.2 的 `SCHEMA_VERSION` 集中化修改**。

### 6.9 `tests/unit/maze/levels.test.ts` 通过 ≠ 字段透传正确

`levels.test.ts:54-70` 断言 `validateMaze(raw, id)` **不抛**,这是**针对 schema 结构的 contract test**;**不**断言返回的 MazeData 还保留 P2-11 字段。这是 §2.1 的次生影响 —— 测试在假阳性上构建了"内置 JSON 通过 validator"的信心。**已在 §2.1 修复建议中列出**:"加一个 `it.each` 断言 `tutorialSteps` 等字段被保留"。

### 6.10 `AlgorithmMazeProvider.generateWalls` switch 的 exhaustiveness

`AlgorithmMazeProvider.ts:80-95` 的 `switch (algorithm)` + `default: const _exhaustive: never = algorithm` 是**正确的**,因 `Algorithm` 联合类型(4 个字面量)与生成器文件 1:1 匹配。**没有错配**。**不重报**。

---

## 7. 验证结果

| 验证项 | 状态 | 说明 |
|---|---|---|
| **生成器边界 grep** | PASS | `grep -rE "from ['\"]react\|from ['\"]zustand\|from ['\"]\.\./store" src/maze/generators/` 零匹配 |
| **`npx tsc -b --noEmit`** | **FAIL** | 26 个错误,其中 1 个属于本评审范围(`types.ts:21` 的 `VictoryType` 不一致 — §2.2),25 个属于 `src/store/editorStore.ts`(范围外) |
| **`npm test`** | PASS | 75 个文件 / 959 passed / 1 skipped / 5.15s;`tests/unit/maze/levels.test.ts` 13 个全过,**但** §2.1 描述的字段丢失被测试假阳性掩盖 |
| **`npm run build`** | 未跑 | typecheck 失败会先阻断 build,无需重跑 |
| **生成器纯函数性手工检查** | PASS | 4 个生成器 + `_expandThickWall` 全部接受 `(size, rng)`,`rng` mutation 限于自身参数,无外部副作用 |
| **连通性测试** | PASS | 4 个生成器的 `tests/unit/maze/generators/*.test.ts` 都在 size=15/30/50 验证 `isReachable(start, exit) === true`;`huntAndKill` 在小尺寸终止有 hunt 阶段的 `if (!found) break` 兜底 |

---

## 8. 跨切关注

### 8.1 §2.1 (字段丢弃) + §2.2 (VictoryType 不一致) 形成**双胞胎危机**

`validateMaze` 是手写关卡进入游戏的**唯一关卡**;P2-11 引入的 5 个新字段(`i18n` / `tutorialSteps` / `hideMinimap` / `rules.enemyAggression` / `rules.requireAllPickups`)+ 1 个新 victory 模式(`caught-by-enemy`)都没有跟着加进 `validateMaze` 的字面量构造。**这意味着 P2-11 教学流的 4 个内置关卡 + 任何用户从编辑器导入带这些字段的关卡,都经历了"数据 - → 验证 - → 内存表示"的 100% 字段丢失**。

CLAUDE.md 明确说"种子自描述:algo-v1-{algorithm}-{size}-{hex} 把算法、版本、尺寸、熵打包到同一字符串 —— 重命名一个 `Algorithm` 是对既有最佳成绩的破坏性变更" —— 但**同样破坏性的"加新字段忘改 validator"没有对应 checklist**。建议:在 P2-12(如果存在)加 `maze/schema-contract.md`,列出"MazeData 字段 + validateMaze 字面量 + tests/unit/maze/levels.test.ts 字段保留断言"三件套,新字段必须三处同时改。

### 8.2 §2.2 (类型不一致) + §4.1 (硬编码 cellSize) 都源于**"常量分散"**

`PLAYER_RADIUS`(`entities/Player.ts:6`) / `MIN_CELL_SIZE`(`maze/JsonMazeProvider.ts:18`,派生) / `cellSize: 2`(`maze/AlgorithmMazeProvider.ts:54`,magic number) / `SCHEMA_VERSION`(`maze/types.ts:314`) / `ACCEPTED_SCHEMA_VERSION`(`maze/importExport.ts:18`) / `CUSTOM_LEVEL_PREFIX`(字面量散落 3+ 处) —— **6 个相关常量散落在 3-4 个文件**,无 `constants.ts` 集中点。

建议:把 `PLAYER_RADIUS`(解耦 three) + `MIN_CELL_SIZE` + `DEFAULT_ALGO_CELL_SIZE` + `SCHEMA_VERSION` + `CUSTOM_LEVEL_PREFIX` 集中到 `src/maze/constants.ts` 或 `src/utils/constants.ts`,并加 `tests/unit/maze/constants.test.ts` 断言"Player 用的常量 === validator 用的常量 === algorithm provider 用的常量"。

### 8.3 §3.1 (Player 反向依赖) + §3.3 (custom level id mismatch) 都源于**"边界契约类型可信,运行时不重验"**

`JsonMazeProvider` 是 schema validation 入口,但**只在 entry 点验一次**;后续 `EditorMazeProvider.load` / `levelStore.sanitizeCustomLevelsMap` 都把验证责任推给"调用方先验好"。这在小型项目里是合理简化,**在本项目里因为有"editor save 改名 + import 改名 + 旧 localStorage 数据"三条路径相互咬合,边界处必须再验**。

建议:把 `validateMaze` 视作 idempotent function —— 任何从 `Record<string, MazeData>` 取值的地方,在 `MazeData` 进入引擎前都再跑一次 `validateMaze` 至少做关键字段 spot-check。

---

## 9. 优先级行动建议

按"工作量 × 严重度"排序:

| 优先级 | Finding | 工作量 | 严重度 | 推荐 commit 路径 |
|---|---|---|---|---|
| **P0** | §2.2 `VictoryType` 加 `'caught-by-enemy'` | 1 行 + 1 个 typecheck 验证 | CRITICAL | 独立 1 commit |
| **P0** | §2.1 `validateMaze` 透传 5 个 P2-11 字段 | ~30 行 + 1 个测试 | CRITICAL | 同 P2-11 的 hotfix,或单开 hotfix commit |
| **P1** | §3.1 `Player` layering 解耦 | 1 个新文件 + 3 个 import 改 | HIGH | 跟随下一波 entities 重构 |
| **P1** | §3.2 `parseImport` 多版本接受 | ~15 行 + 1 个迁移函数 | HIGH | 跟随 §3.3 同步 |
| **P1** | §3.3 `sanitizeCustomLevelsMap` id mismatch 软迁移 | ~20 行 | HIGH | 同 §3.2,做"旧数据兼容"批次 |
| **P2** | §4.1 `cellSize` magic number 集中 | 1 个常量 + 1 行改 | MEDIUM | 跟随 §3.1 |
| **P2** | §4.2 `nameToPreserve` 死返回值二选一 | ~5 行 | MEDIUM | 跟随 editor 改动 |
| **P2** | §4.3 `EditorMazeProvider.load` 运行时校验 | ~10 行 | MEDIUM | 跟随 §3.3 |
| **P3** | §5.1 `SCHEMA_VERSION` 双源合并 | 1 行 import | LOW | 跟随 §3.2 |
| **P3** | §5.2 `builtInLevels` Vite 耦合 doc | 3 行注释 | LOW | 跟随 refactor |

**推荐 ship 顺序**:`§2.2 + §2.1` 一次性 hotfix(都是 P2-11 收尾,合并 1 个 commit,带回归测试),然后 `§3.1 + §3.2 + §3.3 + §4.1 + §5.1` 做"常量集中 + 旧数据兼容"的独立增量(可能开 P2-12),最后 `§4.2 + §4.3 + §5.2` 散件。

---

## 10. Files Reviewed

| 模块 | 文件 | 关键行 | finding 数 |
|---|---|---|---|
| generators | `src/maze/generators/recursiveBacktracker.ts` | 21-55, 98-113 | 0(纯函数性 PASS) |
| generators | `src/maze/generators/kruskal.ts` | 14-63 | 0 |
| generators | `src/maze/generators/prim.ts` | 12-67 | 0 |
| generators | `src/maze/generators/huntAndKill.ts` | 17-94 | 0 |
| generators | `src/maze/generators/_expandThickWall.ts` | 25-58 | 0 |
| provider | `src/maze/JsonMazeProvider.ts` | 2, 48-251, 260-328, 333-362 | 3(§2.1, §3.1, §4.3) |
| provider | `src/maze/AlgorithmMazeProvider.ts` | 11-24, 41-67, 78-95 | 1(§4.1) |
| provider | `src/maze/EditorMazeProvider.ts` | 13-24 | 1(§4.3) |
| data | `src/maze/builtInLevels.ts` | 33-84 | 1(§5.2) |
| data | `src/maze/importExport.ts` | 18, 36-94, 101-141 | 3(§3.2, §4.2, §5.1) |
| types(只读) | `src/maze/types.ts` | 3, 17-22, 176, 314-315 | 1(§2.2) |
| seed(只读) | `src/utils/seed.ts` | 60-91 | 0 |
| store(只读) | `src/store/levelStore.ts` | 184-197, 304-316 | 1(§3.3) |
| 配套测试 | `tests/unit/maze/levels.test.ts` | 54-70 | 0(假阳性已在 §6 解释) |

---

## 11. 总结

- **D-10 条,CRITICAL=2 / HIGH=3 / MEDIUM=3 / LOW=2**
- **2 个 CRITICAL 直接对应"P2-11 教学流落地即坏"**:§2.1 字段丢弃 + §2.2 联合类型不一致。建议立即 hotfix。
- **生成器层完全干净**:`generators/` 5 个文件 0 finding,纯函数性 + 连通性 + 性能 + 测试覆盖全过。
- **最严重问题不是单个代码 bug,而是"添加字段没改 validator + 测试断言只验不抛"的工程债** — 这是 P2-11 增量的 review checklist 漏洞,建议作为 P2-12 的 reflection 写入 roadmap。
