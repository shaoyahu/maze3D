import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MainMenu } from '../../src/ui/MainMenu';
import { LevelSelect, type LevelDef } from '../../src/ui/LevelSelect';
import { Settings } from '../../src/ui/Settings';
import { useSettingsStore } from '../../src/store/settingsStore';
import { ConfirmProvider } from '../../src/ui/useConfirm';

describe('menu components', () => {
  beforeEach(() => {
    localStorage.clear();
    useSettingsStore.setState({
      pointerSensitivity: 0.002,
      fov: 60,
      darkMode: false,
      set: useSettingsStore.getState().set,
    });
  });

  it('MainMenu shows title and triggers onStart/onSettings callbacks', () => {
    const onStart = vi.fn();
    const onSettings = vi.fn();
    render(<MainMenu onStart={onStart} onSettings={onSettings} />);
    // F-2026-06-15-H-3.6: title text varies by locale (i18n via P2-8).
    // Use the panel testid so the assertion is locale-stable. The "开始"
    // button now renders as "▶ 开始" after the home-revamp icon prefix —
    // use the testid for the same reason.
    expect(screen.getByTestId('main-menu-panel')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('main-menu-start'));
    expect(onStart).toHaveBeenCalled();
    fireEvent.click(screen.getByText('设置'));
    expect(onSettings).toHaveBeenCalled();
  });

  it('MainMenu shows the level editor button only when onEditor is provided (P2-4b FR-1)', () => {
    const { rerender } = render(<MainMenu onStart={() => {}} onSettings={() => {}} />);
    expect(screen.queryByTestId('main-menu-editor')).not.toBeInTheDocument();
    const onEditor = vi.fn();
    rerender(<MainMenu onStart={() => {}} onSettings={() => {}} onEditor={onEditor} />);
    fireEvent.click(screen.getByTestId('main-menu-editor'));
    expect(onEditor).toHaveBeenCalled();
  });

  it('LevelSelect renders available levels and triggers onPick and onBack', () => {
    const onPick = vi.fn();
    const onBack = vi.fn();
    const levels: LevelDef[] = [{ id: 'a', name: 'Alpha' }, { id: 'b', name: 'Beta' }];
    render(<ConfirmProvider><LevelSelect available={levels} onPick={onPick} onBack={onBack} /></ConfirmProvider>);
    // P2-6: default source='teaching' renders sublevel-select + single start-button.
    fireEvent.change(screen.getByTestId('sublevel-select'), { target: { value: 'a' } });
    fireEvent.click(screen.getByTestId('start-button'));
    // Hand-crafted level: just the id, no StartLevelOptions.
    // P2-6: onPick is (id, options?) so the second arg is explicitly undefined.
    expect(onPick).toHaveBeenCalledWith('a', undefined);
    fireEvent.click(screen.getByText('返回'));
    expect(onBack).toHaveBeenCalled();
  });

  // P2-6: the "暂无固定关卡" hint text was replaced by a disabled sublevel-select
  // (per FR-2: when no teaching levels are available, the dropdown is rendered
  // but disabled). Old text removed; this test would be a no-op so it's skipped
  // rather than deleted, awaiting P2-7 to add a richer empty-state message.
  it.skip('LevelSelect shows a hint about the random cards when no hand-crafted levels are loaded (P2-6: hint text removed; see FR-2)', () => {
    render(<ConfirmProvider><LevelSelect available={[]} onPick={() => {}} onBack={() => {}} /></ConfirmProvider>);
    expect(screen.getByText(/暂无固定关卡/)).toBeInTheDocument();
  });

  // P2-3 FR-10: LevelSelect has two extra entries for procedural play:
  //   (1) "随机关卡" — 3 size cards (15/30/50) → time-trial with a random seed
  //   (2) "指定种子关卡" — seed input + algorithm + size + mode + start
  // P2-6: all 4 sources are gated by a single level-source-select dropdown; the
  // tests below switch the source first, then exercise the same behaviors.
  describe('P2-3 procedural entries (P2-6 cascading)', () => {
    it('switching to random source shows the size dropdown', () => {
      render(<ConfirmProvider><LevelSelect available={[]} onPick={() => {}} onBack={() => {}} /></ConfirmProvider>);
      fireEvent.change(screen.getByTestId('level-source-select'), { target: { value: 'random' } });
      // P2-6: a single size <select> drives the random seed; the 4 separate
      // random-card buttons are gone (replaced by a single start-button).
      expect(screen.getByTestId('size-select')).toBeInTheDocument();
    });

    it('clicking start-button with default size calls onPick with a procedural seed id + default mode', () => {
      const onPick = vi.fn();
      render(<ConfirmProvider><LevelSelect available={[]} onPick={onPick} onBack={() => {}} /></ConfirmProvider>);
      fireEvent.change(screen.getByTestId('level-source-select'), { target: { value: 'random' } });
      // Switch size to 15 then click the unified start-button.
      fireEvent.change(screen.getByTestId('size-select'), { target: { value: '15' } });
      fireEvent.click(screen.getByTestId('start-button'));
      expect(onPick).toHaveBeenCalledTimes(1);
      const [id, options] = onPick.mock.calls[0];
      // id must be a well-formed procedural seed id (algo-v1-*-15-xxxxxxxxxxxxxxxx).
      expect(id).toMatch(/^algo-v1-[a-z-]+-15-[0-9a-f]{16}$/);
      // default mode is time-trial (FR-17: algorithmForMode(time-trial) = prim)
      expect(options?.mode).toBe('time-trial');
      expect(options?.seed?.size).toBe(15);
    });

    it('changing the size dropdown passes that size in the start options', () => {
      const onPick = vi.fn();
      render(<ConfirmProvider><LevelSelect available={[]} onPick={onPick} onBack={() => {}} /></ConfirmProvider>);
      fireEvent.change(screen.getByTestId('level-source-select'), { target: { value: 'random' } });
      // Default size is 30, but switch to 50 to verify the dropdown drives the seed.
      fireEvent.change(screen.getByTestId('size-select'), { target: { value: '50' } });
      fireEvent.click(screen.getByTestId('start-button'));
      const [id, options] = onPick.mock.calls[0];
      expect(id).toMatch(/-50-[0-9a-f]{16}$/);
      expect(options?.seed?.size).toBe(50);
    });

    it('switching to seed source shows the seed input directly (no 进阶 fold in P2-6)', () => {
      render(<ConfirmProvider><LevelSelect available={[]} onPick={() => {}} onBack={() => {}} /></ConfirmProvider>);
      fireEvent.change(screen.getByTestId('level-source-select'), { target: { value: 'seed' } });
      // P2-6: the seed section is open by default — no advanced-toggle, no fold.
      expect(screen.queryByTestId('advanced-toggle')).toBeNull();
      expect(screen.getByTestId('seed-input')).toBeInTheDocument();
      // Reuse-last-seed button is still rendered.
      expect(screen.getByTestId('reuse-last-seed')).toBeInTheDocument();
    });

    it('clicking start with a valid hex seed calls onPick with that seed', () => {
      const onPick = vi.fn();
      render(<ConfirmProvider><LevelSelect available={[]} onPick={onPick} onBack={() => {}} /></ConfirmProvider>);
      fireEvent.change(screen.getByTestId('level-source-select'), { target: { value: 'seed' } });
      const seedInput = screen.getByTestId('seed-input') as HTMLInputElement;
      fireEvent.change(seedInput, { target: { value: '0123456789abcdef' } });
      fireEvent.click(screen.getByTestId('start-button'));
      expect(onPick).toHaveBeenCalledTimes(1);
      const [id, options] = onPick.mock.calls[0];
      expect(id).toMatch(/^algo-v1-[a-z-]+-\d+-0123456789abcdef$/);
      expect(options?.seed?.mazeSeed).toBe('0123456789abcdef');
    });

    it('clicking start with an invalid (non-hex) seed does NOT call onPick (start-button disabled)', () => {
      const onPick = vi.fn();
      render(<ConfirmProvider><LevelSelect available={[]} onPick={onPick} onBack={() => {}} /></ConfirmProvider>);
      fireEvent.change(screen.getByTestId('level-source-select'), { target: { value: 'seed' } });
      const seedInput = screen.getByTestId('seed-input') as HTMLInputElement;
      fireEvent.change(seedInput, { target: { value: 'not-hex' } });
      // P2-6: validation failure disables the start-button; clicking it is a no-op.
      const btn = screen.getByTestId('start-button') as HTMLButtonElement;
      expect(btn).toBeDisabled();
      fireEvent.click(btn);
      expect(onPick).not.toHaveBeenCalled();
    });
  });

  // P2-4a FR-13/FR-20: 4 procedural controls + last-seed persistence.
  // P2-6: switching to 'random' reveals the procedural-controls section; survive
  // mode then reveals the 4-control block (mode/survive-seconds/enemy/progressive).
  describe('P2-4a procedural controls (P2-6 cascading)', () => {
    it('switching to random + survive mode renders the 4 procedural controls', () => {
      render(<ConfirmProvider><LevelSelect available={[]} onPick={() => {}} onBack={() => {}} /></ConfirmProvider>);
      fireEvent.change(screen.getByTestId('level-source-select'), { target: { value: 'random' } });
      expect(screen.getByTestId('procedural-controls')).toBeInTheDocument();
      // P2-5 FR-8: mode is a <select> with stable testids on each <option>.
      const modeSelect = screen.getByTestId('mode-select');
      expect(within(modeSelect).getByTestId('mode-reach-exit')).toBeInTheDocument();
      expect(within(modeSelect).getByTestId('mode-time-trial')).toBeInTheDocument();
      expect(within(modeSelect).getByTestId('mode-survive')).toBeInTheDocument();
      // P2-6: survive-seconds is a free <input> + 4 chips, only when mode='survive'.
      expect(screen.queryByTestId('survive-seconds-input')).toBeNull();
      // Switch to survive so the 4 controls are all rendered.
      fireEvent.change(modeSelect, { target: { value: 'survive' } });
      // P2-5 FR-15: enemy count is a 0..10 <select> with default 3.
      const enemySelect = screen.getByTestId('enemy-count-select') as HTMLSelectElement;
      expect(enemySelect.tagName).toBe('SELECT');
      expect(enemySelect.value).toBe('3');
      const values = Array.from(enemySelect.options).map((o) => o.value);
      expect(values).toEqual(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
      // progressive toggle defaults to on
      expect(screen.getByTestId('progressive-spawn')).toBeChecked();
    });

    it('switching to survive mode reveals the survive-seconds input + 4 chip buttons', () => {
      render(<ConfirmProvider><LevelSelect available={[]} onPick={() => {}} onBack={() => {}} /></ConfirmProvider>);
      fireEvent.change(screen.getByTestId('level-source-select'), { target: { value: 'random' } });
      // P2-6: no survive-seconds-select anymore — replaced by a free input + 4 chip
      // buttons. Verify the select-based testid is gone and the new ones exist.
      expect(screen.queryByTestId('survive-seconds-select')).toBeNull();
      fireEvent.change(screen.getByTestId('mode-select'), { target: { value: 'survive' } });
      expect(screen.getByTestId('survive-seconds-input')).toBeInTheDocument();
      // 4 chip buttons (30/60/90/120) — the previous <select> <option> testids
      // (`survive-30` etc.) are gone, replaced by `survive-chip-30` etc.
      expect(screen.getByTestId('survive-chip-30')).toBeInTheDocument();
      expect(screen.getByTestId('survive-chip-60')).toBeInTheDocument();
      expect(screen.getByTestId('survive-chip-90')).toBeInTheDocument();
      expect(screen.getByTestId('survive-chip-120')).toBeInTheDocument();
    });

    it('forwards mode + enemyCount + spawnSchedule on the start callback', () => {
      const onPick = vi.fn();
      render(<ConfirmProvider><LevelSelect available={[]} onPick={onPick} onBack={() => {}} /></ConfirmProvider>);
      fireEvent.change(screen.getByTestId('level-source-select'), { target: { value: 'random' } });
      // Switch to survive and configure enemy + spawn options.
      fireEvent.change(screen.getByTestId('mode-select'), { target: { value: 'survive' } });
      // P2-6: 30s chip click sets survive-seconds to 30 (replaces <select> change).
      fireEvent.click(screen.getByTestId('survive-chip-30'));
      fireEvent.click(screen.getByTestId('progressive-spawn')); // toggle off
      fireEvent.click(screen.getByTestId('start-button'));
      const [, options] = onPick.mock.calls[0];
      expect(options?.mode).toBe('survive');
      expect(options?.surviveSeconds).toBe(30);
      expect(options?.enemyCount).toBe(3);
      expect(options?.spawnSchedule?.enabled).toBe(false);
    });

    it('persists the last valid seed to localStorage on a successful start', () => {
      const onPick = vi.fn();
      render(<ConfirmProvider><LevelSelect available={[]} onPick={onPick} onBack={() => {}} /></ConfirmProvider>);
      fireEvent.change(screen.getByTestId('level-source-select'), { target: { value: 'seed' } });
      const seedInput = screen.getByTestId('seed-input') as HTMLInputElement;
      fireEvent.change(seedInput, { target: { value: '0123456789abcdef' } });
      fireEvent.click(screen.getByTestId('start-button'));
      expect(localStorage.getItem('maze3d.lastSeed')).toBe('0123456789abcdef');
    });

    it('does NOT persist a seed that fails the hex check (FR-20)', () => {
      localStorage.setItem('maze3d.lastSeed', 'previoustoolongvalue');
      const onPick = vi.fn();
      render(<ConfirmProvider><LevelSelect available={[]} onPick={onPick} onBack={() => {}} /></ConfirmProvider>);
      fireEvent.change(screen.getByTestId('level-source-select'), { target: { value: 'seed' } });
      const seedInput = screen.getByTestId('seed-input') as HTMLInputElement;
      fireEvent.change(seedInput, { target: { value: 'not-hex' } });
      // Invalid seed disables start-button; click is a no-op so localStorage
      // is never clobbered.
      fireEvent.click(screen.getByTestId('start-button'));
      // Invalid seed must not clobber the prior value.
      expect(localStorage.getItem('maze3d.lastSeed')).toBe('previoustoolongvalue');
    });

    it('pre-fills the seed input from localStorage (FR-20 round-trip)', () => {
      localStorage.setItem('maze3d.lastSeed', 'feedfacefeedface');
      render(<ConfirmProvider><LevelSelect available={[]} onPick={() => {}} onBack={() => {}} /></ConfirmProvider>);
      // P2-6: seed input is rendered immediately when source='seed' — no fold
      // to open. The pre-fill useEffect runs on mount and reads localStorage.
      fireEvent.change(screen.getByTestId('level-source-select'), { target: { value: 'seed' } });
      const seedInput = screen.getByTestId('seed-input') as HTMLInputElement;
      expect(seedInput.value).toBe('feedfacefeedface');
    });

    it('ignores a non-hex value in localStorage and leaves the input empty', () => {
      localStorage.setItem('maze3d.lastSeed', 'totally-not-hex');
      render(<ConfirmProvider><LevelSelect available={[]} onPick={() => {}} onBack={() => {}} /></ConfirmProvider>);
      fireEvent.change(screen.getByTestId('level-source-select'), { target: { value: 'seed' } });
      const seedInput = screen.getByTestId('seed-input') as HTMLInputElement;
      expect(seedInput.value).toBe('');
    });
  });

  it('Settings renders current sensitivity and updates via set', () => {
    const onBack = vi.fn();
    render(<Settings onBack={onBack} />);
    expect(screen.getByText(/rad\/px/)).toBeInTheDocument();
    // Two sliders now (sensitivity + FOV). Pick the one whose min matches
    // the sensitivity range so the test stays unambiguous if the FOV
    // slider's range ever changes.
    const slider = screen.getAllByRole('slider').find(
      (el) => (el as HTMLInputElement).min === '0.0005',
    ) as HTMLInputElement;
    fireEvent.change(slider, { target: { value: '0.004' } });
    expect(useSettingsStore.getState().pointerSensitivity).toBeCloseTo(0.004);
    fireEvent.click(screen.getByText('返回'));
    expect(onBack).toHaveBeenCalled();
  });
});
