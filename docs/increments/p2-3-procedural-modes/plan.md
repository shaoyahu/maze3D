# 程序生成关卡 + 新游戏模式 —实施计划（Plan）

**Spec**: `docs/increments/procedural-modes/spec.md`
**复杂度**: Large
**日期**:2026-06-08

>步骤使用 `- []`语法追踪。执行时建议使用 `superpowers:subagent-driven-development` 子技能。

## 文件改动总览
| 文件 | 操作 |原因 |
|---|---|---|
| `src/maze/AlgorithmMazeProvider.ts` | CREATE |递归回溯算法 provider |
| `src/maze/MazeProvider.ts` | UPDATE | 接口扩展 options 参数 |
| `src/utils/random.ts` | UPDATE | 新增 seeded RNG（FNV-1a + mulberry32） |
| `src/store/gameStore.ts` | UPDATE | `startLevel(id, options?)` |
| `src/store/levelStore.ts` | UPDATE | `best[levelId].seed?: string` |
| `src/game/Rules.ts` | UPDATE | `survive` / `time-trial` mode判定 |
| `src/game/GameState.ts` | UPDATE | mode状态分支 |
| `src/engine/Game.ts` | UPDATE | `startLevel`接受 options |
| `src/ui/LevelSelect.tsx` | UPDATE | "程序生成"分组 |
| `src/ui/WinOverlay.tsx` | UPDATE | time-trial 显示用时 |
| `src/ui/GameOverOverlay.tsx` | UPDATE | survive 显示击中数 |
| `tests/unit/maze/AlgorithmMazeProvider.test.ts` | CREATE | 算法单测 |
| `tests/unit/utils/random.test.ts` | UPDATE | seeded RNG 测试 |
| `tests/e2e/procedural.spec.ts` | CREATE | 程序生成端到端 |
| `tests/e2e/time-trial.spec.ts` | CREATE | time-trial 超时 |
| `tests/e2e/pause-resume.spec.ts` | UPDATE | 新 mode 下暂停 |
| `README.md` | UPDATE |移除 P2-3 |

##任务清单

> **执行说明**：实际 ship 走的是 `docs/increments/_template/roadmap.md` §"总任务列表" 的 14 行清单（按 4 算法 × 3 尺寸 × 2 mode 的最终设计展开）。本 plan.md 是初版设计，与最终交付的差异：
> - seeded RNG 移到 `src/utils/seed.ts`（与 maze 域更近，且加了 encode/decode + parseHexSeed）
> - 4 个算法各成独立纯函数文件 + per-generator TDD，而非单一 provider
> - mode 缩到 `time-trial` / `reach-exit`，`survive` 推到 P2-4a（Q5）
> - `WinOverlay` 用时显示推到 P2-4a / 后续（FR-7 未完）
>
> 下方勾选反映实际 ship 状态；deferred 项保留未勾并加注。
>
> ### Deferred → P2-4a 显式归属清单
>
> 用户 2026-06-09 确认：以下 P2-3 范围内未 ship 的项推到 P2-4a（巡逻敌人 + survive mode），不进入 P2-3 follow-up。P2-4a 展开任务清单时可直接抄：
>
> | 来源 | 描述 | P2-4a 任务草案 |
> |---|---|---|
> | plan §Task8a | `WinOverlay` 在 time-trial 模式下显示用时 | P2-4a T-? : HUD/WinOverlay 倒计时显示 |
> | plan §Task8b | `GameOverOverlay` 在 survive 模式下显示击中数 | P2-4a T-? : survive 计数显示 |
> | plan §Task10b | `tests/e2e/time-trial.spec.ts` 180s 超时 | P2-4a T-? : 用 fake-timer 替代 180s 等待 |
> | plan §Task10c | `tests/e2e/pause-resume.spec.ts` 扩展新 mode 暂停 | P2-4a T-? : survive mode 暂停测试 |
> | spec §11.5 #3 | 浏览器刷新后 seed 输入框保留最近一次 | P2-4a T-? : seed 输入框 localStorage 持久化 |
>
> P2-3 范围 14/14 完成；以上 5 项不阻塞 P2-3 验收。

### Task1: seeded RNG
- [x] **Action**：在 `src/utils/seed.ts`（路径调整自 `random.ts`）实现 `mulberry32(seed: number): () => number` + `fnv1a(s: string): number` + 16-hex seed 解析。
- [x] **Validate**：`tests/unit/utils/seed.test.ts` 覆盖同 seed 同输出 / 不同 seed 不同输出 + encode/decode 往返。

### Task2: AlgorithmMazeProvider 算法
- [x] **Action**：4 个独立纯函数生成器（recursive-backtracker / Kruskal / Prim / hunt-and-kill），位于 `src/maze/generators/*.ts`；统一通过 `src/maze/AlgorithmMazeProvider.ts` 调度。
- [x] **Mirror**：`AlgorithmMazeProvider` 实现 `MazeProvider` 接口；start=(0,0)，exit=(右下逻辑角)，cellSize=2。
- [x] **Validate**：见 Task3。

