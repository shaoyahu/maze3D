import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { PICKUP_COLORS, createPickupMaterial } from '../../src/entities/Pickup';

describe('Pickup colors (P2-2 #11)', () => {
  it('PICKUP_COLORS covers all three pickup types', () => {
    expect(Object.keys(PICKUP_COLORS).sort()).toEqual(['health', 'key', 'time']);
  });

  it('PICKUP_COLORS matches the spec hex values (time/健康/key)', () => {
    expect(PICKUP_COLORS.time.color).toBe(0xffd84d);
    expect(PICKUP_COLORS.health.color).toBe(0xff5050);
    expect(PICKUP_COLORS.key.color).toBe(0x5fa8ff);
  });

  it('createPickupMaterial returns a MeshLambertMaterial for each type', () => {
    for (const type of ['time', 'health', 'key'] as const) {
      const mat = createPickupMaterial(type);
      expect(mat).toBeInstanceOf(THREE.MeshLambertMaterial);
      expect(mat.color.getHex()).toBe(PICKUP_COLORS[type].color);
      expect(mat.emissive.getHex()).toBe(PICKUP_COLORS[type].emissive);
    }
  });

  it('two calls for the same type produce independent material instances', () => {
    // disposeScene relies on per-mesh material disposal; shared materials
    // would leak GPU memory when one mesh is hidden but others are not.
    const a = createPickupMaterial('key');
    const b = createPickupMaterial('key');
    expect(a).not.toBe(b);
  });
});
