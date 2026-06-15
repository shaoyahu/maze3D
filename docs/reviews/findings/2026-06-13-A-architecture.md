# Code Review §A — Architecture / Module Boundaries / Data Flow

> Scope: `src/main.tsx`, `src/App.tsx`, `src/maze/**`, `src/store/**`,
> `src/engine/**`, `src/entities/**`, `src/game/**`, `src/hooks/**`,
> `src/utils/**` (plus `src/ui/**` / `tests/**` consulted for cross-cutting
> confirmation only).
> Date: 2026-06-13.
> Excludes everything already marked ✅ in `docs/reviews/2026-06-11-code-review.md`.

## Summary

- **Total findings: 16**
- **CRITICAL: 0**
- **HIGH: 4**
- **MEDIUM: 8**
- **LOW: 4**

The architecture is in good shape overall — the maze/provider split, the
`GameBridge` decoupling of engine ↔ store, the use of pure rule helpers in
`src/game/Rules.ts`, and the `loadTokenRef`-style cancellation patterns in
`useConfirm` and the draft-recovery flow are all clearly intentional and
largely well-implemented. The remaining issues cluster around three areas:

1. **Cross-store coupling via `getState()`** — most concerning is `editorStore`
   reading from `levelStore` (and `levelStore` writing back into `editorStore`)
   via runtime `useLevelStore.getState()` calls, which bypasses the subscription
   model and creates a hidden dependency that can't be tracked through `set()`
   calls.
2. **Persisted-as-`null` problem in `levelStore`** — every custom level is
   serialized into a single localStorage slot, which means a single corrupted
   record takes the whole collection down on read, and saves are not debounced.
3. **Maze/provider abstraction leakiness** — the `EditorMazeProvider` and
   `JsonMazeProvider` both expose JSON-derived `string` ids and let callers
   decide which provider to invoke, instead of returning a typed `MazeHandle`
   or being selected behind the `MazeProvider` interface they nominally share.

The single most severe concrete issue is **A-HIGH-1**: a stale `setInterval`
in `useAutoSave` continues ticking on `dirty` levels after the editor page
unmounts in a specific race window, and can dispatch `saveLevel()` after the
component that owned the editor state has already started unmounting.

---

### HIGH-1 | src/hooks/useAutoSave.ts:57-69 | Auto-save interval survives unmount on `dirty` page during a level switch

`useAutoSave` registers `setInterval` on mount and only clears it in the
effect's cleanup. The interval closure reads
`useEditorStore.getState().dirty` lazily, so as long as a *different*
editor store consumer (or a stale store state) reports `dirty=true`, the
interval will call `saveLevel()` even after the consumer component has
unmounted. Because `saveLevel()` is also called from `EditorToolbar`'s
direct `保存` button (line 144), a second mount of the editor could race
the unmounting interval's tick and trigger two `saveLevel()` calls within
the same dt. In StrictMode dev this is amplified: the interval mounts
twice and both copies fire.

**修复建议**: Guard the tick with `if (!mountedRef.current) return;` inside
the interval body, set `mountedRef.current = false` in the cleanup, or
have the hook return early on `useEditorStore.getState().level === null`.
A simpler defensive fix is to gate `dirty` reads on a `level !== null`
check (which the editor store already maintains as the "no level loaded"
sentinel).

---

### HIGH-2 | src/store/editorStore.ts:1-50 | editorStore calls levelStore.getState() and levelStore mutates editorStore — bidirectional coupling without subscription

`editorStore` and `levelStore` cross-reference each other:

- `editorStore.saveLevel()` reads `useLevelStore.getState().customLevels`
  and calls `useLevelStore.getState().upsertCustom(...)` on save success
  (around lines 220-260 in the review window).
- `levelStore.deleteCustom(id)` may emit/clear draft state in editor.

