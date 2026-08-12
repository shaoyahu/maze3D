// P3-1c LevelSelect (workstream 2): the new `levelCount` dropdown +
// the seed-input's new ability to parse a pasted algo-v2-… id. These
// tests live in their own file so a P3-1c workstream 1 (UI render of
// the dropdown) regression shows up as a single failure, not buried
// inside the P2-6 cascading-redesign suite.
//
// The two contracts under test, per spec §6.4 / P3-1c workstream 2:
//   1. level=1 → seed id is the legacy v1 format (best records / URLs
//      round-trip unchanged).
//   2. level>=2 → seed id is the v2 format (carries the level count
//      between `size` and the hex mazeSeed).
//   3. Pasting a full algo-v1-… or algo-v2-… id into the seed input
//      splits the id into algorithm + size + levelCount + hex so a
//      user can copy a friend's URL and have the dropdowns auto-fill.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { LevelSelect } from '../../src/ui/LevelSelect';
import { useLevelStore } from '../../src/store/levelStore';
import { useSettingsStore } from '../../src/store/settingsStore';
import { ConfirmProvider } from '../../src/ui/useConfirm';
import { encodeSeedV2 } from '../../src/utils/seed';

// The 16-char hex the seed input primes with. Picked to round-trip
// cleanly through `parseHexSeed` (no leading-zero truncation) and
// easy to grep for in a failure log.
const ENCODE_HEX = '0123456789abcdef';

beforeEach(() => {
  localStorage.clear();
  useSettingsStore.setState({
    pointerSensitivity: 0.002,
    fov: 60,
    darkMode: false,
    set: useSettingsStore.getState().set,
  });
  useLevelStore.setState({ customLevels: {} });
});

/**
 * Switch the source to the "seed" path (where the algorithm +
 * levelCount dropdowns live per spec §6.4 — the dropdowns only
 * render when the user is composing a v1/v2 id by hand). Also
 * primes a valid 16-char hex into the seed input so the levelCount
 * change is the only thing the assertion depends on.
 */
function goToSeedPath(hex: string): void {
  const src = screen.getByTestId('level-source-select') as HTMLSelectElement;
  fireEvent.change(src, { target: { value: 'seed' } });
  fireEvent.change(screen.getByTestId('seed-input'), { target: { value: hex } });
}

