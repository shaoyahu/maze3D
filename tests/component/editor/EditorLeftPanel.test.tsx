// P2-13: EditorLeftPanel 的核心渲染 + 交互测试。注:window.prompt
// 在 happy-dom 默认有 stub(返回 null),我们用 vi.spyOn 拦截。
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import { EditorLeftPanel } from '../../../src/ui/editor/EditorLeftPanel';
import { useLevelStore, DEFAULT_FOLDER_ID } from '../../../src/store/levelStore';
import { useEditorStore } from '../../../src/store/editorStore';
import { ConfirmProvider } from '../../../src/ui/useConfirm';
import type { MazeData } from '../../../src/maze/types';
import { makeMaze3x3 } from '../../_helpers/makeMaze';
import { resetEditorWithFolder } from '../../_helpers/editorMocks';

// F-2026-06-17-F-M-1: thin wrapper 保留旧 3-arg 签名,内部走统一 helper。
function makeMaze(id: string, name: string, folderId?: string): MazeData {
  return makeMaze3x3({ id, name, ...(folderId ? { folderId } : {}) });
}

beforeEach(() => {
  resetEditorWithFolder({ id: 'editor-default', name: 'Editor Default' });
});

describe('EditorLeftPanel (P2-13)', () => {
  it('renders the empty state when there are no levels', () => {
    render(<ConfirmProvider><EditorLeftPanel /></ConfirmProvider>);
    expect(screen.getByTestId('leftpanel-empty')).toBeInTheDocument();
  });

  it('shows root levels when no folders are created', () => {
    useLevelStore.setState({
      customLevels: { l1: makeMaze('l1', 'L1') },
      folders: { [DEFAULT_FOLDER_ID]: { id: DEFAULT_FOLDER_ID, name: '我的', createdAt: 1 } },
    });
    render(<ConfirmProvider><EditorLeftPanel /></ConfirmProvider>);
    expect(screen.getByTestId('level-row-l1')).toBeInTheDocument();
    expect(within(screen.getByTestId('level-row-l1')).getByText('L1')).toBeInTheDocument();
  });

  it('clicking "新建关卡" calls newLevel', () => {
    render(<ConfirmProvider><EditorLeftPanel /></ConfirmProvider>);
    fireEvent.click(screen.getByTestId('leftpanel-new-level'));
    expect(useEditorStore.getState().level.id).not.toBe('editor-default');
  });

  it('clicking "新建文件夹" with a name creates a folder', () => {
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('教程');
    render(<ConfirmProvider><EditorLeftPanel /></ConfirmProvider>);
    fireEvent.click(screen.getByTestId('leftpanel-new-folder'));
    promptSpy.mockRestore();
    const folders = Object.values(useLevelStore.getState().folders);
    const created = folders.find((f) => f.name === '教程');
    expect(created).toBeDefined();
    expect(created!.parentId).toBe(DEFAULT_FOLDER_ID);
  });

  it('clicking a level row triggers editor loadLevel', () => {
    const target = makeMaze('l1', 'MyLevel');
    useLevelStore.setState({
      customLevels: { l1: target },
      folders: { [DEFAULT_FOLDER_ID]: { id: DEFAULT_FOLDER_ID, name: '我的', createdAt: 1 } },
    });
    render(<ConfirmProvider><EditorLeftPanel /></ConfirmProvider>);
    fireEvent.click(screen.getByTestId('level-load-l1'));
    expect(useEditorStore.getState().level.id).toBe('l1');
    expect(useEditorStore.getState().level.name).toBe('MyLevel');
  });

  it('current level row shows the highlight dot', () => {
    useLevelStore.setState({
      customLevels: { l1: makeMaze('l1', 'Current') },
      folders: { [DEFAULT_FOLDER_ID]: { id: DEFAULT_FOLDER_ID, name: '我的', createdAt: 1 } },
    });
    useEditorStore.setState({ level: makeMaze('l1', 'Current') });
    render(<ConfirmProvider><EditorLeftPanel /></ConfirmProvider>);
    expect(screen.getByTestId('level-icon-l1').textContent).toBe('●');
  });

  it('deleteLevel confirm-yes removes the level', async () => {
    useLevelStore.setState({
      customLevels: { l1: makeMaze('l1', 'Doomed') },
      folders: { [DEFAULT_FOLDER_ID]: { id: DEFAULT_FOLDER_ID, name: '我的', createdAt: 1 } },
    });
    render(<ConfirmProvider><EditorLeftPanel /></ConfirmProvider>);
    fireEvent.click(screen.getByTestId('row-menu-level-l1'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('row-delete-level-l1'));
    });
    expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByTestId('confirm-action-ok'));
    });
    expect(useLevelStore.getState().customLevels['l1']).toBeUndefined();
  });

  it('deleteFolder cascades and removes its levels', async () => {
    const f = useLevelStore.getState().folders[DEFAULT_FOLDER_ID];
    const sub = useLevelStore.getState().createFolder('Sub', f.id);
    useLevelStore.getState().saveCustom(makeMaze('l1', 'L1', sub.id));
    render(<ConfirmProvider><EditorLeftPanel /></ConfirmProvider>);
    fireEvent.click(screen.getByTestId('row-menu-folder-' + sub.id));
    await act(async () => {
      fireEvent.click(screen.getByTestId('row-delete-folder-' + sub.id));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('confirm-action-ok'));
    });
    expect(useLevelStore.getState().folders[sub.id]).toBeUndefined();
    expect(useLevelStore.getState().customLevels['l1']).toBeUndefined();
  });
});
