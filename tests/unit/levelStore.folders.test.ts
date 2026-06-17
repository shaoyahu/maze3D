import { describe, it, expect, beforeEach } from 'vitest';
import {
  useLevelStore,
  DEFAULT_FOLDER_ID,
} from '../../src/store/levelStore';
import type { MazeData } from '../../src/maze/types';
import { makeMaze3x3 } from '../_helpers/makeMaze';

// F-2026-06-17-F-M-1: thin wrapper 保留旧 3-arg 签名,内部走统一 helper。
function makeMaze(id: string, name: string, folderId?: string): MazeData {
  return makeMaze3x3({ id, name, ...(folderId ? { folderId } : {}) });
}

beforeEach(() => {
  localStorage.clear();
  // folders 字段在初始化时自动建 default,这里保留它。
  useLevelStore.setState({
    customLevels: {},
    folders: { [DEFAULT_FOLDER_ID]: { id: DEFAULT_FOLDER_ID, name: '我的', createdAt: 1 } },
    lastLoadSummary: null,
    lastWriteError: null,
  });
});

describe('levelStore folder API (P2-13)', () => {
  it('exposes a default "我的" folder', () => {
    const f = useLevelStore.getState().folders[DEFAULT_FOLDER_ID];
    expect(f).toBeDefined();
    expect(f.name).toBe('我的');
  });

  it('createFolder adds a new folder under the given parent', () => {
    const created = useLevelStore.getState().createFolder('子文件夹', DEFAULT_FOLDER_ID);
    expect(created.name).toBe('子文件夹');
    expect(created.parentId).toBe(DEFAULT_FOLDER_ID);
    expect(useLevelStore.getState().folders[created.id]).toEqual(created);
  });

  it('createFolder with an unknown parent falls back to root', () => {
    const created = useLevelStore.getState().createFolder('orphan', 'no-such-folder');
    expect(created.parentId).toBeUndefined();
  });

  it('renameFolder updates name in-place', () => {
    const f = useLevelStore.getState().createFolder('Old');
    useLevelStore.getState().renameFolder(f.id, 'New');
    expect(useLevelStore.getState().folders[f.id].name).toBe('New');
  });

  it('deleteFolder removes the folder and its levels', () => {
    const f = useLevelStore.getState().createFolder('Trash');
    useLevelStore.getState().saveCustom(makeMaze('l1', 'L1', f.id));
    useLevelStore.getState().deleteFolder(f.id);
    expect(useLevelStore.getState().folders[f.id]).toBeUndefined();
    expect(useLevelStore.getState().customLevels['l1']).toBeUndefined();
  });

  it('deleteFolder cascades into nested subfolders', () => {
    const a = useLevelStore.getState().createFolder('A');
    const b = useLevelStore.getState().createFolder('B', a.id);
    const c = useLevelStore.getState().createFolder('C', b.id);
    useLevelStore.getState().saveCustom(makeMaze('lc', 'LC', c.id));
    useLevelStore.getState().deleteFolder(a.id);
    expect(useLevelStore.getState().folders[a.id]).toBeUndefined();
    expect(useLevelStore.getState().folders[b.id]).toBeUndefined();
    expect(useLevelStore.getState().folders[c.id]).toBeUndefined();
    expect(useLevelStore.getState().customLevels['lc']).toBeUndefined();
  });

  it('deleteFolder refuses to remove the default folder', () => {
    const before = useLevelStore.getState().folders[DEFAULT_FOLDER_ID];
    useLevelStore.getState().deleteFolder(DEFAULT_FOLDER_ID);
    expect(useLevelStore.getState().folders[DEFAULT_FOLDER_ID]).toEqual(before);
  });

  it('moveLevel changes folderId; null maps to default', () => {
    const f = useLevelStore.getState().createFolder('Target');
    useLevelStore.getState().saveCustom(makeMaze('l1', 'L1'));
    useLevelStore.getState().moveLevel('l1', f.id);
    expect(useLevelStore.getState().customLevels['l1'].folderId).toBe(f.id);
    useLevelStore.getState().moveLevel('l1', null);
    expect(useLevelStore.getState().customLevels['l1'].folderId).toBe(DEFAULT_FOLDER_ID);
  });

  it('moveFolder detects cycles (cannot move folder under itself / descendants)', () => {
    const a = useLevelStore.getState().createFolder('A');
    const b = useLevelStore.getState().createFolder('B', a.id);
    expect(useLevelStore.getState().moveFolder(b.id, b.id)).toBe(false);
    expect(useLevelStore.getState().moveFolder(a.id, b.id)).toBe(false);
    expect(useLevelStore.getState().moveFolder(a.id, null)).toBe(true);
  });

  it('moveFolder refuses to relocate the default folder', () => {
    expect(useLevelStore.getState().moveFolder(DEFAULT_FOLDER_ID, null)).toBe(false);
  });
});