describe('LevelSelect levelCount dropdown (P3-1c workstream 2)', () => {
  it('renders the level-count-select next to the algorithm dropdown with 6 options', () => {
    render(<ConfirmProvider><LevelSelect available={[]} onPick={() => {}} onBack={() => {}} /></ConfirmProvider>);
    goToSeedPath(ENCODE_HEX);

    const levelCount = screen.getByTestId('level-count-select') as HTMLSelectElement;
    expect(levelCount.tagName).toBe('SELECT');
    for (const n of [1, 2, 3, 4, 5, 6]) {
      expect(within(levelCount).getByTestId(`level-count-${n}`)).toBeInTheDocument();
    }
    // Default 1 keeps every existing single-layer flow producing v1 ids.
    expect(levelCount.value).toBe('1');
  });

  it('levelCount=1 → onPick yields a v1 id (algo-v1-…; back-compat with existing best records)', () => {
    const onPick = vi.fn();
    render(<ConfirmProvider><LevelSelect available={[]} onPick={onPick} onBack={() => {}} /></ConfirmProvider>);
    goToSeedPath(ENCODE_HEX);

    fireEvent.change(screen.getByTestId('algorithm-select'), { target: { value: 'recursive-backtracker' } });
    fireEvent.change(screen.getByTestId('size-select'), { target: { value: '15' } });
    // level-count defaults to 1; explicit assignment here is for clarity.
    fireEvent.change(screen.getByTestId('level-count-select'), { target: { value: '1' } });

    fireEvent.click(screen.getByTestId('start-button'));

    expect(onPick).toHaveBeenCalledTimes(1);
    const [id] = onPick.mock.calls[0];
    // v1 format: no `levels` slot between size and hex.
    expect(id).toBe(`algo-v1-recursive-backtracker-15-${ENCODE_HEX}`);
    expect(id).not.toMatch(/^algo-v2-/);
  });

  it('levelCount=2 → onPick yields a v2 id with the documented wire format', () => {
    const onPick = vi.fn();
    render(<ConfirmProvider><LevelSelect available={[]} onPick={onPick} onBack={() => {}} /></ConfirmProvider>);
    goToSeedPath(ENCODE_HEX);

    fireEvent.change(screen.getByTestId('algorithm-select'), { target: { value: 'recursive-backtracker' } });
    fireEvent.change(screen.getByTestId('size-select'), { target: { value: '15' } });
    fireEvent.change(screen.getByTestId('level-count-select'), { target: { value: '2' } });

    fireEvent.click(screen.getByTestId('start-button'));

    expect(onPick).toHaveBeenCalledTimes(1);
    const [id] = onPick.mock.calls[0];
    // Per spec §3 decision 3 / SEED_RE_V2: algo-v2-{alg}-{size}-{levels}-{hex}
    expect(id).toBe(`algo-v2-recursive-backtracker-15-2-${ENCODE_HEX}`);
    // Cross-check via the codec so a future regex change doesn't silently
    // drift the UI off the wire format.
    expect(id).toBe(encodeSeedV2(
      { algorithm: 'recursive-backtracker', size: 15, mazeSeed: ENCODE_HEX },
      2,
    ));
  });

  it('levelCount=3 (the spec\'s example) yields a v2 id that round-trips through encodeSeedV2', () => {
    // The task description's manual-sanity example: 选 size=15 +
    // algorithm=recursive-backtracker + levelCount=3 → 拼出的 seed
    // `algo-v2-recursive-backtracker-15-3-0123456789abcdef` 有效.
    // This test pins the wire format at the spec value.
    const onPick = vi.fn();
    render(<ConfirmProvider><LevelSelect available={[]} onPick={onPick} onBack={() => {}} /></ConfirmProvider>);
    goToSeedPath(ENCODE_HEX);

    fireEvent.change(screen.getByTestId('algorithm-select'), { target: { value: 'recursive-backtracker' } });
    fireEvent.change(screen.getByTestId('size-select'), { target: { value: '15' } });
    fireEvent.change(screen.getByTestId('level-count-select'), { target: { value: '3' } });

    fireEvent.click(screen.getByTestId('start-button'));

    expect(onPick).toHaveBeenCalledTimes(1);
    const [id] = onPick.mock.calls[0];
    expect(id).toBe(`algo-v2-recursive-backtracker-15-3-${ENCODE_HEX}`);
  });

  it('levelCount=6 (spec upper cap) still produces a valid v2 id', () => {
    const onPick = vi.fn();
    render(<ConfirmProvider><LevelSelect available={[]} onPick={onPick} onBack={() => {}} /></ConfirmProvider>);
    goToSeedPath(ENCODE_HEX);

    fireEvent.change(screen.getByTestId('algorithm-select'), { target: { value: 'kruskal' } });
    fireEvent.change(screen.getByTestId('size-select'), { target: { value: '50' } });
    fireEvent.change(screen.getByTestId('level-count-select'), { target: { value: '6' } });

    fireEvent.click(screen.getByTestId('start-button'));

    expect(onPick).toHaveBeenCalledTimes(1);
    const [id] = onPick.mock.calls[0];
    expect(id).toBe(`algo-v2-kruskal-50-6-${ENCODE_HEX}`);
  });

  it('levelCount=2 → onPick options.seed carries levelCount=2 (downstream codec sees it)', () => {
    const onPick = vi.fn();
    render(<ConfirmProvider><LevelSelect available={[]} onPick={onPick} onBack={() => {}} /></ConfirmProvider>);
    goToSeedPath(ENCODE_HEX);

    fireEvent.change(screen.getByTestId('level-count-select'), { target: { value: '2' } });
    fireEvent.click(screen.getByTestId('start-button'));

    const [, options] = onPick.mock.calls[0];
    expect(options.seed?.levelCount).toBe(2);
  });

  it('levelCount=1 → onPick options.seed has levelCount=1 (no v1 → undefined leak)', () => {
    // The Seed type allows levelCount?: LevelCount; v1 ids by
    // definition don't carry it. LevelSelect explicitly populates
    // `levelCount: ctx.levelCount` in the seed path so the option
    // shape stays consistent across the v1/v2 boundary — a
    // downstream consumer reading options.seed.levelCount always
    // gets a numeric answer, never undefined.
    const onPick = vi.fn();
    render(<ConfirmProvider><LevelSelect available={[]} onPick={onPick} onBack={() => {}} /></ConfirmProvider>);
    goToSeedPath(ENCODE_HEX);
    fireEvent.click(screen.getByTestId('start-button'));

    const [, options] = onPick.mock.calls[0];
    expect(options.seed?.levelCount).toBe(1);
  });
});

