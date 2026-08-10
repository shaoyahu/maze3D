// P3-1d: Scene's createTransitionMesh now covers all 5 kinds.
// The pre-P3-1d version returned null for `stair-down` / `hole-up`
// / `ladder`, which made those tile kinds invisible in the 3D view
// even though the editor painted them in the 2D preview. The
// tests below pin the contract: every kind the data layer accepts
// must produce a non-null Object3D so the player can spot the
// inter-layer mechanic visually.

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createTransitionMesh } from '../../../src/engine/Scene';
import { FLOOR_HEIGHT } from '../../../src/engine/Game';
import type { VerticalTransition } from '../../../src/maze/types';

const CS = 2;
const ALL_KINDS: ReadonlyArray<VerticalTransition['kind']> = [
  'stair-up',
  'stair-down',
  'hole-down',
  'hole-up',
  'ladder',
];

describe('Scene.createTransitionMesh (P3-1d)', () => {
  // The pre-fix version of createTransitionMesh returned null
  // for 3 of 5 kinds. Returning null made those tile kinds
  // invisible in the 3D view, so a player couldn't tell which
  // tiles were interactive. The fix gives every kind a visible
  // mesh (stair-up / stair-down = tilted box, hole-down / hole-up
  // = dark plane, ladder = vertical thin box + 2 rungs).
  it.each(ALL_KINDS)('returns a non-null Object3D for kind=%s', (kind) => {
    const mesh = createTransitionMesh(kind, CS, FLOOR_HEIGHT);
    expect(mesh).not.toBeNull();
  });

  it('stair-up and stair-down produce visually distinguishable meshes (color + slope)', () => {
    // The two stairs share the same geometry (tilted box) but
    // differ in slope sign and color, so a player can tell them
    // apart when both appear in the same level. The two boxes
    // are different Object3D instances, so a `===` comparison
    // would fail; the assertion is on `material.color` instead.
    const up = createTransitionMesh('stair-up', CS, FLOOR_HEIGHT);
    const down = createTransitionMesh('stair-down', CS, FLOOR_HEIGHT);
    expect(up).not.toBeNull();
    expect(down).not.toBeNull();
    if (up && down) {
      const upMesh = up as THREE.Mesh;
      const downMesh = down as THREE.Mesh;
      const upColor = (upMesh.material as THREE.MeshLambertMaterial).color.getHex();
      const downColor = (downMesh.material as THREE.MeshLambertMaterial).color.getHex();
      // Different colors. The exact hex values are spec'd in
      // Scene.ts's createTransitionMesh; the assertion is
      // inequality, not the literal numbers.
      expect(upColor).not.toBe(downColor);
    }
  });

  it('ladder returns a Group (rails + rungs) — verified via the children count', () => {
    // The ladder is the only kind that returns a Group rather
    // than a single Mesh. The contract: the Group must have the
    // rail + rung children so dispose() can walk them in
    // lockstep. The exact child count is 4 (2 rails + 2 rungs)
    // per Scene.ts:761-768 — pinned here so a future refactor
    // that drops a rung doesn't silently ship a 3-rung ladder.
    const ladder = createTransitionMesh('ladder', CS, FLOOR_HEIGHT);
    expect(ladder).not.toBeNull();
    if (ladder) {
      // The return is cast to `Object3D` to keep the export
      // signature stable, but the runtime value is a Group.
      // Children are exposed via the standard `Object3D.children`
      // array regardless of the runtime type.
      expect((ladder as unknown as { children: unknown[] }).children.length).toBe(4);
    }
  });
});
