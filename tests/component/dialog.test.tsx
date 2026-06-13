import { describe, it, expect, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { type ReactNode } from 'react';
import { Dialog } from '../../src/ui/components/Dialog';
import {
  ConfirmProvider,
  useConfirm,
  type ConfirmOptions,
} from '../../src/ui/useConfirm';

// ---- Dialog primitive ------------------------------------------------------

const BASIC_ACTIONS = [
  { label: '取消', value: 'cancel', variant: 'secondary' as const },
  { label: '确定', value: 'ok', variant: 'primary' as const },
];

function renderDialog(
  props: Partial<React.ComponentProps<typeof Dialog>> & { open?: boolean } = {},
) {
  const onAction = props.onAction ?? vi.fn();
  const onClose = props.onClose ?? vi.fn();
  const utils = render(
    <Dialog
      open={props.open ?? true}
      title={props.title ?? '标题'}
      message={props.message ?? '正文内容'}
      actions={props.actions ?? BASIC_ACTIONS}
      danger={props.danger ?? false}
      onAction={onAction}
      onClose={onClose}
    />,
  );
  return { ...utils, onAction, onClose };
}

describe('Dialog (P2-7)', () => {
  it('renders nothing when open=false', () => {
    render(
      <Dialog
        open={false}
        title="T"
        message="M"
        actions={BASIC_ACTIONS}
        onAction={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.queryByTestId('confirm-dialog')).toBeNull();
  });

  it('renders title, message, and actions with role/aria attributes when open=true', () => {
    renderDialog({ title: '删除关卡', message: '不可撤销' });
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    const titleId = dialog.getAttribute('aria-labelledby');
    const descId = dialog.getAttribute('aria-describedby');
    expect(titleId).toBeTruthy();
    expect(descId).toBeTruthy();
    expect(document.getElementById(titleId as string)?.textContent).toBe('删除关卡');
    expect(document.getElementById(descId as string)?.textContent).toBe('不可撤销');
    expect(screen.getByTestId('confirm-title').textContent).toBe('删除关卡');
    expect(screen.getByTestId('confirm-message').textContent).toBe('不可撤销');
    expect(screen.getByTestId('confirm-action-cancel')).toBeInTheDocument();
    expect(screen.getByTestId('confirm-action-ok')).toBeInTheDocument();
  });

  it('clicking an action button invokes onAction with that value', () => {
    const { onAction } = renderDialog();
    fireEvent.click(screen.getByTestId('confirm-action-ok'));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledWith('ok');
  });

  it('pressing Escape invokes onClose', () => {
    const { onClose } = renderDialog();
    const dialog = screen.getByRole('dialog');
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('clicking the backdrop invokes onClose, but clicks on the card do not', () => {
    const { onClose } = renderDialog();
    const backdrop = screen.getByTestId('confirm-dialog');
    const dialog = screen.getByRole('dialog');
    fireEvent.click(dialog);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('auto-focuses the first action button on open', async () => {
    renderDialog();
    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByTestId('confirm-action-cancel'));
    });
  });

  it('uses --danger for the card border when danger=true', () => {
    renderDialog({ danger: true });
    const dialog = screen.getByRole('dialog');
    // happy-dom splits the `border: 1px solid <color>` shorthand into
    // longhand properties, so assert on borderColor instead of the full
    // shorthand.
    expect(dialog.style.borderColor).toBe('var(--danger)');
  });

  it('uses --border for the card border when danger=false', () => {
    renderDialog({ danger: false });
    const dialog = screen.getByRole('dialog');
    expect(dialog.style.borderColor).toBe('var(--border)');
  });

  it('Tab from the last action wraps focus to the first', () => {
    renderDialog();
    const okBtn = screen.getByTestId('confirm-action-ok') as HTMLButtonElement;
    const cancelBtn = screen.getByTestId('confirm-action-cancel') as HTMLButtonElement;
    okBtn.focus();
    expect(document.activeElement).toBe(okBtn);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Tab' });
    expect(document.activeElement).toBe(cancelBtn);
  });
});

// ---- useConfirm hook + Provider -------------------------------------------

interface HarnessProps {
  onReady?: (confirm: ReturnType<typeof useConfirm>) => void;
}

function Harness({ onReady }: HarnessProps): ReactNode {
  const confirm = useConfirm();
  if (onReady) onReady(confirm);
  return null;
}

function renderProvider(props: HarnessProps = {}) {
  const utils = render(
    <ConfirmProvider>
      <Harness {...props} />
    </ConfirmProvider>,
  );
  return utils;
}

const OPTS_A: ConfirmOptions = {
  title: '恢复草稿',
  message: '发现上次未保存的草稿，是否恢复？',
  actions: [
    { label: '放弃', value: 'cancel', variant: 'secondary' },
    { label: '恢复', value: 'ok', variant: 'primary' },
  ],
};

const OPTS_B: ConfirmOptions = {
  title: '删除关卡',
  message: '此操作不可撤销',
  actions: [
    { label: '取消', value: 'cancel', variant: 'secondary' },
    { label: '删除', value: 'ok', variant: 'danger' },
  ],
  danger: true,
};

describe('useConfirm + ConfirmProvider (P2-7)', () => {
  it('renders no dialog before any confirm() call', () => {
    renderProvider();
    expect(screen.queryByTestId('confirm-dialog')).toBeNull();
  });

  it('confirm({...}) shows a dialog with the supplied title/message/actions', () => {
    let confirmFn!: ReturnType<typeof useConfirm>;
    renderProvider({ onReady: (c) => (confirmFn = c) });
    act(() => {
      void confirmFn(OPTS_A);
    });
    expect(screen.getByTestId('confirm-title').textContent).toBe('恢复草稿');
    expect(screen.getByTestId('confirm-message').textContent).toBe(
      '发现上次未保存的草稿，是否恢复？',
    );
    expect(screen.getByTestId('confirm-action-cancel')).toBeInTheDocument();
    expect(screen.getByTestId('confirm-action-ok')).toBeInTheDocument();
  });

  it('clicking an action resolves the promise with that action value and closes the dialog', async () => {
    let confirmFn!: ReturnType<typeof useConfirm>;
    renderProvider({ onReady: (c) => (confirmFn = c) });
    let promise!: Promise<string | null>;
    act(() => {
      promise = confirmFn(OPTS_A);
    });
    expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByTestId('confirm-action-ok'));
    });
    // Await the promise directly so the .then microtask definitely runs.
    const result = await promise;
    expect(result).toBe('ok');
    expect(screen.queryByTestId('confirm-dialog')).toBeNull();
  });

  it('pressing Escape resolves the promise with null', async () => {
    let confirmFn!: ReturnType<typeof useConfirm>;
    renderProvider({ onReady: (c) => (confirmFn = c) });
    let promise!: Promise<string | null>;
    act(() => {
      promise = confirmFn(OPTS_A);
    });
    await act(async () => {
      fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    });
    const result = await promise;
    expect(result).toBeNull();
    expect(screen.queryByTestId('confirm-dialog')).toBeNull();
  });

  it('concurrent confirm() calls queue FIFO; the second appears only after the first resolves', async () => {
    let confirmFn!: ReturnType<typeof useConfirm>;
    const { rerender } = render(
      <ConfirmProvider>
        <Harness onReady={(c) => (confirmFn = c)} />
      </ConfirmProvider>,
    );
    let promiseA!: Promise<string | null>;
    let promiseB!: Promise<string | null>;
    await act(async () => {
      promiseA = confirmFn(OPTS_A);
      promiseB = confirmFn(OPTS_B);
    });

    // First dialog is the one from the first call.
    expect(screen.getByTestId('confirm-title').textContent).toBe(OPTS_A.title);

    await act(async () => {
      fireEvent.click(screen.getByTestId('confirm-action-ok'));
    });
    expect(await promiseA).toBe('ok');

    // Second dialog now visible.
    await waitFor(() => {
      expect(screen.getByTestId('confirm-title').textContent).toBe(OPTS_B.title);
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('confirm-action-ok'));
    });
    expect(await promiseB).toBe('ok');

    await waitFor(() => expect(screen.queryByTestId('confirm-dialog')).toBeNull());

    rerender(
      <ConfirmProvider>
        <Harness />
      </ConfirmProvider>,
    );
  });

  it('Provider unmount while a confirm() is pending resolves it with null', async () => {
    let confirmFn!: ReturnType<typeof useConfirm>;
    const { unmount } = render(
      <ConfirmProvider>
        <Harness onReady={(c) => (confirmFn = c)} />
      </ConfirmProvider>,
    );
    let promise!: Promise<string | null>;
    await act(async () => {
      promise = confirmFn(OPTS_A);
    });
    expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
    unmount();
    expect(await promise).toBeNull();
  });

  it('useConfirm outside of a Provider throws a clear error', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(() => render(<Harness />)).toThrow(/useConfirm must be called inside/);
    } finally {
      errSpy.mockRestore();
    }
  });
});