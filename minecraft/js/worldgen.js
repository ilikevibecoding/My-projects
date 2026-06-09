import { CHUNK_SIZE, WORLD_HEIGHT, SEA_LEVEL } from './constants.js';
import { Noise2D, ValueNoise3D } from './noise.js';
import { Blocks } from './blocks.js';
import { hash2, rand2, rand3 } from './rng.js';

export const Biomes = {
  GRASS: 0,
  DESERT: 1,
  SNOW: 2,
};

export class WorldGen {
  constructor(seed) {
    this.seed = seed >>> 0;
    this.continentNoise = new Noise2D(seed ^ 0x10501);
    this.hillNoise = new Noise2D(seed ^ 0x20a02);
    this.mountainNoise = new Noise2D(seed ^ 0x35703);
    this.biomeNoise = new Noise2D(seed ^ 0x4b104);
    this.caveNoise = new ValueNoise3D(seed ^ 0x5c205);
    this.heightCache = new Map();
  }

  heightAt(x, z) {
    const key = x + ',' + z;
    const cached = this.heightCache.get(key);
    if (cached !== undefined) return cached;

    const c = this.continentNoise.fbm(x * 0.004, z * 0.004, 3);
    const hills = this.hillNoise.fbm(x * 0.02, z * 0.02, 3);
    let m = this.mountainNoise.fbm(x * 0.007 + 13.1, z * 0.007 - 7.7, 3);
    m = Math.max(0, m + 0.15);

    let h = Math.round(33 + c * 13 + hills * 6 + Math.pow(m, 1.8) * 42);
    h = Math.max(5, Math.min(WORLD_HEIGHT - 14, h));

    if (this.heightCache.size > 120000) this.heightCache.clear();
    this.heightCache.set(key, h);
    return h;
  }

  biomeAt(x, z) {
    const b = this.biomeNoise.fbm(x * 0.0045 + 9.7, z * 0.0045 - 3.1, 2);
    if (b < -0.38) return Biomes.DESERT;
    if (b > 0.42) return Biomes.SNOW;
    return Biomes.GRASS;
  }

  hasTreeAt(x, z) {
    const h = this.heightAt(x, z);
    if (h <= SEA_LEVEL + 1) return false;
    const biome = this.biomeAt(x, z);
    if (biome === Biomes.DESERT) return false;
    const r = rand2(x, z, this.seed ^ 0x7ee5);
    const chance = biome === Biomes.SNOW ? 0.004 : 0.009;
    return r < chance;
  }

  trunkHeightAt(x, z) {
    return 4 + (hash2(x, z, this.seed ^ 0x771a) % 3);
  }

  generateChunk(cx, cz) {
    const data = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT);
    const heights = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
    const x0 = cx * CHUNK_SIZE;
    const z0 = cz * CHUNK_SIZE;
    const seed = this.seed;

    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const wx = x0 + lx;
        const wz = z0 + lz;
        const h = this.heightAt(wx, wz);
        const biome = this.biomeAt(wx, wz);
        const beach = h <= SEA_LEVEL + 1;
        const snowy = biome === Biomes.SNOW || h >= 70;

        let topBlock;
        let fillBlock;
        if (beach || biome === Biomes.DESERT) {
          topBlock = Blocks.SAND;
          fillBlock = Blocks.SAND;
        } else if (snowy) {
          topBlock = Blocks.SNOWY_GRASS;
          fillBlock = Blocks.DIRT;
        } else {
          topBlock = Blocks.GRASS;
          fillBlock = Blocks.DIRT;
        }

        const colTop = Math.max(h, SEA_LEVEL);
        for (let y = 0; y <= colTop; y++) {
          const idx = lx + lz * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE;
          let id = Blocks.AIR;

          if (y === 0) {
            id = Blocks.BEDROCK;
          } else if (y <= h) {
            if (y === h) {
              id = topBlock;
            } else if (y >= h - 3) {
              id = fillBlock;
            } else {
              id = Blocks.STONE;
              if (
                y < 48 &&
                rand3(wx >> 2, y >> 2, wz >> 2, seed ^ 0xc0a1) < 0.14 &&
                rand3(wx, y, wz, seed ^ 0xc0a2) < 0.42
              ) {
                id = Blocks.COAL_ORE;
              } else if (
                y < 34 &&
                rand3(wx >> 2, y >> 2, wz >> 2, seed ^ 0x1407) < 0.1 &&
                rand3(wx, y, wz, seed ^ 0x1408) < 0.36
              ) {
                id = Blocks.IRON_ORE;
              }

              // Cave carving.
              if (y >= 6 && y <= h - 6) {
                const n = this.caveNoise.fbm(wx * 0.075, y * 0.105, wz * 0.075, 2);
                if (n > 0.665) id = Blocks.AIR;
              }
            }
          } else if (y <= SEA_LEVEL) {
            id = Blocks.WATER;
          }

          data[idx] = id;
        }
      }
    }

    this.placeTrees(data, x0, z0);

    // Column heights (topmost non-air, non-water block), used for lighting.
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        let top = 0;
        for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
          const id = data[lx + lz * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE];
          if (id !== Blocks.AIR && id !== Blocks.WATER) {
            top = y;
            break;
          }
        }
        heights[lx + lz * CHUNK_SIZE] = top;
      }
    }

    return { data, heights };
  }

  placeTrees(data, x0, z0) {
    const margin = 3;
    for (let wz = z0 - margin; wz < z0 + CHUNK_SIZE + margin; wz++) {
      for (let wx = x0 - margin; wx < x0 + CHUNK_SIZE + margin; wx++) {
        if (!this.hasTreeAt(wx, wz)) continue;

        const h = this.heightAt(wx, wz);
        const trunkH = this.trunkHeightAt(wx, wz);
        const topY = h + trunkH;
        const seed = this.seed;

        // Canopy first, trunk overrides.
        for (let dy = -1; dy <= 2; dy++) {
          const y = topY + dy;
          if (y < 0 || y >= WORLD_HEIGHT) continue;
          let r;
          if (dy <= 0) r = 2;
          else if (dy === 1) r = 1;
          else r = 1;
          for (let dz = -r; dz <= r; dz++) {
            for (let dx = -r; dx <= r; dx++) {
              if (dy === 2 && dx !== 0 && dz !== 0) continue;
              const isCorner = Math.abs(dx) === r && Math.abs(dz) === r;
              if (isCorner && (r === 0 || rand3(wx + dx, y, wz + dz, seed ^ 0x1eaf) < 0.55)) {
                continue;
              }
              this.setLocal(data, x0, z0, wx + dx, y, wz + dz, Blocks.LEAVES, true);
            }
          }
        }

        for (let y = h + 1; y <= topY; y++) {
          this.setLocal(data, x0, z0, wx, y, wz, Blocks.LOG, false);
        }
      }
    }
  }

  setLocal(data, x0, z0, wx, y, wz, id, onlyIfAir) {
    const lx = wx - x0;
    const lz = wz - z0;
    if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE) return;
    if (y < 0 || y >= WORLD_HEIGHT) return;
    const idx = lx + lz * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE;
    if (onlyIfAir && data[idx] !== Blocks.AIR) return;
    data[idx] = id;
  }

  surfaceAt(x, z) {
    return this.heightAt(x, z);
  }
}
