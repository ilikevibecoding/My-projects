// Block definitions: maps block IDs to their visual + physical properties.
//
// Each block references atlas tile indices for its faces. Tile indices map into
// the procedural texture atlas built in textures.js (TILE order must match).
import { BLOCK } from './config.js';

// Atlas tile indices (order here defines the atlas layout in textures.js).
export const TILE = {
  SNOW: 0,
  SNOW_SIDE: 1,
  PACKED_ICE: 2,
  BLUE_ICE: 3,
  ICE: 4,
  GLACIER_STONE: 5,
  ICE_BRICK: 6,
  SNOW_BRICK: 7,
  CRYSTAL: 8,
  FROZEN_DIRT: 9,
};

export const ATLAS_TILES = 10; // number of distinct tiles
export const ATLAS_COLS = 4; // atlas grid columns
export const ATLAS_ROWS = 4; // atlas grid rows (cols*rows >= ATLAS_TILES)

// faces order: [px, nx, py, ny, pz, nz] (+X,-X,+Y,-Y,+Z,-Z)
function uniform(t) {
  return [t, t, t, t, t, t];
}

// def: { solid, opaque, transparent, light, faces:[6 tile indices] }
const DEFS = {};

DEFS[BLOCK.AIR] = { solid: false, opaque: false, transparent: true, faces: null };

DEFS[BLOCK.SNOW] = {
  solid: true,
  opaque: true,
  transparent: false,
  // top = snow, bottom = frozen dirt, sides = snow_side
  faces: [TILE.SNOW_SIDE, TILE.SNOW_SIDE, TILE.SNOW, TILE.FROZEN_DIRT, TILE.SNOW_SIDE, TILE.SNOW_SIDE],
};

DEFS[BLOCK.PACKED_ICE] = { solid: true, opaque: true, transparent: false, faces: uniform(TILE.PACKED_ICE) };
DEFS[BLOCK.BLUE_ICE] = { solid: true, opaque: true, transparent: false, faces: uniform(TILE.BLUE_ICE) };
DEFS[BLOCK.ICE] = { solid: true, opaque: false, transparent: true, faces: uniform(TILE.ICE) };
DEFS[BLOCK.GLACIER_STONE] = { solid: true, opaque: true, transparent: false, faces: uniform(TILE.GLACIER_STONE) };
DEFS[BLOCK.ICE_BRICK] = { solid: true, opaque: true, transparent: false, faces: uniform(TILE.ICE_BRICK) };
DEFS[BLOCK.SNOW_BRICK] = { solid: true, opaque: true, transparent: false, faces: uniform(TILE.SNOW_BRICK) };
DEFS[BLOCK.CRYSTAL] = { solid: true, opaque: false, transparent: true, light: true, faces: uniform(TILE.CRYSTAL) };
DEFS[BLOCK.FROZEN_DIRT] = { solid: true, opaque: true, transparent: false, faces: uniform(TILE.FROZEN_DIRT) };

export function blockDef(id) {
  return DEFS[id] || DEFS[BLOCK.AIR];
}

export function isSolid(id) {
  return blockDef(id).solid === true;
}

// A block is "opaque" for face-culling purposes if it fully hides the neighbor face.
export function isOpaque(id) {
  return blockDef(id).opaque === true;
}

export function isTransparent(id) {
  return blockDef(id).transparent === true;
}

export function isAir(id) {
  return id === BLOCK.AIR;
}

// Hotbar: the blocks a player can place, in order.
export const HOTBAR = [
  { id: BLOCK.SNOW, label: 'Snow' },
  { id: BLOCK.PACKED_ICE, label: 'Packed Ice' },
  { id: BLOCK.BLUE_ICE, label: 'Blue Ice' },
  { id: BLOCK.ICE, label: 'Ice' },
  { id: BLOCK.ICE_BRICK, label: 'Ice Brick' },
  { id: BLOCK.SNOW_BRICK, label: 'Snow Brick' },
  { id: BLOCK.GLACIER_STONE, label: 'Glacier Stone' },
  { id: BLOCK.CRYSTAL, label: 'Ice Crystal' },
];
