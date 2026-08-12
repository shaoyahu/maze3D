# P4 refactor-fp2d Code Review (2026-08-11)

**Slug**: p4-refactor-fp2d-review
**日期**: 2026-08-11
**评审窗口**: `p4-refactor-fp2d` branch HEAD = `3f6baea` + working tree (3 files uncommitted)
**前置评审**: [`2026-08-11-p4a-and-7-p4b-final`](../roadmap.md) 之前的 7 个 P4 增量(P4a + P4b-Prim/CellSize/Lerp/Minimap/HudLayer/Panorama/Instanced)各自 ship
**关联文档**:
- [`docs/increments/p4-refactor-fp2d/spec.md`](../increments/p4-refactor-fp2d/spec.md)
- [`docs/increments/p4-refactor-fp2d/plan.md`](../increments/p4-refactor-fp2d/plan.md)
**评审方式**: 单代理 walkthrough 7 commit diff + working tree + spec 验收清单对照,跑全量 typecheck + vitest 验证 baseline

## §0 元数据 & 方法

- **范围**: 锁定到 `p4-refactor-fp2d` branch,7 commit + working tree 改动,15 个核心文件 + 5 个新 test 文件 + 文档 3 文件
- **不**重复审查被删的 5 个 P4a/P4b test 文件(已 ship 完,只是被本 refactor 删除)
- **方法**:
  1. 读 spec/plan,提取验收清单 §11
  2. walkthrough 每个 commit 的 diff,标注"做了什么 / 删了什么 / locked contract 是否保持"
  3. grep 残余 `walls3D` / `algo-v3-` / `getMove3D` / `tick3D*` / `Move3D` 引用,区分**代码** vs **历史注释**
  4. 跑 `npx tsc --noEmit -p tsconfig.app.json && npx vitest run`(期望 1694 pass + 1 skip,0 fail)
  5. 启 dev server 跑 curl 端点验证(Browser E2E 上一轮已做过,本轮复验 server 启动 + v3 URL 路由不 500)
  6. 比对 spec §8/§10/§11 vs 实际实现

## §1 总览

**一句话结论**:核心 refactor 干净正确(2D 全链路零回归,3D 模式 contract 锁住)。**Bug #1 (Critical) + Bug #2 (Spec violation) + 1 新 test 已修,但未 commit**。主要债务在**文档**(CLAUDE.md + README 几行 obsolete 引用,需清理),代码层面只剩 2 处 LOW 级别 dead code。

| 严重度 | 数量 | 状态 |
|---|---|---|
| CRITICAL | 0 | — |
| HIGH | 1 | Bug #1 已修,working tree 待 commit |
| ~~HIGH~~ | ~~1~~ | ~~Bug #2 已修,working tree 待 commit~~(实际 spec violation,修后 MEDIUM 文档债) |
| MEDIUM | 2 | 文档 debt |
| LOW | 2 | dead code + 噪音注释 |

## §2 HIGH 严重度

### H-1: GameCanvas Effect 1 缺 `view` 依赖(已修,待 commit)

- **位置**: `src/ui/GameCanvas.tsx:184-195`
- **影响**: 用户在 /levels 切 view(2D ↔ fp3d)但 maze.id 不变时,React 的 `key={activeMaze.id}` prop 不会重新挂载 GameCanvas,旧 Game 实例继续跑 `viewMode === '2d'`,**切 view 静默失效**。fp3d 模式 `applyLook` 永远不调,crosshair 永远不显示。
- **复现**:
  1. 进入 /game?seed=algo-v2-kruskal-30-2-72a65eadf35566fd
  2. 返回 /levels,切到 "3D First-person",同 maze 重启
  3. 预期:第一人称视角 + crosshair;**实际**: 2D top-down 视角,无 crosshair
- **修复**: Effect 1 deps `[]` → `[view]`,加注释说明 Effect 1/2 各自职责
- **修复状态**: working tree 已改,1 个 test 已加,未 commit

## §3 MEDIUM 严重度

### M-1: CLAUDE.md P4 refactor-fp2d 段自相矛盾(已修代码,文档未同步)

- **位置**: `CLAUDE.md:556-600` (P4 refactor-fp2d 段)
- **问题**: 段内 (1) `**2D 模式全链路零回归**` 小节(line 594)仍写:
  > 老 `algo-v3-…` URL fail `bad-seed` 错误 (P4 refactor spec §8 决策:不 silent fallback)
