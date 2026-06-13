# C-tests — Test Quality / Coverage / E2E Reliability Review

**Slug**: tests-review-2026-06-13
**Reviewer**: agent §C (test quality)
**Date**: 2026-06-13
**Scope**: `tests/unit/**`, `tests/component/**`, `tests/e2e/**`, `playwright.config.ts`, `vitest.config.ts`
**Source-of-truth**: `docs/reviews/2026-06-11-code-review.md` (35 prior findings, all closed)

---

## Coverage overview (snapshot)

| Area | Unit | Component | E2E |
|---|---|---|---|
| Core engine (`Collision.ts`, `Game.ts`, `Rules.ts`, `Loop.ts`, `Scene.ts`) | OK (`collision.test.ts`, `rules.test.ts`, `game.test.ts`, `scene.test.ts`, `loop.test.ts`) | n/a | partial via `play-through.spec.ts` |
| `Player.ts` (entity) | OK 3 tests (`player.test.ts`) | n/a | partial |
| `Enemy.ts` (entity) | OK (`entities/Enemy.test.ts` covers wall-aware moveToward + FOV) | n/a | partial via `enemies.spec.ts` |
| `Pickup.ts` (materials/colors) | OK (`pickup.test.ts`) | n/a | OK (`pickup-types.spec.ts`) |
| `InputManager.ts` | OK 14 tests (`inputManager.test.ts`) | n/a | OK (`pause-resume.spec.ts`) |
| `enemySpawner.ts` | OK 8 tests (`enemySpawner.test.ts`) | n/a | n/a |
| `editorStore.ts` | OK 60+ tests (`editorStore.test.ts`) | partial (`EditorToolbar.test.tsx`, `EditorPropertiesPanel.test.tsx`, `EditorStatusBar.test.tsx`, `EditorViewport.test.tsx`) | OK (`editor.spec.ts`) |
| `gameStore.ts` | OK 35+ tests (`gameStore.test.ts`, `gameStore.rebalance.test.ts`) | partial (`hud.test.tsx`, `inventoryBar.test.tsx`, `crosshair.test.tsx`) | partial via `survive.spec.ts`, `time-trial.spec.ts`, `pause-resume.spec.ts` |
| `levelStore.ts` | OK (`levelStore.customLevels.test.ts`) | OK (`levelSelect.uiRevamp.test.tsx`, `levelSelect.custom.test.tsx`) | partial via `editor.spec.ts`, `level-select-cascading.spec.ts` |
| `settingsStore.ts` | OK (`settingsStore.test.ts`) | OK (`settings.test.tsx` in `menus.test.tsx`) | n/a |
| `persist.ts` | OK 17 tests (`persist.test.ts`) | indirect | OK (`persistence.spec.ts`) |
| `useAutoSave` hook | OK 9 tests (`useAutoSave.test.tsx`) | OK exercised in `EditorToolbar.test.tsx` (3 timer tests) | n/a |
| Dialog / `useConfirm` (P2-7) | n/a | OK 16 tests (`dialog.test.tsx`) | OK (`editor.spec.ts` delete flow, `level-select-cascading.spec.ts`) |
| Editor autosave + draft recovery | n/a | OK (`EditorPage.test.tsx` covers 2s debounce + draft prompt + recovery) | n/a |

**Verdict**: coverage is broad and the new code paths from P2-6/P2-7 are tested in all three layers. Findings below target quality/reliability, not missing coverage.

---

## Findings

### C-H1 | `tests/e2e/editor.spec.ts:139-179` | Stale `test.skip` for export/import roundtrip with no quarantine marker

The skip comment says the carveLShape helper conflicts with the new exit-on-floor guard and "filed for follow-up". No issue link, no re-enable plan beyond "rewrite carveLShape". The skip will rot — if no one notices, this round-trip silently regresses and the test never fires.

**Fix**: at minimum, add a top-of-file TODO with issue link and convert to `test.fixme` (which Playwright reports separately in the run output).

