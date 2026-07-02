# Finding C — Maze Subsystem (2026-07-01)

**Reviewer**: caveman:cavecrew-reviewer (maze domain)
**Parent review**: [`../2026-07-01-full-code-review.md`](../2026-07-01-full-code-review.md)
**Scope**: `src/maze/**`, `src/utils/tutorialValidator.ts`, `public/levels/*.json`

## Confirmed Findings

### FCR-H-3: `tutorialSteps` JSON loader 边界零保护
- **File**: [src/maze/JsonMazeProvider.ts:258-261](../../maze/JsonMazeProvider.ts#L258-L261)
- **Problem**: 
  ```ts
  if (Array.isArray(m.tutorialSteps)) {
    tutorialSteps = m.tutorialSteps as NonNullable<MazeData['tutorialSteps']>;
  }
  ```
  数组内每个 trigger 的 `kind` 判别字段 / `timeoutSec` 必填 / `id` 重复 / `messageKey` 非空**全未校验**。`validateTutorialSteps`(utils/tutorialValidator.ts:70)已完整实现且被 GameCanvas / EditorPropertiesPanel 调用,但 **loader 路径绕过它**。
- **Impact**: 玩家加载一个畸形 JSON 关卡 → 进入游戏后才在 console 看到 "Tutorial trigger has unknown kind: 'foo'"——而该关卡本应在 save/load 阶段就被拒绝。
- **Fix**:
  ```ts
  if (Array.isArray(m.tutorialSteps)) {
    const v = validateTutorialSteps(m.tutorialSteps);
    if (!v.ok) {
      throw new LevelLoadError(
        `Maze '${id}': invalid tutorial step (${v.index}): ${v.reason}`,
      );
    }
    tutorialSteps = m.tutorialSteps as NonNullable<MazeData['tutorialSteps']>;
  }
  ```

### FCR-L-4: `SCHEMA_VERSION` 迁移协议纯文档,无机械执行
- **File**: [src/maze/importExport.ts:3-6](../../maze/importExport.ts#L3-L6)
- **Problem**: 注释说"bump SCHEMA_VERSION + 同时更新 parseImport 的 ACCEPTED_SCHEMA_VERSION 列表"——但没有 lint / test / CI 钩子保证。如果未来加 SCHEMA_VERSION=2 但忘了更新 parseImport,envelope 直接 reject,用户看到 "Unsupported schemaVersion" 而无任何迁移提示。
- **Fix (可选)**: 加 `tests/unit/maze/importExport.migration.test.ts`,遍历 `1..N` 验证每个版本 envelope 都能被某个 parser 接受(或显式说明是 hard-break)。

### FCR-L-15: `Object.keys(localStorage)` polyfill 不完整
- **File**: [tests/setup.ts:7](../../tests/setup.ts#L7)
- **Problem**: polyfill 只实现 `clear / getItem / setItem / removeItem / key / length`,但 `Object.keys(localStorage)` 直接走 proxy 的 ownKeys trap,不调用 `key(i)`。目前无测试依赖此模式,所以无 fail;未来若加 migration 测试遍历所有 key,会得到空数组。
- **Fix**: polyfill 加 `ownKeys` / `getOwnPropertyDescriptor` trap,委托给 `key(i)`。

## Verified Clean

- ✅ `isPickupType` / `isVictoryType` / `isMazeSize` / `isLevelSource` / `isSurviveSeconds` / `isTrapKind` / `isKeyColor`(P2-18 新增)—— 全部白名单类型守卫覆盖
- ✅ 4 个生成器(recursiveBacktracker / kruskal / prim / huntAndKill)全部 `(size, prng) => walls: CellType[][]` 纯函数
- ✅ `_isReachable` BFS 正确,O(n)
- ✅ `_expandThickWall` 边界 midpoint 计算 `(2*ax + 2*bx) >> 1 === ax + bx` 对邻居 logical cell 成立;奇数 size 边界 OK
- ✅ `AlgorithmMazeProvider.logicalSize = Math.ceil(seed.size / 2)`,exit placement 正确
- ✅ `enemySpawner.ts:63` deterministic sort + bounded `candidates.length ≤ width*depth` ≤ 2500
- ✅ `EditorMazeProvider`(maze/EditorMazeProvider.ts:13-24)wraps JsonMazeProvider + custom precedence;`CUSTOM_LEVEL_PREFIX = 'custom-'` 一致
- ✅ `JsonMazeProvider.validateMaze` 在 cellSize / size / victory / start-exit 都有强校验
- ✅ Built-in 加载 8 个 `teaching-XX.json`,import.meta.glob eager 模式

## Subagent False Positives (corrected in §6 of main review)

| 声称 | 实际 |
|------|------|
| `public/levels/teaching-07.json` exit 不可达 | **Node BFS 验证:REACHABLE** |
| `validateTutorialSteps` 从未被调用 | GameCanvas.tsx:187 + EditorPropertiesPanel.tsx:1324 调用,**只是 loader 漏** → 升级为 FCR-H-3 |
| `isSurviveSeconds` 是 dead code | LevelSelect.tsx:143 实际使用,与 `isValidSurviveSeconds` 是 API 双胞胎 |

## Subagent True Negatives (verified 不存在)

- ✅ `public/levels/` 不包含 CLAUDE.md 文档化的 4 个 fixture(`level-small` / `level-tiny` / `level-tiny-pickups` / `level-tiny-enemy`)——这是事实,但根因是 P2-11 教学关重设计时已替换为 `teaching-XX.json`,CLAUDE.md 表头需要同步(归到 E finding 或在 P2-19 cleanup 收口)。E2E spec 仍引用旧 fixture id → 见主报告 FCR-C-2。