- **跟 spec 矛盾**: spec.md §8 line 173 写 *"老 v3 seed URL → 解码失败,**fall back to default level**"*,§10 写 *"v3 链接重定向到 2D view 提示用户"*,§11 line 210 写 *"老 v3 URL:友好 fall back 到 2D"*。
- **跟代码矛盾**: Bug #2 修后 `App.tsx:457-466` 走 `navigate('/levels', { replace: true })` + `console.warn`,这是友好 fall back,**不是**"不 silent fallback"。
- **修法**: 把 line 594 改成
  > 老 `algo-v3-…` URL 友好 fall back 到 /levels (P4 refactor spec §8 决策 + Bug #2 修):console.warn + `navigate('/levels', { replace: true })`,App.tsx `useEffect` 限定 v3 prefix
- **优先级**: HIGH (文档直接违反 spec,且与已修代码矛盾)— 但因 spec.md/plan.md 已经正确,**先 commit code 再改 doc**,doc fix 跟 commit 一起推

### M-2: CLAUDE.md 8 段旧 P4a + 7 P4b "locked contracts" 没删

- **位置**: `CLAUDE.md:177-555`(共 8 段:P4 / P4b-Prim / P4b-CellSize / P4b-Lerp / P4b-Minimap / P4b-HudLayer / P4b-Panorama / P4b-Instanced)
- **问题**: 这些段**完整保留**了 P4a + 7 P4b 的 locked contracts,描述的代码(`walls3D` / `tick3DMovement` / `getMove3D` / `active3DTween` / 3D Prim / `3d-recursive-backtracker` 算法 / `algo-v3-3d-...` codec / `is3D = maze.walls3D !== undefined` dispatch / `getPlayerY()` accessor / `PlayerSnapshot.y` / `Y_EPSILON` / 3D panorama 3-strip / 3D InstancedMesh)全部被本 refactor 删除。新 P4 refactor-fp2d 段(line 556)说"推翻上面所有 P4 旧 contracts",但**旧段没删**。
- **影响**:
  1. 文档体积臃肿(177-555 共 379 行,描述不存在代码)
  2. 读 CLAUDE.md 找"3D 模式怎么实现"会被旧段误导(读 5 分钟才发现这些是过时的)
  3. 新人 onboarding 负担
- **修法**: 整个删 line 177-555(P4 refactor-fp2d 段 line 556 起包含新 contract),或者把 8 段折叠成"deprecated — see P4 refactor-fp2d"
- **优先级**: MEDIUM(不阻塞 ship,但 review 看到都会喊)

### M-3: README.md 几行 obsolete 引用

- **位置**: `README.md:363, 410, 488`
- **问题**:
  - Line 363: `Minimap.tsx # 2D top-down + 3D panorama (3 strip 堆叠)` — Minimap 已经没有 3D panorama,本 refactor 删了
  - Line 410: `**2D / 3D 互斥 dispatch**: 3D 路径通过 'maze.walls3D !== undefined' 检测` — 错。本 refactor 删了 `walls3D`,新 dispatch 是 `view` query
  - Line 488: P4 refactor-fp2d 状态标记 — 实际是 ✅,但同段前面 P4b-* 标记是 ⚠️ 作废,层次可能让人混淆
- **修法**:
  - Line 363 改 `Minimap.tsx # 2D top-down minimap (2D / fp3d 共享,2D top-down 风格)`
  - Line 410 改 `**3D 模式 dispatch** = '?view=fp3d' URL query (3D 模式渲染同一份 2D 多层数据,无独立 3D 数据)`
- **优先级**: LOW-MEDIUM(可读性问题)

## §4 LOW 严重度

### L-1: `getPlayerY()` accessor 是 dead code

- **位置**: `src/engine/Game.ts:343-368`
- **状态**: 定义存在,但**没有 production 调用**:
  - `src/ui/components/Minimap.tsx:243, 468` 都是注释(说"删了 getPlayerY 调用")
  - 真实 `getPlayerY()` 调用原本在 P4b-Minimap / P4b-Panorama,两个 component test 已删
- **影响**: 0 字节 死代码,1 个 accessor 公开 API 暴露
- **修法**: 删 `getPlayerY()` 方法(2 行)+ JSDoc 12 行,改 `src/engine/Game.ts:349-365` 那段历史注释简化
- **优先级**: LOW(不阻塞,可下个 P 顺带清)

### L-2: `_mode?: never` in createPlayer 是 dead parameter

- **位置**: `src/entities/Player.ts:91-117`
- **状态**: 两 overload 都在,第二个 overload 加 `_mode?: never`:
  ```ts
  export function createPlayer(
    startCell: { x: number; z: number; level?: number },
    cellSize: number,
    _mode?: never,  // <-- `never` 类型,任何 caller 都传不了
  ): PlayerState
  ```
  - 所有 caller(`src/engine/Game.ts:891` + 6 个 test 文件)都不传第 3 参数
  - `never` 类型让 `_mode` 永远 undefined
- **影响**: 12 行 overload + 8 行注释解释为何保留 — 实际纯 dead code
- **修法**: 合并两个 overload 成一个,删 `_mode?` + 删 JSDoc
- **优先级**: LOW(不阻塞,可下个 P 顺带清)

### L-3: 大量 removal 注释噪音

- **位置**:
  - `src/engine/Game.ts:254, 352-368, 507-509, 881-883, 967-970, 1066-1067`(约 50 行)
  - `src/engine/Scene.ts:205-220, 927-937`(约 30 行)
  - `src/engine/InputManager.ts:5-16`(12 行)
  - `src/maze/AlgorithmMazeProvider.ts:115-126`(12 行)
  - `src/utils/seed.ts:115-121, 144-148`(11 行)
  - `src/ui/components/Minimap.tsx:69-91, 374-377, 408-411`(约 25 行)
- **状态**: 都是"P4 refactor-fp2d: 删了 X / 删了 Y / 旧 P4b-Lerp 是 Z"型注释,功能上无害
- **影响**: 阅读干扰,但 git blame 可以追溯,新读者需要花时间理解"这些 deleted 是什么"
- **修法**: 保留 1-2 段核心 contract 注释,删重复段落;或者把"为什么删"的解释合并到 P4 refactor-fp2d 段(CLAUDE.md line 556)
- **优先级**: LOW(noise,不影响功能)

## §5 验证为假阳性的子代理报告

无子代理,本 review 由单代理完成。**不需要否定**任何 finding。

## §6 验证结果

| 验证 | 命令 | 结果 |
|---|---|---|
| Typecheck | `npx tsc --noEmit -p tsconfig.app.json` | ✅ 0 error |
| Unit + Component tests | `npx vitest run` | ✅ 1694 passed, 1 skipped(1695 total)|
| 2D 模式回归 | 1693 → 1694(p4-refactor-fp2d 末态)→ 1694(bug fix +1 test) | ✅ 0 regression |
| Dev server 启动 | `npm run dev` → `localhost:5173` | ✅ HTTP 200 |
| v3 URL 路由 | `curl http://localhost:5173/game?seed=algo-v3-3d-recursive-backtracker-7-0123456789abcdef` | ✅ HTTP 200(JS-side redirect 不可见,unit test 已覆盖) |

## §7 跨切关注

1. **Documentation debt 是本 refactor 主要残留**:5 个文档(CLAUDE.md 379 行 + README 3 行)跟实际代码不同步,需要在 ship 前清理
2. **dead code 清理可下个 P 顺带做**:L-1 + L-2 + L-3 都在 P4 refactor-fp2d 删 3D 代码的波及范围,可作为一个 "P4 refactor-fp2d cleanup" 小增量处理
3. **Browser E2E 没在本轮重新跑**(上一轮已验证过 v3 fall back / 2D 模式 / FP3D 模式 / FP3D 多层),如需 re-verify 见 `docs/increments/p4-refactor-fp2d/plan.md` 验证章节
4. **GitHub Pages deployment** 持续卡 `deployment_queued` 是 pre-existing 问题,跟本 refactor 无关

## §8 优先级行动建议

| # | 行动 | 工作量 | 影响 | 备注 |
|---|---|---|---|---|
| 1 | **commit Bug #1 + Bug #2 fix + 新 test** | 5 min | H → fix | 1 commit "fix(p4-refactor-fp2d): GameCanvas view deps + 老 v3 URL 友好 fall back" |
| 2 | **修 M-1(CLAUDE.md "无 silent fallback" 自相矛盾)** | 2 min | M → fix | 跟 commit 1 一起推,或单独 docs commit |
| 3 | **删 CLAUDE.md line 177-555(8 段旧 P4a/P4b contracts)** | 5 min | M → fix | 单独 docs commit "docs(p4-refactor-fp2d): 删过时 P4a/P4b contracts 段" |
| 4 | **修 README.md line 363, 410(M-3)** | 5 min | L-M → fix | 跟 commit 3 一起推 |
| 5 | **删 L-1 getPlayerY() + L-2 _mode?: never dead code** | 15 min | L → fix | 可选,下个 P 顺带 |
| 6 | **简化 L-3 大量 removal 注释** | 30 min | L → noise reduction | 可选,下个 P 顺带 |

**建议先做 1+2+3+4**(都是 ship 阻塞的 H/M 项,共 ~20 min 工作量),5+6 推到下个增量。

## §9 Files Reviewed

| 模块 | 文件数 | Finding 数 |
|---|---|---|
| Engine | `Game.ts` / `Scene.ts` / `InputManager.ts` / `Player.ts` | H-1(Bug 1) + L-1 + L-2 + L-3 |
| App 层 | `App.tsx` / `GameCanvas.tsx` / `LevelSelect.tsx` | Bug 2(v3 fall back) + L-3 |
| UI 组件 | `Minimap.tsx` | L-3 |
| 数据层 | `maze/types.ts` / `maze/AlgorithmMazeProvider.ts` / `utils/seed.ts` / `utils/gameUrl.ts` | L-3 |
| Test | `Game.fp3d.test.ts` / `levelSelect.view.test.tsx` / `gameUrl.test.ts` / `app.routing.test.tsx` | 0(覆盖度合格)|
| 文档 | `CLAUDE.md` / `README.md` / `spec.md` / `plan.md` / `roadmap.md` | M-1 + M-2 + M-3 |

**总共 16 文件** + 5 已删 test 文件(已删除,无需再 review)。
