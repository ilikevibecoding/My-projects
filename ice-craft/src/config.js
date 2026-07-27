// IceCraft global configuration and tunables.

export const SEED = 1337;

// Chunk dimensions.
export const CHUNK_SIZE = 16; // X and Z
export const WORLD_HEIGHT = 64; // Y (0..63)

// Terrain shaping.
export const SEA_LEVEL = 30; // frozen-lake water line
export const BASE_HEIGHT = 32; // average ground height

// View / performance.
export const RENDER_DISTANCE = 5; // chunks radius around player
export const MESH_BUDGET_PER_FRAME = 2; // chunk (re)builds per frame
export const MAX_PIXEL_RATIO = 1.0; // cap render resolution (big win on HiDPI)

// Player physics.
export const GRAVITY = 28.0; // blocks / s^2
export const JUMP_SPEED = 9.0; // blocks / s
export const WALK_SPEED = 5.0; // blocks / s
export const SPRINT_SPEED = 8.5; // blocks / s
export const FLY_SPEED = 12.0; // blocks / s
export const FLY_SPRINT_SPEED = 26.0; // blocks / s
export const PLAYER_WIDTH = 0.6;
export const PLAYER_HEIGHT = 1.8;
export const PLAYER_EYE = 1.62;

// Interaction.
export const REACH = 6.0; // block reach distance

// Block IDs.
export const BLOCK = {
  AIR: 0,
  SNOW: 1,
  PACKED_ICE: 2,
  BLUE_ICE: 3,
  ICE: 4, // translucent
  GLACIER_STONE: 5,
  ICE_BRICK: 6,
  SNOW_BRICK: 7,
  CRYSTAL: 8, // glowing accent
  FROZEN_DIRT: 9,
};