### C-H2 | `tests/e2e/editor.spec.ts:80-87` | Save-and-exit-then-verify-in-LevelSelect has a race window

The test waits for `main-menu-editor` (back on menu) and then immediately clicks 开始. There's no explicit wait for the `levelStore` to have re-hydrated from localStorage on menu-mount. If a refactor moves hydration into a deferred effect, this test will flake intermittently.

**Fix**: after clicking 开始, add `await expect(page.getByTestId('level-source-select')).toBeVisible()` so the hydration step is deterministic.

### C-H3 | `tests/e2e/ui-revamp.spec.ts:57-65` | Second stale `test.skip` for the 进阶 ▾ fold removed in P2-6

Same rot risk as C-H1. The cascade test in `level-select-cascading.spec.ts` already covers the seed-reveal behavior. Both skipped cases should either be deleted or marked `test.fixme` with a tracking link.

**Fix**: delete both `test.skip` cases — the new specs already cover the same behavior.

### C-M1 | `tests/e2e/playwright.config.ts:5-7` | `fullyParallel: false, retries: 0, workers: 1` with no reporter config for failure triage

With `workers: 1` and ~13 spec files × ~5 tests each ≈ 65 tests serially, the e2e stage is the slow path. No HTML report means failure triage is harder.

**Fix**: add `reporter: [['html', { open: 'never' }], ['list']]` for easier failure reading.

### C-M2 | `tests/e2e/play-through.spec.ts:18-21` | `page.waitForTimeout(1600)` is a magic-number flake risk

The comment says "4m traversal at speed 3 m/s = ~1.4s; use 1600ms to be safe". On a slow CI box 1600ms might be insufficient and the next `expect(... '通关' ...)` will timeout (5s default) — flakiness with the worst possible signal: a 5s wait, not a fail-fast.

**Fix**: poll for the win condition with a short loop and only release `KeyD` once the win screen is visible.

### C-M3 | `tests/component/editor/EditorStatusBar.test.tsx:46` | `vi.useFakeTimers()` in `beforeEach` with no matching `useRealTimers()` in `afterEach`

`EditorPropertiesPanel.test.tsx` and `useAutoSave.test.tsx` correctly pair both. `EditorStatusBar.test.tsx` enables fake timers but never restores them. Within-file behavior is fine (each test resets), but the asymmetry is a style hole.

**Fix**: add `afterEach(() => { vi.useRealTimers(); });`.

### C-M4 | `tests/component/editor/EditorPage.test.tsx:190-210` | Autosave debounce test only asserts the `>=2s` boundary, not `<2s` no-write

The test advances exactly 2000ms and asserts the write happened. There is no test for the `<2000ms` no-write path, so a future fix that switches strict-`<` to `<=` is not caught.

**Fix**: split into two tests: `advanceTimersByTime(1999)` → still null; then `advanceTimersByTime(1)` → written. Same pattern as `useAutoSave.test.tsx:99-105`.

### C-M5 | `tests/component/editor/EditorToolbar.test.tsx:318-335` | `lastError` 3s auto-clear test uses magic 3050ms instead of exporting the constant

The comment says "3050 gives a small safety margin without coupling this test to that internal constant". The test will silently start failing at 4s if the constant changes to 4s, and silently passing if the constant drops to 1s (a 3050ms advance still trips it).

**Fix**: export `LAST_ERROR_DISPLAY_MS` and import it in the test, the same way `useAutoSave.test.tsx` pins `DEFAULT_AUTOSAVE_INTERVAL_MS`.

### C-M6 | `tests/component/editor/EditorToolbar.test.tsx:123-129` | `confirmSpy` on `window.confirm` is never restored

```ts
const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
```

`beforeEach` calls `vi.clearAllMocks()` which clears call history but does NOT restore the implementation. The spy stays installed for the rest of the file. Currently low-risk because the P2-7 migration removed the `window.confirm` path, but the test itself is dead.

