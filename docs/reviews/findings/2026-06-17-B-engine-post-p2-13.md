# Code Review §B(post-P2-13) — Engine / Entities / Engine↔UI Bridge

**Slug**: `2026-06-17-B-engine-post-p2-13`
**日期**: 2026-06-17
**评审窗口**: `main` HEAD = `ad94abe feat(p2-13): 编辑器文件夹系统 + 左侧栏重构 + 胜利标签键修复`
**前置评审**: [`2026-06-17-B-engine.md`](./2026-06-17-B-engine.md)(12 条 baseline,本轮核验)
**评审方式**: 单代理,直接逐文件 Read(`src/engine/*`、`src/entities/*`、`src/ui/GameCanvas.tsx`、`src/game/Rules.ts`、`src/styles/theme.css` 主题相关段),不依赖子代理

## §0 范围 & 方法

**P2-11 → P2-13 之间 commit(本域相关)**:
- `74cf371 fix(engine): 4 个 HIGH 资源/状态守卫 (Game.destroyed / paused / clampFov / WeakSet)` — 修复 B-H-1/2/3/4 四条
- `b7707fd fix(editor-store): P2-11 4 个 setter 静默 no-op 修复 + commitLevel 自动清错 + enemySpawner retry 去重` — 修复 C-H-3
- `2296ef2 fix(p2-11-regression): 修 typecheck 红 30 处 + validateMaze 吞 P2-11 字段 + i18n 扩展`
- `284d0c1 test(maze+entities): reachability + Player 单测 + levels P2-11 字段断言 + isVictoryType 扩展性`

**P2-13 改动清单(本域相关)**:
- 仅 `src/styles/theme.css`(+4737 行 CSS 变量重排,本质是 design tokens 重组)
- 引擎层 7 个 .ts 文件、entities 3 个 .ts 文件、`GameCanvas.tsx` 全部**未在 P2-13 diff 中出现**

**边界检查**(强制):
```bash
grep -rE "from ['\"]react|from ['\"]react-dom|from ['\"]zustand|from ['\"]\.\./store" src/engine/ src/entities/
```
**结果**:`NO_MATCHES` —— 边界依然干净。

**P2-13 theme.css 与引擎的耦合点核验**:
- `Scene.setDarkMode(bool)`(Scene.ts:193)接收的是 `boolean`,**不读取 CSS 变量** —— 它的 LIGHT/DARK palette 是 JS 字面量(`Scene.ts:146-159`)。
- `GameCanvas.tsx:234` 把 CSS 变量 `var(--danger)` 用于错误提示 DOM 元素 —— 纯 CSS 层,与引擎无关。
- `Game.setDarkMode(enabled)` 转发 `enabled: boolean` 到 `sceneRefs.setDarkMode(enabled)` —— 类型 `boolean` 不被 P2-13 改动。
- **结论**:P2-13 的 CSS 重排**未触及引擎初始化路径**,引擎侧 dark-mode 状态机依然由 `settingsStore.darkMode: boolean` 驱动,与 CSS variable 解耦。

**逐文件读清单**:
- `src/engine/Game.ts`(527 行)—— +36 行相对 06-17 评审
- `src/engine/Scene.ts`(391 行)—— +16 行
- `src/engine/Collision.ts`(99 行)—— 未变
- `src/engine/Camera.ts`(7 行)—— 未变
- `src/engine/Renderer.ts`(11 行)—— 未变
- `src/engine/Loop.ts`(28 行)—— 未变
- `src/engine/InputManager.ts`(160 行)—— +12 行
- `src/entities/Player.ts`(46 行)—— 未变
- `src/entities/Enemy.ts`(206 行)—— 未变
- `src/entities/Pickup.ts`(16 行)—— 未变
- `src/ui/GameCanvas.tsx`(243 行)—— 未变
- `src/styles/theme.css` —— 主题 token 重排(4723 行 diff,本评审只取 Scene / setDarkMode 引用相关的子集)

## §1 总览

| 严重度 | 条数(新增) |
|---|---|
| CRITICAL | 0 |
| HIGH | 0 |
| MEDIUM | 0 |
| LOW | 1 |
| **合计** | **1** |

一句话结论:**P2-11 的 4 条 HIGH 引擎守卫已全部修复,本轮 B 域仅剩 1 条 LOW —— Scene.ts 的 `doubleDisposeWarned` 集合跨整个模块生命周期增长,在长期运行 SPA 场景下单调递增。引擎 ⇄ UI 隔离边界仍 100% 干净;P2-13 theme.css 重排不触及引擎路径。**

