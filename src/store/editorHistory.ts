// P2-4b: editor undo/redo engine.
//
// Pure functions only — no Zustand store, no React, no I/O. The editor's
// main state store (Task 8) wires these into the editor slice. Keeping
// history as pure functions lets us test the stack mechanics in isolation
// and makes the store logic trivial.

import type { MazeData } from '../maze/types';

/** Maximum number of undo snapshots retained. Older entries are dropped. */
export const HISTORY_LIMIT = 50;

// EditorSelection is the union of "things the user can click on" in the
// editor. Named with the `Editor` prefix to avoid shadowing the DOM's
// `Selection` interface (lib.dom.d.ts exports its own `Selection`).
export type EditorSelection =
  | { kind: 'pickup'; id: string }
  | { kind: 'enemy'; id: string }
  // P2-18: trap and door selection variants.
  | { kind: 'trap'; id: string }
  | { kind: 'door'; id: string }
  | { kind: 'wall'; x: number; z: number };

export interface Snapshot {
  level: MazeData;
  selection: EditorSelection | null;
}

export interface EditorState {
  level: MazeData;
  selection: EditorSelection | null;
  past: Snapshot[];
  future: Snapshot[];
}

/**
 * Push a new snapshot onto the history. The current `level`/`selection` are
 * captured (deep-cloned) into `past`; `future` is cleared because we have
 * branched. `past` is truncated so that, after the new entry is appended,
 * its length never exceeds `HISTORY_LIMIT`.
 */
export function pushHistory(
  state: EditorState,
  nextLevel: MazeData,
  nextSelection: EditorSelection | null,
): EditorState {
  const current: Snapshot = {
    level: structuredClone(state.level),
    selection: state.selection,
  };
  // Drop the oldest entry when we are already at the cap so the resulting
  // stack length never exceeds HISTORY_LIMIT. Applied BEFORE appending.
  const truncatedPast =
    state.past.length >= HISTORY_LIMIT ? state.past.slice(1) : state.past;
  return {
    level: nextLevel,
    selection: nextSelection,
    past: [...truncatedPast, current],
    future: [],
  };
}

/**
 * Pop one snapshot from `past`, push the current level/selection onto
 * `future`, and restore the popped snapshot. Returns the input state
 * unchanged (by reference) when `past` is empty.
 */
export function undo(state: EditorState): EditorState {
  if (state.past.length === 0) return state;
  const previous = state.past[state.past.length - 1]!;
  const current: Snapshot = {
    level: structuredClone(state.level),
    selection: state.selection,
  };
  return {
    level: previous.level,
    selection: previous.selection,
    past: state.past.slice(0, -1),
    future: [...state.future, current],
  };
}

/**
 * Pop one snapshot from `future`, push the current level/selection onto
 * `past`, and restore the popped snapshot. Returns the input state
 * unchanged (by reference) when `future` is empty.
 */
export function redo(state: EditorState): EditorState {
  if (state.future.length === 0) return state;
  const next = state.future[state.future.length - 1]!;
  const current: Snapshot = {
    level: structuredClone(state.level),
    selection: state.selection,
  };
  return {
    level: next.level,
    selection: next.selection,
    past: [...state.past, current],
    future: state.future.slice(0, -1),
  };
}

export function canUndo(state: EditorState): boolean {
  return state.past.length > 0;
}

export function canRedo(state: EditorState): boolean {
  return state.future.length > 0;
}
