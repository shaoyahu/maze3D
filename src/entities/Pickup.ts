import * as THREE from 'three';
import type { PickupType } from '../maze/types';

// P2-2 #11: per-type colors so the three pickup kinds are visually
// distinct on the floor. Hex values come from spec §4 / F-8.
export const PICKUP_COLORS: Record<PickupType, { color: number; emissive: number }> = {
  time:   { color: 0xffd84d, emissive: 0x553300 },
  health: { color: 0xff5050, emissive: 0x551111 },
  key:    { color: 0x5fa8ff, emissive: 0x113355 },
};

export function createPickupMaterial(type: PickupType): THREE.MeshLambertMaterial {
  const { color, emissive } = PICKUP_COLORS[type];
  return new THREE.MeshLambertMaterial({ color, emissive });
}