describe('LevelSelect seed input parses pasted v1/v2 ids (P3-1c workstream 2)', () => {
  it('pasting a v1 id into the seed input extracts algorithm + size and resets levelCount to 1', () => {
    render(<ConfirmProvider><LevelSelect available={[]} onPick={() => {}} onBack={() => {}} /></ConfirmProvider>);
    goToSeedPath('0000000000000000'); // unrelated starting hex

    // Set levelCount first so we can confirm pasting a v1 id zeroes it.
    fireEvent.change(screen.getByTestId('level-count-select'), { target: { value: '5' } });
    expect((screen.getByTestId('level-count-select') as HTMLSelectElement).value).toBe('5');

    const v1Id = 'algo-v1-recursive-backtracker-30-0123456789abcdef';
    fireEvent.change(screen.getByTestId('seed-input'), { target: { value: v1Id } });

    expect((screen.getByTestId('seed-input') as HTMLInputElement).value).toBe('0123456789abcdef');
    expect((screen.getByTestId('algorithm-select') as HTMLSelectElement).value).toBe('recursive-backtracker');
    expect((screen.getByTestId('size-select') as HTMLSelectElement).value).toBe('30');
    // v1 ids don't carry a level count; the spec's P3-1 back-compat
    // rule is "v1 ≡ single layer" so the dropdown collapses to 1.
    expect((screen.getByTestId('level-count-select') as HTMLSelectElement).value).toBe('1');
  });

  it('pasting a v2 id into the seed input syncs algorithm + size + levelCount + hex', () => {
    render(<ConfirmProvider><LevelSelect available={[]} onPick={() => {}} onBack={() => {}} /></ConfirmProvider>);
    goToSeedPath('0000000000000000');

    const v2Id = 'algo-v2-kruskal-50-4-fedcba9876543210';
    fireEvent.change(screen.getByTestId('seed-input'), { target: { value: v2Id } });

    expect((screen.getByTestId('seed-input') as HTMLInputElement).value).toBe('fedcba9876543210');
    expect((screen.getByTestId('algorithm-select') as HTMLSelectElement).value).toBe('kruskal');
    expect((screen.getByTestId('size-select') as HTMLSelectElement).value).toBe('50');
    expect((screen.getByTestId('level-count-select') as HTMLSelectElement).value).toBe('4');
  });

  it('partial hex input (the common typing case) does NOT trigger the parser branch', () => {
    // The onChange handler must keep the existing 16-char hex
    // strip filter for the typing case. A user who types
    // "0123" character by character should not have the
    // algorithm / size dropdowns jump around.
    render(<ConfirmProvider><LevelSelect available={[]} onPick={() => {}} onBack={() => {}} /></ConfirmProvider>);
    goToSeedPath('0000000000000000');
    // Capture the dropdown values BEFORE the partial-hex change.
    const algoBefore = (screen.getByTestId('algorithm-select') as HTMLSelectElement).value;
    const sizeBefore = (screen.getByTestId('size-select') as HTMLSelectElement).value;

    fireEvent.change(screen.getByTestId('seed-input'), { target: { value: '01234abc' } });

    expect((screen.getByTestId('seed-input') as HTMLInputElement).value).toBe('01234abc');
    expect((screen.getByTestId('algorithm-select') as HTMLSelectElement).value).toBe(algoBefore);
    expect((screen.getByTestId('size-select') as HTMLSelectElement).value).toBe(sizeBefore);
  });

  it('pasting a v2 id then clicking start produces the same v2 id (round-trip self-consistency)', () => {
    const onPick = vi.fn();
    render(<ConfirmProvider><LevelSelect available={[]} onPick={onPick} onBack={() => {}} /></ConfirmProvider>);
    goToSeedPath('0000000000000000');

    const v2Id = 'algo-v2-houston-30-2-0123456789abcdef';
    fireEvent.change(screen.getByTestId('seed-input'), { target: { value: v2Id } });
    fireEvent.click(screen.getByTestId('start-button'));

    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick.mock.calls[0][0]).toBe(v2Id);
  });
});