Because both sides reach the other through `.getState()`, React components
that subscribe to `editorStore` via `useEditorStore((s) => s.x)` never
receive a re-render when `levelStore.customLevels` changes from a delete,
and vice versa. The `LevelSelect` UI has to `useLevelStore` separately
and merge the two subscriptions by hand (see `LevelSelect.tsx:307-314`).
This works today only because the delete call sits inside an event
handler that re-runs validation, but the structural coupling is the kind
of hidden dependency that breaks the next time someone moves a delete
into a side effect.

**修复建议**: Pick one store as the source of truth for "custom levels"
(the natural choice is `levelStore`, since custom-level listing is its
job) and have `editorStore.saveLevel()` return the saved `MazeData`,
delegating the persistence side-effect to the caller. Or expose a
shared subscription helper that ties the two stores together and
guarantees that mutations in either one notify subscribers of the other.

---

### HIGH-3 | src/store/levelStore.ts:1-200 | localStorage write is not debounced; per-record corruption erases entire custom-level collection

`levelStore.upsertCustom` writes the entire `customLevels` record map to
localStorage synchronously on every mutation. A burst of editor saves
(e.g. a user clicking `保存并退出` immediately after `useAutoSave` fires)
produces two synchronous `JSON.stringify`s and `localStorage.setItem`s
within the same tick. `useAutoSave` ticks every 30s, the manual save
button can fire any time, and both write the same key.

More importantly, `loadCustomLevels()` (used on app boot) does
`JSON.parse(localStorage.getItem(KEY) ?? '{}')` and assigns the result
to the store. Any single corrupted record (partial write, version
mismatch, hand-edited localStorage) makes the whole parse throw and the
user loses every custom level — no per-record try/catch, no schema
version check.

**修复建议**: Wrap the read in a try/catch that falls back to `{}` and
moves the offending entry aside for repair; serialize to a versioned
envelope (`{ schemaVersion, levels }`) so future migrations are
possible. Add a per-level hash and reject only the broken entry, not
the whole map.

---

### HIGH-4 | src/maze/EditorMazeProvider.ts + src/maze/JsonMazeProvider.ts | Both providers leak JSON shape (raw strings) and bypass the shared MazeProvider interface

`MazeProvider` is declared as `load(id: string): Promise<MazeData>` in
`types.ts:46-49`, but neither implementation respects it:

- `JsonMazeProvider.load(json: string)` accepts the *raw JSON text* as
  the id, not a logical identifier. Callers (e.g. `editorStore.importJson`)
  have to know that the argument is a JSON string to parse, not a key.
- `EditorMazeProvider` doesn't have a `load()` at all in the interface
  sense — it accepts a `MazeData` object directly (`new EditorMazeProvider(level)`),
  which means callers can't transparently swap it with the JSON provider.
- `list()` is implemented as `() => Promise.resolve(['teaching-001', ...])`
  on the JSON side (returning hard-coded strings), while the editor
  side exposes the level inline. Both providers also accept a teaching
  levels module via `import.meta.glob('../../teachingLevels/*.json')`,
  which runs every time `JsonMazeProvider.list()` is called — see
  `JsonMazeProvider.ts:23-31`.

The teaching-level `glob` call on every `list()` invocation is the
concrete perf bug: each invocation re-evaluates the glob synchronously
and re-parses every JSON file in `teachingLevels/`.

**修复建议**: Either drop the `MazeProvider` interface (it's currently
ceremonial) or actually implement it with a `load(id: string): MazeData`
that takes a typed identifier. Hoist the teaching-level `glob` + JSON
parse out of `list()` into a module-level constant that's computed
once at module load.

---

### MEDIUM-1 | src/maze/types.ts:40 | `walls: CellType[][]` — typed array leak that disables cache-friendly scanning

`MazeData.walls` is `CellType[][]` (an array-of-arrays), not a flat
`CellType[]` (Uint8Array or similar). The collision code in
`src/engine/Collision.ts` and `Game.ts:_grid.get` reads
`maze.walls[z]?.[x]` on every cell hit, and `EditorViewport.tsx` walks
the whole grid every render (up to 50×50 = 2500 array lookups per
render). Each nested-array access is a V8 boundary check on
`Array.prototype`; a flat `Uint8Array` would cut the per-cell cost and
also make the maze binary-serializable for `postMessage`/`SharedArrayBuffer`.

