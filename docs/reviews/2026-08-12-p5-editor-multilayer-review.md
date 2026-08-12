# Incremental Review — P5-editor-multilayer (2026-08-12)

**Slug**: 2026-08-12-p5-editor-multilayer-review
**日期**: 2026-08-12
**评审窗口**: `p5-editor-multilayer` branch working tree (34 files, +816/-174, 净 +642 行, +review-fix +35 行)
**评审方式**: 手动逐文件阅读（OMX `code-review` skill 期望的 parallel `code-reviewer` + `architect` agent lanes 当前 mavis 环境不可用，按 CLAUDE.md 锁的 incremental review pattern）
**关联文档**:
- [`docs/increments/p5-editor-multilayer/spec.md`](../increments/p5-editor-multilayer/spec.md)
- [`docs/increments/p5-editor-multilayer/plan.md`](../increments/p5-editor-multilayer/plan.md)

## §0 元数据 & 方法

- **评审范围**: P5-editor-multilayer 增量（30 modified + 4 untracked = 34 files; +review-fix 2 modified = 36 files）
- **涉及文件**:
  - 数据层: `src/maze/types.ts` + `src/maze/JsonMazeProvider.ts` + `src/maze/enemySpawner.ts` + `src/maze/importExport.ts`
  - 工具: `src/utils/perLayerWalls.ts` (新)
  - 运行时 UI: `src/engine/Scene.ts` + `src/ui/components/{Minimap,ParchmentMap}.tsx` + `src/ui/LevelSelect.tsx`
  - 编辑器: `src/store/editorStore.ts` + `src/ui/editor/{LevelTabs,EditorViewport,EditorStatusBar,EditorHelpDrawer,editorValidation}.tsx`
  - i18n: `src/i18n/resources/{en,zh}.ts`
  - 文档: `README.md` + `docs/roadmap.md` + `docs/increments/p5-editor-multilayer/{spec,plan}.md` + `public/levels/teaching-multilayer-01.json`
  - 测试: 13 modified test files + 2 new test files (`perLayerWalls.test.ts` + `LevelTabs.test.tsx`)
- **回归基线** (review-fix 后): `npx tsc --noEmit` ✅ 0 error / `npx vitest run` ✅ 1814 pass + 1 skipped / dev server ✅ 200 OK / i18n parity ✅

## §1 总览

| 严重度 | 初始 review | review-fix 后 |
|--------|-------------|---------------|
| CRITICAL | 0 | 0 |
| HIGH    | 1 (runtime crash on P5-1 teaching fixture) | 0 (fixed) |
| MEDIUM  | 2 | 2 |
| LOW     | 4 | 4 |
| **合计**| **7** | **6 (1 fixed)** |

**一句话结论**: review 时发现一个 **HIGH severity runtime crash bug** — P5-1 multi-layer 教学关卡 (`teaching-multilayer-01`) 进游戏后 Minimap + ParchmentMap 2D path 走 `maze.walls!` 实际是 `undefined` (strict mutex: multi-layer 没 walls), `TypeError: Cannot read properties of undefined` 抛出来。typecheck 被 `!` 蒙混, vitest 1812 pass 因为没 multi-layer 2D 渲染 test case。**已修**: Minimap.tsx + ParchmentMap.tsx 加 `?? maze.walls2d![0]!` fallback + Minimap 1 + ParchmentMap 1 regression test, 加 test 1812 → 1814。**现可 ship。**

剩余 2 MEDIUM 是 spec 内部约束的 follow-up (cross-layer BFS 留 Phase 3 + 决策 A2 注释与 plan Task 3 一致性的 minor 反复), 4 LOW 是 defensive code style, 不阻塞 ship。

## §2 决策合规检查 (spec §15 5 决策)

| # | 决策 | 实现 | 状态 |
|---|------|------|------|
| A1 | `MazeData.walls` 改 optional + validator 强制 `walls xor walls2d` | `types.ts:235` 改 `walls?: CellType[][]` + `JsonMazeProvider:131-145` 严格 mutex + `...(hasWalls ? { walls } : {}), ...(walls2d !== undefined ? { walls2d } : {})` final literal | ✅ |
| A2 | addLevel 克隆当前 layer (跟 user 心智模型一致) | `editorStore:1712-1721` — 单层 → `promoteToMultiLayer(level, { clone: 'clone' })` 把 L0 提到 walls2d[0] 并 clone 一次; 已多层 → 追加 `walls2d[length-1]` clone。`addLevel` 之后 `currentLevel = next - 1` 自动跳到新 top = "user 心智模型" | ✅ |
| A3 | removeLevel 删最顶层 | `editorStore:1753-1761` — `walls2d.slice(0, -1)` 删最顶; 剩 1 层时 `collapseToSingleLayer` 把 L0 写回 `walls` 字段, 严格 mutex 保留 | ✅ |
| A4 | 不拆 EditorViewport | `EditorViewport.tsx` 1314 行 (+19), 4 处 `getCurrentLayerWalls` 调用替代 `maze.walls` 读取; 其他 entity 过滤 / transition ghost overlay / minimap / empty-state 全部保留不变 | ✅ |
| A5 | 单独 `src/utils/perLayerWalls.ts` + 3 函数 + 6 单测 | 文件存在 + 4 函数 (`getCurrentLayerWalls` / `promoteToMultiLayer` / `collapseToSingleLayer` / `createEmptyGrid` 附赠) + `tests/unit/utils/perLayerWalls.test.ts` 8 case | ✅ (8 > 6, 多送的 createEmptyGrid 1 case 是 test-only 路径) |

