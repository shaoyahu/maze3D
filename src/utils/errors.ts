export class LevelLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LevelLoadError';
  }
}

// F-project-review-2026-06-13-D-30: cap user-controlled values that are
// interpolated into LevelLoadError messages. Without this, a hand-crafted
// or buggy-imported level JSON with a 10 MB string field would surface
// into the error message, which the LevelSelect error UI then renders
// directly into a <p>. React escapes the text (no XSS), but a 10 MB
// paragraph locks the browser tab. Clamping at the source keeps the
// DOM-side concern out of every consumer.
//
// 80 chars is chosen because:
//  - it comfortably fits a UUID / slug / short label in full;
//  - any reasonable UI surface (modal, toast, inline paragraph) copes;
//  - one terminal-line of monospace text ≈ 80 cols, so a developer
//    pasting the error into a terminal can still read the value.
export const MAX_ERROR_VALUE_CHARS = 80;

export function clampErrorValue(v: unknown): string {
  const s = typeof v === 'string' ? v : String(v);
  return s.length > MAX_ERROR_VALUE_CHARS
    ? s.slice(0, MAX_ERROR_VALUE_CHARS) + '…'
    : s;
}
