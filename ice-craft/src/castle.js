// Procedural ice castles: deterministic placement + chunk-independent stamping.
//
// Castles are anchored on a coarse grid of "cells". For any chunk we find every
// castle whose footprint overlaps the chunk and stamp its voxels directly. The
// block written at any world coordinate depends only on (world coords + SEED),
// so castles are seamless across chunk borders and identical across reloads.
import { CHUNK_SIZE, SEA_LEVEL, SEED, BLOCK } from './config.js';
import { hash2i } from './noise.js';
import { heightAt } from './terrain.js';

const SIZE = CHUNK_SIZE;
const CELL = 112; // castle cell size in blocks
const SPAWN_PROB = 0.5; // chance a cell contains a castle

const VARIANTS = [
  { R: 12, wallH: 6, towerR: 3, towerH: 11, keepR: 4, keepH: 16 },
  { R: 16, wallH: 7, towerR: 3, towerH: 13, keepR: 5, keepH: 21 },
  { R: 20, wallH: 8, towerR: 4, towerH: 15, keepR: 6, keepH: 27 },
];

// Returns a castle descriptor for a cell, or null if none.
export function getCastle(cellX, cellZ) {
  const r = hash2i(cellX, cellZ, SEED + 555);
  if (r >= SPAWN_PROB) return null;

  const jx = 24 + Math.floor(hash2i(cellX, cellZ, SEED + 1) * (CELL - 48));
  const jz = 24 + Math.floor(hash2i(cellX, cellZ, SEED + 2) * (CELL - 48));
  const ax = cellX * CELL + jx;
  const az = cellZ * CELL + jz;

  const variant = Math.min(2, Math.floor(hash2i(cellX, cellZ, SEED + 3) * 3));
  const v = VARIANTS[variant];

  // Sit on top of terrain, but never below the frozen lake surface.
  const groundY = heightAt(ax, az);
  const fy = Math.max(groundY, SEA_LEVEL) + 1;

  const ext = v.R + v.towerR + 2;
  const yMin = fy - 6;
  const yMax = fy + v.keepH + v.keepR * 3 + 6;

  return { ax, az, fy, ext, yMin, yMax, ...v };
}