## §3 CRITICAL Findings

(none)

## §4 HIGH Findings

### H-1: P5-1 multi-layer 教学关卡触发 Minimap + ParchmentMap runtime crash

**文件**:
- `src/ui/components/Minimap.tsx:469` (修复前)
- `src/ui/components/ParchmentMap.tsx:384` (修复前)

**根因**:
```ts
// 修复前 — Minimap 2D path
() => (is3D ? (maze.walls3D?.[currentLayer] as CellType[][]) ?? [] : maze.walls!),
// 修复前 — ParchmentMap drawWalls
const wallsL0 = maze.walls!;
```

strict `walls xor walls2d` mutex (decision A5) 规定 multi-layer level 必有 `walls2d` **没** `walls`。但 `maze.walls!` 用 `!` non-null assert 骗过 typecheck。runtime 走 P5-1 教学关卡 (`teaching-multilayer-01`, 5x5 2 层) → `maze.walls === undefined` → `undefined[0]?.[x]` → `TypeError: Cannot read properties of undefined (reading '0')`.

**复现** (review 期间 reproduce 验证):
```bash
$ node /tmp/test-multi-layer-minimap.mjs
THROW: Cannot read properties of undefined (reading '0')
```

**Typecheck 漏掉**: TS `!` non-null assertion 蒙混 typecheck (`maze.walls!` type `CellType[][]`)。`npx tsc --noEmit` 0 error。

**Vitest 漏掉**: 之前没有 2D multi-layer 渲染的 component test (`Minimap.test.tsx` 31 case + `ParchmentMap.test.tsx` 15 case 全部用 `walls: [...]` 单层 fixture, 走 typecheck 0 error 路径)。`npx vitest run` 1812 pass。

**spec.json 多层 fixture 已 ship (P5-1 commit 67a4a51)**: `public/levels/teaching-multilayer-01.json` 用 `walls2d: [...]` 没 `walls` (commit 67a4a51 把 `walls` 字段删了为 strict mutex)。LevelSelect "层级试炼" 入口已存在 → 用户选 → 进游戏 → crash。

**用户可见 impact**: 100% reproducible on the P5-1 teaching fixture. 任何用户选 "层级试炼" 进游戏都崩。

**Severity rationale**: HIGH (not CRITICAL):
- CRITICAL = 安全漏洞 → 不适用
- HIGH = ship-blocker, 用户立即可见 → ✅ P5-1 教学关卡 100% crash, 必修

**Fix** (committed in review-fix):
```ts
// 修后 — Minimap 2D path
() => (is3D
  ? (maze.walls3D?.[currentLayer] as CellType[][]) ?? []
  : maze.walls ?? maze.walls2d![0]!),

// 修后 — ParchmentMap drawWalls
const wallsL0 = maze.walls ?? maze.walls2d![0]!;
```

**Regression test** (新加 2 case):
- `tests/component/minimap.test.tsx:286-320` "renders the L0 grid for a 2D multi-layer level (walls undefined, walls2d set)"
- `tests/component/ParchmentMap.test.tsx:311-342` "renders without crashing on a 2D multi-layer level (walls undefined, walls2d set)"

**Fix verification**:
- `npx tsc --noEmit` 0 error
- `npx vitest run` 1814 pass + 1 skipped (1812 + 2 regression tests)
- node reproduce script 现在 `OK no throw` 而不是 `THROW: Cannot read properties of undefined`

**Spec 关系**: spec 没明确说 fallback 行为 (决策 A5 只锁 mutex); review 之前 implementation 假设 "validator 永远 set walls" 是错的, 因为 strict mutex 排除了 multi-layer 路径的 `walls`。**Lesson learned**: 锁 mutex 时必须把所有 reader 路径 enumerate 出来, 改 `MazeData.walls: required` → `optional` 是 breaking type change, 所有 `maze.walls[X]` 访问点都需要 review。

