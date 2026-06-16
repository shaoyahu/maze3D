import { JsonMazeProvider } from './JsonMazeProvider';

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
// Note: `import.meta.glob('/public/levels/*.json', { eager: true })` returns
// a record of `{ [path]: Module }` — Vite inlines each JSON module into the
// main bundle at build time, so there is no runtime chunk fetch and no
// per-chunk path-prefix problem on subpath deploys.
//
// Why `eager: true`? Without it, the default is `{ eager: false }` which
// returns a `{ [path]: () => Promise<Module> }` record whose value is a
// *dynamic import* — Vite emits each JSON as a separate chunk and references
// it via `import('./level-tiny-HASH.js')` (relative). On a GitHub Pages
// subpath deploy (https://<user>.github.io/maze3D/), the browser resolves
// the relative path against the page's origin, dropping the `/maze3D/`
// prefix and 404-ing on `level-tiny-*.js`. `eager: true` bypasses the
// dynamic import and inlines the JSON into the entry chunk alongside the
// app code, where the URL is irrelevant. See F-2026-06-16-deploy-1.
const BUILT_IN_MODULES = import.meta.glob<unknown>('/public/levels/*.json', { eager: true });

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
// Eager glob: unwrap each JSON module's `{ default: <data> }` envelope up
// front (Vite's import shape) so JsonMazeProvider can store the data
// directly. Provider accepts either a loader fn or pre-validated data
// (see JsonMazeProvider comment), so we pass the unwrapped data here.
function unwrapEagerBuiltIn(mod: unknown): unknown {
  return (mod as { default?: unknown }).default ?? mod;
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
  // Eager glob: BUILT_IN_MODULES values are already the parsed JSON
  // modules. Unwrap the Vite `{ default: <data> }` envelope here and
  // hand the raw data to JsonMazeProvider — it accepts either a loader
  // function or pre-validated data (see its constructor comment).
  // Unwrapping eagerly also lets `validateMaze` run its structural
  // checks (id matches filename, etc.) exactly once at module load,
  // matching the lazy-path behavior.
  Object.fromEntries(
    Object.entries(BUILT_IN_MODULES).map(([path, mod]) => [
      builtInIdFromPath(path),
      unwrapEagerBuiltIn(mod),
    ]),
  ),
);
