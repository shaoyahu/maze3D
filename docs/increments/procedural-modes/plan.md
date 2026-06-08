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

### Task1: seeded RNG
- [] **Action**：在 `src/utils/random.ts` 新增 `seededRandom(seed: number): () => number`（mulberry32 实现）；FNV-1a hash 把字符串 seed 转32-bit int。
- [] **Validate**：`npm run test -- random` 同 seed 同输出 / 不同 seed 不同输出。

### Task2: AlgorithmMazeProvider 算法
- [] **Action**：`src/maze/AlgorithmMazeProvider.ts`：
 -接受 `{ size, seed }`。
 -递归回溯算法（迭代实现避免栈溢出）：从 start出发随机选未访问邻居，挖通；最终保证全图连通。
 - start = (0,0)，exit = (width-1, depth-1)。
 -随机放1-3 个 `time` pickup。
- [] **Mirror**：实现 `MazeProvider` 接口（spec §5）。
- [] **Validate**：单测（Task3）。

### Task3: AlgorithmMazeProvider 单测
- [] **Action**：`tests/unit/maze/AlgorithmMazeProvider.test.ts`：
 - 同 seed 同尺寸 →同一 `MazeData`。
 - 不同 seed → 不同 `MazeData`。
 -30×30 完成 <500ms（`performance.now()`）。
 - 所有输出 `walls` 经 DFS验证 start ↔ exit 可达。
- [] **Validate**：`npm run test` 通过。

### Task4: MazeProvider 接口扩展
- [] **Action**：`src/maze/MazeProvider.ts` 把 `getMaze`签名扩展为 `getMaze(options: { id, seed?, size?, mode? }): Promise<MazeData>`；`JsonMazeProvider`忽略 seed/size（用 JSON 内置字段）。
- [] **Mirror**：两个 provider 都实现完整新接口。
- [] **Validate**：`npm run typecheck` 通过。

### Task5: gameStore.startLevel options
- [] **Action**：`src/store/gameStore.ts` 的 `startLevel`接受 `options?: { seed?: string; size?: { width, depth }; mode?: VictoryType }`，存入 `currentOptions`。
- [] **Validate**：`npm run test -- gameStore`覆盖 options传递。

### Task6: Game.ts传递 options
- [] **Action**：`src/engine/Game.ts` 的 `startLevel(levelId, options?)` 把 options转发给 `mazeProvider.getMaze`。
- [] **Validate**：手动调用 `startLevel('procedural', { seed: 'test' })` 生成对应 maze。

### Task7: Rules.ts mode判定
- [] **Action**：`src/game/Rules.ts`：
 - `mode: 'reach-exit'` →维持现有逻辑。
 - `mode: 'survive'` → time=120s + enemy命中 ≥3 → game-over（敌人来自 P2-4，未到位前 hits=0 不触发）。
 - `mode: 'time-trial'` → time=180s 内 reach exit → win，否则 game-over。
- [] **Validate**：`npm run test -- rules`三个 mode 分支覆盖。

### Task8: WinOverlay / GameOverOverlay 显示
- [] **Action**：
 - `WinOverlay.tsx`：time-trial 时显示"用时 X 秒"。
 - `GameOverOverlay.tsx`：survive 时显示"被击中 N 次"。
- [] **Validate**：`npm run test -- WinOverlay GameOverOverlay` RTL覆盖。

### Task9: LevelSelect 程序生成分组
- [] **Action**：`src/ui/LevelSelect.tsx` 新增"程序生成"卡片：尺寸 slider（10-30）+ seed文本输入 + mode 下拉（survive / time-trial / reach-exit）。
- [] **Validate**：`npm run test -- LevelSelect`覆盖程序生成分组渲染。

### Task10: E2E
- [] **Action**：
 - `procedural.spec.ts`：选程序生成 → 进游戏 → 通关 → win。
 - `time-trial.spec.ts`：超时 → game-over。
 - `pause-resume.spec.ts`扩展：survive / time-trial暂停正确。
- [] **Validate**：`npm run test:e2e` 全绿。

### Task11:文档同步
- [] **Action**：README / roadmap / spec同步更新。
- [] **Validate**：grep验证。

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
- [] 所有 Task勾选完成
- [] 验证命令全部通过
- [] spec §11 完成清单全部勾选
- [] README.md / roadmap.md / spec.md同步更新
