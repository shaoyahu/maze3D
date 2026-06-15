# Code Review §D — Security / TypeScript Quality / Performance

- **Scope**: `src/**` (security, types, performance only) + `public/levels/*.json` (data contract)
- **Baseline**: `docs/reviews/2026-06-11-code-review.md` (35 prior findings, all marked resolved). Findings below are **new** in this pass; I checked git blame / file content for the 2026-06-11 fixes and do **not** re-raise any of them.
- **UI / architecture** issues are intentionally **not** in this report (ref to §B / §A).
- Files referenced are absolute paths.

---

### D-1 | HIGH | `src/ui/editor/EditorToolbar.tsx:251-264` | `level.name` text input has no length / charset cap

The free-text "关卡名" input is bound directly to `updateName(e.target.value)`, which writes to the store and to the eventual exported filename (`sanitizeFilename(level.name)`). There is no max length, no char allowlist, no normalization. A user can paste a 10k-character CJK string, multi-line content with `\n`, or a name that becomes an empty filename after `sanitizeFilename` (the fallback `'level'` masks the problem, so the bug is silent). The exported file's metadata will also be valid JSON, but the JSON file's `name` field will be huge, bloating autosave drafts and `localStorage` size (the `maze3d.editorDraft.v1` key holds the full level).

**修复建议**: clamp the input on `onChange` (e.g. `value.slice(0, 64)` + collapse newlines), and surface an inline hint when the cap is reached. Same treatment for the properties-panel name field (`EditorPropertiesPanel.tsx:63-83`).

---

### D-2 | HIGH | `src/ui/editor/EditorPropertiesPanel.tsx:223,107,142` | Unchecked `as` casts on user-controlled enum values

`onChange={(e) => setRule({ pickupType: e.target.value as PickupType })}`, `updateRule({ victory: v as LevelRules['victory'] })`, `Number(e.target.value) as MazeSize` all cast raw input strings/numbers to closed unions without a runtime guard. `PickupType`, `VictoryType`, `MazeSize` are restricted types (`['time','health','key']`, `['reach-exit','survive','time-trial']`, `[15,30,50]`). If a future DOM regression, browser extension, or stored-state replay feeds a value outside the union, the store will hold an invalid `MazeData` and `validateMaze` (or the engine) will either throw later or, worse, silently misbehave. The right side of an `as` should be re-validated on the way in.

**修复建议**: introduce a single `isPickupType` / `isVictoryType` / `isMazeSize` type-guard and replace `as` with the guard. (Reuse the `VALID_PICKUP_TYPES` / `VALID_VICTORY` patterns already used in `JsonMazeProvider.ts:6-7` and `utils/seed.ts:60-67`.)

---

### D-3 | HIGH | `src/ui/LevelSelect.tsx:60-64` | `Math.random()` fallback for procedural seed generation is **not** user-visible randomness

`useEffect` in `LevelSelect` generates a fallback procedural seed with `Math.floor(Math.random() * 256) × 8` when `crypto.getRandomValues` is missing. The seed then drives `AlgorithmMazeProvider` and is what the user will share, save, or type back in to reproduce a maze. Using `Math.random()` here means two users with "no crypto" browsers can never reproduce each other's mazes with the same hex string. The branch comment at `utils/id.ts:2-5` is honest about the entropy source for `id.ts` (idempotent UUID fallback, OK there), but here the seed is the reproducibility key.

**修复建议**: when falling back, read the time + a counter and fold it through a small xorshift to produce a 16-hex string with a stateful generator; or, if `Math.random()` is acceptable, document it explicitly in the user-facing seed input tooltip.

---

### D-4 | MEDIUM | `src/engine/Scene.ts:82-93` | `Math.random()` used in scene texture generation — non-deterministic across reloads

`buildFloorTexture` / `buildCeilingTexture` use `Math.random()` to scatter the noise blobs in canvas-painted textures. This is the visual surface the player sees. It is not a security / correctness issue, but it is a reproducible-bug magnet: a designer reporting "the floor in level X has a bright spot at tile (5,5) that looks like a glitch" cannot reproduce it after a reload. The existing `seededRng` utility (`utils/seed.ts`) is exactly the right tool here.

**修复建议**: thread the maze `id` (or a per-maze derivation) into the texture builders, and use the seeded RNG. Bonus: deterministic textures also make visual regression tests possible.

---