describe('LevelSelect random mode honors levelCount (P3-1 UX fix)', () => {
  // UX fix: the level count dropdown is visible on the random rail
  // (line 787+ in LevelSelect.tsx renders it for `teaching` /
  // `random` / `seed`, only `custom` skips it), but the previous
  // `validateSelection` random branch always used `encodeSeed` (v1)
  // and silently dropped the user's layer pick. These two tests
  // pin the contract: random + levelCount=2 → v2 id, random +
  // levelCount=1 → v1 id (no best-record regression).

  function goToRandomPath(): void {
    const src = screen.getByTestId('level-source-select') as HTMLSelectElement;
    fireEvent.change(src, { target: { value: 'random' } });
  }

  it('random + levelCount=2 → onPick yields a v2 id carrying the layer count', () => {
    const onPick = vi.fn();
    render(<ConfirmProvider><LevelSelect available={[]} onPick={onPick} onBack={() => {}} /></ConfirmProvider>);
    goToRandomPath();

    fireEvent.change(screen.getByTestId('level-count-select'), { target: { value: '2' } });
    fireEvent.click(screen.getByTestId('start-button'));

    expect(onPick).toHaveBeenCalledTimes(1);
    const [id] = onPick.mock.calls[0];
    // v2 format: algo-v2-{algorithm}-{size}-{N}-{hex}, with N=2.
    // The exact algorithm + size + hex are determined by
    // algorithmForMode(mode) + the default 30 + a fresh random hex
    // on the random rail — we assert the shape, not the literals,
    // so a future algorithmForMode tweak doesn't break this test.
    expect(id).toMatch(/^algo-v2-[a-z-]+-\d+-2-[0-9a-f]{16}$/);
  });

  it('random + levelCount=1 → onPick yields a v1 id (back-compat with existing single-layer best records)', () => {
    const onPick = vi.fn();
    render(<ConfirmProvider><LevelSelect available={[]} onPick={onPick} onBack={() => {}} /></ConfirmProvider>);
    goToRandomPath();

    // Default levelCount is 1, but the test sets it explicitly to
    // document the back-compat contract: even with the dropdown
    // visible, picking 1 must still produce a v1 id.
    fireEvent.change(screen.getByTestId('level-count-select'), { target: { value: '1' } });
    fireEvent.click(screen.getByTestId('start-button'));

    expect(onPick).toHaveBeenCalledTimes(1);
    const [id] = onPick.mock.calls[0];
    expect(id).toMatch(/^algo-v1-[a-z-]+-\d+-[0-9a-f]{16}$/);
  });
});

describe('LevelSelect random mode honors levelCount (P3-1 UX fix)', () => {
  // UX fix: the level count dropdown is visible on the random rail
  // (line 787+ in LevelSelect.tsx renders it for `teaching` /
  // `random` / `seed`, only `custom` skips it), but the previous
  // `validateSelection` random branch always used `encodeSeed` (v1)
  // and silently dropped the user's layer pick. These two tests
  // pin the contract: random + levelCount=2 → v2 id, random +
  // levelCount=1 → v1 id (no best-record regression).

  function goToRandomPath(): void {
    const src = screen.getByTestId('level-source-select') as HTMLSelectElement;
    fireEvent.change(src, { target: { value: 'random' } });
  }

  it('random + levelCount=2 → onPick yields a v2 id carrying the layer count', () => {
    const onPick = vi.fn();
    render(<ConfirmProvider><LevelSelect available={[]} onPick={onPick} onBack={() => {}} /></ConfirmProvider>);
    goToRandomPath();

    fireEvent.change(screen.getByTestId('level-count-select'), { target: { value: '2' } });
    fireEvent.click(screen.getByTestId('start-button'));

    expect(onPick).toHaveBeenCalledTimes(1);
    const [id] = onPick.mock.calls[0];
    // v2 format: algo-v2-{algorithm}-{size}-{N}-{hex}, with N=2.
    // The exact algorithm + size + hex are determined by
    // algorithmForMode(mode) + the default 30 + a fresh random hex
    // on the random rail — we assert the shape, not the literals,
    // so a future algorithmForMode tweak doesn't break this test.
    expect(id).toMatch(/^algo-v2-[a-z-]+-\d+-2-[0-9a-f]{16}$/);
  });

  it('random + levelCount=1 → onPick yields a v1 id (back-compat with existing single-layer best records)', () => {
    const onPick = vi.fn();
    render(<ConfirmProvider><LevelSelect available={[]} onPick={onPick} onBack={() => {}} /></ConfirmProvider>);
    goToRandomPath();

    // Default levelCount is 1, but the test sets it explicitly to
    // document the back-compat contract: even with the dropdown
    // visible, picking 1 must still produce a v1 id.
    fireEvent.change(screen.getByTestId('level-count-select'), { target: { value: '1' } });
    fireEvent.click(screen.getByTestId('start-button'));

    expect(onPick).toHaveBeenCalledTimes(1);
    const [id] = onPick.mock.calls[0];
    expect(id).toMatch(/^algo-v1-[a-z-]+-\d+-[0-9a-f]{16}$/);
  });
});

