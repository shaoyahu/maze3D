# {增量名称} —实施计划（Plan）

**Spec**: `docs/increments/<slug>/spec.md`
**复杂度**: {Small | Medium | Large | X-Large}
**日期**: YYYY-MM-DD

> 把本文件复制到 `docs/increments/<slug>/plan.md`，再按需修改占位符。
>步骤使用 `- []`语法追踪。执行时建议使用 `superpowers:subagent-driven-development` 或 `superpowers:executing-plans` 子技能。

## 文件改动总览
| 文件 | 操作 |原因 |
|---|---|---|
| ... | CREATE / UPDATE / DELETE | ... |

##任务清单

### Task1: {name}
- [] **Action**: ...
- [] **Mirror**:沿用的模式（引用现有文件 / 函数）
- [] **Test**: 单测覆盖
- [] **Validate**: `npm run test ...`

### Task2: {name}
- [] **Action**: ...
- [] **Mirror**: ...
- [] **Test**: ...
- [] **Validate**: ...

### Task3: {name}
- ...

（继续添加任务直到覆盖 spec 中的所有 FR-N）

##验证

```bash
# 必须全部通过才能标记增量为 done
npm run typecheck
npm run test
npm run build
npm run test:e2e
```

##风险
|风险 |可能性 |缓解 |
|---|---|---|
| ... | 高 / 中 / 低 | ... |

##验收
- [] 所有 Task勾选完成
- [] 验证命令全部通过
- [] spec §11 完成清单全部勾选（参考 `_template/dod.md`）
- [] README.md 的"Future increments"列表同步更新
- [] Roadmap 中对应行从 `pending`改为 `done`

---

## 执行日志（实施时填写）

###实施日期
YYYY-MM-DD

###实际改动文件
（与上面"文件改动总览"对照，列出真实改动的文件）

###遇到的偏差
- spec 中计划 ...，实际做了 ...，原因 ...

### 测试覆盖
-单元覆盖率：...%
- 新增 / 修改测试：...

###备注
（任何给后续增量有参考价值的发现）
