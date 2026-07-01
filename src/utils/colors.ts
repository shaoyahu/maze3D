// F-2026-07-01-L-2: centralized color constants for trap kinds and key
// colors. Previously duplicated across EditorViewport (TRAP_CSS_COLOR,
// KEY_COLOR_CSS) and InventoryBar (KEY_COLOR_SWATCH). Single source of
// truth now; all consumers import from here.

import type { KeyColor, TrapKind } from '../maze/types';

/** CSS color for each trap kind (matches the 3D scene's palette). */
export const TRAP_CSS_COLOR: Record<TrapKind, string> = {
  fire: '#ff6b35',
  water: '#4da6ff',
};

/** CSS color for each key color (used by editor glyphs + inventory swatch). */
export const KEY_COLOR_CSS: Record<KeyColor, string> = {
  red: '#ff5050',
  blue: '#5fa8ff',
  green: '#4caf50',
  yellow: '#ffd84d',
};