describe('LevelSelect levelCount dropdown is teaching-aware (H3 fix)', () => {
  // H3 fix (architect review): the levelCount dropdown is rendered
  // in a sibling section visible across teaching / random / seed.
  // On the teaching rail the dropdown is locked to 1 layer (the
  // teaching JSONs are served by JsonMazeProvider with no
  // `transitions` array, so any `levelCount > 1` would trap the
  // player on L0 with no climb-out path). The contract under test:
  //   1. `source === 'teaching'` (the default) → the dropdown
  //      exists in the DOM with `disabled={true}` and a visible
  //      hint explaining the lock.
  //   2. `source === 'seed'` (the only procedural path with a
  //      fully open dropdown per spec §6.4) → the dropdown is
  //      enabled and the 1..6 options are all selectable.
  //   3. Switching from `seed` (where the user may have picked
  //      `levelCount=6`) back to `teaching` snaps the value back
  //      to 1 via the guard useEffect — a stale multi-layer state
  //      never reaches the start handler.

  it('disables the level count dropdown and shows a hint when source is teaching (default rail)', () => {
    // The default `levelSource` is 'teaching' (LevelSelect.tsx useState
    // initializer), so rendering the component with no further
    // interaction already puts the user on the teaching rail.
    render(<ConfirmProvider><LevelSelect available={[]} onPick={() => {}} onBack={() => {}} /></ConfirmProvider>);

    const levelCount = screen.getByTestId('level-count-select') as HTMLSelectElement;
    // `disabled` is the wire-level guard. The trigger <button> and
    // the hidden <select> both forward the `disabled` prop, so
    // checking the <select>'s disabled flag is the cheapest way to
    // assert the lock without coupling to which path a11y uses.
    expect(levelCount.disabled).toBe(true);
    // `value` is the only sanity check we need: the useEffect that
    // snaps `levelCount` back to 1 on the teaching rail guarantees
    // the dropdown's controlled value is also 1, regardless of
    // whether the user had touched the dropdown in a previous
    // render of this same component instance.
    expect(levelCount.value).toBe('1');
    // The hint explains the lock to the player; without it the
    // disabled dropdown reads as a UI bug ("why is this greyed
    // out?") instead of an intentional guard.
    expect(screen.getByTestId('level-count-disabled-hint')).toHaveTextContent(
      /教学关卡固定 1 层|Teaching levels are fixed at 1 layer/,
    );
  });

  it('keeps the level count dropdown enabled with all 1..6 options when source is seed', () => {
    render(<ConfirmProvider><LevelSelect available={[]} onPick={() => {}} onBack={() => {}} /></ConfirmProvider>);
    goToSeedPath(ENCODE_HEX);

    const levelCount = screen.getByTestId('level-count-select') as HTMLSelectElement;
    expect(levelCount.disabled).toBe(false);
    // Every spec value (1..6) is present in the option list. The
    // `option1..option6` keys are the single source of truth in
    // i18n, so the actual labels differ by locale — the assertion
    // is on count + presence, not on the localized strings.
    for (const n of [1, 2, 3, 4, 5, 6]) {
      expect(within(levelCount).getByTestId(`level-count-${n}`)).toBeInTheDocument();
    }
    // Selecting each value round-trips through the controlled
    // <select>. This pins the open-path behavior so a future
    // H3-style "lock levelCount for X source" rule can't silently
    // regress the seed path.
    for (const n of [1, 2, 3, 4, 5, 6] as const) {
      fireEvent.change(levelCount, { target: { value: String(n) } });
      expect((screen.getByTestId('level-count-select') as HTMLSelectElement).value).toBe(String(n));
    }
  });

  it('preserves the levelCount state value when switching from seed to teaching (no auto-snap, P5-1)', () => {
    // P5-1: the historical H3 useEffect that snapped `levelCount`
    // back to 1 on the teaching rail is removed. Teaching JSONs
    // now carry `levelCount` directly (e.g. `teaching-multilayer-01`
    // has `levelCount: 2`), and the engine reads it from the JSON —
    // the UI state is internal-only. The dropdown stays `disabled`
    // on the teaching rail (so a user can't change it from the
    // teaching UI), but a stale value from a prior seed visit
    // flows through the state without auto-reset. The teaching
    // rail's validateSelection returns no options, so the stale
    // value never reaches the engine.
    render(<ConfirmProvider><LevelSelect available={[]} onPick={() => {}} onBack={() => {}} /></ConfirmProvider>);
    goToSeedPath(ENCODE_HEX);

    // Push the dropdown to 6 in the seed path.
    const levelCount = screen.getByTestId('level-count-select') as HTMLSelectElement;
    fireEvent.change(levelCount, { target: { value: '6' } });
    expect(levelCount.value).toBe('6');

    // Switch back to teaching (the default rail). The dropdown
    // becomes disabled but the value is preserved — no useEffect
    // snap, since the engine reads `levelCount` from the JSON.
    const src = screen.getByTestId('level-source-select') as HTMLSelectElement;
    fireEvent.change(src, { target: { value: 'teaching' } });

    expect((screen.getByTestId('level-count-select') as HTMLSelectElement).value).toBe('6');
    expect(screen.getByTestId('level-count-disabled-hint')).toBeInTheDocument();
  });
});

