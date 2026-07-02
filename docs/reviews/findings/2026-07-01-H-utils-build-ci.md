# Finding H — Utils / Build / CI (2026-07-01)

**Reviewer**: caveman:cavecrew-reviewer (utils/build domain)
**Parent review**: [`../2026-07-01-full-code-review.md`](../2026-07-01-full-code-review.md)
**Scope**: `src/utils/**`, `src/hooks/**`(非 useAutoSave)、`package.json`、Vite/Vitest/Playwright 配置、`index.html`、`.github/**`

## Confirmed Findings

### FCR-L-7: `App.tsx` 无 `React.lazy` 路由分包
- **File**: `src/ui/App.tsx` (`AppRoutes`)
- **Status**: 6 个 route component(`MainMenu` / `LevelSelect` / `Settings` / `EditorPage` / `GamePage` / `NotFound`)全部 eager import。Three.js 全量在初始 bundle。
- **Fix**: 
  ```ts
  const EditorPage = React.lazy(() => import('./editor/EditorPage').then(m => ({ default: m.EditorPage })));
  // 包裹 <Suspense fallback={...}>
  ```
  预期 manualChunks 把 three 拆到独立 chunk,首屏降低 ~300 KB。

### FCR-L-8: `import * as THREE from 'three'` 6 处阻止 tree-shaking
- **Files**: src/engine/Camera.ts · Renderer.ts · Scene.ts · Game.ts · src/entities/Player.ts · Pickup.ts
- **Status**: namespace import 让 Vite/Rollup 无法做精确 dead-code elimination。Bundle 960 KB(266 KB gzip)。
- **Fix**: 改 named imports:
  ```ts
  import { Vector3, Mesh, ... } from 'three';
  ```
  配合 `vite.config.ts` `build.rollupOptions.output.manualChunks: { three: ['three'] }`,预期降至 ~600 KB。

### FCR-L-9: `vite.config.ts` 硬编码端口 5173
- **File**: [vite.config.ts:18](../../vite.config.ts#L18)
- **Status**: `server.port: 5173`。端口忙时 Vite 自动 +1,功能正常,但开发者在 container / 多 workspace 下端口冲突体验差。
- **Fix**: 改 `strictPort: false`(默认)+ 文档化"如需固定端口可加环境变量 `VITE_PORT`"。

### FCR-L-10: `vitest.config.ts` exclude 注释陈旧
- **File**: [vitest.config.ts:32-47](../../vitest.config.ts#L32-L47)
- **Status**: line 32-37 注释说"以下 3 文件已移除",但 line 39-47 仍 exclude `engine/Camera.ts` / `engine/Renderer.ts` / `engine/Loop.ts`。注释与实际矛盾。
- **Fix**: 更新注释,或实际把 3 文件移出 exclude(若覆盖率已达标)。

### FCR-L-11: CI Node 20 vs 文档 Node 18+
- **File**: `.github/workflows/deploy.yml:31`
- **Status**: CI 用 Node 20,`docs/CLAUDE.md` 写"Node 18+"。Node 20 ≥ 18,功能上 OK,但文档与实际不一致;若有人按 Node 18 验证,可能踩到 20 独有 feature 假设。
- **Fix**: 在 `package.json` `engines.node: ">=18"` 显式声明,workflow 改 `node-version: [18, 20] matrix` 或固定 20 + 文档同步。

## Verified Clean

- ✅ `utils/seed.ts` FNV-1a + mulberry32 + `algo-v1-${algorithm}-${size}-${hex16}` 自描述;`decodeSeed` 三重验证(SEED_RE / VALID_ALGORITHMS / VALID_SIZES);重命名 Algorithm = 最佳成绩破坏已在 maze/types.ts:253-254 显式文档化
- ✅ `utils/gameUrl.ts` `parseGameSearchParams` 非法输入全部 fallback,不抛异常;`id` 长度上限 256;F-2026-06-16-H-2 `progressive=disabled` URL 修复已合入
- ✅ `utils/id.ts` / `errors.ts` / `getDisplayName.ts` / `time.ts` 正确
- ✅ `useAutoSave` mounted flag + getState lazy + callbacks in refs,防 post-unmount 回调
- ✅ `tsconfig.json` strict + project references 完整
- ✅ `package.json` `engines` / `scripts` / devDependencies 干净,无 phantom deps
- ✅ `vite build` 138 modules transformed,仅 1 chunk-size warning(非阻断)

## Subagent False Positives (corrected)

| 声称 | 实际 |
|------|------|
| `gameUrl.ts:148` 应返回 `error: 'bad-id'` 而非 `error: 'missing-id'` 区分 oversize-id | 实际函数语义正确——id 超 256 时确实就是 missing-id(超出合法范围视为缺失);`GameUrlError` 类型也匹配。属 stylistic,不是 bug。降级为 LOW (不写入)。 |
| `getDisplayName.ts:31` `maze.i18n?.[locale]` 类型不安全 | 实际类型守卫在 `i18n/types.ts` 完成,optional chain 正确。 |