// Block id for a castle at a world position, or null = leave terrain untouched.
function castleBlockAt(c, wx, wy, wz) {
  const dx = wx - c.ax;
  const dz = wz - c.az;
  const ry = wy - c.fy;
  const adx = Math.abs(dx);
  const adz = Math.abs(dz);
  const cheb = Math.max(adx, adz);

  // nearest corner-tower distance
  let towerDist = Infinity;
  const R = c.R;
  const corners = [
    [R, R],
    [R, -R],
    [-R, R],
    [-R, -R],
  ];
  for (let i = 0; i < 4; i++) {
    const ddx = dx - corners[i][0];
    const ddz = dz - corners[i][1];
    const d = Math.sqrt(ddx * ddx + ddz * ddz);
    if (d < towerDist) towerDist = d;
  }
  const inTowerFoot = towerDist <= c.towerR + 0.5;
  const inTowerRing = inTowerFoot && towerDist >= c.towerR - 1.2;

  const keepDist = Math.sqrt(dx * dx + dz * dz);
  const inKeepFoot = keepDist <= c.keepR + 0.5;
  const inKeepRing = inKeepFoot && keepDist >= c.keepR - 1.2;

  const inSquare = cheb <= R;
  const inWallRing = cheb >= R - 1 && cheb <= R;

  if (!inSquare && !inTowerFoot) return null;

  // Foundation below the floor.
  if (ry < 0) {
    return BLOCK.PACKED_ICE;
  }

  // Courtyard / tower / keep floor.
  if (ry === 0) {
    return BLOCK.BLUE_ICE;
  }

  // Gate opening in the -Z (south) wall.
  const isGate = Math.abs(dz + R) <= 1 && adx <= 2 && ry >= 1 && ry <= 4;

  // Central keep (checked first; overrides interior).
  if (inKeepFoot) {
    if (ry >= 1 && ry <= c.keepH) {
      return inKeepRing ? BLOCK.ICE_BRICK : BLOCK.AIR;
    }
    if (ry === c.keepH + 1) {
      if (!inKeepRing) return BLOCK.AIR;
      const along = Math.round(Math.atan2(dz, dx) / (Math.PI / 4));
      return ((along % 2) + 2) % 2 === 0 ? BLOCK.SNOW_BRICK : BLOCK.AIR;
    }
    const base = c.keepH + 2;
    if (ry >= base) {
      const sh = ry - base;
      const rad = c.keepR - sh * 0.5;
      if (rad >= 0 && keepDist <= rad + 0.3) return BLOCK.BLUE_ICE;
      if (rad < 0 && keepDist < 1.0 && sh <= c.keepR * 2.4) return BLOCK.CRYSTAL;
      return null;
    }
  }

  // Corner towers.
  if (inTowerFoot) {
    if (ry >= 1 && ry <= c.towerH) {
      return inTowerRing ? BLOCK.ICE_BRICK : BLOCK.AIR;
    }
    if (ry === c.towerH + 1) {
      if (!inTowerRing) return BLOCK.AIR;
      const along = Math.round(Math.atan2(dz, dx) / (Math.PI / 4));
      return ((along % 2) + 2) % 2 === 0 ? BLOCK.SNOW_BRICK : BLOCK.AIR;
    }
    const base = c.towerH + 2;
    if (ry >= base) {
      const sh = ry - base;
      const rad = c.towerR - sh * 0.6;
      if (rad >= 0 && towerDist <= rad + 0.3) return BLOCK.BLUE_ICE;
      if (rad < 0 && towerDist < 0.9 && sh <= c.towerR * 2.0) return BLOCK.CRYSTAL;
      return null;
    }
  }

  // Curtain walls.
  if (inWallRing && !inTowerFoot) {
    if (ry >= 1 && ry <= c.wallH) {
      if (isGate) return BLOCK.AIR;
      return BLOCK.ICE_BRICK;
    }
    if (ry === c.wallH + 1) {
      if (isGate) return BLOCK.AIR;
      const along = adx >= adz ? wz : wx; // coordinate running along this wall
      return ((along % 2) + 2) % 2 === 0 ? BLOCK.SNOW_BRICK : BLOCK.AIR;
    }
  }

  // Interior: carve away any terrain to leave a clean courtyard.
  if (inSquare && ry >= 1 && ry <= c.keepH + 2) {
    return BLOCK.AIR;
  }

  return null;
}

// Stamp all castles overlapping the given chunk into its voxel array.
export function stampCastles(chunk) {
  const baseX = chunk.cx * SIZE;
  const baseZ = chunk.cz * SIZE;

  const maxExt = VARIANTS[2].R + VARIANTS[2].towerR + 2;
  const c0x = Math.floor((baseX - maxExt) / CELL) - 1;
  const c1x = Math.floor((baseX + SIZE + maxExt) / CELL) + 1;
  const c0z = Math.floor((baseZ - maxExt) / CELL) - 1;
  const c1z = Math.floor((baseZ + SIZE + maxExt) / CELL) + 1;

  for (let cz = c0z; cz <= c1z; cz++) {
    for (let cx = c0x; cx <= c1x; cx++) {
      const castle = getCastle(cx, cz);
      if (!castle) continue;

      // x/z overlap of footprint with this chunk
      const minX = Math.max(baseX, castle.ax - castle.ext);
      const maxX = Math.min(baseX + SIZE - 1, castle.ax + castle.ext);
      const minZ = Math.max(baseZ, castle.az - castle.ext);
      const maxZ = Math.min(baseZ + SIZE - 1, castle.az + castle.ext);
      if (minX > maxX || minZ > maxZ) continue;

      for (let wz = minZ; wz <= maxZ; wz++) {
        for (let wx = minX; wx <= maxX; wx++) {
          const lx = wx - baseX;
          const lz = wz - baseZ;
          for (let wy = castle.yMin; wy <= castle.yMax; wy++) {
            const id = castleBlockAt(castle, wx, wy, wz);
            if (id === null) continue;
            chunk.set(lx, wy, lz, id);
          }
        }
      }
    }
  }
}
