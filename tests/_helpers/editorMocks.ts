import type { MazeData } from '../../src/maze/types';
import { useEditorStore } from '../../src/store/editorStore';
import { useLevelStore, DEFAULT_FOLDER_ID } from '../../src/store/levelStore';
import { makeMaze } from './makeMaze';

// F-2026-06-17-F-M-1: 统一 resetEditor 工厂。抽离前 6 份内联重复(3 套签名)
// 现在统一为 overrides 风格;EditorPropertiesPanel 的 `level` 形参调用方
// 改用 `resetEditor({ ...overrides })` 即可(override 会合并到默认 makeMaze)。
export function resetEditor(overrides: Partial<MazeData> = {}): void {
  localStorage.clear();
  useLevelStore.setState({ customLevels: {} });
  useEditorStore.setState({
    level: makeMaze(overrides),
    tool: 'select',
    selection: null,
    camera: { x: 0, y: 0, zoom: 1 },
    past: [],
    future: [],
    dirty: false,
    lastSavedAt: null,
    // F-project-review-2026-06-13-D-5/D-18: reset the draft-storage
    // banner flags so a prior test that triggered a quota failure
    // doesn't leak into this one.
    storageFull: false,
    lastDraftError: null,
  });
}

// 兼容:EditorLeftPanel 用,初始化 folders 默认 + customLevels 空。
export function resetEditorWithFolder(overrides: Partial<MazeData> = {}): void {
  localStorage.clear();
  useLevelStore.setState({
    customLevels: {},
    folders: { [DEFAULT_FOLDER_ID]: { id: DEFAULT_FOLDER_ID, name: '我的', createdAt: 1 } },
  });
  useEditorStore.setState({ level: makeMaze(overrides) });
}
