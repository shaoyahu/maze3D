# maze3D — 项目文档

本目录按"项目阶段 + 增量 + 评审"组织所有设计、计划、评审文档。

## 阅读顺序（建议）

1. **`roadmap.md`** — 主路线图。当前活跃增量、完成情况、Phase 1 / Phase 2 总任务列表。
2. **`mvp/design.md`** + **`mvp/plan.md`** — Phase 1（MVP）的原始设计与完整实施计划。
3. **`increments/p2-N-<slug>/spec.md`** — 任意 Phase 2 增量的设计文档（why & what）。
4. **`increments/p2-N-<slug>/plan.md`** — 该增量的实施计划（how & 验证）。
5. **`reviews/2026-MM-DD-*.md`** — 历史代码评审。

## 目录结构

```
docs/
├── README.md                          # 本文件
├── roadmap.md                         # 主路线图（Phase 2 增量表 + 总任务列表）
├── mvp/                               # Phase 1（MVP）原始设计与计划
│   ├── design.md                      #   主设计文档
│   └── plan.md                        #   完整实施计划
├── reviews/                           # 代码评审
│   ├── 2026-06-10-full-code-review.md
│   └── 2026-06-11-code-review.md
├── _template/                         # 增量文档模板
│   ├── increment-spec.md
│   ├── increment-plan.md
│   └── dod.md                         # Definition of Done
└── increments/                        # Phase 2 增量（按 P2-N 序号排序）
    ├── p2-2-dark-mode-pickups/        { spec.md, plan.md, review.md }
    ├── p2-3-procedural-modes/         { spec.md, plan.md }
    ├── p2-4a-enemies-editor/          { spec.md, plan.md, review.md }
    ├── p2-4b-level-editor/            { spec.md, plan.md }
    ├── p2-5-ui-and-rebalance/         { spec.md, plan.md, review.md }
    ├── p2-6-level-select-cascading-redesign/  { spec.md, plan.md, review.md, task-list.md }
    └── p2-7-custom-dialog/            { spec.md, plan.md }    # 进行中
```

## 约定

- **每个增量**的最小文件集 = `spec.md` + `plan.md`，完成后补 `review.md`。
- **`task-list.md`** 是可选的"为什么 / 谁 / 什么时候"工作清单；仅 P2-6 用了。
- **P2-3 / P2-4b 缺 `review.md`** 是已知历史现状，不影响增量完整性。
- **增量目录命名** = `p2-N[-a/b]-<slug>/`，按时间排序；N 序号由 `roadmap.md` 分配。
- **`roadmap.md` 的 §12 与 `phase1/design.md` 的 §12 Roadmap 互为镜像**。

## 同步约束

`docs/roadmap.md` 与 `docs/mvp/design.md` 的 §12 Roadmap 互为镜像副本。修改时：

- 若改动影响 Phase 1 的全局设计 → 改 `mvp/design.md`，同步 `roadmap.md`。
- 若仅是当前 P2-N 增量的状态变化 → 改 `roadmap.md` 即可。
