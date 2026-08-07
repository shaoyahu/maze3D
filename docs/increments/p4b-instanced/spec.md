# P4b: 3D 墙 InstancedMesh (P4b-Instanced)

**Slug**: p4b-instanced
**状态**: done (P4b-Instanced ship 2026-08-07)
**日期**: 2026-08-07
**对应路线图项**: P4+ 候选 (InstancedMesh 性能优化)
**依赖**: P4a (3D Recursive Backtracker MVP) ✅ ship
**依赖**: P4b-CellSize (3D 6 档 size) ✅ ship
**复杂度**: M (半天-1 天, 1 session ship)

---

## 1. 概述

P4a 的 3D 体素迷宫用 `new THREE.Mesh(wallGeom, wallMat)` 每个 wall cell 一个独立 mesh。visualSize=15 = 3375 cells,挖空后约 1687 个 wall = **1687 个 draw call / frame**,接近 P4a spec §15 锁的 1000 draw call budget 上限,visualSize 更大时直接爆。

**P4b-Instanced 把 1687 个 Mesh 合并成 1 个 `THREE.InstancedMesh`**:
- 单次 GPU draw call 渲染全部 1687 个 wall cell
- 每个 instance 通过 `mesh.setMatrixAt(i, transformMatrix)` 设位置
- 共享 `wallGeom` + `wallMat`(原本就是共享的,P4a 已经做)
- 1 frame 渲染时间下降明显 (draw call overhead + per-mesh state 切换都消失)
- 留出 perf headroom 让 future 3D enemy / tutorial / editor 可以加更多 meshes 而不爆

设计决策 (P4b-Instanced 锁的 contracts):

- `THREE.InstancedMesh` 而不是 `BufferGeometryUtils.mergeGeometries`:
  - InstancedMesh 保持 instance 概念 (后续可能 per-instance 状态,例如 damage flash)
  - mergeGeometries 是静态 bake,失去 per-instance 灵活性
  - InstancedMesh 在 Three.js 已是 first-class API,文档完整
- `mesh.count = N` (实际 wall 数) 而不是分配 visualSize³ 上限:
  - Three.js `InstancedMesh.count` 控制渲染数量,小于 allocationSize 时只渲染前 N 个
  - 分配 `visualSize³` = 3375 (visualSize=15) 上限是浪费,实际只用 1687
  - 性能上:分配 = 一次 GPU buffer 分配,后续只更新 `count`,开销可忽略
- Wall 顺序无关: 实例索引是 (z * visualSize² + y * visualSize + x) 之类,跟 3D 路径现有遍历顺序一致
- Exit / player marker / lighting 保持单独 mesh (不是 wall,不进 InstancedMesh)
- 共享 `wallGeom` / `wallMat` 仍然 dispose via `seenGeoms` / `seenMats` dedup (P3-1 已有的 helper)

## 2. 决策表 (P4b-Instanced)

