import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { EditorStatusBar } from '../../../src/ui/editor/EditorStatusBar';
import { useEditorStore } from '../../../src/store/editorStore';
import type { MazeData } from '../../../src/maze/types';
import { makeMaze as makeBaseMaze } from '../../_helpers/makeMaze';
import { resetEditor as baseResetEditor } from '../../_helpers/editorMocks';

// F-2026-06-17-F-M-1: 走统一 helper;此测试需要带 2 个 obstacle 的 walls,
// 用 thin wrapper 在 base 上叠加。
function makeMaze(overrides: Partial<MazeData> = {}): MazeData {
  return makeBaseMaze({
    walls: [
      [0, 0, 0, 0, 0],
      [0, 1, 0, 0, 0],
      [0, 0, 0, 1, 0],
      [0, 0, 0, 0, 0],
    ],
    ...overrides,
  });
}

const resetEditor = (overrides: Partial<MazeData> = {}): void => baseResetEditor(makeMaze(overrides));

describe('EditorStatusBar (P2-4b #14)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-10T13:07:42Z'));
    resetEditor();
  });

  // P3-C-M3: paired with the beforeEach fake-timer install above. Without
  // this restore, fake timers leak into any test that runs after this
  // file in the same worker — making time-based helpers in unrelated
  // tests fire at the wrong wall-clock and silently break.
  // (M-63 / M-64: there used to be a second copy of this afterEach
  // block immediately after the first. Kept one and dropped the dup.)
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the dirty / saved / not-modified indicator', () => {
    // 1. Pristine: shows "未改动" because dirty=false and no save.
    const { rerender } = render(<EditorStatusBar />);
    expect(screen.getByTestId('status-dirty').textContent).toContain('未改动');

    // 2. Dirty: shows "● 未保存".
    useEditorStore.setState({ dirty: true });
    rerender(<EditorStatusBar />);
    expect(screen.getByTestId('status-dirty').textContent).toContain('未保存');

    // 3. Saved: shows "✓ 已保存 HH:MM:SS" (chip mode in the redesign).
    useEditorStore.setState({ dirty: false, lastSavedAt: Date.now() });
    rerender(<EditorStatusBar />);
    expect(screen.getByTestId('status-dirty').textContent).toMatch(/已保存\s*\d{2}:\d{2}:\d{2}/);
  });

  it('counts walls, pickups, and enemies from the level', () => {
    resetEditor({
      pickups: [
        { id: 'p1', x: 1, z: 1, type: 'time', value: 5 },
        { id: 'p2', x: 2, z: 1, type: 'key', value: 1 },
      ],
      enemies: [
        { id: 'e1', x: 2, z: 2, path: [{ x: 2, z: 2 }, { x: 3, z: 2 }] },
      ],
    });
    render(<EditorStatusBar />);
    // 2 walls in the default fixture. New chip layout puts each stat on
    // its own chip; verify all three counts are present anywhere in the
    // status bar.
    const bar = screen.getByTestId('editor-status-bar');
    expect(bar.textContent).toMatch(/2[\s\S]*墙/);
    // F-P2-9: status-bar chip relabeled from "拾取" → "道具".
    expect(bar.textContent).toMatch(/2[\s\S]*道具/);
    expect(bar.textContent).toMatch(/1[\s\S]*敌人/);
  });

  it('shows the warning count from validateDesign', () => {
    // F-2026-06-17: the default fixture used to be 1 warning ("no
    // pickups"). That rule was removed — empty levels are legal — so we
    // pre-seed a wall column at x=2 that severs start (0,0) from exit
    // (4,3), which is the only remaining non-error rule that always
    // fires regardless of the rest of the level.
    resetEditor({
      walls: [
        [0, 0, 1, 0, 0],
        [0, 0, 1, 0, 0],
        [0, 0, 1, 0, 0],
        [0, 0, 1, 0, 0],
      ],
    });
    render(<EditorStatusBar />);
    expect(screen.getByTestId('status-warnings').textContent).toContain('1');
    expect(screen.getByTestId('status-warnings').textContent).toContain('警告');
  });

  it('shows the schema version', () => {
    render(<EditorStatusBar />);
    expect(screen.getByTestId('status-schema').textContent).toBe('schema v1');
  });

  // F-editor-warnings-popup: the status-bar warning chip is now a button.
  // Clicking it opens a portal-rendered dialog listing every issue
  // validateDesign emits for the current level, each tagged with its
  // severity and `where`. Closing the dialog hides the list.
  describe('warnings popup', () => {
    it('does not render the popup by default', () => {
      render(<EditorStatusBar />);
      expect(screen.queryByTestId('warnings-popup')).toBeNull();
    });

    it('opens the popup when the warning chip is clicked', () => {
      // F-2026-06-17: fixture has 1 warning (exit unreachable) and 0
      // errors after the "no pickups" rule was removed.
      resetEditor({
        walls: [
          [0, 0, 1, 0, 0],
          [0, 0, 1, 0, 0],
          [0, 0, 1, 0, 0],
          [0, 0, 1, 0, 0],
        ],
      });
      render(<EditorStatusBar />);
      act(() => {
        screen.getByTestId('status-warnings').click();
      });
      const popup = screen.getByTestId('warnings-popup');
      expect(popup).toBeInTheDocument();
      // F-2026-06-17-E-M-7: warnings popup renders the i18n-translated
      // message (default locale is `zh`), not the raw English string.
      expect(screen.getByTestId('warnings-popup-list').children).toHaveLength(1);
      expect(screen.getByTestId('warnings-popup-item-0').textContent).toContain('出口无法从起点到达');
    });

    it('renders one list item per issue across warnings and errors', () => {
      // F-2026-06-17: trigger 1 warning + 1 error without relying on
      // the removed "no pickups" rule. The wall column severs start↔exit
      // (warning); `initialTime: 0` triggers the rules.initialTime error.
      resetEditor({
        walls: [
          [0, 0, 1, 0, 0],
          [0, 0, 1, 0, 0],
          [0, 0, 1, 0, 0],
          [0, 0, 1, 0, 0],
        ],
        rules: { initialTime: 0, maxHealth: 3, victory: 'reach-exit', timeOnPickup: 10 },
      });
      render(<EditorStatusBar />);
      act(() => {
        screen.getByTestId('status-warnings').click();
      });
      const items = screen.getByTestId('warnings-popup-list').children;
      expect(items).toHaveLength(2);
      expect(screen.getByTestId('warnings-popup-item-0').dataset.severity).toBe('warning');
      expect(screen.getByTestId('warnings-popup-item-1').dataset.severity).toBe('error');
    });

    it('closes the popup when the close button is clicked', () => {
      render(<EditorStatusBar />);
      act(() => {
        screen.getByTestId('status-warnings').click();
      });
      expect(screen.getByTestId('warnings-popup')).toBeInTheDocument();
      act(() => {
        screen.getByTestId('warnings-popup-close').click();
      });
      expect(screen.queryByTestId('warnings-popup')).toBeNull();
    });

    it('closes the popup when the backdrop is clicked', () => {
      render(<EditorStatusBar />);
      act(() => {
        screen.getByTestId('status-warnings').click();
      });
      act(() => {
        screen.getByTestId('warnings-popup-backdrop').click();
      });
      expect(screen.queryByTestId('warnings-popup')).toBeNull();
    });
  });

  it('saveLevel updates lastSavedAt and the status reflects the new timestamp', () => {
    // M-65: the original test did `expect(...).toBe(Date.now())`,
    // which is a race — between the call to saveLevel and the
    // Date.now() read, fake-time edges can advance. Capture the
    // expected value at the same instant saveLevel is invoked, so
    // the assertion is monotonic against the store's recorded
    // timestamp.
    const before = Date.now();
    render(<EditorStatusBar />);
    act(() => {
      useEditorStore.getState().saveLevel();
    });
    const expected = useEditorStore.getState().lastSavedAt;
    expect(expected).not.toBeNull();
    expect(expected!).toBeGreaterThanOrEqual(before);
    expect(expected!).toBeLessThanOrEqual(Date.now());
    // The displayed chip shows the local time, not the timestamp
    // value. We just pin the format HH:MM:SS — anything more would
    // be a timezone pin, which is the brittleness M-65 is fixing.
    expect(screen.getByTestId('status-dirty').textContent).toMatch(/已保存\s*\d{2}:\d{2}:\d{2}/);
  });

  // F-project-review-2026-06-13-D-5/D-18: the storage banner closes the
  // last hop of the P0-2 chain — saveDraft sets `storageFull` +
  // `lastDraftError` on a quota / too-large failure, and the status bar
  // is the user-facing surface that turns those flags into a red banner
  // they can actually see (and dismiss).
  describe('storage banner', () => {
    it('renders no storage banner when no draft error is pending', () => {
      render(<EditorStatusBar />);
      expect(screen.queryByTestId('status-storage')).toBeNull();
    });

    it('renders the red banner with the message when lastDraftError is set', () => {
      useEditorStore.setState({
        storageFull: true,
        lastDraftError: '本地存储已满，自动保存失败（请删除旧关卡后重试）',
      });
      render(<EditorStatusBar />);
      const banner = screen.getByTestId('status-storage');
      expect(banner).not.toBeNull();
      expect(banner.textContent).toContain('本地存储已满');
      // P3-Phase-2 chip styling: the banner paints the danger color via
      // the `editor-statusbar__storage` class (which uses var(--danger)
      // in the stylesheet). Pinning the class pins the "this is bad,
      // not just a warning" intent — the previous inline-style pin was
      // brittle to the CSS migration.
      expect(banner.className).toContain('editor-statusbar__storage');
    });

    it('renders the banner for non-quota errors too (e.g. unavailable / serialization)', () => {
      // A serialization failure isn't "full" but it IS a draft failure
      // worth surfacing — keep the banner visible so the user knows
      // autosave is broken.
      useEditorStore.setState({
        storageFull: false,
        lastDraftError: '关卡数据无法序列化，自动保存失败',
      });
      render(<EditorStatusBar />);
      expect(screen.getByTestId('status-storage').textContent).toContain('无法序列化');
    });

    it('clicking the dismiss button clears both storageFull and lastDraftError', () => {
      useEditorStore.setState({
        storageFull: true,
        lastDraftError: '本地存储已满，自动保存失败（请删除旧关卡后重试）',
      });
      render(<EditorStatusBar />);
      const dismiss = screen.getByTestId('status-storage-dismiss');
      act(() => {
        dismiss.click();
      });
      expect(useEditorStore.getState().storageFull).toBe(false);
      expect(useEditorStore.getState().lastDraftError).toBeNull();
      expect(screen.queryByTestId('status-storage')).toBeNull();
    });
  });
});