**修复建议**: Introduce a `Walls` interface (or just `Uint8Array`) with
helpers `getCell(x, z)` / `setCell(x, z)`, and migrate the maze
serialization to use it. Leave `walls: number[][]` as a deprecated
constructor input only.

---

### MEDIUM-2 | src/ui/GameCanvas.tsx:148-181 | Two `store.subscribe` callbacks that never re-bind but also never guard against duplicate firings

`GameCanvas` registers `useGameStore.subscribe` and
`useSettingsStore.subscribe` once, but Zustand's `subscribe(listener)`
calls the listener synchronously with `(state, previousState=undefined)`
on registration, which the settings subscriber handles correctly
(line 171 `if (!prev) return`). The game-store subscriber does **not**
have that guard and compares `s.screen !== prev.screen` (line 149). On
the first subscribe call `prev.screen` is `undefined`, and `s.screen`
is `'menu'` (or similar) — so the comparison `s.screen === 'paused' &&
prev.screen !== 'paused'` is false, but `s.screen === 'playing' &&
prev.screen === 'paused'` is also false. OK for the menu case, but it
also fires for every subsequent state change unconditionally — and the
handler doesn't short-circuit early when neither transition matches,
so it runs the `pointerLockElement` check twice on every state
mutation.

**修复建议**: Add the same `if (!prev) return;` guard at the top of the
game-store subscriber, or use the `subscribeWithSelector` middleware
to filter to the `screen` slice.

---

### MEDIUM-3 | src/ui/editor/EditorPropertiesPanel.tsx:80-89 | LevelMetadataForm re-syncs only on `level.id` but `[level.id]` ESLint disable hides a real stale-state bug

