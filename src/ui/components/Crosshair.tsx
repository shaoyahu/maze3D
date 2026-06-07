import type { CSSProperties } from 'react';

// Always rendered as a sibling of the canvas so it stays centered on the
// viewport regardless of canvas resize. pointer-events: none so clicks
// fall through to the canvas (which owns pointer-lock acquisition).
const CROSS_SIZE = 20;
const STYLE_CENTER: CSSProperties = {
  position: 'absolute',
  left: '50%', top: '50%',
  width: CROSS_SIZE, height: CROSS_SIZE,
  transform: 'translate(-50%, -50%)',
  pointerEvents: 'none',
  zIndex: 5,
};

const STYLE_HORIZONTAL: CSSProperties = {
  position: 'absolute',
  left: 0, right: 0,
  top: '50%', height: 2, marginTop: -1,
  background: 'var(--accent)', opacity: 0.8,
  boxShadow: '0 0 2px rgba(0,0,0,0.6)',
};

const STYLE_VERTICAL: CSSProperties = {
  position: 'absolute',
  top: 0, bottom: 0,
  left: '50%', width: 2, marginLeft: -1,
  background: 'var(--accent)', opacity: 0.8,
  boxShadow: '0 0 2px rgba(0,0,0,0.6)',
};

const STYLE_DOT: CSSProperties = {
  position: 'absolute',
  left: '50%', top: '50%',
  width: 4, height: 4,
  marginLeft: -2, marginTop: -2,
  borderRadius: '50%',
  background: 'var(--accent)',
  boxShadow: '0 0 0 1px rgba(0,0,0,0.5)',
};

export function Crosshair() {
  return (
    <div aria-hidden="true" data-testid="crosshair" style={STYLE_CENTER}>
      <div style={STYLE_HORIZONTAL} />
      <div style={STYLE_VERTICAL} />
      <div style={STYLE_DOT} />
    </div>
  );
}
