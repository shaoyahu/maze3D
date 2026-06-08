# 完成定义 /验收标准模板（Definition of Done）

>镜像副本：`docs/superpowers/specs/2026-06-05-maze3d-first-person-game-design.md` 的 §14 Definition of Done。两份应保持同步；以 `_template/` 为单一入口维护时同步 spec。

每个增量（Phase2 项）完成后，必须满足以下检查项。所有项以 ✅标记才能视为该增量完成。

##14.1 功能验收
- [] 增量 spec 中"功能需求"列表全部实现
- [] 用户能从 UI触发该功能端到端走通（点击 →生效 →状态正确）
- [] 边界情况在 spec 或 plan 中显式列出并被覆盖

##14.2引擎 /架构边界
- [] 引擎层（`src/engine/`、`src/maze/`、`src/entities/`、`src/game/`、`src/utils/`）**不**新增对 `react` / `store/` 的 import
- [] 任何对 `MazeProvider` 的新增实现必须实现完整接口（不靠 duck typing）
- [] 新增 Three.js资源在 `dispose()`路径中被释放

##14.3 测试
- [] 单元测试覆盖率 ≥80%（`npm run test`）
- [] 新增的 Zustand action / Rule / Collision 分支必须有对应单测
- [] 涉及 UI 的改动必须有 RTL组件测试
- [] 涉及端到端流程的改动必须有 Playwright E2E（沿用 `level-tiny.json`模式）
- [] `npm run typecheck` 与 `npm run build` 通过

##14.4文档
- [] `docs/increments/<slug>/spec.md`存在且包含"完成"勾选清单（拷贝自 §14.1–14.3）
- [] `docs/increments/<slug>/plan.md` 所有任务 checkbox 已勾
- [] README.md 的"Future increments"列表同步更新（已完成的增量移走或打勾）
- [] 新增的公共类型 / 常量 / 配置项在 spec §7 或对应章节反映

##14.5持久化与兼容
- [] 不破坏现有 `localStorage` 的 best records / settings schema（必要时做迁移）
- [] 新增设置项使用 `settingsStore`，并在 settings UI 中可调
- [] 浏览器刷新后状态合理恢复

##14.6 安全与健壮性
- [] 用户输入校验到位（关卡 JSON、关卡编辑器输入等）
- [] 错误处理走 `GameError`体系，有 `userMessage`
- [] 不引入 console.log / debugger残留
- [] 不硬编码密钥 /资源 URL（必要时走 env 或常量）

---

> 在每个增量的 `spec.md` 与 `plan.md` 中，应把上面的 `- []`列表作为最终验收清单拷贝进去，逐项勾选后该增量才算完成。
