// DDA voxel raycast for block selection (break/place).
import { REACH } from './config.js';

// origin: THREE.Vector3, dir: normalized THREE.Vector3
// Returns { hit:{x,y,z}, prev:{x,y,z}, normal:{x,y,z} } or null.
export function raycastVoxel(world, origin, dir, maxDist = REACH) {
  let x = Math.floor(origin.x);
  let y = Math.floor(origin.y);
  let z = Math.floor(origin.z);

  const stepX = dir.x > 0 ? 1 : dir.x < 0 ? -1 : 0;
  const stepY = dir.y > 0 ? 1 : dir.y < 0 ? -1 : 0;
  const stepZ = dir.z > 0 ? 1 : dir.z < 0 ? -1 : 0;

  const tDeltaX = dir.x !== 0 ? Math.abs(1 / dir.x) : Infinity;
  const tDeltaY = dir.y !== 0 ? Math.abs(1 / dir.y) : Infinity;
  const tDeltaZ = dir.z !== 0 ? Math.abs(1 / dir.z) : Infinity;

  // distance to first voxel boundary on each axis
  const fracX = origin.x - x;
  const fracY = origin.y - y;
  const fracZ = origin.z - z;
  let tMaxX = dir.x > 0 ? (1 - fracX) * tDeltaX : dir.x < 0 ? fracX * tDeltaX : Infinity;
  let tMaxY = dir.y > 0 ? (1 - fracY) * tDeltaY : dir.y < 0 ? fracY * tDeltaY : Infinity;
  let tMaxZ = dir.z > 0 ? (1 - fracZ) * tDeltaZ : dir.z < 0 ? fracZ * tDeltaZ : Infinity;

  let nx = 0;
  let ny = 0;
  let nz = 0;
  let t = 0;

  // include the starting voxel
  if (world.isSolidAt(x, y, z)) {
    return { hit: { x, y, z }, prev: { x, y, z }, normal: { x: 0, y: 0, z: 0 } };
  }

  while (t <= maxDist) {
    if (tMaxX < tMaxY && tMaxX < tMaxZ) {
      x += stepX;
      t = tMaxX;
      tMaxX += tDeltaX;
      nx = -stepX;
      ny = 0;
      nz = 0;
    } else if (tMaxY < tMaxZ) {
      y += stepY;
      t = tMaxY;
      tMaxY += tDeltaY;
      nx = 0;
      ny = -stepY;
      nz = 0;
    } else {
      z += stepZ;
      t = tMaxZ;
      tMaxZ += tDeltaZ;
      nx = 0;
      ny = 0;
      nz = -stepZ;
    }

    if (t > maxDist) break;

    if (world.isSolidAt(x, y, z)) {
      return {
        hit: { x, y, z },
        prev: { x: x + nx, y: y + ny, z: z + nz },
        normal: { x: nx, y: ny, z: nz },
      };
    }
  }
  return null;
}