**Fix**: delete this test entirely (P2-7 made it moot), or add `confirmSpy.mockRestore()` at the end.

### C-M7 | `tests/component/mainMenu.revamp.test.tsx:15-30` | `console.warn` spy installed but never restored

`afterEach` with `vi.restoreAllMocks()` is missing. Low-risk (other tests don't depend on `console.warn` being un-spied) but it's noise.

**Fix**: add `afterEach(() => vi.restoreAllMocks())`.

### C-M8 | `tests/unit/maze/enemySpawner.test.ts:51-69` | Exclusion-set bounds hard-coded to 5×5 instead of derived from fixture

```ts
if (ex >= 0 && ex < 5 && ez >= 0 && ez < 5) excluded.add(...)
```

If the `openMaze` fixture changes size, the assertion is silently wrong (the `ex < 5` check would still match the fixture but the test is "right" only by coincidence).

**Fix**: derive the bounds from `openMaze.size.width` / `.depth`.

### C-M9 | `tests/unit/engine/game.test.ts:18-44` | `setFov` tests construct a real `THREE.PerspectiveCamera` via `createCamera()`

If `createCamera()` ever changes its aspect ratio or near/far planes, or throws on a future Three.js version, all `setFov` tests fail with a confusing error rather than a targeted one.

**Fix**: stub the camera at the field level (`{ fov: 60, updateProjectionMatrix: vi.fn() }`).

### C-M10 | `tests/unit/store/editorStore.test.ts` | No test for `placeWall` on an out-of-bounds cell

`placeStart` OOB and `placePickup` OOB are covered; `placeWall` OOB silently no-ops but has no pinning test. A future "throw on OOB" refactor would not be caught.

**Fix**: add `it('placeWall on an out-of-bounds cell is a no-op')`.

### C-L1 | `tests/component/editor/EditorToolbar.test.tsx:159-164` | Save assertion is over-broad

```ts
expect(useLevelStore.getState().customLevels['custom-test-id']).toBeDefined();
```

`toBeDefined()` only proves the key exists, not that the saved level matches. A refactor that persists the *wrong* level still passes this — silent green.

**Fix**: assert on the full payload via `toMatchObject({ id: 'custom-test-id', name: 'Test' })`.

### C-L2 | `tests/component/dialog.test.tsx:100-113` | Inline style assertion couples to happy-dom's shorthand splitting

```ts
expect(dialog.style.borderColor).toBe('var(--danger)');
```

If a future contributor switches the dialog to `border-color` shorthand or a different prop the assertion silently starts asserting on `''` and a stylesheet regression goes unnoticed.

**Fix**: assert on `getComputedStyle(dialog).getPropertyValue('--danger')` or use a class-based assertion (`dialog.classList.contains('dialog--danger')`).

### C-L3 | `tests/component/editor/EditorPropertiesPanel.test.tsx:53-57` | Metadata-form render only checks one testid inside it

```ts
expect(screen.getByTestId('level-metadata-form')).toBeInTheDocument();
expect(screen.getByTestId('meta-name')).toBeInTheDocument();
```

`meta-width` / `meta-depth` / `meta-victory-*` are not asserted in the metadata-form render path. A future refactor that conditionally hides width/depth for size-1 levels is not caught.

**Fix**: use `within(meta-form).getByTestId(...)` for the dependent fields.

### C-L4 | `tests/component/levelSelect.uiRevamp.test.tsx:181-186` | `start-button` size assert is per-test override, not the default

The regex pins size to `15` but the preceding line explicitly switches `size-select` to `15`. There's no positive assertion that the *default* size dropdown value flows through (only `menus.test.tsx:99` asserts on `-50-` after explicit override).

**Fix**: add one test that clicks `start-button` without changing `size-select` and asserts on the default size.

### C-L5 | `tests/e2e/editor.spec.ts:90-131` | Delete-confirm e2e seeds via localStorage + `page.reload()` but doesn't guard against `editorDraft` race

If a prior spec's autosave lands after the clear (debounce is 2s), the delete spec sees the wrong level. The seed step only sets `maze3d.customLevels.v1`.

**Fix**: explicitly remove `maze3d.editorDraft.v1` in the seed step, or assert that only `maze3d.customLevels.v1` exists after seeding.

### C-L6 | `tests/component/editor/EditorToolbar.test.tsx:172-188` | "rising-edge clear" test wraps a store update in `act()`

```ts
act(() => {
  useEditorStore.getState().placeWall(1, 0);
});
```

The toolbar's `useEffect([dirty])` may not run synchronously inside `act()` (zustand external store + React batch can defer). The comment "Wrap in act() so the toolbar's useEffect re-runs and clears the local status before we assert on the DOM" acknowledges the racy intent.

**Fix**: use `waitFor(() => expect(screen.getByTestId('tool-dirty')).toBeInTheDocument())` instead, matching the import-status polling pattern at line 272.

### C-L7 | `tests/component/editor/EditorPage.test.tsx:67-73` | Draft check uses `await Promise.resolve()` instead of `findBy*`

```ts
renderPage();
await Promise.resolve();
expect(screen.queryByTestId('confirm-dialog')).toBeNull();
```

`Promise.resolve()` flushes one microtask but the mount-time effect that reads `localStorage` may chain a few more. The test depends on the effect being synchronous after one microtask.

**Fix**: use `await waitFor(() => expect(screen.queryByTestId('confirm-dialog')).toBeNull())` — same pattern used elsewhere in this file (line 122).

### C-L8 | `tests/component/editor/EditorToolbar.test.tsx:300-307` | `lastError` render test doesn't wrap state set in `act()`

`render()` flushes the initial render synchronously, so this works today. If a future change moves `lastError` reading into a `useEffect`, the test starts failing in confusing ways.

**Fix**: explicit `act(() => { useEditorStore.setState(...) })` before `render()`.

### C-L9 | `tests/component/levelSelect.custom.test.tsx:155-159` | Sort-order test relies on glob-order insertion, not actual sort

```ts
expect(labels.indexOf('Apple')).toBeGreaterThanOrEqual(0);
expect(labels.indexOf('Apple')).toBeLessThan(labels.indexOf('Banana'));
```

Only proves relative order; doesn't prove locale-aware sort. Acceptable for these capital-letter names.

**Fix**: assert on the full label array: `expect(labels).toEqual(['Apple', 'Banana'])` — catches any drift.

### C-L10 | `tests/setup.ts:7-31` | Custom localStorage shim has no comment explaining the dual-storage world

The shim replaces Node 22+'s non-functional `localStorage` with an in-memory object. Tests that check `localStorage.length` will see happy-dom's value in some tests and the shim's in others.

**Fix**: explicit comment explaining the dual-storage world + consideration of an `afterEach` clear if order matters.

### C-L11 | `docs/reviews/2026-06-11-code-review.md:230` | Prior review's verification block omitted e2e ("⏸ 未跑")

The new e2e tests (P2-6 cascading, P2-7 confirm, editor autosave) need to be added to the CI run, and the next review's verification block must show pass + skip counts.

**Fix**: include an `E2E (Playwright)` line in the next review's verification block.

### C-M11 | `tests/unit/engine/game.rebalance.test.ts` (file not opened) | May not pin F-N6 non-survive progressive-trigger gate

If the test does NOT explicitly assert `progressiveEnemyCount` does not increment in `reach-exit` / `time-trial` modes, then F-N6 (the dead-code regression from the prior review) is re-introducible.

**Status**: cannot verify from this review (file not opened); flagging for follow-up. Recommended spot-check: `startLevel(maze, { mode: 'reach-exit' })` → `tick(100)` → progressiveEnemyCount unchanged.

---

## Summary

| Severity | Count |
|---|---|
| **CRITICAL** | 0 |
| **HIGH** | 3 (C-H1, C-H2, C-H3 — e2e reliability / stale skips / race window) |
| **MEDIUM** | 11 (M1–M11 — e2e config + flake, timer discipline, mock hygiene, coverage gaps) |
| **LOW** | 11 (L1–L11 — assertion strength, style, verification block) |
| **Total** | **25** |

**One-line summary**: test coverage is broad and the P2-6/P2-7 paths are exercised in all three layers; remaining risks concentrate in e2e reliability (3 HIGH — stale `test.skip`s, post-save race window, no failure-friendly reporter) and timer-boundary / mock-hygiene discipline (5 MEDIUM), with no CRITICAL issues found.

---

## Files reviewed (absolute paths)

- `/Users/bytedance/code/self/maze3D/tests/setup.ts`
- `/Users/bytedance/code/self/maze3D/tests/unit/collision.test.ts`
- `/Users/bytedance/code/self/maze3D/tests/unit/player.test.ts`
- `/Users/bytedance/code/self/maze3D/tests/unit/pickup.test.ts`
- `/Users/bytedance/code/self/maze3D/tests/unit/inputManager.test.ts`
- `/Users/bytedance/code/self/maze3D/tests/unit/rules.test.ts`
- `/Users/bytedance/code/self/maze3D/tests/unit/engine/game.test.ts`
- `/Users/bytedance/code/self/maze3D/tests/unit/engine/game.rebalance.test.ts` (referenced, not opened)
- `/Users/bytedance/code/self/maze3D/tests/unit/scene.test.ts`
- `/Users/bytedance/code/self/maze3D/tests/unit/persist.test.ts`
- `/Users/bytedance/code/self/maze3D/tests/unit/maze/enemySpawner.test.ts`
- `/Users/bytedance/code/self/maze3D/tests/unit/store/editorStore.test.ts`
- `/Users/bytedance/code/self/maze3D/tests/unit/store/editorHistory.test.ts`
- `/Users/bytedance/code/self/maze3D/tests/unit/hooks/useAutoSave.test.tsx`
- `/Users/bytedance/code/self/maze3D/tests/unit/gameStore.test.ts`
- `/Users/bytedance/code/self/maze3D/tests/component/dialog.test.tsx` (P2-7)
- `/Users/bytedance/code/self/maze3D/tests/component/menus.test.tsx` (P2-7)
- `/Users/bytedance/code/self/maze3D/tests/component/levelSelect.uiRevamp.test.tsx` (P2-6)
- `/Users/bytedance/code/self/maze3D/tests/component/levelSelect.custom.test.tsx` (P2-7)
- `/Users/bytedance/code/self/maze3D/tests/component/editor/EditorPage.test.tsx` (P2-7)
- `/Users/bytedance/code/self/maze3D/tests/component/editor/EditorToolbar.test.tsx` (P2-7)
- `/Users/bytedance/code/self/maze3D/tests/component/editor/EditorPropertiesPanel.test.tsx`
- `/Users/bytedance/code/self/maze3D/tests/component/editor/EditorStatusBar.test.tsx`
- `/Users/bytedance/code/self/maze3D/tests/component/editor/EditorViewport.test.tsx`
- `/Users/bytedance/code/self/maze3D/tests/e2e/editor.spec.ts` (P2-7)
- `/Users/bytedance/code/self/maze3D/tests/e2e/persistence.spec.ts`
- `/Users/bytedance/code/self/maze3D/tests/e2e/play-through.spec.ts`
- `/Users/bytedance/code/self/maze3D/tests/e2e/level-select-cascading.spec.ts`
- `/Users/bytedance/code/self/maze3D/tests/e2e/ui-revamp.spec.ts`
- `/Users/bytedance/code/self/maze3D/playwright.config.ts`
- `/Users/bytedance/code/self/maze3D/vitest.config.ts`