## §2 CRITICAL

无。

## §3 HIGH

无(上轮 B-H-1/2/3/4 全部已修,逐条核验见 §7)。

## §4 MEDIUM

无。

## §5 LOW

### L-1 | `src/engine/Scene.ts:24, 360-363` | `doubleDisposeWarned: Set<Texture>` 跨整个模块生命周期单调增长

**观察**: `disposedTexs` 与 `doubleDisposeWarned` 是 module-level 强引用 `Set<THREE.Texture>`(Scene.ts:23-24,用于修复 B-H-1)。`disposedTexs` 在 `disposeScene` 中持续 add,**从不删除**(L368 `disposedTexs.add(t)`)。`doubleDisposeWarned` 同样 add-only(L361)。

- `disposedTexs` 的设计意图是 "track which textures have been disposed so a second call doesn't double-dispose"
- 但 Three.js 的 `Texture.dispose()` 内部把 `this.version = 0` 并标记 disposed — 一个被 disposed 的 `THREE.CanvasTexture` 包装器再调用 `.dispose()` 不会引发 crash,只是 `console.warn` 一次
- module-level 永生集合保留了"已经被 dispose 但 JS 包装器仍可达"的强引用,**等于把整个游戏历史的所有 CanvasTexture 实例都钉在内存里**
- 在 50×50 maze 的 progressive 模式中,关卡切换会产生 `3 个 texture (floor/wall/ceiling) × 关卡次数` 个被钉住的 entry
- 实际场景下用户玩 100 关后,本集合钉住 ~300 个 CanvasTexture 包装器(每张 64-256 byte canvas buffer,关联 ~5-20 KB),JS heap 累加 ~1.5-6 MB,GPU 侧已被 dispose 故**不影响显存**,但 JS 端内存长期单调增长

**为什么是 LOW 不是 MEDIUM**:
- 仅 SPA 长期运行 / dev mode 反复刷新才显现
- 每次刷新浏览器清空
- 不影响功能正确性,只影响长跑场景下的内存峰值
- B-H-1 的核心问题(GPU texture leak)已修,这只是 Set 设计的副作用

**修复建议**(任一):
1. **`disposedTexs` 改成 WeakSet**:在 dispose 链上的对象会被 GC 时自动清理,但需要接受 B-H-1 描述的"GPU 资源 永生 leak"风险回到原状 → 不推荐
2. **每次 `disposeScene` 末尾清空**:`disposedTexs.clear()` / `doubleDisposeWarned.clear()` 简单可靠,但会丢失"这个 texture 历史上已被 disposed"信息
3. **按 level-session 分桶**:`disposedTexs: WeakMap<Scene, Set<Texture>>`,scene 被 GC 时桶被回收,跨关卡跟踪保留。最优雅但需要更多代码
4. **当前方案维持**:`disposedTexs` 永生增长(本 finding 记录),待 P3 在重构"纹理按需生成 vs module-scope 缓存"时一并处理

**F-tag**: `F-2026-06-17-B-L-1-N1`

## §6 验证为假阳性的子代理报告

