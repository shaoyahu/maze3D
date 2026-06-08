# 程序生成关卡 + 新游戏模式 — 设计文档（Spec）

**Slug**: procedural-modes
**状态**: draft
**日期**:2026-06-08
**对应路线图项**: P2-3
**依赖**:—
**复杂度**: Large

##1.概述
两个相互配合的扩展：
（a）实现 `AlgorithmMazeProvider`，用递归回溯算法生成连通迷宫，集成到现有 `MazeProvider` 接口；
（b）扩展 `VictoryType` 已有的 `survive` 与 `time-trial`模式，实现新游戏模式（生存 /计时挑战）。

两者组合让游戏从"固定关卡 → 通关"扩展为"任意尺寸 → 多目标"。

##2.目标 / 非目标

###目标
- 新增 `src/maze/AlgorithmMazeProvider.ts`，实现 `MazeProvider` 接口
- 算法：递归回溯（recursive backtracker），保证单解路径
- 支持尺寸参数化（width × depth ≥5×5）
- `Game.startLevel(id, options?)`接收 `seed` 与 `mode` 参数
- 新增 `survive`模式：固定时间（120s）内被敌人碰到 N 次即 game-over（敌人系统来自 P2-4；本增量提供 mode框架与 rules，等 P2-4补敌人）
- 新增 `time-trial`模式：3 分钟内完成关卡即胜利，否则 game-over
- 关卡选择界面增加"程序生成"分组（尺寸 / seed / mode 可选）

### 非目标
-多种算法（仅递归回溯；预留接口给后续 Kruskal / Prim）
-难度自适应（玩家显式选尺寸）
-多人 /协作模式
- 服务器端 seed共享

##3. 用户故事
- 作为休闲玩家，我想要无限关卡，以便不会玩腻
- 作为竞技玩家，我想要 seed 可复现的关卡，以便挑战他人成绩
- 作为速通玩家，我想要 time-trial模式，以便专注通关速度

##4. 功能需求
- FR-1：新增 `AlgorithmMazeProvider` 类，实现完整 `MazeProvider` 接口
- FR-2：算法接受 `seed: number | string`（确定性）
- FR-3：算法保证 start 与 exit 间至少一条路径
- FR-4：算法生成时随机放置1-3个 `time` pickup
- FR-5：`LevelSelect.tsx` 新增"程序生成"分组，含尺寸 + seed 输入
- FR-6：`gameStore.startLevel` 新增 `options: { mode?, seed?, size? }` 参数
- FR-7：`Rules.ts` 实现 `survive` 与 `time-trial` 的胜负判定
- FR-8：`WinOverlay` 与 `GameOverOverlay` 显示对应 mode 的结果文案
- FR-9：`pause-resume.spec.ts`扩展：survive / time-trial模式下暂停正确
- FR-10：seed持久化到 `levelStore` 的 best records字段

##5. 数据 /类型变更

###新增 /修改的类型
- `src/maze/types.ts`：
 - `MazeProvider` 接口已存在，新实现 `AlgorithmMazeProvider`
 - `MazeData`字段保持不变
- `src/maze/MazeProvider.ts`：
 -扩展 `getMaze(options: { id, seed?, size?, mode? }): Promise<MazeData>`
- `src/store/gameStore.ts`：
 - `startLevel(id, options?)`接受可选 options
- `src/store/levelStore.ts`：
 - best record 增加 `seed?: string`字段
- `src/game/Rules.ts`：
 - `survive` mode: time=120s, hits≥3 → game-over
 - `time-trial` mode: time=180s → win

###边界检查
- 算法纯函数，输入 `(size, seed)` → 输出 `MazeData`
- 算法不依赖 React / Zustand

##6.引擎 /架构影响

###受影响文件
| 文件 |改动 |说明 |
|---|---|---|
| `src/maze/AlgorithmMazeProvider.ts` | CREATE | 新 provider |
| `src/maze/MazeProvider.ts` | UPDATE | 接口扩展 options |
| `src/store/gameStore.ts` | UPDATE | startLevel接受 options |
| `src/store/levelStore.ts` | UPDATE | best record schema兼容扩展 |
| `src/game/Rules.ts` | UPDATE | 新 mode胜负判定 |
| `src/game/GameState.ts` | UPDATE | 新 mode 的状态分支 |
| `src/engine/Game.ts` | UPDATE |接受 options传给 provider |
| `src/ui/LevelSelect.tsx` | UPDATE | 程序生成分组 |
| `src/ui/WinOverlay.tsx` | UPDATE | 显示 mode 结果 |
| `src/ui/GameOverOverlay.tsx` | UPDATE | 显示 mode 结果 |
| `tests/unit/maze/AlgorithmMazeProvider.test.ts` | CREATE | 单测 |
| `tests/e2e/procedural.spec.ts` | CREATE | E2E |

