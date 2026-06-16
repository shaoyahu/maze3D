import { JsonMazeProvider } from './JsonMazeProvider';
import type { MazeLoader } from './JsonMazeProvider';

// F-project-review-2026-06-13-A-HIGH-4: hoist the built-in-level glob + the
// per-file loader wrappers out of `App.tsx`'s `useMemo` into a module-level
// singleton. The previous version rebuilt every loader closure on every
// `customLevels` change (i.e. on every save), even though the built-in
// catalog never changes between mounts. Vite evaluates `import.meta.glob`
// itself at build time, but the per-file async wrapper was still allocated
// repeatedly inside the component body.
//
// After the hoist, `BUILT_IN_JSON_PROVIDER` is constructed exactly once at
// module load. App.tsx then wraps it in an `EditorMazeProvider` per-render
// (so a fresh overlay picks up the latest `customLevels`), but the inner
// provider — and its glob result — is shared across all consumers.
//
// Singleton identity is asserted by
// `tests/unit/maze/builtInLevels.test.ts:21-27`.
//
// Note: `import.meta.glob('/public/levels/*.json')` returns a record of
// `{ [path]: () => Promise<Module> }` — Vite injects the static import for
// each matched file at build time, so no runtime directory scan is
// involved.
const BUILT_IN_MODULES = import.meta.glob('/public/levels/*.json');

/**
 * Build the loader id from a glob path like
 * `/public/levels/level-tiny.json` → `'level-tiny'`. The trailing `.json`
 * is stripped, the leading path segments are dropped. Exported for tests
 * that need to assert the id format independently of the provider.
 */
export function builtInIdFromPath(path: string): string {
  const filename = path.split('/').pop() ?? path;
  return filename.replace(/\.json$/, '');
}

/**
 * Wrap Vite's per-file loader so it returns the level payload directly.
 * Vite imports JSON modules with a `{ default: <data> }` envelope, so we
 * unwrap `.default` when present and fall back to the module itself.
 * Exported for tests; the production path doesn't need it.
 */
function makeBuiltInLoader(loader: () => Promise<unknown>): MazeLoader {
  return async () => {
    const mod = await loader();
    return (mod as { default?: unknown }).default ?? mod;
  };
}

/**
 * Module-level singleton `JsonMazeProvider` for the built-in level catalog
 * at `/public/levels/*.json`. Constructed once at module load; the same
 * instance is reused across all consumers (App, editor, etc.) so the
 * glob + loader-wrapping work is paid exactly once per app boot.
 *
 * Consumers that need a `Record<string, MazeData>` (i.e. the editor's
 * custom-level overlay) should wrap this provider in an
 * `EditorMazeProvider`; see `App.tsx` for the canonical wiring.
 */
export const BUILT_IN_JSON_PROVIDER: JsonMazeProvider = new JsonMazeProvider(
  Object.fromEntries(
    Object.entries(BUILT_IN_MODULES).map(([path, loader]) => [
      builtInIdFromPath(path),
      makeBuiltInLoader(loader),
    ]),
  ),
);