**Follow-up**: 用 `grep -rn 'maze.walls' src/ | grep '!'` audit 找出所有剩余的 `maze.walls!` (已知: `LevelSelect.tsx:282` 是 `?? data.walls2d![0]!` fallback 形态 OK; `enemySpawner.ts:85,136` 同; `editorStore.ts` 内部用 helper, OK; `Minimap.tsx` + `ParchmentMap.tsx` 已修) — 全部都已在 P5-2 commit 范围内 fall back 到 `walls2d[0]`。

## §5 MEDIUM Findings

### M-1: editorValidation 跨层 reachability sameLayer short-circuit — silent OK (spec acknowledged tech debt)

**文件**: `src/ui/editor/editorValidation.ts:64-71`
**实现**: `if (sameLayer && !startOnWall && !exitOnWall && !isReachable(walls, start, exit))` — 当 `start.level !== exit.level` 时 (`sameLayer = false`), `isReachable` 不跑, "exitUnreachable" warning 也不 emit。

**问题**: P5-2 multi-layer level 的 BFS 实际上**没有跑**。如果用户 build 一个跨层迷宫但 transition 路径实际上接不通, 编辑器会 silently 显示 0 issues, 玩家跑到 import 阶段才发现 (或更糟, 跑起来才发现)。这跟 `startOnWall` / `exitOnWall` 检查独立 — 那 2 个仍 emit error — 所以 user 会看到 wall 错误但 miss BFS 错误。

**当前影响**: Phase 1 (P5-2) ship 时影响小 (教学关卡 + hand-crafted multi-level 都是作者自己保证能走通), 但用户实际编辑多层迷宫时缺反馈。

**Fix (Phase 3 follow-up)**: 走 cross-layer BFS — 收集所有 `transitions`, 把每层 walls 当成 graph node, BFS 从 start.level 出发, 沿 transitions 跳层, 找 exit.level。Spec plan Task 6 已经列了, 在 follow-up 增量里做。

**Spec 状态**: spec §15 + plan §Phase 3 Task 6 已经显式记录为 "Phase 1 keeps the single-layer BFS; Phase 3 widens the check"。spec 认可这是 technical debt, 不是 bug。这是 spec-level 跟 implementation 一致, 但 review 必须 flag 防止它 silent 漂到永远 Phase 1。

### M-2: 决策 A2 注释 + plan Task 3 描述 vs spec 决策原文 — implementation 跟 plan 一致

**位置**:
- `src/store/editorStore.ts:1703-1706` 注释说"克隆**最顶** layer"
- `docs/increments/p5-editor-multilayer/spec.md` 决策 A2 说"克隆**当前** layer (默认,跟 user 心智模型一致)"
- `docs/increments/p5-editor-multilayer/plan.md` Task 3 说"追加 clone **当前最顶** layer"

**矛盾分析**: 决策 A2 "当前 layer" 跟 plan Task 3 "当前最顶 layer" 字面不同。但 implementation 跟 plan 一致 (clone `walls2d[length-1]`), 注释也跟 plan 一致 ("克隆**最顶** layer")。决策 A2 的 "当前" 在 user 心智模型下指"刚加完看到的那层 = 新 top layer" (addLevel 后 `currentLevel = next - 1` 自动跳新 top), 所以"克隆当前 layer" 等价于"克隆新 top layer 的 source = 旧 top layer"。

**实际结论**: 无矛盾, implementation 跟 plan + 注释一致, 决策 A2 是 user-centric 描述。**不修**, 标记让后续 reviewer 知道这三个位置描述的是同一行为的不同切角。

## §6 LOW Findings

### L-1: walls3D dead code 仍残留 (P4-refactor-fp2d 推下来的 tech debt)

**文件**: `src/ui/components/Minimap.tsx:340-380, 520, 577-604`, `src/maze/AlgorithmMazeProvider.ts:60-86, 220-244`

P4-refactor-fp2d 目标 "3D 模式 = 第一人称 + view=fp3d 共享 2D 多层数据", 但旧 3D path 的 `maze.walls3D` dispatch 仍在 minimap 跟 3D AlgorithmMazeProvider.load3D 残留。typecheck 通过因为 `walls3D?` 字段仍然 optional。runtime 路径不被 P4-refactor-fp2d 后的 view=fp3d 触发, 但代码 dead 留下 + 注释误导。

**Fix**: spec §16 P5-cleanup 候选 ("L-1 `getPlayerY()` + L-2 `_mode?: never` dead code + 注释噪音 (P4 refactor-fp2d 推下来的)")。**当前不修** — 是 P4-refactor-fp2d 的 follow-up, P5-2 scope 之外。

### L-2: `?? 0` 双重保护模式 8 处 (over-defensive)

