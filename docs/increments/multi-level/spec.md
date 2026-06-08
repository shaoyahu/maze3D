# 多关卡 JSON — 设计文档（Spec）

**Slug**: multi-level
**状态**: draft
**日期**:2026-06-08
**对应路线图项**: P2-1
**依赖**:—
**复杂度**: Small

##1.概述
新增中尺寸（medium）与大尺寸（large）固定关卡 JSON，扩展关卡选择界面，让玩家有完整的难度梯度（小 / 中 / 大）。MVP 只完成 small，本增量补齐 medium 与 large 两个尺寸。

##2.目标 / 非目标

###目标
- 新增 `public/levels/level-medium.json`（建议20×20）
- 新增 `public/levels/level-large.json`（建议30×30）
- 关卡选择界面自动列出三个难度
- 中、大关卡可通关并产生 best record
- 三档难度的 `rules.initialTime` 按尺寸递增（small60s, medium120s, large180s）

### 非目标
- 程序生成关卡（属于 P2-3）
- 关卡编辑器（属于 P2-4）
- 新增玩法机制（仅扩展关卡池）

##3. 用户故事
- 作为玩家，我想要选择不同难度的关卡，以便挑战自己
- 作为休闲玩家，我想要小尺寸关卡快速通关
- 作为核心玩家，我想要大尺寸关卡有更长的游玩时间

##4. 功能需求
- FR-1：新增 `public/levels/level-medium.json`，尺寸20×20，路径连通
- FR-2：新增 `public/levels/level-large.json`，尺寸30×30，路径连通
- FR-3：每个新关卡的 `rules.initialTime` 按尺寸递增
- FR-4：`LevelSelect.tsx` 自动列出 `public/levels/` 下所有可用 JSON
- FR-5：关卡卡片显示尺寸 /预计时长
- FR-6：三个关卡都通过 smoke test（可通关到 exit）

##5. 数据 /类型变更
无新增 TypeScript 类型。复用现有 `MazeData`、`LevelRules`、`CellType`、`PickupType`。

##6.引擎 /架构影响
###受影响文件
| 文件 |改动 |说明 |
|---|---|---|
| `public/levels/level-medium.json` | CREATE | 中尺寸关卡 |
| `public/levels/level-large.json` | CREATE | 大尺寸关卡 |
| `src/ui/LevelSelect.tsx` | UPDATE | 显示尺寸与预计时长 |

###边界检查
-引擎层无改动
-仅 UI 层与静态资源改动

##7. UI /UX变更

###屏幕 /组件改动
- `LevelSelect.tsx`：每个关卡卡片新增"尺寸"与"预计时间"两行
- 关卡顺序按尺寸升序（小 → 中 → 大）

###交互流程
1.玩家在主菜单点击"开始"
2. 关卡选择界面列出三个关卡卡片
3. 点击某个卡片 → 进入 `playing`状态

##8.错误处理

###兜底行为
- 关卡 JSON 不合法 →沿用现有 `LevelLoadError`提示
- 关卡列表为空 → 显示"暂无关卡"
- 新增关卡无可通路径 → E2E校验失败，开发期拦截

##9. 测试策略

###单元测试
- `JsonMazeProvider.test.ts`：新增 medium/large fixture 测试解析

### E2E 测试
- `level-select.spec.ts`：扩展断言三个关卡都出现在选择界面
- 新增 `level-medium-smoke.spec.ts`：从 medium 关卡可达 exit
- 新增 `level-large-smoke.spec.ts`：从 large 关卡可达 exit
- 所有 E2E沿用 `level-tiny.json`模式做小尺寸端到端

##10.风险

|风险 |可能性 |缓解 |
|---|---|---|
| 大关卡性能下降 | 低 |30×30仍在 Three.js 单 draw call承受范围内；如需要再切 BatchedMesh |
| 关卡设计无解 | 中 |手工 review + E2E smoke兜底 |
| 关卡 JSON写错尺寸 | 低 | 用 `JsonMazeProvider` 测试覆盖 |

##11. 完成清单（拷贝自 `_template/dod.md`）

###11.1 功能验收
- [] FR-1 到 FR-6全部实现
- [] LevelSelect界面端到端走通（点击 → 进游戏）
- [] 边界情况显式列出（尺寸 /路径 / 时间）

###11.2引擎 /架构边界
- [] 引擎层无新增 import
- [] 无新增 `MazeProvider`实现
- [] 静态资源在 `dispose()`路径中无需特殊处理

###11.3 测试
- [] 单测覆盖率 ≥80%
- [] `JsonMazeProvider` 新增 medium/large fixture 测试通过
- [] RTL:`LevelSelect` 新增三个关卡的快照
- [] E2E:`level-select`扩展 + 新增两个 smoke spec
- [] `npm run typecheck` 与 `npm run build` 通过

###11.4文档
- [] `docs/increments/multi-level/spec.md`已写入（本文件）
- [] `docs/increments/multi-level/plan.md`待写
- [] README.md 的"Future increments"中标 P2-1 完成时移走

###11.5持久化与兼容
- [] 不破坏现有 best records（仅新增 levelId）
- [] 无新增设置项

###11.6 安全与健壮性
- [] JSON 输入走 `JsonMazeProvider`校验
- [] 无硬编码资源 URL

##12. 参考
- 设计 spec:`docs/superpowers/specs/2026-06-05-maze3d-first-person-game-design.md`
- DoD模板:`docs/increments/_template/dod.md`
- Phase1已有 `level-small.json` 与 `level-tiny.json`：`public/levels/`
-路线图:`docs/increments/_template/roadmap.md`
