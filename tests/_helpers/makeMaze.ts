import type { MazeData } from '../../src/maze/types';

// F-2026-06-17-F-M-1: 统一 makeMaze 工厂。抽离前 8 份内联重复(2 套签名)
// 现在统一为 overrides 风格;id-name-folderId 签名调用方改用
// `makeMaze({ id, name, folderId })` 即可。
export function makeMaze(overrides: Partial<MazeData> = {}): MazeData {
  return {
    id: 'test-level',
    name: 'Test',
    size: { width: 5, depth: 4 },
    cellSize: 2,
    start: { x: 0, z: 0 },
    exit: { x: 4, z: 3 },
    walls: [
      [0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0],
    ],
    pickups: [],
    enemies: [],
    rules: { initialTime: 60, maxHealth: 3, victory: 'reach-exit', timeOnPickup: 10 },
    ...overrides,
  };
}

// 兼容:3x3 小型 maze(给 levelStore.folders / EditorLeftPanel 用)
export function makeMaze3x3(overrides: Partial<MazeData> = {}): MazeData {
  return makeMaze({
    size: { width: 3, depth: 3 },
    exit: { x: 2, z: 2 },
    walls: [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ],
    ...overrides,
  });
}

// 兼容:5x5 maze(给 editorHistory.test 用)
export function makeMaze5x5(overrides: Partial<MazeData> = {}): MazeData {
  return makeMaze({
    size: { width: 5, depth: 5 },
    exit: { x: 4, z: 4 },
    walls: Array.from({ length: 5 }, () => new Array(5).fill(0)),
    ...overrides,
  });
}
