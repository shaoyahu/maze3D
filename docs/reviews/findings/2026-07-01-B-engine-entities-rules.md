# Finding B — Engine / Entities / Rules (2026-07-01)

**Reviewer**: caveman:cavecrew-reviewer (engine/entities/rules domain)
**Parent review**: [`../2026-07-01-full-code-review.md`](../2026-07-01-full-code-review.md)
**Scope**: `src/engine/**`, `src/entities/**`, `src/game/**`

## Confirmed Findings

### FCR-M-6: Rules.ts 三处缺 `cellSize <= 0` 防御 guard
- **Files**: [src/game/Rules.ts:29](../../game/Rules.ts#L29) (`crossesExit`) · [src/game/Rules.ts:40](../../game/Rules.ts#L40) (`findPickupAt`) · [src/game/Rules.ts:57](../../game/Rules.ts#L57) (`findTrapAt`)
- **Problem**: 三个函数都用 `maze.cellSize` 做除法 / 坐标换算,无 `cs <= 0` 防御。`Math.floor(point.x / 0) === Infinity`,`crossesExit` 永远 false,`findPickupAt` / `findTrapAt` 永远 null——**静默 bug**。
- **Mitigation today**: 上游 `JsonMazeProvider.validateMaze` 在 line 82-86 抛 `LevelLoadError`(已正确保护),所以正常运行下不会触发。
- **Severity rationale**: MEDIUM 而非 HIGH,因为上游是唯一入口;但如果未来 `EditorMazeProvider` / `AlgorithmMazeProvider` 直接构造 maze 而跳过 validate,这个 guard 缺失会引发"能进游戏但 exit 永远不触发"的幽灵 bug。Defense-in-depth 推荐补上。
- **Fix**: 每个函数顶部加 `if (cs <= 0) return false / null`,对齐 `shouldSurviveWin` (Rules.ts:193) 的 `surviveSeconds <= 0` 守卫风格。

### FCR-M-7: `DOOR_COLOR` 类型不严格
- **File**: [src/engine/Scene.ts:379](../../engine/Scene.ts#L379)
- **Problem**: `const DOOR_COLOR: Record<string, number> = {...}`,TypeScript 不强制 `red | blue | green | yellow` 全覆盖。新增 `KeyColor` 但忘了给 Scene 加条目 → 编译通过 → 运行时 fallback 到 0x555555 灰色,玩家看不出"门有色",只能凭"是否阻挡"判断——破坏 P2-18 设计意图。
- **Fix**: `const DOOR_COLOR = { red: 0xff5050, blue: 0x5fa8ff, green: 0x66dd66, yellow: 0xf0c040 } as const satisfies Record<KeyColor, number>;` 然后渲染处做 `DOOR_COLOR[keyColor] ?? 0x555555`(显式 fallback,显式 console.warn)。

### FCR-M-8: `InputManager.getMove()` 对角向量未归一化
- **File**: [src/engine/InputManager.ts:82-88](../../engine/InputManager.ts#L82-L88)
- **Problem**: 同时按 W+A 时 `{x: -1, z: -1}`,长度 √2 ≈ 1.41。`Player.update(dt)` 把它乘 `player.speed * dt`,对角移动比正交快 41%。
- **Fix**: 
  ```ts
  getMove(): Move {
    let x = 0, z = 0;
    // ... existing key checks ...
    const len = Math.hypot(x, z);
    if (len > 0) { x /= len; z /= len; }
    return { x, z };
  }
  ```

### FCR-L-13: `Loop.MAX_DT_SECONDS` 未导出
- **File**: [src/engine/Loop.ts:9](../../engine/Loop.ts#L9)
- **Problem**: `MAX_DT_SECONDS = 0.1`(10 FPS floor,防 tab 后台 spike)是模块私有。trap tick / enemy path recompute / 相机 lerp 都各自重新定义 0.1 或 0.05 阈值。
- **Fix**: `export const MAX_DT_SECONDS = 0.1`,并扫一遍 engine 内部重复 magic number。

### FCR-L-14: `disposeScene` 与 `Game.dispose()` enemies 清理冗余
- **Files**: [src/engine/Scene.ts:466](../../engine/Scene.ts#L466) · [src/engine/Game.ts:493](../../engine/Game.ts#L493)
- **Status**: 实际正确(`Scene.ts:466` 有 `enemies.length = 0`,子代理 B 初判误报)。但 Game.ts:367 注释 "drop the Enemy refs along with the scene" 暗示依赖 disposeScene,而实际是 Game.ts:499 的 `this.enemies = []` 在做——注释与实现不一致。
- **Fix**: Game.ts:367 注释改为"actual cleanup happens at line 499 via reassignment; disposeScene also zeros the array for defense-in-depth"。

## Verified Clean

- ✅ `Rules.shouldSurviveWin`(Rules.ts:193)`surviveSeconds <= 0` + `!Number.isFinite` 双重 guard 已覆盖
- ✅ `Rules.crossesExit` 隧道采样:start / end / mid-point 三采样点,正确应对 dt spike
- ✅ Enemy FSM(patrol / dwell / chase)状态机入队出队时机正确,F-2026-06-16-H-3 路径节点 NaN guard 已就位
- ✅ Player damage flow / invincibility frames / slow effect(P2-18)/ burn effect 集成正确
- ✅ Pickup 收集幂等(F-2026-06-16-M-2 已修)
- ✅ Trap triggers / door key consumption 走 Rules 纯函数,与 store 通过 `setSlowUntil` / `lastUnlockedDoorId` 协作
- ✅ Scene.dispose 通过 module-level `disposedTexs` Set 防跨调用重复释放 texture(F-2026-06-17-M-12 已修)
- ✅ Camera 鼠标 delta 已 cap 到 ±π 防后台 tab 切回 spin(F-L3 已修)
- ✅ Game.startLevel / dispose 流程:enemies / pickups / traps / doors 全部 dispose 后数组清零

## Subagent False Positives (corrected)

| 声称 | 实际 |
|------|------|
| `disposeScene` 跳过 `enemies.length = 0` | `Scene.ts:466` 已正确清零 |
| `Math.floor` snap 在 Rules 是 bug | Rules 用 `Math.floor` 仅用于 start.x/cs 这种几何映射,符合预期 |

## Coverage Gap (cross-ref to G-tests-coverage)

- `applySpawnTrigger`(Rules.ts:300)无直接单测,详见 G finding FCR-M-12。