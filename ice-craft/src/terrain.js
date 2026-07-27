// Terrain generation for the icy world.
import { CHUNK_SIZE, WORLD_HEIGHT, SEA_LEVEL, BASE_HEIGHT, SEED, BLOCK } from './config.js';
import { fbm2, valueNoise3, valueNoise2 } from './noise.js';
import { stampCastles } from './castle.js';

const SIZE = CHUNK_SIZE;

// Surface height for a world column (x,z). Deterministic.
export function heightAt(wx, wz) {
  // Large rolling hills.
  const base = fbm2(wx * 0.0125, wz * 0.0125, SEED, 4, 2.0, 0.5);
  // Sharper mountain ridges in some regions.
  const mountainMask = fbm2(wx * 0.0035, wz * 0.0035, SEED + 77, 2, 2.0, 0.5);
  const ridge = fbm2(wx * 0.02, wz * 0.02, SEED + 9, 3, 2.0, 0.5);

  let h = BASE_HEIGHT + (base - 0.5) * 18;
  const m = Math.max(0, mountainMask - 0.55) / 0.45; // 0..1 where mask high
  h += m * ridge * 26;
  return Math.floor(h);
}

export function generateChunk(chunk) {
  const baseX = chunk.cx * SIZE;
  const baseZ = chunk.cz * SIZE;
  const v = chunk.voxels;

  for (let z = 0; z < SIZE; z++) {
    for (let x = 0; x < SIZE; x++) {
      const wx = baseX + x;
      const wz = baseZ + z;
      const h = heightAt(wx, wz);

      for (let y = 0; y <= Math.max(h, SEA_LEVEL); y++) {
        let id = BLOCK.AIR;
        if (y <= h) {
          if (y === 0) {
            id = BLOCK.GLACIER_STONE;
          } else if (y < h - 4) {
            // deep: glacier stone with occasional blue-ice veins
            const vein = valueNoise3(wx * 0.12, y * 0.12, wz * 0.12, SEED + 31);
            id = vein > 0.78 ? BLOCK.BLUE_ICE : BLOCK.GLACIER_STONE;
          } else if (y < h) {
            // sub-surface: packed ice / frozen dirt mix
            const m = valueNoise3(wx * 0.18, y * 0.18, wz * 0.18, SEED + 5);
            id = m > 0.5 ? BLOCK.PACKED_ICE : BLOCK.FROZEN_DIRT;
          } else {
            // surface block
            if (h < SEA_LEVEL) {
              id = BLOCK.PACKED_ICE; // lake bed
            } else {
              id = BLOCK.SNOW;
            }
          }
        } else if (y <= SEA_LEVEL && h < SEA_LEVEL) {
          // frozen lake fill above terrain up to sea level
          id = BLOCK.ICE;
        }

        if (id !== BLOCK.AIR) {
          v[x + z * SIZE + y * SIZE * SIZE] = id;
        }
      }
    }
  }

  // Stamp any ice castles overlapping this chunk.
  stampCastles(chunk);

  chunk.generated = true;
  chunk.dirty = true;
}