### Task3: AlgorithmMazeProvider 单测
- [x] **Action**：per-generator TDD：`tests/unit/maze/generators/{recursiveBacktracker,kruskal,prim,huntAndKill}.test.ts` 各 8–9 case；50×50 性能单测 <500ms。
- [x] **Validate**：`npm run test` 通过（33 个生成器单测 + provider 单测）。

### Task4: MazeProvider 接口扩展
- [x] **Action**：`src/maze/types.ts` 新增 `Algorithm` 枚举、`Seed`、`StartLevelOptions`、`MazeSize` 类型；`JsonMazeProvider` 与 `AlgorithmMazeProvider` 都实现新接口。
- [x] **Validate**：`npm run typecheck` 通过。

### Task5: gameStore.startLevel options
- [x] **Action**：`src/store/gameStore.ts` 的 `startLevel(maze, options?)` 接受 `{ mode?, seed? }`；time-trial 强制 180s 计时；`currentMode` 持久化。
- [x] **Validate**：`tests/unit/gameStore.test.ts` 覆盖 mode 切换 + 180s 强制 + time-trial 至 0 触发 game-over。

### Task6: Game.ts 传递 options
- [x] **Action**：`src/engine/Game.ts` 的 `startLevel(maze, options?)` 接受 options 并 snapshot 到 `currentMode`，对外提供 `getCurrentMode()`。
- [x] **Validate**：手动调用 + GameCanvas 透传 options 已验证。

### Task7: Rules.ts mode 判定（部分 deferred）
- [x] **time-trial**：在 gameStore.tick 中倒计时至 0 → game-over，180s 上限。
- [x] **reach-exit**：维持现有逻辑（GameCanvas onReachExit 钩子）。
- [ ] **survive**：敌人来自 P2-4a，本增量不 ship——deferred 到 P2-4a（Q5）。

### Task8: WinOverlay / GameOverOverlay 显示（deferred）
- [ ] **WinOverlay time-trial 用时显示**：现 WinOverlay 仅显示 best/new-record；time-trial 专用文案未加——deferred（FR-7 未完）。
- [ ] **GameOverOverlay survive 击中数**：依赖 survive mode（P2-4a）。

### Task9: LevelSelect 程序生成分组
- [x] **Action**：`src/ui/LevelSelect.tsx` 拆为 3 分组——固定关卡、随机关卡（3 尺寸卡片）、指定种子关卡（16-hex 输入 + 默认 30×30 + time-trial）；算法对玩家不可见（Q11）。
- [x] **Validate**：`tests/component/menus.test.tsx` 6 个 P2-3 case + 既有 case 覆盖。

### Task10: E2E（部分 deferred）
- [x] **procedural.spec.ts**：3 尺寸卡片可见 / 点 15×15 进游戏 / 合法 hex seed 进游戏 / 非 hex seed 不进游戏。
- [ ] **time-trial.spec.ts**：180s 超时 → game-over——deferred（180s 等待对 CI 时长不友好，留给 P2-4a 时一起 ship 或加 fake-timer）。
- [ ] **pause-resume.spec.ts 扩展**：现有 spec 已覆盖通用暂停；新 mode 暂停未单独加 case——deferred。

### Task11: 文档同步
- [x] **Action**：README / roadmap / spec / plan 全部同步至 ship 状态。
- [x] **Validate**：grep "AlgorithmMazeProvider" 在 README Architecture 段出现；roadmap 14/14；spec FR 段勾选反映实际 ship。

##验证

```bash
npm run typecheck
npm run test
npm run build
npm run test:e2e
#验证算法性能
node -e "import('./src/maze/AlgorithmMazeProvider.js').then(m => { const t0 = performance.now(); m.getMaze({ size: { width:30, depth:30 }, seed: 'perf' }); console.log('30x30:', performance.now() - t0, 'ms'); })"
#验证算法无 react/store依赖
grep -E "(react|store)" src/maze/AlgorithmMazeProvider.ts && echo "FAIL" || echo "OK"
```

##风险
|风险 |可能性 |缓解 |
|---|---|---|
| 算法大尺寸性能 | 中 | Task3性能测试；如失败改 iterative DFS |
| mode 分支过多 | 中 | Rules.ts 函数拆分 <50行 |
| seed持久化破坏旧数据 | 低 | levelStore.best schema兼容 |

##验收
- [x] 所有 Task 勾选完成（Task7/8/10 deferred 子项已标注且原因明确）
- [x] 验证命令全部通过：`npm run typecheck` ✅ / `npm test` 260/260 ✅ / `npm run build` ✅
- [x] spec §11 完成清单反映实际 ship 状态
- [x] README.md / roadmap.md / spec.md / plan.md 同步更新
