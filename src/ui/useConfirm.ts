import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Dialog } from './components/Dialog';

/**
 * P2-7: imperative confirm dialog API.
 *
 * Replaces the 5 native `window.confirm()` callsites (LevelSelect delete,
 * EditorToolbar new/import, EditorPage draft-recovery + dirty-exit).
 * Caller pattern:
 *
 *     const confirm = useConfirm();
 *     const choice = await confirm({ title, message, actions });
 *     if (choice === 'ok') { ... }
 *
 * Returns the action `value` the user picked, or `null` if they dismissed
 * via Esc / backdrop click / Provider unmount.
 */

export type ConfirmActionVariant = 'primary' | 'secondary' | 'danger';

export interface ConfirmAction {
  label: string;
  /** Stable identifier returned to the caller when the action is chosen. */
  value: string;
  variant?: ConfirmActionVariant;
}

export interface ConfirmOptions {
  title: string;
  message: string;
  /** At least one action; the first action receives initial focus. */
  actions: ConfirmAction[];
  /** When true, the dialog card uses --danger for its border color. */
  danger?: boolean;
}

export type ConfirmRequest = (opts: ConfirmOptions) => Promise<string | null>;

interface QueuedRequest {
  opts: ConfirmOptions;
  resolve: (value: string | null) => void;
}

interface ConfirmContextValue {
  request: ConfirmRequest;
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

export function useConfirm(): ConfirmRequest {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error(
      'useConfirm must be called inside <ConfirmProvider>. ' +
        'Wrap your App root with <ConfirmProvider> before calling useConfirm.',
    );
  }
  return ctx.request;
}

export interface ConfirmProviderProps {
  children: ReactNode;
}

export function ConfirmProvider({ children }: ConfirmProviderProps): JSX.Element {
  // FIFO queue so concurrent callers don't race on the same DOM node.
  // Single visible dialog at a time; pending requests wait their turn.
  const [current, setCurrent] = useState<ConfirmOptions | null>(null);
  const queueRef = useRef<QueuedRequest[]>([]);
  // Resolver for whichever request is currently visible. Updated whenever
  // `current` changes (effect below). `resolveAndAdvance` reads this ref
  // to invoke the right resolver before advancing the queue.
  const drainCurrentRef = useRef<((v: string | null) => void) | null>(null);
  // Keep a ref to `setCurrent` so request() doesn't close over a stale setter.
  const setCurrentRef = useRef(setCurrent);
  setCurrentRef.current = setCurrent;

  // Drop the head of the queue (the entry currently displayed) and advance
  // to the next pending request, or close the dialog if none remain.
  const dequeue = useCallback((): void => {
    queueRef.current.shift();
    const next = queueRef.current[0];
    if (next) {
      setCurrentRef.current(next.opts);
    } else {
      setCurrentRef.current(null);
    }
  }, []);

  const resolveAndAdvance = useCallback(
    (value: string | null): void => {
      drainCurrentRef.current?.(value);
      drainCurrentRef.current = null;
      dequeue();
    },
    [dequeue],
  );

  // Stable identity: never depends on `current`, so callers that capture
  // `request` in a closure (handlers, useMemo, etc.) always see the same
  // function reference across renders. Queue binding is owned entirely by
  // the `current` effect below.
  const request = useCallback<ConfirmRequest>(
    (opts) => {
      return new Promise<string | null>((resolve) => {
        queueRef.current.push({ opts, resolve });
        // If nothing is on screen, the new entry becomes the visible one
        // synchronously. Otherwise it queues behind the current request
        // and the `current` effect will rebind on the next dequeue.
        setCurrentRef.current((prev) => (prev === null ? opts : prev));
      });
    },
    [],
  );

  // Whenever `current` flips to a new opts object (dequeue picked the next
  // entry), capture its resolver. When `current` goes back to null we clear.
  useEffect(() => {
    if (current === null) {
      drainCurrentRef.current = null;
      return;
    }
    const front = queueRef.current[0];
    if (front && front.opts === current) {
      drainCurrentRef.current = front.resolve;
    }
  }, [current]);

  // On Provider unmount, resolve any in-flight promises with `null` so
  // awaiting call sites don't hang forever.
  useEffect(() => {
    return () => {
      const pending = queueRef.current.splice(0);
      for (const r of pending) r.resolve(null);
      if (drainCurrentRef.current) {
        drainCurrentRef.current(null);
        drainCurrentRef.current = null;
      }
    };
  }, []);

  const handleAction = useCallback(
    (value: string): void => {
      resolveAndAdvance(value);
    },
    [resolveAndAdvance],
  );

  const handleClose = useCallback((): void => {
    resolveAndAdvance(null);
  }, [resolveAndAdvance]);

  const contextValue = useMemo<ConfirmContextValue>(() => ({ request }), [request]);

  return createElement(
    ConfirmContext.Provider,
    { value: contextValue },
    children,
    createElement(Dialog, {
      open: current !== null,
      title: current?.title ?? '',
      message: current?.message ?? '',
      actions: current?.actions ?? [],
      danger: current?.danger ?? false,
      onAction: handleAction,
      onClose: handleClose,
    }),
  );
}