### D-5 | HIGH | `src/store/editorStore.ts:710, 736` | `level` (full `MazeData`) is `JSON.stringify`-ed into `localStorage` on every 2s dirty change

`saveDraft` does `JSON.stringify({ level: get().level })` on every 2s debounced edit and writes to `localStorage`. For a 30×30 maze this is ~5–10 KB per write, and a 50×50 maze pushes past 25 KB. The same string is also the in-memory past/future stack payload (`editorHistory.ts:45,69,89` uses `structuredClone(state.level)` for each undo step, so a 50-step undo history can hold ~1.25 MB transiently). Neither is throttled, debounced, or capped. A user with 200 undo steps and a 50×50 maze can hit the 5–10 MB `localStorage` quota and silently break autosave.

**修复建议**: (a) cap `past`/`future` to e.g. 50 entries in `editorStore.pushHistory`; (b) wrap the `saveDraft` write in a try/catch that watches for `QuotaExceededError` and surfaces a soft warning + a "clean history" affordance. Today the `catch` on `editorStore.ts:712` swallows it.

---

### D-6 | HIGH | `src/maze/JsonMazeProvider.ts:177` | `as unknown as MazeData` — the single biggest type-assertion escape hatch

`return { ...m, pickups: normalizedPickups, enemies } as unknown as MazeData;` — the function validated many but not all fields (e.g. `m.id` is typed `unknown`; `m.name`, `m.cellSize`, `m.size`, `m.start`, `m.exit`, `m.rules` are all `Record<string, unknown>` / `unknown`; the `m` spread carries over any extra fields like `m.customProperty` straight into the result). A hand-crafted JSON can pass `validateMaze` and still smuggle in arbitrary keys that downstream code (the minimap, the editor's diff / display, future serializers) may not expect. The `as unknown as` is the loudest possible "trust me" signal — the whole point of the validation function is that its return type should be a **narrowed** `MazeData`, not a `Record<string, unknown>` cast.

**修复建议**: build a typed object literal: `const result: MazeData = { id: m.id as string, name: m.name as string, size: { width, depth }, cellSize: m.cellSize as number, start: { x: start.x as number, z: start.z as number }, ... }; return result;`. With `noImplicitAny` strict, the cast count becomes a visible diff: the more casts, the more runtime checks are still needed.

---

### D-7 | HIGH | `src/maze/JsonMazeProvider.ts:159-177, 218, 221, 231-233` | Repeated `as number` / `as string` after `requireNumber`/`requireString` instead of a narrowing helper

`requireNumber` / `requireString` / `requireInBounds` throw on failure but **return `void`**, so the type system still sees `m.cellSize` as `unknown` immediately after. The code then writes `m.cellSize as number` 4 times, `r.initialTime as number` 3 times, `ee.id as string` 3 times, `nn.x as number` 4 times. The runtime check is real; the type check is not. Each cast is a tiny `unknown → T` trust jump that defeats the purpose of running the validator.

**修复建议**: change `requireNumber` etc. to return a narrowing assertion, e.g. `function requireNumber(o: Record<string, unknown>, k: string, ctx: string): number` that throws inside but returns the narrowed value. Then every `as number` in `validateMaze` / `parseEnemies` disappears, and the type system *agrees* with the runtime guard.

---

### D-8 | MEDIUM | `src/utils/seed.ts:79-88` | `as Algorithm` / `as MazeSize` after `Array.includes` narrowing

`SEED_RE.exec(id)` returns `RegExpExecArray | null`; the captured groups are typed `string` because the regex has no `(?<name>...)` capture, so the subsequent `algorithm as Algorithm` and `size as MazeSize` are pure trust jumps. The `VALID_ALGORITHMS.includes(algorithm as Algorithm)` check runs at runtime but the type system doesn't carry the narrowing through. Same anti-pattern as D-7, smaller blast radius.

**修复建议**: rewrite the regex to use named groups (`?<algorithm>rb|kruskal|prim|hak`) — TS narrows named-group captures to `string`, and the `includes` check still gates the value, but now the assertions can be replaced with a single type guard.

---

### D-9 | MEDIUM | `src/ui/GameCanvas.tsx:100` | `(window as unknown as { __game: Game }).__game` — bypasses the `Window` interface

The dev-only escape hatch attaches the live `Game` to `window` via a double-cast. The `as unknown as` defeats the project-wide no-`any` discipline. The block is gated by `import.meta.env.DEV`, so it never ships to production, but it still bypasses `tsc`'s safety net for the dev bundle and the type signature is unreachable from the devtools snippet the comment claims to enable.

**修复建议**: declare a module augmentation in a single `src/env.d.ts`: `interface Window { __game?: Game; }`. Then `(window as { __game: Game }).__game = game;` (single, narrow assertion) or just `window.__game = game` if the augmentation is loaded. No behavior change, no `unknown` jump.

---

### D-10 | MEDIUM | `src/store/levelStore.ts:88-128` | localStorage records are dropped with `console.warn` but no user feedback

`loadFromStorage` iterates `localStorage.getItem` results, runs each through `mazeSchema` / runtime checks, and on failure logs `console.warn` and drops the entry silently. A user who just lost 3 personal bests to a schema-version bump has no UI surfacing of the loss — they only see the warning if they open devtools. The previous review's mitigation `maze3d.customLevels.v1` versioned key helps, but a future v2 migration that runs `loadFromStorage` against the old v1 key will still silently drop the user's data.

**修复建议**: when records are dropped, set a transient store field (e.g. `lastLoadSummary: { dropped: number }`) and have `App` / `LevelSelect` show a one-time toast: "3 custom levels were skipped because they're from a newer format." This is the same pattern used in `useConfirm` for surfacing errors.

---

### D-11 | MEDIUM | `src/ui/components/Minimap.tsx:159-174` | `setInterval` 10Hz tick bypasses React lifecycle ordering and never pauses on `screen` transitions cleanly

`useTickRef` polls `gameRef.current.getPlayerPosition()` every 100ms and bumps a `setTick` counter to force a re-render. The effect re-creates the interval on `[gameRef, intervalMs, screen]` changes, so pausing pauses it — good. But the cleanup function doesn't cancel a *pending* in-flight callback: if a tick fires between `clearInterval` and the next mount, the `setTick` lands on an unmounted component (React 18 will warn, similar to the `pointerLockTimerRef` pattern already in `GameCanvas.tsx:24-31`). With a 10Hz cadence, this is rare but reachable.

**修复建议**: wrap the `setTick` call in a `if (gameRef.current) ...` check (which is already there at `Minimap.tsx:170`) — but also store the interval id in a ref and clear it in *both* the effect cleanup and a separate unmount-only cleanup effect, mirroring the `pointerLockTimerRef` pattern.

---

### D-12 | MEDIUM | `src/ui/components/Minimap.tsx:104-117` | `gameRef.current?.getPlayerPosition() ?? ...` reads store-imposter values on every render

The minimap reads `player position` / `player yaw` / `camera fov` from the `gameRef` *on every render*, including renders triggered by other state. Today the only trigger is the 10Hz tick, so this is benign, but it is a hidden contract: the minimap re-renders only on its own tick, not on the parent's re-renders, so any future change that re-renders the minimap with a fresh `gameRef.current` will read the live player state instead of the cached one. There is no memoization between `getPlayerPosition()` calls.

**修复建议**: snapshot `{ pos, yaw, fov }` into a single object inside the tick callback, store it in a ref, and let the render read the snapshot. That way the contract is explicit: "minimap re-renders reflect the state at the last tick, never live state."

---

### D-13 | LOW | `src/store/editorStore.ts:562-563` | `clamp` usage on integers is fine, but `level.size.width - 1` is computed twice

`const cx = clamp(x, 0, level.size.width - 1); const cz = clamp(z, 0, level.size.depth - 1);` — purely a perf nit. With 1000 calls/sec from the canvas drag handler, the property access is repeated. Today it's a few-ns cost; only worth fixing if the editor's placePickup / placeEnemy hot-path becomes a bottleneck.

**修复建议**: optional. Cache `level.size` in a local const if profiling points here.

---

### D-14 | LOW | `src/maze/types.ts:120,145` | `SURVIVE_SECONDS_VALUES` is typed `readonly number[]` only at the call site

`export const SURVIVE_SECONDS_VALUES = [30, 60, 90, 120] as const;` — the `as const` narrows the array to `readonly [30, 60, 90, 120]`, which is exactly what `isSurviveSeconds` needs. The check at `types.ts:145` is `(SURVIVE_SECONDS_VALUES as readonly number[]).includes(value)` — the `as readonly number[]` widens it back to `number` only because the original narrowing made `includes` infer a too-restricted signature. This is a TS-strictness symptom, not a runtime issue, but it's a smell that the typed value lives and dies by an `as` cast.

**修复建议**: `const SURVIVE_SECONDS_VALUES = [30, 60, 90, 120] satisfies readonly number[];` and drop the inline `as readonly number[]` at the `includes` call site. Same fix for `VALID_ALGORITHMS` / `VALID_SIZES` in `utils/seed.ts` and `store/levelStore.ts`.

---

### D-15 | MEDIUM | `src/maze/JsonMazeProvider.ts:90,92,151,221,245` | `as CellType` / `as string` inside a validator that *already* runtime-checked the value

`cells.push(v as CellType)` follows `if (v !== 0 && v !== 1) throw ...`, so the value is provably `0 | 1` at runtime — the cast just tells TypeScript what it should already know. `normalizedPickups.push({ ...pp, id: pickupId })` — `pp` is a `Record<string, unknown>`, so the spread leaks every other field through. The validator only `requireString`'d `x`, `z`, `type`, `value`; the spread can carry `pp.foo: { bar: malicious }` into the final `MazeData`. The downstream `EditorPropertiesPanel` / `EditorViewport` iterate these objects and would happily render any extra fields (extra DOM attributes, extra data-testid, etc.).

**修复建议**: replace the spread with an explicit `Pickup` literal: `{ id: pickupId, x: pp.x as number, z: pp.z as number, type: pp.type as PickupType, value: pp.value as number }`. Same for `path.push({ x: nn.x as number, z: nn.z as number })` — but the inner `nn` is already `Record<string, unknown>`, so the explicit form also surfaces any unvalidated fields.

---

### D-16 | MEDIUM | `src/ui/LevelSelect.tsx:142, 396, 455, 470` | Multiple `as Foo` on raw event-target values without runtime guard

`opts.surviveSeconds = clamped as 30 | 60 | 90 | 120;`, `setLevelSource(e.target.value as LevelSource)`, `setMode(e.target.value as VictoryType)`, `setSelectedSize(Number(e.target.value) as MazeSize)`. Same anti-pattern as D-2: a closed union is being trusted without a `isX` guard. The `VictoryType` cast is especially concerning because `setMode` writes to `StartLevelOptions` which is later persisted via `validateMaze` — a `VictoryType` mismatch would throw deep in the engine instead of failing fast in the UI.

**修复建议**: define `isLevelSource`, `isVictoryType`, `isMazeSize` once and apply them at the boundary.

---

### D-17 | LOW | `src/engine/Scene.ts:32, 56, 99` | `new THREE.CanvasTexture(canvas)` returned and assigned; disposal pairing is implicit

`buildFloorTexture` / `buildCeilingTexture` create `CanvasTexture` instances; `Scene.buildScene` keeps the textures alive on `floorMat.map` / `wallMat.map` / `ceilingMat.map` for the lifetime of the scene. `Scene.dispose` must traverse the material maps. The current scene is built once per level and disposed on level change, so the leak window is short, but **every level transition creates new textures and discards old ones**. For 4 built-in levels + custom levels, this is bounded — but a procedural-level power user playing 100 levels in one session will allocate 100+ `CanvasTexture`s and never release the old ones unless `dispose()` is hit between each.

**修复建议**: log a one-time `console.warn` in `dispose()` if `floorTex.dispose()` was called twice (suggests a leak), and consider a "lru cache of N textures keyed by the noise seed" so procedural mazes with the same visual config reuse textures. (Caveat: D-4 already says the seed isn't deterministic; this is dependent on D-4 being fixed first.)

---

### D-18 | LOW | `src/store/editorStore.ts:708-714` | `localStorage` write happens inside store action; no debounce on user input

`saveDraft` is called by `useAutoSave` (30s) and by `EditorPage` (2s debounced on `level` reference change). Both are debounced, so the write is throttled in practice. The comment at `editorStore.ts:711-714` acknowledges the `try/catch` swallows quota errors. Not a security issue, but a UX dead-end: if quota is hit, the next reload silently loses the draft. A `setItem` call into a full `localStorage` throws `QuotaExceededError`; the catch on `e` just `console.warn`s.

**修复建议**: surface a store-level `storageFull: boolean` and let `EditorStatusBar` show a one-line warning. The schema for this is already proven by `lastError` in the same file.

---

### D-19 | MEDIUM | `src/App.tsx:60-67` | `import.meta.glob('/public/levels/*.json')` with `as { default?: unknown }` — no validation that the path matches a level id

`const id = path.split('/').pop()!.replace('.json', '')` — uses `!` (non-null assertion) on the array pop. If a future build ever produced a path with no `/` (unlikely from `import.meta.glob`, but the assertion lies about it), `id` would be `''` and the lookup would silently fail. More importantly, the `id` derived from the path is **never checked against the JSON's `id` field**. A level with `"id": "level-tiny"` saved in `public/levels/level-other.json` would be loaded by the *path-derived* id `level-other` and exposed to `JsonMazeProvider.load("level-other")`, which then `requireString(m, 'id', id)` — `validateMaze` would throw because the stored `id` is `"level-tiny"` and the requested `id` is `"level-other"` — but only at *use* time, not at module-load time. The throw is correct, but the error message would be confusing.

**修复建议**: drop the `!` by guarding `path.split('/').pop() ?? ''` and `id.replace(/\.json$/, '')`. Optionally, cross-check `path-derived id === m.id` in `validateMaze` to surface a clearer error: "filename 'level-other.json' does not match level id 'level-tiny'".

---

### D-20 | MEDIUM | `public/levels/*.json` | Built-in level JSONs have no schema-validation test in `tests/`

All 4 built-in levels (`level-tiny`, `level-tiny-enemy`, `level-tiny-pickups`, `level-small`) live in `public/levels/` and are loaded at runtime. The runtime validator (`validateMaze`) catches them on the first `provider.load(id)`, but a regression that changes the JSON shape (e.g. `enemies[].dwellTime` renamed) would only show up when a user picks the level — not in CI. The same applies to `maze.cellSize`, which the JSON files all set to `2` matching `MIN_CELL_SIZE = 2 * PLAYER_RADIUS`. A future `PLAYER_RADIUS` bump would silently invalidate the built-in levels.

**修复建议**: add a `tests/levels.test.ts` that imports each `*.json` (via `import.meta.glob`) and runs them through `validateMaze`. Asserts not just "no throw" but also that `cellSize === MIN_CELL_SIZE` and that the start / exit are on a walkable cell.

---

### D-21 | MEDIUM | `src/store/levelStore.ts:30-33` | `localStorage` key naming has version segment, but no migration path

The `maze3d.customLevels.v1` key is versioned (good). The `loadFromStorage` reads it via `STORAGE_KEY`, but if a future version bumps the key, the old `v1` data is orphaned in `localStorage` forever — there's no migration that reads the old key, transforms, and writes the new one. Same for the `bestByLevel` key.

**修复建议**: when introducing a v2, add a one-time migration in `levelStore` that reads the old v1 key, runs each entry through a v1→v2 transformer, and writes the v2 key. Mark the v1 key as deprecated in a comment so the next version bumps the schema.

---

### D-22 | LOW | `src/maze/importExport.ts` (used by EditorToolbar) | `sanitizeFilename` exists but is only applied to the export filename, not to the level name stored in JSON

`handleExport` calls `sanitizeFilename(level.name) || 'level'` for the **file** name, but the level name itself is still exported as-is into the JSON. A user can name their level `<script>alert(1)</script>` and the JSON round-trips it through export → import → re-display. Today the only renderer is `EditorToolbar` / `LevelSelect` which display it as text content (React auto-escapes), so no XSS — but the same level name is also persisted to `localStorage` and re-displayed. A future change to render the name via `dangerouslySetInnerHTML` (for markdown, e.g.) would immediately become an XSS vector.

**修复建议**: at the JSON-load boundary (`JsonMazeProvider.validateMaze` for `importJson`, `editorStore.parseImport` for `importJson`), normalize the name: strip control chars, cap at 64 chars, and (defensively) HTML-escape `<`, `>`, `&`, `"`, `'`. Even though React auto-escapes, normalizing at the boundary is the right place.

---

### D-23 | MEDIUM | `src/store/editorStore.ts:711` | `localStorage.setItem` is called with a payload of unbounded size from `JSON.stringify`

`saveDraft` → `JSON.stringify({ level: get().level })` has no size cap. Combined with D-5, an adversarial user (or a large-but-valid maze) can push 5+ MB into `localStorage` and silently break future `setItem` calls. The `try/catch` on `e` swallows the `QuotaExceededError`, so the editor still *thinks* it saved.

**修复建议**: before `setItem`, check `payload.length` against a `MAX_DRAFT_BYTES` constant (e.g. 1 MB). If exceeded, truncate to "draft is too large to auto-save; export manually" and surface a one-time warning.

---

### D-24 | LOW | `src/utils/id.ts:11` | Fallback `id` uses `Math.random()` but is only the "id" of an enemy / pickup, not a security token

`return \`fallback-${Date.now()}-${Math.random()}\`` — the comment is honest that this is for "very old environments where `crypto` is missing". The id is used as a `key` in React lists and as a `data-testid` attribute; neither is a security boundary. Not a finding, but worth noting: the same fallback path is **not** appropriate if `id.ts` ever generates session tokens, share-link slugs, or anti-CSRF nonces.

**修复建议**: no change today. Add a comment in `id.ts` clarifying "this id is **not** a security token" so future authors don't repurpose it for one.

---

### D-25 | MEDIUM | `src/ui/editor/EditorToolbar.tsx:191-197` | `readJsonFile(file)` reads the entire file into a single string with no size limit

A user can pick a 500 MB JSON file; `FileReader.readAsText` will load it all into memory, then `JSON.parse` will block the main thread. The browser's "file" picker is the only sandbox — a malicious shared-hosting page can't force a file, but a user dragging in a big log file by mistake will freeze the tab.

**修复建议**: in `importExport.ts`'s `readJsonFile`, check `file.size > MAX_IMPORT_BYTES` (e.g. 1 MB) and reject with an `ImportError("File too large: ${file.size} bytes; max ${MAX_IMPORT_BYTES}")` before reading. This is a one-line guard, big UX win.

---

### D-26 | LOW | `src/store/persist.ts:4-5` | `setItem(k, k)` / `removeItem(k)` are localStorage-capability probes; they don't catch `SecurityError`

`isStorageAvailable` writes then deletes a 1-char key. In Safari private mode and some enterprise-locked-down browsers, the *write* succeeds but later `JSON.stringify` writes throw `SecurityError` (e.g. when the storage gets full mid-session). Today the `persist.ts:33` `try/catch` handles that, but the probe is a one-time check at module load. A user with a long-running session whose storage fills up later will see silent `console.warn` drops.

**修复建议**: a small `safeSetItem(key, value)` wrapper that catches `SecurityError` *and* `QuotaExceededError` and returns a boolean. Use it in `persist.ts`, `editorStore.saveDraft`, `editorStore.loadDraft`, and `LevelSelect.tsx:362`. Lets the callers decide whether to surface a UI warning.

---

### ✅ D-27 | MEDIUM | `src/maze/importExport.ts` (via EditorToolbar) | Exported JSON does **not** include a `schemaVersion` field — **已修复 by P2-4b (commit 1e79f26, 2026-06-12)**

The exported `.maze3d.json` is the level file. A user opens it in 6 months when the project has added new fields (e.g. `enemies[].patrolSpeed`): the runtime `validateMaze` will accept it (extra fields are ignored by spread), but a v2 with a *renamed* required field would silently lose the player's level. The fix is symmetric to D-21: stamp a `schemaVersion` in the export, refuse imports with a higher version, and migrate known-lower versions on import.

**修复建议**: add `"schemaVersion": 1` to the exported JSON. In `importExport.parseImport` (or `JsonMazeProvider.validateMaze`), check `parsed.schemaVersion` against the current; if higher, `throw new ImportError(\`Level uses schema v${parsed.schemaVersion}, this build only supports v1. Update the editor.\`)`. A migration registry `(v1 → v2, v2 → v3, ...)` can be added later without changing the call site.

**Resolution** (P2-4b `feat(P2-4b): add importExport module`, 2026-06-12): implemented as designed. `src/maze/importExport.ts:30-32` writes `{ schemaVersion: 1, level: MazeData }`; `parseImport` at lines 54-58 strictly rejects anything whose `schemaVersion !== 1` with `ImportError`; `EditorStatusBar` displays `SCHEMA_VERSION 1`. `tests/unit/maze/importExport.test.ts` covers roundtrip preservation (line 51), v2 rejection (line 82), missing-version rejection (line 90), missing-level rejection (line 98), and the validateMaze-wrap path (line 106). Migration registry intentionally deferred (YAGNI — only one schema exists).

---

### D-28 | LOW | `src/maze/JsonMazeProvider.ts:223-227` | `console.warn` for a soft-fail drops the enemy silently

`if (path.length < 2) { console.warn(...); continue; }` — the enemy is excluded from the loaded level. The user-visible behavior is: "I imported a level, but one of my enemies is gone, and the only signal is a `console.warn` in devtools." The previous review (F7) made this a soft-fail (drop + warn) rather than a hard-fail (throw), which is the right call for resilience — but the user has no in-UI signal.

**修复建议**: surface a "level imported with N enemies skipped (paths too short)" toast in the toolbar. The plumbing already exists (`lastError` in `editorStore` + `EditorToolbar.tsx:109-113`).

---

### D-29 | LOW | `src/store/editorStore.ts:732-735` | Loaded draft resets `dirty: false` and `lastSavedHash` — but `levelHash` may not match the on-disk draft

`loadDraft` sets `lastSavedHash: levelHash(validated)`. If `validateMaze` normalizes the draft (e.g. fills in a missing `pickup.id`), the hash is computed on the *normalized* level, not the original draft bytes. The next `saveLevel` will see `dirty === false` (because hash matches), so the user thinks the draft is saved — but the on-disk `maze3d.editorDraft.v1` still holds the pre-normalization bytes. A subsequent reload that bypasses `validateMaze` would read stale data. Today's `loadDraft` does run through `validateMaze`, so this is mostly hypothetical, but worth a comment.

**修复建议**: in `loadDraft`, *re-save* the validated draft immediately: `set({ level: validated, ... }); get().saveDraft();` so the on-disk version matches the in-memory hash baseline. (Note: this would cause a 2s autosave after every draft load — fine for UX, just call out the cause.)

---

### D-30 | MEDIUM | `src/maze/types.ts:53-58` | `LevelLoadError` fields are loosely typed, leak `MazeData` field names

`LevelLoadError` is constructed with a string message that includes `${id}.rules` / `${id}.size` paths and the offending value (`"must be 0 or 1 (got ${v})"` at `JsonMazeProvider.ts:88`). The error eventually surfaces to `App.tsx:93` as `关卡加载失败：${msg}`. The `${v}` interpolation includes arbitrary user-provided JSON values — if a user imports a level with a 10 MB string in a numeric field, the error message would be 10 MB. React renders this directly into the DOM, which auto-escapes, so no XSS — but the layout (the `<p>` at `LevelSelect.tsx:387`) has no max-height / overflow handling, and 10 MB of text in a `<p>` will lock the browser tab.

**修复建议**: clamp the `v` interpolation to e.g. `${String(v).slice(0, 80)}` in every `LevelLoadError` message. Same treatment for `ee.id` at `JsonMazeProvider.ts:208, 219, 225, 231` — an enemy `id` is user-controlled and currently printed in error messages.

---

### D-31 | MEDIUM | `src/ui/LevelSelect.tsx:537` | `localStorage.getItem(LAST_SEED_KEY)` read inside an onClick — synchronous I/O on the click thread

`onClick` reads `localStorage.getItem(LAST_SEED_KEY)` synchronously. `localStorage` reads on the main thread are typically <1ms, so this is fine in practice, but the value is also used in `useEffect` on mount (`LevelSelect.tsx:325`). A future change that adds many `localStorage` reads in a single click handler will block the UI.

**修复建议**: optional. Cache `lastSeed` in a `useRef` updated by the mount `useEffect`, and read the ref in the onClick.

---

## Summary of severity

- **CRITICAL**: 0
- **HIGH**: 6 (D-1, D-2, D-3, D-5, D-6, D-7)
- **MEDIUM**: 15 (D-4, D-8, D-10, D-11, D-12, D-15, D-16, D-18, D-19, D-20, D-21, D-23, D-25, D-27, D-30, D-31)
- **LOW**: 10 (D-9, D-13, D-14, D-17, D-22, D-24, D-26, D-28, D-29)

**Total: 31 findings** (0 CRITICAL, 6 HIGH, 15 MEDIUM, 10 LOW).

---

## Cross-refs to other agents (out of §D scope)

- **Ref to §B (UI/UX)**: The `onChange` on `<input value={level.name}>` (`EditorToolbar.tsx:251`) has no `maxLength` HTML attribute and no `aria-invalid` feedback when the name is rejected downstream. Visual treatment of dirty / status states is a §B concern.
- **Ref to §A (architecture)**: `editorStore` owns the maze data, validation, history, persistence, and import/export in one file (300+ lines after the recent P2-7 changes). A split into `editorStore` / `editorHistory` (already exists) / `editorImportExport` would help; see `editorStore.ts:1-50` for the coupling points.