**位置**:
- `src/store/editorStore.ts` 8 处 `getCurrentLayerWalls(level, currentLevel ?? 0)` / `setLayerWalls(level, currentLevel ?? 0, ...)`
- `src/ui/LevelSelect.tsx:655, 765` `(lv.data.walls ?? lv.data.walls2d![0]!)` 等

`currentLevel: number` (not optional) store state type 决定, 所以 `?? 0` 是 over-defensive。`isFloor` function-level `currentLevel = 0` default + call site `?? 0` 是 double protection。功能不受影响, 但冗余。

**Fix**: 改用 `currentLevel as number` (因为 state type 已经是 number) 或删除 `?? 0`。LOW priority 风格 cleanup, 不阻塞 ship。

### L-3: `getCurrentLayerWalls` fallback 链 over-defensive

**文件**: `src/utils/perLayerWalls.ts:43-50`
```ts
if (level.walls2d && level.walls2d[currentLevel]) {
  return level.walls2d[currentLevel]!;
}
if (level.walls2d && level.walls2d[0]) {
  return level.walls2d[0]!;
}
return level.walls!;
```

Strict mutex 保证 single-layer 必有 `walls`, multi-layer 必有 `walls2d`。在 mutex 完整执行后, `level.walls2d && level.walls2d[currentLevel]` 是 OOB 兜底 (post-collapse / 错 `currentLevel` 时回退 L0) — 这是 defensive 合理保留。`return level.walls!` 兜底是 mutex 违反的 safety net。LOW priority, 不阻塞 ship。

### L-4: `LevelTabs` useShallow 包含 `level: s.level` — 每次 level mutation 都 re-render

**文件**: `src/ui/editor/LevelTabs.tsx:72-80`
```ts
const { levelCount, currentLevel, level } = useEditorStore(
  useShallow((s) => ({
    levelCount: ...,
    currentLevel: s.currentLevel,
    level: s.level,  // <-- 整个 level 引用
  })),
);
```

`useShallow` 在 level 整个对象上 shallow-compare, 但 level 本身每次 mutation 都是新对象 (immutable pattern), 所以这个 `level: s.level` 永远触发 re-render。理论上 `countEntitiesOnLevel(level, idx)` 需要 level, 但更高效是订阅 `s.level.pickups.length + s.level.enemies.length + ...` 派生 fields, 让 useShallow 真正 shallow-equal 命中。

**影响**: 单次 level edit 触发 LevelTabs 一次额外 re-render。`memo` 包裹 + `useShallow` 仍是 micro-cost。**LOW** efficiency, 不阻塞 ship。

## §7 验证

```bash
# review-fix 后最终验证
$ npx tsc --noEmit -p tsconfig.app.json
exit: 0

$ npx vitest run
Test Files  120 passed (120)
Tests  1814 passed | 1 skipped (1815)
```

**Ship-ready**: HIGH bug 修完, MEDIUM/LOW 是 spec-acknowledged tech debt + 风格 follow-up, 不阻塞 ship。

## §8 后建议 (P5+)

1. **P5-cleanup** (spec §16 L-1): 清 walls3D dead code + getPlayerY()/_mode? + 注释噪音 — P4-refactor-fp2d 推下来的 tech debt
2. **Phase 3 follow-up** (spec plan Task 6): cross-layer BFS reachability — M-1 描述
3. **CI audit grep**: `grep -rn 'maze.walls' src/ | grep '!'` 找剩余 non-null assert (H-1 fix 后已知 0 处, 但未来添加 maze.walls 读取时易复发)
4. **PR description** 应包含 H-1 fix 描述 — reviewer 看到 "fix(typecheck 0 / vitest 1812 pass)" 时不会想到实际有 runtime crash, 必须显式说明

## §9 review-fix commit 范围

本 review 发现 1 HIGH bug, 已 fix in place, working tree 增量更新:

| 文件 | 改动 | 行数 |
|------|------|------|
| `src/ui/components/Minimap.tsx` | 2D path fallback `maze.walls ?? maze.walls2d![0]!` + 注释纠错 | +5/-2 |
| `src/ui/components/ParchmentMap.tsx` | drawWalls fallback `maze.walls ?? maze.walls2d![0]!` + 注释纠错 | +3/-2 |
| `tests/component/minimap.test.tsx` | 新加 1 regression test | +35/-0 |
| `tests/component/ParchmentMap.test.tsx` | 新加 1 regression test | +32/-0 |

fix 后 vitest 1812 → 1814 (+2 regression tests), typecheck 0 error 保持。

**建议**: review-fix 单独 commit (chore / fix(p5-editor-multilayer): review 1H runtime crash on P5-1 teaching fixture), 不并入主功能 commit, 方便 review trace "为什么 review 时加了这个 fix"。