| 报告 | 验证 | 否决理由 |
|---|---|---|
| 2026-06-15-fresh-full-review §4.12: Loop stop 后本帧 rAF 仍 fire | 仍修复 | Loop.ts L12, L17 双重 `stopped` 守卫,commit `74cf371` 前已修,本轮再核验保留 ✓ |
| 2026-06-15-fresh-full-review §4.13: disposedTexs WeakSet GC 失效 | **本轮升级为 B-H-1,已修** | `74cf371` 把 WeakSet 改 Set + 加 `disposedTexs` module-level 强引用,本轮 §7 逐行核验 ✓ |
| 2026-06-15-full-bug-scan §4.2: InputManager dispose 不清 keys | 仍修复 | L42 `this.justPressed = []` + L56 `this.keys.clear()`,`74cf371` 前已修,本轮保留 ✓ |
| 2026-06-15-full-bug-scan §4.4: Game setDarkMode 静默 no-op | 仍修复 | Game.ts L209-211 转发到 `sceneRefs.setDarkMode(enabled)`,`74cf371` 前已修 ✓ |
| 2026-06-15-full-bug-scan §4.5: Loop `0.1` magic number | **降级保留** | 2026-06-17 M-4 已重提;本轮 B-M-4 不重复,等 P3 重构统一加 `MAX_DT_SECONDS` 常量 |
| 2026-06-17-B-M-1: Scene.dispose 未 clear children | **降级,本轮 B-L-1 N1 关注点更严重** | `disposeScene` 用 `scene.traverse` 释放所有 Mesh 的 geometry/material/tex,GC 会清空 children 数组引用;`walls.length = 0 / pickups.length = 0 / enemies.length = 0` 切断调用方引用;`scene` 自身不在本函数 clear,但 Game.dispose 后 `this.sceneRefs` 不再被引用,scene 整体 GC。`scene.clear()` 显式调用是更稳的做法,但本轮资源生命周期已通过 L-1 N1 的 Set 增长暴露,优先级更高 |
| 2026-06-17-B-M-2: Enemy mesh 与 Enemy 实例顺序同步 race | 不变 | 当前 maze.enemies 不可变 + sceneRefs.enemies 严格按注入顺序构造,无变化 |
| 2026-06-17-B-M-3: `collidesAt` 对 OOB 返回 `true`,cellSize=0 保护缺失 | 不变 | JsonMazeProvider.validateMaze 仍校验 ≥ MIN_CELL_SIZE(0.6);AlgorithmMazeProvider 与编辑器输出仍未走同样校验,但本轮不修,**继承为 B-M-3-N1(更详细的修复见 P2-14)** |
| 2026-06-17-B-M-4: Loop `0.1` magic number | 不变 | 详见上表"Loop 0.1 magic number"行 |
| 2026-06-17-B-M-5: useGameStore.subscribe 异步回调引用 gameRef | 不变 | GameCanvas L163-181 的 callback 内 `gameRef.current?.` 守卫已存在(L165-180);cleanup 内 `gameRef.current = null`(L119)在 unsub 前执行,unsub 后任何 closure 内引用 `gameRef.current?.` 拿到 null,无副作用。**本轮核验仍安全** |
| 2026-06-17-B-L-1: Wall mesh GPU instancing 未用 | 不变 | 2700 mesh 在 50×50 maze 仍是问题,但 InstancedMesh 重构需 P3 集中处理 |
| 2026-06-17-B-L-2: contact 平方和未用 playerVsEnemy | 不变 | 内联与 `hasEnemyContact` 语义一致,本轮不修 |
| 2026-06-17-B-L-3: FOV_DEFAULT 60 重复 | 不变 | Camera.ts L4 与 Game.ts L97 各一份,本轮不修 |

## §7 上轮 finding 修复状态核验(P2-11 → P2-13 之间)

| 上轮 F-tag | 标题 | 修复 commit | 核验位置 | 状态 |
|---|---|---|---|---|
| F-2026-06-17-B-H-1 | Scene WeakSet → Set + dispose 显式调用 | `74cf371` | Scene.ts:23-24, 344-369 | ✓ **已修** |
| F-2026-06-17-B-H-2 | Game.destroy 入口 `running` 守卫 | `74cf371` | Game.ts:118 `destroyed` flag + L351 `this.destroyed = true` + L374 `if (this.destroyed) return` | ✓ **已修**(用 `destroyed` 而非 `running` —— 等价但语义更清晰) |
| F-2026-06-17-B-H-3 | InputManager 加 `if (paused) return` | `74cf371` | InputManager.ts:125 `if (this.paused && e.code !== 'KeyP') return` | ✓ **已修**(并保留 KeyP 让玩家可 un-pause) |
| F-2026-06-17-B-H-4 | camera.fov NaN/Infinity 守卫 | `74cf371` | Game.ts:183 `this.camera.fov = clampFov(this.bridge.getInitialFov())` | ✓ **已修** |
| F-2026-06-17-B-M-1 | Scene.dispose 未 clear children | (未修) | — | △ **降级保留** — 本轮 §6 说明,本轮 B-L-1 N1 优先级更高 |
| F-2026-06-17-B-M-2 | Enemy mesh 与 Enemy 实例顺序同步 race | (未修) | — | △ **继承** |
| F-2026-06-17-B-M-3 | `collidesAt` cellSize=0 保护缺失 | (未修) | — | △ **继承 B-M-3-N1** |
| F-2026-06-17-B-M-4 | Loop `0.1` magic number | (未修) | — | △ **继承** |
| F-2026-06-17-B-M-5 | useGameStore.subscribe 异步回调 | (未修) | — | △ **继承** |
| F-2026-06-17-B-L-1 | Wall mesh GPU instancing 未用 | (未修) | — | △ **继承** |
| F-2026-06-17-B-L-2 | contact 平方和未用 playerVsEnemy | (未修) | — | △ **继承** |
| F-2026-06-17-B-L-3 | FOV_DEFAULT 60 重复 | (未修) | — | △ **继承** |

