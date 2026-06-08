# {增量名称} — 设计文档（Spec）

**Slug**: {kebab-case-slug}
**状态**: draft → in-review → approved → done
**日期**: YYYY-MM-DD
**对应路线图项**: P2-N
**依赖**: {前置增量或"—"}
**复杂度**: {Small | Medium | Large | X-Large}

> 把本文件复制到 `docs/increments/<slug>/spec.md`，再按需修改占位符。

##1.概述
{2-3句话说明这个增量做什么、为什么做、解决了什么问题。}

##2.目标 / 非目标

###目标
- ...

### 非目标
- ...（明确写出来能防止范围蔓延）

##3. 用户故事
- 作为 {角色}，我想要 {行为}，以便 {价值}
- ...

##4. 功能需求
- FR-1: ...
- FR-2: ...
- FR-3: ...

##5. 数据 /类型变更

###新增 /修改的类型
- `src/maze/types.ts`:
- `src/store/*.ts`:

###新增 /修改的 Store字段
- `gameStore`:
- `levelStore`:
- `settingsStore`:

##6.引擎 /架构影响

###受影响文件
| 文件 |改动类型 | 说明 |
|---|---|---|
| ... | 新增 /修改 | ... |

###新增模块
- ...

###边界检查
-引擎层（`src/engine/`、`src/maze/`、`src/entities/`、`src/game/`、`src/utils/`）**不**新增对 `react` / `store/` 的 import
-任何对 `MazeProvider` 的新增实现必须实现完整接口
- 新增 Three.js资源在 `dispose()`路径中被释放

##7. UI /UX变更

###屏幕 /组件改动
- ...（每个屏幕/组件单独列一行）

###交互流程
1. 用户 ...
2. 系统 ...
3. ...

##8.错误处理

###新增错误码
- `*Error.kind`: ...

###兜底行为
- 输入非法 → ...
- 网络 /资源不可用 → ...

##9. 测试策略

###单元测试
-重点覆盖：...

###组件测试（RTL）
-重点覆盖：...

### E2E 测试（Playwright）
- 新增 spec：...
-复用 `level-tiny.json`模式：...

##10.风险

|风险 |可能性 |缓解 |
|---|---|---|
| ... | 高 /中 /低 | ... |

##11. 完成清单（拷贝自 `_template/dod.md`）

###11.1 功能验收
- [] 增量 spec 中"功能需求"列表全部实现
- [] 用户能从 UI触发该功能端到端走通（点击 →生效 →状态正确）
- [] 边界情况在 spec 或 plan 中显式列出并被覆盖

###11.2引擎 /架构边界
- [] 引擎层不新增对 `react` / `store/` 的 import
- [] 任何对 `MazeProvider` 的新增实现必须实现完整接口
- [] 新增 Three.js资源在 `dispose()`路径中被释放

###11.3 测试
- [] 单元测试覆盖率 ≥80%
- [] 新增的 Zustand action / Rule / Collision 分支必须有对应单测
- [] 涉及 UI 的改动必须有 RTL组件测试
- [] 涉及端到端流程的改动必须有 Playwright E2E
- [] `npm run typecheck` 与 `npm run build` 通过

###11.4文档
- [] `docs/increments/<slug>/spec.md`已写入
- [] `docs/increments/<slug>/plan.md`所有 checkbox 已勾
- [] README.md 的"Future increments"列表同步更新
- [] 新增的公共类型 / 常量 / 配置项在 spec §7反映

###11.5持久化与兼容
- [] 不破坏现有 `localStorage` schema
- [] 新增设置项使用 `settingsStore` 并在 settings UI 可调
- [] 浏览器刷新后状态合理恢复

###11.6 安全与健壮性
- [] 用户输入校验到位
- [] 错误处理走 `GameError`体系
- [] 无 console.log / debugger残留
- [] 无硬编码密钥 /资源 URL

##12. 参考
- 设计 spec：`docs/superpowers/specs/2026-06-05-maze3d-first-person-game-design.md`
- DoD模板：`docs/increments/_template/dod.md`
- Roadmap：`docs/increments/_template/roadmap.md`
- 相关 issue / PR: {链接或"—"}