describe('LevelSelect progressiveMax threads into spawnSchedule.max (P3-1 fix-progressive-max)', () => {
  // P3-1 fix-progressive-max: the "渐进上限" input on the
  // procedural panel used to be a dead state — `buildOptions`
  // constructed `spawnSchedule` from `SPAWN_SCHEDULE_DEFAULT` and
  // only overlaid `enabled`, never the `max` field. This describe
  // pins the contract: changing the input now flows through to
  // `options.spawnSchedule.max` and lands in the URL via the
  // gameUrl codec.
  //
  // The input only renders when the user is in `survive` mode
  // (the only mode where the progressive toggle is shown) — same
  // gate as the `progressive-spawn` checkbox. The two tests
  // below start by clicking the `mode-survive` segmented option
  // so the input is in the DOM.

  function goToRandomSurvive(): void {
    const src = screen.getByTestId('level-source-select') as HTMLSelectElement;
    fireEvent.change(src, { target: { value: 'random' } });
    // The mode picker renders twice (a hidden Dropdown and a
    // visible segmented control with role="tablist"). The
    // scoped query pins the click to the visible segmented
    // button so we don't accidentally hit the Dropdown's
    // hidden option row.
    const tablist = screen.getByRole('tablist');
    fireEvent.click(within(tablist).getByTestId('mode-survive'));
  }

  function goToSeedSurvive(hex: string): void {
    goToSeedPath(hex);
    const tablist = screen.getByRole('tablist');
    fireEvent.click(within(tablist).getByTestId('mode-survive'));
  }

  it('progressiveMax=3 (random + survive) → onPick options.spawnSchedule.max === 3', () => {
    const onPick = vi.fn();
    render(<ConfirmProvider><LevelSelect available={[]} onPick={onPick} onBack={() => {}} /></ConfirmProvider>);
    goToRandomSurvive();

    // The "渐进上限" input only shows on the survive mode
    // (the only mode the progressive spawn toggle / max are
    // gated on). Default value is
    // SPAWN_PROGRESSIVE_MAX_DEFAULT (10); we override to 3
    // to make the round-trip the only thing under test.
    const maxInput = screen.getByTestId('progressive-max-input') as HTMLInputElement;
    fireEvent.change(maxInput, { target: { value: '3' } });

    fireEvent.click(screen.getByTestId('start-button'));

    expect(onPick).toHaveBeenCalledTimes(1);
    const [, options] = onPick.mock.calls[0];
    expect(options.spawnSchedule?.max).toBe(3);
  });

  it('progressiveMax=7 (seed + survive) → onPick options.spawnSchedule.max === 7', () => {
    // Same contract on the seed rail — the input is the
    // LevelSelect-level "渐进上限" regardless of the active
    // source, so both random + seed must honor it.
    const onPick = vi.fn();
    render(<ConfirmProvider><LevelSelect available={[]} onPick={onPick} onBack={() => {}} /></ConfirmProvider>);
    goToSeedSurvive(ENCODE_HEX);

    const maxInput = screen.getByTestId('progressive-max-input') as HTMLInputElement;
    fireEvent.change(maxInput, { target: { value: '7' } });

    fireEvent.click(screen.getByTestId('start-button'));

    expect(onPick).toHaveBeenCalledTimes(1);
    const [, options] = onPick.mock.calls[0];
    expect(options.spawnSchedule?.max).toBe(7);
  });
});

