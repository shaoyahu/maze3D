# 多关卡 JSON —实施计划（Plan）

**Spec**: `docs/increments/multi-level/spec.md`
**复杂度**: Small
**日期**:2026-06-08

>步骤使用 `- []`语法追踪。执行时建议使用 `superpowers:subagent-driven-development` 子技能。

## 文件改动总览
| 文件 | 操作 |原因 |
|---|---|---|
| `public/levels/level-medium.json` | CREATE | 中尺寸关卡（20×20） |
| `public/levels/level-large.json` | CREATE | 大尺寸关卡（30×30） |
| `src/ui/LevelSelect.tsx` | UPDATE | 显示尺寸与预计时长 |
| `tests/unit/maze/JsonMazeProvider.test.ts` | UPDATE | 新增 medium / large fixture |
| `tests/e2e/level-medium-smoke.spec.ts` | CREATE | medium 关卡可达 exit |
| `tests/e2e/level-large-smoke.spec.ts` | CREATE | large 关卡可达 exit |
| `tests/e2e/level-select.spec.ts` | UPDATE |断言三关卡都在 |
| `README.md` | UPDATE | 从"Future increments"中移除 P2-1 |

##任务清单

### Task1: 设计 medium 关卡
- [] **Action**：手工编辑 `public/levels/level-medium.json`，20×20网格，手画一条从 start 到 exit 的通路，留几条岔路增加探索性，放置2-3个 `time` pickup。
- [] **Mirror**：复用 `level-small.json` 的 schema（spec §7）。
- [] **Validate**：`npm run test -- JsonMazeProvider`解析通过；`node tests/manual/check-path.js public/levels/level-medium.json`（一次性脚本）输出"reachable: true"。

### Task2: 设计 large 关卡
- [] **Action**：同上，30×30网格，通路更长（约30-50步），放置3-5个 pickup。
- [] **Validate**：`npm run test -- JsonMazeProvider`解析通过；可达性脚本通过；`initialTime=180s` 与规格一致。

### Task3:扩展 LevelSelect 显示尺寸与时长
- [] **Action**：在 `src/ui/LevelSelect.tsx` 的卡片组件中，从 `MazeData.size` 与 `rules.initialTime`派生显示"尺寸 W×D"与"预计 X 秒"两行；卡片按尺寸升序排列（小 → 中 → 大）。
- [] **Mirror**：沿用现有 `MazeData` 类型；不动 store。
- [] **Validate**：`npm run test -- LevelSelect` RTL快照包含"20×20"、"30×30"。

### Task4: 单测扩展
- [] **Action**：在 `tests/unit/maze/JsonMazeProvider.test.ts` 增加 `describe('medium/large')`，断言解析后 `size.width ===20 /30`。
- [] **Validate**：`npm run test` 通过；覆盖率 ≥80%。

### Task5: E2E smoke tests
- [] **Action**：
 - 新建 `tests/e2e/level-medium-smoke.spec.ts`：选 medium 关卡 → 通关 →断言 `win`。
 - 新建 `tests/e2e/level-large-smoke.spec.ts`：同上 large。
 -扩展 `tests/e2e/level-select.spec.ts`：断言三个关卡都出现。
- [] **Mirror**：复用现有 `level-tiny.json` 的 E2E模式（用最小可通关路径）。
- [] **Validate**：`npm run test:e2e` 全绿。

### Task6:文档同步
- [] **Action**：
 - `README.md` 的"Future increments"列表移除"Medium / large level JSONs"或打勾。
 - `docs/increments/_template/roadmap.md` 的 P2-1 行状态从 `pending`改为 `done`。
 - `docs/superpowers/specs/2026-06-05-maze3d-first-person-game-design.md` §12同步。
- [] **Validate**：grep `"Medium / large"` 在 `README.md` 中无匹配。

##验证

```bash
npm run typecheck
npm run test
npm run build
npm run test:e2e
```

##风险
|风险 |可能性 |缓解 |
|---|---|---|
|手工设计关卡不可达 | 中 |Task1 /2末尾跑可达性脚本 |
|大关卡首帧渲染卡顿 | 低 |若发生切换 BatchedMesh / InstancedMesh |

##验收
- [] 所有 Task勾选完成
- [] 验证命令全部通过
- [] spec §11 完成清单全部勾选
- [] README.md / roadmap.md / spec.md同步更新
