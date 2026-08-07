# P4b 实施计划 (3D 墙 InstancedMesh)

**Slug**: p4b-instanced
**复杂度**: M (半天-1 天, 1 session ship)
**依赖**: P4a + P4b-CellSize 全部 ✅

---

## Task Table (P4b-Instanced)

| # | 文件 | 类型 | 内容 | 状态 |
|---|---|---|---|---|
| 1 | docs/increments/p4b-instanced/{spec,plan}.md | ADD | 增量文档 | [x] |
| 2 | src/engine/Scene.ts | UPDATE | `buildScene3D` 改用 `THREE.InstancedMesh` 替代 N mesh;1 pass 计数 + 1 pass setMatrixAt;`instanceMatrix.needsUpdate = true`;`SceneRefs.walls` 变 `[instancedMesh]` 单元素 | [ ] |
| 3 | tests/unit/engine/Scene.3D.test.ts (NEW) | ADD | 5+ case: instancedMesh 存在 / count 正确 / matrix 数 = wall 数 / 共享 geom/mat / dispose 清理 | [ ] |
| 4 | CLAUDE.md | UPDATE | P4b-Instanced 段 (在 P4b-Panorama 段后) | [ ] |
| 5 | docs/roadmap.md | UPDATE | 加 P4b-Instanced 行 + 活跃锚点 | [ ] |
| 6 | spec.md | UPDATE | 状态 in-progress → done | [ ] |
| 7 | Commit + push | — | `feat(p4b): 3D 墙 InstancedMesh (1687 → 1 draw call)` | [ ] |

## 实施顺序

1. **Task 1 (docs)** — spec + plan 锁 ✓
2. **Task 2 (Scene.ts InstancedMesh)** — 改 buildScene3D 用 InstancedMesh
3. **Task 3 (新 test)** — Scene.3D.test.ts 5+ case 覆盖 InstancedMesh
4. **集成验证** — typecheck + test + build + Browser E2E + 性能对比
5. **Task 4-6 (docs)** — CLAUDE.md + roadmap + spec
6. **Task 7 (commit + push)** — 独立 ship

## 关键设计点 (Q&A 复盘)

### Q1 InstancedMesh vs mergeGeometries

**选 InstancedMesh**。原因:
- 保持 per-instance 概念,后续可加 per-instance 状态 (damage flash / enemy AI 标记 / 动态颜色)
- mergeGeometries 是静态 bake,失去 per-instance 灵活性,后续重构 InstancedMesh 更麻烦
- Three.js first-class API 文档完整,生态好
- 性能上 InstancedMesh 1687 → 1 draw call 已经满足需求,mergeGeometries 也是 1 draw call 但灵活性差

### Q2 分配 count = 实际 wall 数 vs visualSize³ 上限

**选 实际 wall 数**。原因:
- InstancedMesh.count 控制渲染数量,小于 allocationSize 时只渲染前 N 个
- 分配 visualSize³ = 3375 上限 (visualSize=15) 是浪费,实际只用 1687
- 1 次 O(N) pass 计数 (loop + if 简单),< 1ms 开销
- 内存上: 1687 / 3375 = 50% 节省,visualSize=5 时 100% 节省 (实际 87 vs 上限 125)

### Q3 Instance index 顺序

**选 (z * visualSize + y) * visualSize + x**。原因:
- 跟 walls3D 数组遍历顺序一致 (outer z, middle y, inner x)
- 物理位置连续 (z 最慢变,x 最快变),GPU cache locality 好
- 跟 `walls3D[z][y][x]` 索引 1:1 对应,代码可读性高

### Q4 Exit / player marker 保持单独 mesh

**选 是**。原因:
- 不是 wall,不该进 InstancedMesh
- Exit 1 mesh + player marker 1 mesh + 2 lights = 4 draw call,加 InstancedMesh wall = 5 总 draw call (vs 1687 之前)
- 4 个 draw call 完全可接受,不是优化目标
- 保持单独 mesh 概念清晰,代码可读性高

### Q5 性能对比实测

**选 build/test 跑 `renderer.info.render.calls`**。原因:
- Three.js `WebGLRenderer.info` 提供每帧 draw call 计数
- 实测 visualSize=15 cube 应该 1687 → 1
- 跨 5³ / 7³ / 9³ / 11³ / 13³ / 15³ 6 档 size 实测,验证 count 正确
- 加到 Browser E2E 验证 (page console 读 `renderer.info.render.calls`)

## 锁的 contracts (跨 scope)

- `SceneRefs.walls` 数组形状变化 (N mesh → 1 InstancedMesh) 是本 scope 唯一变化
- `buildScene3D` 签名 + 返回 `SceneRefs` 不动
- cell-center invariant 保持 (matrix.makeTranslation((x+0.5)*cs, ...) 跟 mesh.position.set 等价)
- 共享 wallGeom / wallMat 不动 (P3-1 已有 helper dedup)
- 2D `buildScene` 路径完全不动
- 3D 路径视觉输出不变 (player 看到一样的迷宫)
- Exit / player marker / lighting 保持单独 mesh
- 后续 P4+ 3D enemy / tutorial / editor 可以加 meshes 而不爆 1000 budget (P4a §15 警告)

## 不在 scope

- ❌ `BufferGeometryUtils.mergeGeometries` 静态 bake — InstancedMesh 更灵活
- ❌ Per-instance color (damage flash / enemy AI 标记) — P4b+ 候选
- ❌ Frustum culling / octree culling — 1687 → 1 已经够,加 culling 复杂度上升
- ❌ 2D path InstancedMesh — 2D 墙更少 (≤ 2500 cells),不需要优化
- ❌ Light 作为 InstancedMesh — light 不是 mesh,保持单独
- ❌ Floor / ceiling InstancedMesh — 3D 没有 floor/ceiling 概念 (玩家在 cube 内部,不需要)
- ❌ 2D path 的 pickups / enemies / traps 优化 — 2D 路径有 entity 概念,3D 路径 P4a spec 锁的 0 entities
- ❌ LOD (level of detail) — visualSize 已经分档 (5/7/9/11/13/15),cell size 一致
- ❌ Dynamic wall matrices (e.g. 墙移动 / 隐藏) — 迷宫是静态的