describe('LevelSelect random rail exposes the algorithm picker (P3-1 fix-random-algo-selector)', () => {
  // P3-1 fix-random-algo-selector: the algorithm-select dropdown
  // used to be locked behind `showSeedFields` (only visible on
  // the seed-input rail), and the random branch of
  // `validateSelection` hardcoded `algorithmForMode(mode)`,
  // ignoring the user's `selectedAlgorithm` state. Both halves of
  // the bug are fixed: the dropdown is now in a sibling section
  // visible on random + seed, and the random branch reads
  // `ctx.selectedAlgorithm`.

  function goToRandomPath(): void {
    const src = screen.getByTestId('level-source-select') as HTMLSelectElement;
    fireEvent.change(src, { target: { value: 'random' } });
  }

  it('algorithm-select is present on the random rail (was previously hidden)', () => {
    render(<ConfirmProvider><LevelSelect available={[]} onPick={() => {}} onBack={() => {}} /></ConfirmProvider>);
    goToRandomPath();

    // The dropdown is now in `algorithm-picker-section`; the
    // data-testid stays `algorithm-select` so existing tests
    // and the P2-19 wiring still find it. This is the
    // gate-rewrite half of the fix: the random rail now sees
    // the dropdown.
    expect(screen.getByTestId('algorithm-picker-section')).toBeInTheDocument();
    expect(screen.getByTestId('algorithm-select')).toBeInTheDocument();
  });

  it('random + user-picked algorithm=eller → onPick yields an id carrying `algorithm=eller`', () => {
    // The validateSelection half of the fix: even though the
    // mode is still time-trial (whose default algorithm is
    // recursive-backtracker per `algorithmForMode`), the user's
    // manual override in the dropdown is now honored.
    const onPick = vi.fn();
    render(<ConfirmProvider><LevelSelect available={[]} onPick={onPick} onBack={() => {}} /></ConfirmProvider>);
    goToRandomPath();

    fireEvent.change(screen.getByTestId('algorithm-select'), { target: { value: 'eller' } });
    fireEvent.click(screen.getByTestId('start-button'));

    expect(onPick).toHaveBeenCalledTimes(1);
    const [id] = onPick.mock.calls[0];
    // v1 format puts the algorithm between `algo-v1-` and `-{size}-{hex}`.
    expect(id).toMatch(/^algo-v1-eller-\d+-[0-9a-f]{16}$/);
  });

  it('random default mode=time-trial → onPick algorithm=prim (algorithmForMode default still wins on first paint)', () => {
    // Belt-and-suspenders for the mode-change reset behavior:
    // when the user doesn't touch the algorithm dropdown on
    // the random rail, the seed's algorithm should still be
    // `algorithmForMode('time-trial')` (= `prim` per the P2-3
    // mapping; `recursive-backtracker` is the `reach-exit`
    // default). The P2-19 useEffect at LevelSelect.tsx:400
    // snaps `selectedAlgorithm` to `algorithmForMode(mode)` on
    // every mode change, so the first time the user lands on
    // the random rail the brief and the wire id both show the
    // familiar default.
    const onPick = vi.fn();
    render(<ConfirmProvider><LevelSelect available={[]} onPick={onPick} onBack={() => {}} /></ConfirmProvider>);
    goToRandomPath();

    fireEvent.click(screen.getByTestId('start-button'));

    expect(onPick).toHaveBeenCalledTimes(1);
    const [id] = onPick.mock.calls[0];
    expect(id).toMatch(/^algo-v1-prim-\d+-[0-9a-f]{16}$/);
  });
});
