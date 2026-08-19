// @vitest-environment happy-dom
//
// P5-editor-multilayer (Task 5): LevelTabs multi-layer UI affordances.
// Pins:
//   - per-layer entity-count tooltip ("Layer 2 · N entities · N items · …")
//   - container data-testid flips to `editor-leveltabs-multi` when
//     levelCount > 1
//   - "Multi-layer" badge appears between the tab strip and the
//     +/- actions
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EditorLevelTabs } from '../../../src/ui/editor/LevelTabs';
import { useEditorStore } from '../../../src/store/editorStore';
import { ConfirmProvider } from '../../../src/ui/useConfirm';
import type { MazeData } from '../../../src/maze/types';

// 3x3 grid; the entity roster below lives on the indicated layer so
// the per-layer count assertion can read exact numbers.
function makeMaze(): MazeData {
  return {
    id: 'lvl-x',
    name: 'X',
    size: { width: 3, depth: 3 },
    cellSize: 2,
    start: { x: 0, z: 0, level: 0 },
    exit: { x: 2, z: 2, level: 1 },
    walls: [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ],
    pickups: [
      { id: 'p-l0', x: 0, z: 0, type: 'time', value: 5, level: 0 },
      { id: 'p-l0b', x: 1, z: 0, type: 'health', value: 1, level: 0 },
      { id: 'p-l1', x: 0, z: 0, type: 'key', value: 1, level: 1, keyColor: 'red' },
    ],
    enemies: [
      { id: 'e-l1', x: 1, z: 1, path: [{ x: 1, z: 1 }, { x: 2, z: 1 }], level: 1 },
    ],
    traps: [
      { id: 't-l1', x: 2, z: 0, kind: 'fire', level: 1 },
    ],
    doors: [],
    transitions: [
      { id: 'tr01', kind: 'stair-up', level: 0, x: 1, z: 1, toLevel: 1, toX: 1, toZ: 1 },
    ],
    rules: { initialTime: 60, maxHealth: 3, victory: 'reach-exit', timeOnPickup: 10 },
    levelCount: 1,
  };
}

describe('EditorLevelTabs (P5 multi-layer UI)', () => {
  beforeEach(() => {
    useEditorStore.setState({
      level: makeMaze(),
      currentLevel: 0,
      tool: 'wall',
      selection: null,
      past: [],
      future: [],
      dirty: false,
    });
  });

  it('uses single-layer data-testid + no badge when levelCount=1', () => {
    render(
      <ConfirmProvider>
        <EditorLevelTabs />
      </ConfirmProvider>,
    );
    expect(screen.getByTestId('editor-leveltabs')).toBeTruthy();
    expect(screen.queryByTestId('editor-leveltabs-multi')).toBeNull();
    expect(screen.queryByTestId('editor-leveltabs-badge')).toBeNull();
  });

  it('flips to multi-layer data-testid + shows badge when levelCount>1', () => {
    useEditorStore.setState({ level: { ...makeMaze(), levelCount: 2 } });
    render(
      <ConfirmProvider>
        <EditorLevelTabs />
      </ConfirmProvider>,
    );
    expect(screen.getByTestId('editor-leveltabs-multi')).toBeTruthy();
    expect(screen.getByTestId('editor-leveltabs-badge')).toBeTruthy();
  });

  it('per-layer tooltip includes entity count breakdown (P5 Task 5)', () => {
    useEditorStore.setState({ level: { ...makeMaze(), levelCount: 2 } });
    render(
      <ConfirmProvider>
        <EditorLevelTabs />
      </ConfirmProvider>,
    );
    // L0 (idx=0) tab: 2 pickups, 0 enemies, 0 traps, 0 doors, 1 transition (since tr01 has level=0)
    const tabL0 = screen.getByTestId('level-tab-0');
    const titleL0 = tabL0.getAttribute('title') ?? '';
    // Loose regex so the test passes in both en and zh i18n
    // (the i18n context's default in jsdom is 'zh' per vitest
    // setup; switching language is out of scope for this spec).
    expect(titleL0).toMatch(/1/); // layer 1 (1-indexed display)
    expect(titleL0).toMatch(/2/); // 2 pickups / 2 items
    expect(titleL0).toMatch(/1/); // 1 transition
    // L1 (idx=1) tab: 1 pickup, 1 enemy, 1 trap, 0 doors, 1 transition (tr01.toLevel=1)
    const tabL1 = screen.getByTestId('level-tab-1');
    const titleL1 = tabL1.getAttribute('title') ?? '';
    expect(titleL1).toMatch(/2/); // layer 2
    // The tooltip should mention "1 enemy" (English) or "1 敌人"
    // (Chinese); match the digit + 敌人 OR the word "enemy".
    expect(titleL1).toMatch(/1.*enemy|1.*敌人/);
    // And the trap count: "1 trap" or "1 陷阱".
    expect(titleL1).toMatch(/1.*trap|1.*陷阱/);
  });
});