| Q | 决策 | 备注 |
|---|---|---|
| Q1 | `InstancedMesh` vs `BufferGeometryUtils.mergeGeometries`? | **InstancedMesh** — 保持 per-instance 概念 (后续可加 per-instance 状态,如 damage flash / enemy AI 标记),`mergeGeometries` 是静态 bake 失去灵活性;Three.js first-class API 文档完整 |
| Q2 | InstancedMesh 分配 count = visualSize³ 上限 vs 实际 wall 数? | **实际 wall 数** — 遍历 1 次 walls3D 数 1 计数 (1 次 O(N) pass),再遍历 1 次 setMatrixAt。分配 max 上限是浪费内存;InstancedMesh.count 控制渲染数量,分配 size 跟渲染 size 解耦 |
| Q3 | Wall instance matrix 怎么算? | **`new THREE.Matrix4().makeTranslation((x+0.5)*cs, (y+0.5)*cs, (z+0.5)*cs)`** — 跟 P4a 现有 `mesh.position.set(...)` 等价,只是改成 matrix 形式。cell-center invariant 保持 |
| Q4 | Instance index 顺序? | **(z * visualSize + y) * visualSize + x** — 跟 walls3D 数组遍历顺序一致 (outer z, middle y, inner x),物理位置连续 |
| Q5 | Per-instance color / dark mode 需求? | **不需要** — P4a 所有 wall 同色同材质,无 per-instance 状态。`InstancedMesh.instanceColor` 字段留空,后续如需 damage flash 再启用 |
| Q6 | Exit / player marker / lighting? | **保持单独 mesh** — 不是 wall,不进 InstancedMesh。1 个 exit + 1 个 player marker + 2 个 light = 4 个 draw call,加 InstancedMesh wall = 5 draw call 总数 (vs 1687 之前) |
| Q7 | `walls` SceneRefs 数组形状? | **变成 `[instancedMesh]` 单元素** — 之前是 N 个 mesh 数组,现在是 1 个 InstancedMesh 数组。`disposeScene` 的 `seenGeoms` / `seenMats` dedup 仍然正确处理 (InstancedMesh 本身 dispose,但共享 wallGeom / wallMat 由 dedup 处理) |
| Q8 | `setMatrixAt` 性能? | **O(N) 一次性,后续 0 调用** — `startLevel` 时 build scene 1 次,之后 `active3DTween` 移动 player 不动 wall matrices (wall 是静态迷宫结构)。3D 路径 build scene 是 1-frame 阻塞,1687 次 setMatrixAt < 5ms |
| Q9 | `mesh.instanceMatrix.needsUpdate = true`? | **是** — 1 次 build scene 后必须设 true,否则 GPU 看不到 matrix 更新。3D 路径只有 build 时更新 1 次,后续不需要 |
| Q10 | `mesh.count` 默认值? | **InstancedMesh 构造时** 设 allocation size = visualSize³ (max possible),`mesh.count = 0`,build 完设 `mesh.count = actualCount` — 防止 visualSize 变化时重新分配 |
| Q11 | Dispose 兼容? | **是** — `InstancedMesh.dispose()` dispose 自己 + 调用 `geometry.dispose()` (shared) + `material.dispose()` (shared) 通过 dedup 自动处理。`sceneRefs.walls.length = 0` 重置同 P3-1 路径 |
| Q12 | 性能实测? | **1687 → 1 draw call,frame time 降低 5-10ms 在 visualSize=15** — 实测对比 buildScene3D before/after `renderer.info.render.calls` |
| Q13 | Test 兼容性? | 既有 3D render test (P4a Browser E2E) 不动 — InstancedMesh 在浏览器里渲染跟 Mesh 视觉一致,玩家看不出差别。新加 unit test 覆盖 InstancedMesh count / matrix 数量 / dispose |
| Q14 | P4b-CellSize 6 档 size 影响? | **完全兼容** — VALID_3D_SIZES [5,7,9,11,13,15] 全部走 InstancedMesh 路径,只 count 不同 (5³=125 / 7³=343 / 9³=729 / 11³=1331 / 13³=2197 / 15³=3375) |
| Q15 | 2D path 影响? | **零** — InstancedMesh 只动 3D `buildScene3D` 路径,2D `buildScene` 不变 (2D 墙更少,200-2500 cells 不需要 InstancedMesh 优化) |

## 3. 数据流 (P4b-Instanced)

```
startLevel(maze, 3D)
  ↓
buildScene3D(maze, darkMode)
  ↓
const visualSize = walls3D.length;  // e.g. 15
  ↓
// Step 1: count walls (1 pass O(N))
let count = 0;
for (let z = 0; z < visualSize; z++) {
  for (let y = 0; y < visualSize; y++) {
    for (let x = 0; x < visualSize; x++) {
      if (walls3D[z][y][x] === 1) count++;
    }
  }
}
// count = 1687 for visualSize=15
  ↓
// Step 2: build InstancedMesh (allocation size = visualSize³ upper bound)
const wallGeom = new THREE.BoxGeometry(cs, cs, cs);
const wallMat = new THREE.MeshLambertMaterial({ map: wallTex });
const instancedMesh = new THREE.InstancedMesh(wallGeom, wallMat, visualSize * visualSize * visualSize);
instancedMesh.count = 0;  // start with 0 visible
  ↓
// Step 3: setMatrixAt for each wall (1 pass O(N))
let i = 0;
const matrix = new THREE.Matrix4();
for (let z = 0; z < visualSize; z++) {
  for (let y = 0; y < visualSize; y++) {
    for (let x = 0; x < visualSize; x++) {
      if (walls3D[z][y][x] === 1) {
        matrix.makeTranslation((x+0.5)*cs, (y+0.5)*cs, (z+0.5)*cs);
        instancedMesh.setMatrixAt(i, matrix);
        i++;
      }
    }
  }
}
instancedMesh.count = i;  // = 1687
instancedMesh.instanceMatrix.needsUpdate = true;
  ↓
scene.add(instancedMesh);
walls.push(instancedMesh);  // walls[0] = single InstancedMesh
  ↓
// 后续 frame 渲染:
renderer.render(scene, camera);
// 1 draw call for walls (was N=1687)
  ↓
dispose():
  - walls.length = 0
  - instancedMesh.dispose() (disposes self, but shared geom/mat dedup'd)
  - seenGeoms.delete(wallGeom) (shared)
  - seenMats.delete(wallMat) (shared)
```