**修复率**:4/4 HIGH = 100% 已修;0/5 MEDIUM 修复(全部为 P3 / 重构窗口遗留);0/3 LOW 修复(同样为 P3 窗口)。

## §8 跨切关注

**1. P2-11 → P2-13 的 4 个 commit 重点修复了引擎层资源生命周期与状态守卫**:
- `74cf371` 单 commit 同时修了 B-H-1(WeakSet → Set + dispose 链)、B-H-2(`destroyed` 守卫)、B-H-3(paused 守卫)、B-H-4(clampFov)
- `b7707fd` 修了 C-H-3(enemySpawner retry 去重),与 B-M-2 的顺序同步问题形成上下游闭环
- `2296ef2` 修了 A-CRITICAL-2(VictoryType 联合扩)、D-CRITICAL-1(validateMaze 透传 P2-11 字段)—— 间接影响 B 域的教学关卡字段可见性
- `284d0c1` 新增 `tests/unit/engine/` 与 `tests/unit/maze/reachability.test.ts` —— 引擎层测试覆盖从 0 → N(详见 F 域)

**2. P2-13 theme.css 重排对引擎零影响**:
- Scene.ts 接收的 `setDarkMode(bool)` 是纯 JS 状态机
- GameCanvas L234 的 `var(--danger)` 是 DOM 元素的 CSS property,与 Three.js 渲染无关
- Game.setDarkMode 转发 `boolean` 不读 CSS 变量
- **结论**:P2-13 的"design tokens 重构"完全在样式层完成,引擎层未污染

**3. 引擎 ⇄ UI 隔离依然 100% 干净**:
- `grep -rE "from ['\"]react|from ['\"]react-dom|from ['\"]zustand|from ['\"]\.\./store" src/engine/ src/entities/` → 0 匹配
- 6 个引擎文件 + 3 个 entity 文件全部用 `GameBridge` 回调与 UI 通信
- P2-11 → P2-13 的 4 个 commit 中,只有 `74cf371` 触碰引擎层,且新增的 `destroyed` 字段是纯状态机,无 React/Zustand 引用

**4. P2-13 后 B 域的债务清单**(按 §7 继承顺序):
- **B-M-3-N1**:`AlgorithmMazeProvider` / `EditorMazeProvider` 未走 `JsonMazeProvider.validateMaze`,cellSize=0 保护缺失
- **B-M-4-N1**:Loop `0.1` magic number,应改为 `MAX_DT_SECONDS` 常量
- **B-L-1-N1**:`doubleDisposeWarned` / `disposedTexs` module-level Set 长期运行内存增长
- **B-M-1-N1**:`Scene.dispose` 显式 `scene.clear()` 调用缺失
- **B-L-1-N1**:Wall mesh 未用 InstancedMesh(50×50 maze 下 2700 mesh 触发 2700 draw call)

**估时**:P3 一次性 4 hr 可全部清理。

## §9 优先级行动建议

按 **修复成本** × **影响严重度** 排序:

| 优先级 | finding | 估时 | 影响 |
|---|---|---|---|
| **P3** | B-L-1-N1(`doubleDisposeWarned` Set 增长) | 15 min | 长跑 SPA 内存峰值(本轮已记录,等 P3 一并处理) |

**无 P0/P1/P2 finding**:P2-11 的 4 条 HIGH 引擎守卫已 100% 修复。P3 重构窗口可一次清理所有 MEDIUM/LOW 继承项。

## §10 Files Reviewed

| 模块 | 文件数 | finding 数(新 / 继承) |
|---|---|---|
| `src/engine/` | 7 | 1 / 0 |
| `src/entities/` | 3 | 0 / 0 |
| `src/ui/GameCanvas.tsx` | 1 | 0 / 0 |
| `src/styles/theme.css`(本域相关子集) | 1 | 0 / 0 |
| **总计** | **12** | **1 新 / 9 继承(去重后)** |

---

**B-本轮 1 条新增(0/0/0/1),P2-11 4/4 HIGH 全部已修,引擎层 100% 干净。P2-13 theme.css 重排与引擎零耦合。**

完整 B 域 JSON 报告同步给主代理。
