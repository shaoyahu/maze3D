# Finding A — Architecture & Layer Boundaries (2026-07-01)

**Reviewer**: caveman:cavecrew-reviewer (architecture domain)
**Parent review**: [`../2026-07-01-full-code-review.md`](../2026-07-01-full-code-review.md)
**Scope**: `src/engine/**`, `src/entities/**`, `src/maze/**`, `src/store/**`, `src/ui/GameCanvas.tsx`, `src/utils/gameUrl.ts`, `src/utils/seed.ts`, `src/App.tsx`

## Confirmed Findings

### FCR-M-1: store ↔ engine parchment coupling
- **File**: [src/store/gameStore.ts:26](../../store/gameStore.ts#L26)
- **Problem**: `gameStore` 直接 `import { createEmptyParchment, ParchmentState } from '../engine/ParchmentState'`,让 store 持有 engine 内部类型并复用其工厂。违反"engine 不得被 UI/store 反向依赖"的边界规则精神。
- **Already tracked as**: F-2026-06-30-H-2(已记录但未修)
- **Fix**: 选定 single-source-of-truth。推荐:把 `ParchmentState` 从 engine 迁出到 `src/maze/` 或 `src/types/`,store 与 engine 共同引用;engine 在 tick 末尾通过 `bridge.onParchmentUpdate(snapshot)` 把变化推送给 store。

## Verified Clean

- ✅ `src/engine/**` 没有 import `react` / `react-dom` / `zustand` / `../store/**`(grep 验证,6 个文件:Camera / Renderer / Loop / Scene / Game / InputManager)
- ✅ `src/game/Rules.ts` 是纯函数,无任何 React / Zustand / Three.js 依赖
- ✅ `src/maze/generators/*` 全部接受 `(size, prng)`,无外部状态
- ✅ `src/entities/Enemy.ts` 单向依赖 `src/engine/Collision.ts`(entities→engine,符合分层)
- ✅ `GameBridge` 接口(Game.ts:77-140)全部用回调签名,GameCanvas.tsx 通过 `useGameStore.getState()` / `useSettingsStore.getState()` 单次读取而非订阅
- ✅ `parseGameSearchParams`(utils/gameUrl.ts)在非法输入时全部回退默认,不抛异常;`id` 长度上限 256 字符
- ✅ `encodeSeed` 产出 `algo-v1-${algorithm}-${size}-${hex16}`,`decodeSeed` 通过 `SEED_RE` + `VALID_ALGORITHMS` + `VALID_SIZES` 三重验证;算法重命名 = 历史最佳成绩破坏,maze/types.ts:253-254 显式文档化
- ✅ Zustand 四个 store + editorHistory 全部不互相循环;`gameStore.tick` 用 deferred `set()`(只当 `result.triggered` 时写入),无重入风险
- ✅ TypeScript 严格度:`src/**` 零 `any`(唯一一处 `as unknown` 在 `GameCanvas.tsx:142` 用于 dev-only `window.__game` escape hatch,显式标注)

## Subagent False Positives (corrected in §6 of main review)

- 无 — 架构域子代理结论全部经 grep 验证成立。

## Architecture Debt (LOW)

- **FCR-L-7**:`App.tsx` 无 `React.lazy` 路由分包。`MainMenu / LevelSelect / Settings / EditorPage / GamePage / NotFound` 全部 eager import。Three.js 全量在初始 bundle,首次 LCP 体验拖慢。手动 `manualChunks` 可把 editor 子树拆出。详细见 H-utils-build-ci finding。
- **FCR-L-8**:`import * as THREE from 'three'` 在 engine 与 entities 6 个文件中阻止 tree-shaking。预期 Three.js bundle ≈ 960 KB → manualChunks 可降至 ~600 KB。详见 H finding。