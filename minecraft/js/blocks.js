// Block ids, per-face texture tiles and physical properties.

export const Blocks = {
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  STONE: 3,
  COBBLESTONE: 4,
  PLANKS: 5,
  LOG: 6,
  LEAVES: 7,
  SAND: 8,
  GLASS: 9,
  WATER: 10,
  BEDROCK: 11,
  SNOWY_GRASS: 12,
  COAL_ORE: 13,
  IRON_ORE: 14,
};

export const Tiles = {
  GRASS_TOP: 0,
  GRASS_SIDE: 1,
  DIRT: 2,
  STONE: 3,
  COBBLESTONE: 4,
  PLANKS: 5,
  LOG_SIDE: 6,
  LOG_TOP: 7,
  LEAVES: 8,
  SAND: 9,
  GLASS: 10,
  WATER: 11,
  BEDROCK: 12,
  SNOW_TOP: 13,
  SNOW_SIDE: 14,
  COAL_ORE: 15,
  IRON_ORE: 16,
};

// tiles: [top, bottom, side]
export const BLOCK_DEFS = {
  [Blocks.GRASS]: {
    name: 'Grass',
    tiles: [Tiles.GRASS_TOP, Tiles.DIRT, Tiles.GRASS_SIDE],
    opaque: true,
    solid: true,
    translucent: false,
  },
  [Blocks.DIRT]: {
    name: 'Dirt',
    tiles: [Tiles.DIRT, Tiles.DIRT, Tiles.DIRT],
    opaque: true,
    solid: true,
    translucent: false,
  },
  [Blocks.STONE]: {
    name: 'Stone',
    tiles: [Tiles.STONE, Tiles.STONE, Tiles.STONE],
    opaque: true,
    solid: true,
    translucent: false,
  },
  [Blocks.COBBLESTONE]: {
    name: 'Cobblestone',
    tiles: [Tiles.COBBLESTONE, Tiles.COBBLESTONE, Tiles.COBBLESTONE],
    opaque: true,
    solid: true,
    translucent: false,
  },
  [Blocks.PLANKS]: {
    name: 'Planks',
    tiles: [Tiles.PLANKS, Tiles.PLANKS, Tiles.PLANKS],
    opaque: true,
    solid: true,
    translucent: false,
  },
  [Blocks.LOG]: {
    name: 'Log',
    tiles: [Tiles.LOG_TOP, Tiles.LOG_TOP, Tiles.LOG_SIDE],
    opaque: true,
    solid: true,
    translucent: false,
  },
  [Blocks.LEAVES]: {
    name: 'Leaves',
    tiles: [Tiles.LEAVES, Tiles.LEAVES, Tiles.LEAVES],
    opaque: true,
    solid: true,
    translucent: false,
  },
  [Blocks.SAND]: {
    name: 'Sand',
    tiles: [Tiles.SAND, Tiles.SAND, Tiles.SAND],
    opaque: true,
    solid: true,
    translucent: false,
  },
  [Blocks.GLASS]: {
    name: 'Glass',
    tiles: [Tiles.GLASS, Tiles.GLASS, Tiles.GLASS],
    opaque: false,
    solid: true,
    translucent: true,
  },
  [Blocks.WATER]: {
    name: 'Water',
    tiles: [Tiles.WATER, Tiles.WATER, Tiles.WATER],
    opaque: false,
    solid: false,
    translucent: true,
  },
  [Blocks.BEDROCK]: {
    name: 'Bedrock',
    tiles: [Tiles.BEDROCK, Tiles.BEDROCK, Tiles.BEDROCK],
    opaque: true,
    solid: true,
    translucent: false,
  },
  [Blocks.SNOWY_GRASS]: {
    name: 'Snowy Grass',
    tiles: [Tiles.SNOW_TOP, Tiles.DIRT, Tiles.SNOW_SIDE],
    opaque: true,
    solid: true,
    translucent: false,
  },
  [Blocks.COAL_ORE]: {
    name: 'Coal Ore',
    tiles: [Tiles.COAL_ORE, Tiles.COAL_ORE, Tiles.COAL_ORE],
    opaque: true,
    solid: true,
    translucent: false,
  },
  [Blocks.IRON_ORE]: {
    name: 'Iron Ore',
    tiles: [Tiles.IRON_ORE, Tiles.IRON_ORE, Tiles.IRON_ORE],
    opaque: true,
    solid: true,
    translucent: false,
  },
};

export function isOpaque(id) {
  const def = BLOCK_DEFS[id];
  return def ? def.opaque : false;
}

export function isSolid(id) {
  const def = BLOCK_DEFS[id];
  return def ? def.solid : false;
}

export function isTranslucent(id) {
  const def = BLOCK_DEFS[id];
  return def ? def.translucent : false;
}

export function tileForFace(id, dirY) {
  const def = BLOCK_DEFS[id];
  if (!def) return 0;
  if (dirY > 0) return def.tiles[0];
  if (dirY < 0) return def.tiles[1];
  return def.tiles[2];
}

// Blocks the player can put in the hotbar.
export const HOTBAR_BLOCKS = [
  Blocks.GRASS,
  Blocks.DIRT,
  Blocks.STONE,
  Blocks.COBBLESTONE,
  Blocks.PLANKS,
  Blocks.LOG,
  Blocks.LEAVES,
  Blocks.SAND,
  Blocks.GLASS,
];
