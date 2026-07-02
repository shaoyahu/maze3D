# Finding D — Stores & Persistence (2026-07-01)

**Reviewer**: caveman:cavecrew-reviewer (store domain)
**Parent review**: [`../2026-07-01-full-code-review.md`](../2026-07-01-full-code-review.md)
**Scope**: `src/store/**`

## Confirmed Findings

### FCR-L-1: `bestByLevel` 主键与 spec 描述偏离
- **File**: [src/store/levelStore.ts:468](../../store/levelStore.ts#L468)
- **Status quo**: `bestByLevel: Record<string, BestRecord>`,key 仅 `levelId`。
- **Spec describes**: "(source, id, mode, survive, enemies, progressive) 复合 key"。
- **Why it's actually OK**: URL-as-identity 设计——`levelId` 对程序生成关卡 = `algo-v1-${algorithm}-${size}-${hex16}`,内含 algorithm / size / entropy 但不含 mode / enemyCount / surviveSeconds / progressive。同一 maze 用不同 mode 玩,`levelId` 相同 → 共享一条 best。
- **True impact**: 两盘同一 maze 一玩 reach-exit 一玩 survive,第二盘完成会**覆盖**第一盘的最佳成绩——而玩家直观期待两个 mode 各有 best。
- **Fix (二选一)**: 
  1. **改 key**:`Record<string, BestRecord>` → `Record<string, Record<RunConfigKey, BestRecord>>`,RunConfigKey = `${mode}|${surviveSec}|${enemyCount}|${progressive}`。
  2. **改 spec**:在 `docs/roadmap.md` / `src/store/levelStore.ts` 注释里明确"URL-as-identity → best per maze identity, mode 不参与"。

### FCR-L-2: `saveCustom` 验证改 id 致 localStorage 孤儿 key
- **File**: [src/store/levelStore.ts:506-517](../../store/levelStore.ts#L506-L517)
- **Status**: `validateMaze(level, level.id)` 返回的 data 可能 id 不同(规范化后)。`saveCustom` 把新 id 当 key 写,但旧 id 下的 entry 仍留在 localStorage,成死键。
- **Impact**: localStorage 累积孤儿键,不正确性;quota 略微消耗。
- **Fix**: 写新 key 前先 delete 旧 key(if `data.id !== level.id`)。

### FCR-M-9: `moveFolder` vs `deleteFolder` 对 `DEFAULT_FOLDER_ID` 处理不一致
- **Files**: [src/store/levelStore.ts:683-726](../../store/levelStore.ts#L683-L726) · [src/store/levelStore.ts:593-627](../../store/levelStore.ts#L593-L627)
- **Status**: `moveFolder(DEFAULT_FOLDER_ID)` 静默 `return false`;`deleteFolder(DEFAULT_FOLDER_ID)` 同样静默,但**会** `console.warn`。两者 user-facing 一致,dev console 一致——dev-visible 但 UX 不一致。
- **Fix**: 任一方向统一即可。推荐 `moveFolder` 也加 `console.warn`,便于未来回归测试。

### FCR-H-2: P2-18 `setSlowUntil` store action 无直接单测
- **File**: `src/store/gameStore.ts` `setSlowUntil` / `slowUntil` 字段
- **Status**: `computeSlowMultiplier`(Rules 纯函数)有测试。Game.test / Game.parchment.test / Game.rebalance.test 全部 mock `getPlayerSpeedMultiplier: () => 1`。**store action 自身行为零覆盖**——写入、过期归零、与 `lastHitBy` 协作、与 `lastUnlockedDoorId` 协作都没被验证。
- **Fix**: 加 `tests/unit/store/gameStore.p2-18.test.ts`,覆盖:
  1. 进水域 → `setSlowUntil(now + 3000)` → `slowMultiplier` 派生 = 0.5
  2. 过期后(模拟时钟推进)→ 1.0
  3. 连续两次 `setSlowUntil` 取较大值(累加上限语义)

## Verified Clean

- ✅ `gameStore.goToMenu`(gameStore.ts:559-598)正确重置 `currentMode: 'reach-exit'` / `currentEnemyCount: 0` / `progressiveEnemyCount: 0` —— F-2026-06-15-C-2 已修
- ✅ `tick` 用 deferred `set()`,survive-mode gate 阻止 progressive-spawn 在 reach-exit/time-trial 漂移(F-N6)
- ✅ `levelStore.sanitizeBestRecordMap` / `sanitizeCustomLevelsMap` / `sanitizeFoldersMap` 各自隔离——单字段 corruption 不污染其他
- ✅ `settingsStore.sanitizeSettings` per-field lenient fallback 已实现
- ✅ `persist.stripPollutingKeys`(persist.ts:43-55)递归移除 `__proto__` / `constructor` / `prototype`,防 prototype pollution
- ✅ `safeSetItem` 返回 discriminated `PersistResult`,Quota / 序列化错误显式
- ✅ `saveJSONDebounced` 250ms 防抖,slider 拖动不抖
- ✅ `flushPendingWrites` 用 `Array.from(pendingWrites.keys())` snapshot 防 Map mutation during iteration
- ✅ `editorStore.levelHashCache` = `WeakMap<MazeData, string>`,GC-safe
- ✅ `editorHistory` 纯 `structuredClone`,MazeData 无 BigInt/Symbol,安全
- ✅ `applyLevelMigrations` 空数组 + `CURRENT_LEVEL_SCHEMA_VERSION = 1` hot path 零分配
- ✅ Cross-store 协调全部走 GameBridge 单次 `getState()`,无 subscribe loop
- ✅ `useAutoSave` mounted flag + getState lazy + callbacks in refs,无 post-unmount 回调

## Subagent Notes

- **FCR-M-1**(`gameStore` import engine `ParchmentState`)由 A-architecture finding 承载,避免重复。