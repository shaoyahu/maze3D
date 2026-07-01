import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Game, clampFov } from '../../../src/engine/Game';
import { createCamera } from '../../../src/engine/Camera';
import type { GameBridge } from '../../../src/engine/Game';

// F10: Game.setFov(degrees) had no validation — any value (NaN, Infinity,
// out-of-range, negative) flowed straight into camera.fov and triggered
// an updateProjectionMatrix with garbage. The settingsStore load + set
// paths already have [30, 120] + Number.isFinite guards, so the only
// missing piece is the runtime side. The fix exposes a `clampFov` helper
// and routes setFov through it.
//
// Test strategy: build a Game with a stub bridge, inject a real camera
// via createCamera() (skip the WebGL renderer), call setFov with bad
// inputs, and assert camera.fov stays inside [30, 120].

function stubBridge(): GameBridge {
  return {
    onTick: () => {},
    onPauseToggle: () => {},
    onPickupCollected: () => true,
    onReachExit: () => {},
    getInitialFov: () => 60,
    getInitialPointerSensitivity: () => 0.002,
    getCurrentDarkMode: () => false,
    getCurrentEnemyAggression: () => 'medium',
    isActiveLevel: () => true,
    isPlaying: () => true,
    onUseItem: () => {},
    onEnemyContact: () => {},
    onTrapHit: () => {},
    getPlayerSpeedMultiplier: () => 1,
    // F-2026-07-01-M-1: onDoorUnlocked removed from GameBridge
  };
}

// Build a Game that has a real camera but no renderer. setFov() guards
// `if (!this.camera) return`, so we need camera to be present without
// touching WebGL.
function gameWithCamera(): Game {
  const g = new Game(stubBridge());
  // Bypass init() — it would call createRenderer() which needs WebGL.
  // Attach only what setFov needs: a real PerspectiveCamera.
  (g as unknown as { camera: THREE.PerspectiveCamera }).camera = createCamera();
  return g;
}

describe('clampFov (F10 helper)', () => {
  it('passes through values inside [30, 120]', () => {
    expect(clampFov(60)).toBe(60);
    expect(clampFov(30)).toBe(30);
    expect(clampFov(120)).toBe(120);
    expect(clampFov(75.5)).toBe(75.5);
  });

  it('clamps values below 30 up to 30', () => {
    expect(clampFov(0)).toBe(30);
    expect(clampFov(-1)).toBe(30);
    expect(clampFov(29.999)).toBe(30);
  });

  it('clamps values above 120 down to 120', () => {
    expect(clampFov(121)).toBe(120);
    expect(clampFov(9999)).toBe(120);
    expect(clampFov(180)).toBe(120);
  });

  it('rejects NaN / Infinity / -Infinity with 60 (default), not garbage', () => {
    // The helper returns the in-range fallback (60) so the camera never
    // ends up with NaN.fov — which would propagate into projectionMatrix
    // and break rendering until reload.
    expect(clampFov(NaN)).toBe(60);
    expect(clampFov(Infinity)).toBe(60);
    expect(clampFov(-Infinity)).toBe(60);
  });
});

describe('Game.setFov (F10)', () => {
  it('applies a valid value to camera.fov and calls updateProjectionMatrix', () => {
    const game = gameWithCamera();
    game.setFov(75);
    const cam = (game as unknown as { camera: THREE.PerspectiveCamera }).camera;
    expect(cam.fov).toBe(75);
  });

  it('clamps too-small values up to 30 (F10 bug: previously wrote -1 to camera.fov)', () => {
    const game = gameWithCamera();
    game.setFov(-5);
    const cam = (game as unknown as { camera: THREE.PerspectiveCamera }).camera;
    expect(cam.fov).toBe(30);
  });

  it('clamps too-large values down to 120 (F10 bug: previously wrote 9999 to camera.fov)', () => {
    const game = gameWithCamera();
    game.setFov(9999);
    const cam = (game as unknown as { camera: THREE.PerspectiveCamera }).camera;
    expect(cam.fov).toBe(120);
  });

  it('NaN does NOT propagate to camera.fov (F10 bug: previously wrote NaN, breaking projection matrix)', () => {
    const game = gameWithCamera();
    game.setFov(NaN);
    const cam = (game as unknown as { camera: THREE.PerspectiveCamera }).camera;
    expect(Number.isFinite(cam.fov)).toBe(true);
    expect(cam.fov).toBeGreaterThanOrEqual(30);
    expect(cam.fov).toBeLessThanOrEqual(120);
  });

  it('Infinity does NOT propagate to camera.fov', () => {
    const game = gameWithCamera();
    game.setFov(Infinity);
    const cam = (game as unknown as { camera: THREE.PerspectiveCamera }).camera;
    expect(Number.isFinite(cam.fov)).toBe(true);
    expect(cam.fov).toBeLessThanOrEqual(120);
  });

  it('setFov before init() (camera undefined) is a safe no-op', () => {
    const game = new Game(stubBridge());
    // No camera attached — setFov must not throw.
    expect(() => game.setFov(75)).not.toThrow();
    expect(() => game.setFov(NaN)).not.toThrow();
  });
});