###边界检查
- `AlgorithmMazeProvider` 不 import react/store
- 算法是纯函数，便于测试
- 新增 mode 分支保持 Rules.ts <50行函数边界

##7. UI /UX变更

###屏幕 /组件改动
- `LevelSelect.tsx`：新增"程序生成"卡片，含尺寸 slider（10-30）与 seed 输入框
- `WinOverlay.tsx`：time-trial模式显示"用时 X 秒"
- `GameOverOverlay.tsx`：survive模式显示"被击中 N 次"

###交互流程（time-trial 示例）
1.玩家在 LevelSelect选 "time-trial"
2. 选择尺寸与 seed（默认随机）
3. 进入游戏，倒计时180s
4. 通关 → WinOverlay 显示成绩
5. 超时 → GameOverOverlay

##8.错误处理

###新增错误码
- `InvalidSeedError`：seed解析失败时使用 fallback
- `UnsolvableMazeError`：算法保证可解，此错误作为防御性日志

###兜底行为
- 算法超时（>2s）→退回 small JSON 关卡
- size <5×5 →强制最小尺寸
- 同 seed 重玩 → levelStore命中现有 best record

##9. 测试策略

###单元测试
- `AlgorithmMazeProvider.test.ts`：
 - 同 seed 同尺寸 → 同 MazeData
 - 不同 seed → 不同 MazeData
 - 所有 MazeData 通过可达性校验
 - 大尺寸（30×30）<500ms 完成
- `rules.test.ts`：扩展 survive / time-trial模式分支
- `gameStore.test.ts`：startLevel options传递
- `levelStore.test.ts`：seed字段持久化兼容

### E2E 测试
- `procedural.spec.ts`：选程序生成 → 进入 → 通关 → win
- `time-trial.spec.ts`：180s 超时 → game-over
-扩展 `pause-resume.spec.ts`：survive / time-trial 下暂停

##10.风险

|风险 |可能性 |缓解 |
|---|---|---|
| 算法在大尺寸性能差 | 中 |单元测30×30 <500ms；如不行换 iterative 实现 |
| seed碰撞（不同 seed 同 maze） | 低 | 用 FNV-1a hash +32-bit seed |
| mode状态机分支过多 | 中 | Rules.ts拆分独立函数；<50行 |
| best record schema升级破坏旧数据 | 低 |缺 seed字段时视为不同关卡 |

##11. 完成清单（拷贝自 `_template/dod.md`）

###11.1 功能验收
- [] FR-1 到 FR-10全部实现
- [] 程序生成关卡端到端可走通（选 → 进 → 通关）
- [] survive / time-trial mode胜负判定正确

###11.2引擎 /架构边界
- [] `AlgorithmMazeProvider` 实现完整 `MazeProvider` 接口
- [] 算法不 `import react/store`（grep验证）
- [] 新增 Three.js资源在 `dispose()` 中释放

###11.3 测试
- [] 单测覆盖率 ≥80%（新增4 个测试文件）
- [] 算法同 seed 同尺寸确定性测试通过
- [] RTL:LevelSelect 程序生成分组
- [] E2E:procedural / time-trial / pause-resume扩展
- [] `npm run typecheck` 与 `npm run build` 通过

###11.4文档
- [] `docs/increments/procedural-modes/spec.md`已写入（本文件）
- [] `docs/increments/procedural-modes/plan.md`待写
- [] README.md 的"Future increments"中标 P2-3 完成时移走
- [] spec §7 `MazeProvider` 接口反映新 options

###11.5持久化与兼容
- [] `levelStore.best` schema兼容（缺 seed字段为 undefined）
- [] 无新增 settingsStore字段
- [] 浏览器刷新后 seed 输入框保留最近一次（用 settingsStore 或独立 persistence）

###11.6 安全与健壮性
- [] seed 输入校验（仅数字 /字符串长度限制）
- [] 算法失败有兜底（退回 small JSON）
- [] 无 console.log残留

##12. 参考
- 设计 spec:`docs/superpowers/specs/2026-06-05-maze3d-first-person-game-design.md` §5 `MazeProvider`, §7 `VictoryType`
- 算法参考：Recursive Backtracker (Wikipedia)
- DoD模板:`docs/increments/_template/dod.md`
-路线图:`docs/increments/_template/roadmap.md`