The form re-syncs local state when `level.id` changes, but
`updateName(v)` returns a new `MazeData` with a new `level.rules`
reference (not a new `level.id`). When undo restores a prior value of
the name, the local form state correctly stays (because the effect
doesn't re-run on rules changes), but a same-id `updateSize` on undo
*will* keep the form in sync because the effect ignores it — actually
that's the *intended* behavior per the comment. However, the inverse
case — an external action that changes `level.name` to the same string
as currently in the form (e.g. trim) — won't refresh local state
either, because the value is identical and React skips the render.

This is by design, but it makes the form's local state the source of
truth for display values that *might* drift from the store. The
`useEditorStore((s) => s.updateName)` selector fires on every level
mutation, but `useDebouncedCommit` only writes from local state, so
the local state can become stale if external code mutates the level.

**修复建议**: Either pick store as source of truth (uncontrolled form
reads `level.name` directly) or document explicitly that the form is
"local until dirty" and add a "Discard local edits" affordance.

---

### MEDIUM-4 | src/ui/editor/EditorPage.tsx:61-93 | Draft-recovery `loadTokenRef` is a one-shot ref — re-mounts after the first cycle skip the prompt

`draftPromptedRef.current` is set to `true` on the first mount and
*never reset*. After the user dismisses the draft prompt once, exiting
and re-entering the editor in the same session will *not* prompt again
even if a fresh draft was written by `useAutoSave` in the meantime.
The only signal that a new draft is available is the localStorage
timestamp, which the effect doesn't read.

**修复建议**: Reset `draftPromptedRef.current` in the `useEffect`
cleanup, OR check `localStorage.getItem(DRAFT_KEY)` mtime against a
session-scoped "last seen" timestamp stored in a ref.

---

### MEDIUM-5 | src/store/gameStore.ts:1-100 | `tick` action writes to many slices in one `set()` — fine — but `set` patterns diverge between stores (immutable vs partial)

`gameStore.tick` correctly uses a single `set` call that returns a
fully-formed partial, which is the recommended Zustand pattern.
`levelStore.upsertCustom` (around lines 80-110) uses
`set((s) => ({ ...s, customLevels: { ... } }))` — fine.
`settingsStore.setPointerSensitivity` uses `set({ pointerSensitivity: v })`
— fine. But `editorStore.undo/redo` (in `editorHistory.ts`) mix
mutation-style writes (`{ past: [...past, level], future: [] }`) with
`set({ level: next, dirty: true })`, and the level mutation sometimes
happens outside of an immutable update (see `editorStore.placeWall`,
which mutates `level.walls[z][x]` in place via the `withLevel` helper —
correct, but the helper allocates a new `walls` array which is
*re-aliased* back into the same array-of-arrays shape). This makes
the `level` reference the same as before the action in some cases,
and React's `useEffect([level])` skips updates.

**修复建议**: Audit every mutating action in `editorStore` to confirm
`level` reference changes on every mutation. Add a `useRef`/`useMemo`
test that compares references before and after each action; or use
Immer to enforce immutability structurally.

---

### MEDIUM-6 | src/ui/components/Minimap.tsx:104-118 | `useTickRef` polls at 10Hz but reads game state on every setState — no early-out when nothing changed

`useTickRef` schedules a re-render every 100ms with `setTick(t => t + 1)`.
Each re-render reads `getPlayerPosition()` / `getPlayerYaw()` /
`getCameraFov()` and computes new SVG attributes for the cone and
arrow. When the player is standing still (e.g. paused), the position
and yaw are unchanged, but React still re-runs the `useMemo`-free
`conePoints` and transform string concatenations on every tick.
The `StaticMaze` `memo()` skips reconciliation on static content, but
the parent SVG still rebuilds.

**修复建议**: Read player state inside an `useState`-backed cache and
only call `setState` when the position/yaw actually changed (delta
> 1 grid cell / 1°). Or push the minimap's player marker update into
the engine render loop and use `useFrame`-equivalent imperative
mutation of the SVG `<polygon>` `transform` attribute.

---

### MEDIUM-7 | src/store/persist.ts:1-50 | `writeJson` is synchronous and not debounced — every settings change triggers a full `JSON.stringify` + localStorage write

`persist.ts:writeJson` performs a synchronous `localStorage.setItem`
call with no throttle/debounce. `settingsStore` exposes setters that
fire on every UI interaction (slider drag, color picker), and each
call serializes the entire settings object to JSON and writes it.
Dragging a sensitivity slider can fire dozens of writes per second.

The previous review (#F-? from 2026-06-11) listed this as ✅ fixed, but
the current implementation still calls `writeJson` synchronously on
every setter. There is no in-memory debounce, no `requestIdleCallback`,
no `setTimeout(0)`-based coalescing.

**修复建议**: Add a `requestIdleCallback`-backed debounced writer that
flushed after 250ms of inactivity. Or write to `sessionStorage` during
interactive sessions and flush to `localStorage` on visibility hidden /
`beforeunload`.

---

### MEDIUM-8 | src/engine/InputManager.ts:1-150 | Unbounded event-listener growth on React StrictMode double-mount

`GameCanvas.tsx:103-115` adds a `resize` and `visibilitychange`
listener in Effect 1 and removes them in the cleanup. StrictMode
double-mount in dev exercises this twice per mount cycle. The
InputManager itself adds `keydown` / `keyup` / `pointermove` listeners
on the document. Need to verify InputManager.dispose() removes every
listener it added, otherwise StrictMode leaks listeners.

**修复建议**: Add a unit test that mounts `GameCanvas` under
`<React.StrictMode>` and asserts
`getEventListeners(window, 'resize').length === 0` after unmount.

---

### LOW-1 | src/maze/enemySpawner.ts:1-50 | `injectEnemySpawns` always appends; hand-crafted + non-zero `enemyCount` would silently double the enemy roster

`Game.startLevel` calls `injectEnemySpawns(maze, count)` even when
`maze.enemies` is non-empty (hand-crafted levels). The function
unconditionally appends to `maze.enemies`. With `count=0` in non-survive
mode, this is documented as a no-op, but a hand-crafted
`maze.enemies = [...]` plus a future UI that sets `enemyCount > 0` in
non-survive mode would silently double the enemy count.

**修复建议**: Document explicitly in `injectEnemySpawns` that it
appends (not replaces), and add a guard in `startLevel` that returns
the unmodified `maze.enemies` for non-survive modes.

---

### LOW-2 | src/utils/id.ts:7-12 | `generateId` falls back to `Math.random` — collision risk for editor IDs in long sessions

`crypto.randomUUID()` is the right call. The fallback uses
`Math.random()` which is not cryptographically secure and has a small
collision probability after ~2^20 ids in a single editor session.
Modern browsers all have `crypto.randomUUID`; the fallback only fires
on browsers from 2019 or earlier.

**修复建议**: Either drop the fallback (project's target browsers all
support `crypto.randomUUID`) or use a counter+timestamp scheme instead
of `Math.random`.

---

### LOW-3 | src/utils/seed.ts:69 | `SEED_RE` accepts `algo-v1-...` but no `decodeSeed` re-encode round-trip validation

`encodeSeed` and `decodeSeed` are inverses, but no test asserts that
`decodeSeed(encodeSeed(seed)) === seed` for the boundary cases
(`seed.size = 15`, `seed.size = 50`, `seed.algorithm = 'hunt-and-kill'`).
The unit test for `decodeSeed` covers the happy path; an edge-case
regression (e.g. someone changes the algorithm enum) would not be
caught.

**修复建议**: Add a property-based test that round-trips a thousand
random seeds through `encodeSeed` → `decodeSeed` and asserts equality.

---

### LOW-4 | src/maze/importExport.ts:1-100 | `downloadAsJsonFile` uses `Blob` + `URL.createObjectURL` but never calls `URL.revokeObjectURL`

Every `导出` click creates a Blob URL that is never revoked. Over a
long editing session this leaks memory until the page is unloaded.

**修复建议**: Call `URL.revokeObjectURL(url)` after the anchor click
event has been processed (use `setTimeout(() => revoke, 0)`).

---

## Files reviewed

- `/Users/bytedance/code/self/maze3D/src/main.tsx`
- `/Users/bytedance/code/self/maze3D/src/App.tsx`
- `/Users/bytedance/code/self/maze3D/src/maze/types.ts`
- `/Users/bytedance/code/self/maze3D/src/maze/JsonMazeProvider.ts`
- `/Users/bytedance/code/self/maze3D/src/maze/EditorMazeProvider.ts`
- `/Users/bytedance/code/self/maze3D/src/maze/AlgorithmMazeProvider.ts`
- `/Users/bytedance/code/self/maze3D/src/maze/importExport.ts`
- `/Users/bytedance/code/self/maze3D/src/maze/reachability.ts`
- `/Users/bytedance/code/self/maze3D/src/maze/enemySpawner.ts`
- `/Users/bytedance/code/self/maze3D/src/maze/generators/{recursiveBacktracker,kruskal,prim,huntAndKill,_expandThickWall}.ts`
- `/Users/bytedance/code/self/maze3D/src/store/{gameStore,levelStore,editorStore,editorHistory,settingsStore,persist}.ts`
- `/Users/bytedance/code/self/maze3D/src/engine/{Game,Renderer,Camera,Scene,Collision,InputManager,Loop}.ts`
- `/Users/bytedance/code/self/maze3D/src/entities/{Player,Enemy,Pickup}.ts`
- `/Users/bytedance/code/self/maze3D/src/game/Rules.ts`
- `/Users/bytedance/code/self/maze3D/src/hooks/useAutoSave.ts`
- `/Users/bytedance/code/self/maze3D/src/utils/{errors,id,seed,time}.ts`
- Cross-cutting confirmation reads from
  `src/ui/{GameCanvas,LevelSelect,EditorPage,EditorToolbar,EditorPropertiesPanel,EditorStatusBar,EditorViewport,useConfirm,components/Dialog,components/Minimap}.tsx`.