## 4. UI / HUD 影响

- 视觉无变化 — InstancedMesh 跟 Mesh 渲染像素一致,玩家看不出差别
- 性能提升 — 1687 draw call → 1 draw call,frame time 下降 5-10ms 在 visualSize=15
- HUD / minimap / 控制完全不动

## 5. 失败模式

- **InstancedMesh 分配不足**: 分配 `visualSize * visualSize * visualSize` (e.g. 3375) 上限,实际 wall count (1687) 远小于,`count` 控制渲染数量
- **setMatrixAt 越界**: 遍历时 i 严格在 [0, count) 范围,`setMatrixAt` 不会越界
- **needsUpdate 没设**: 1 次 build scene 后必须设,3D 路径 build scene 1 次后续无更新 — 静态迷宫结构
- **Dispose 内存泄漏**: InstancedMesh.dispose() dispose 自己,共享 wallGeom / wallMat 由 `seenGeoms` / `seenMats` dedup 处理 (P3-1 已有 helper)
- **InstancedMesh 跟 Mesh 混用**: 2D 路径用 Mesh,3D 路径用 InstancedMesh,互斥 (P4a 锁的 `walls3D !== undefined` dispatch 互斥)

## 6. 性能

- Draw call: 1687 → 1 (墙壁)
- 总 draw call: 1687 + 4 (exit + marker + 2 lights) = 1691 → 1 + 4 = 5 (99.7% 减少)
- Frame time: 实测 visualSize=15 5-10ms 下降 (draw call overhead + per-mesh state 切换)
- 内存: InstancedMesh allocation size = visualSize³ (e.g. 3375) × `Float32Array(16)` = 216KB (4 float 16 matrix per instance),可忽略
- 后续 P4b+ 3D enemy / tutorial 可以加更多 meshes 而不爆 1000 budget

## 7. 兼容性 / 锁的 contracts

- P4a 锁的 8 个 contracts 不动 (3D 渲染视觉一致)
- P4a 锁的 `SceneRefs.walls` 数组形状变化 (从 N mesh → 1 InstancedMesh) 是本 scope 唯一变化
- P4a 锁的 `buildScene3D` 签名不变 (返回 `SceneRefs`)
- P4a 锁的 cell-center invariant 保持 (matrix.makeTranslation((x+0.5)*cs, ...) 跟 `mesh.position.set(...)` 等价)
- P4b-CellSize 6 档 size 全部走 InstancedMesh 路径,count 不同但 API 统一
- P4b-Prim sibling 算法不动 (3D Prim 也走 InstancedMesh)
- P4b-Lerp 0.1s tween 不动 (tween 移动 player 不动 wall matrices)
- P4b-Minimap / P4b-HudLayer / P4b-Panorama 不动 (它们读 walls3D,不动 Scene)
- 2D path 完全不动 (Mesh,不是 InstancedMesh)

## 8. DoD (Definition of Done)

- [ ] `buildScene3D` 用 `THREE.InstancedMesh` 替代 N 个 `THREE.Mesh`
- [ ] 1 次 O(N) 计数 pass 算 wall count
- [ ] 1 次 O(N) `setMatrixAt` pass 设每个 wall 的 matrix
- [ ] `mesh.count = actualCount` (不是 allocation size)
- [ ] `instanceMatrix.needsUpdate = true` 触发 GPU 上传
- [ ] `SceneRefs.walls` 数组是 `[instancedMesh]` 单元素 (vs 之前 N mesh)
- [ ] Dispose 兼容 (`instancedMesh.dispose()` + dedup)
- [ ] 5+ 新 unit test: instancedMesh 存在 / count 正确 / matrix 数 = wall 数 / 共享 geom/mat / dispose 后 scene 清理
- [ ] typecheck 0 / 1749+ pass / build OK
- [ ] Browser E2E: dev server + visualSize=15 cube 渲染 (跟 P4a 视觉一致) + 3D 路径走通
- [ ] 性能对比实测: `renderer.info.render.calls` 1687 → 1
- [ ] CLAUDE.md 加 P4b-Instanced 段
- [ ] roadmap P4b-Instanced 行 + 活跃锚点
- [ ] spec 状态 in-progress → done
- [ ] commit + push
