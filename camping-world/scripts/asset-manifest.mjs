/**
 * Poly Haven asset shortlist (all CC0).
 *
 * res: texture resolution downloaded with the glTF
 * simplify: meshopt simplifier target ratio (1 = keep all). Foliage with
 *           alpha cards uses gentler ratios + higher error tolerance.
 * maxTex: final texture edge after optimization (webp)
 */
export const MODELS = [
  // --- trees ---
  { id: 'island_tree_01', res: '2k', simplify: 0.04, alphaRatio: 0.15, error: 0.05, maxTex: 2048, foliage: true },
  { id: 'island_tree_02', res: '2k', simplify: 0.06, alphaRatio: 0.15, error: 0.05, maxTex: 2048, foliage: true },
  { id: 'tree_small_02', res: '2k', simplify: 0.03, alphaRatio: 0.1, error: 0.08, maxTex: 2048, foliage: true },
  { id: 'fir_sapling', res: '1k', simplify: 0.2, error: 0.01, maxTex: 1024, foliage: true },
  { id: 'fir_sapling_medium', res: '2k', simplify: 0.06, alphaRatio: 0.12, error: 0.08, maxTex: 1536, foliage: true },
  { id: 'searsia_lucida', res: '2k', simplify: 0.15, error: 0.01, maxTex: 2048, foliage: true },

  // --- understory ---
  { id: 'shrub_01', res: '1k', simplify: 0.5, error: 0.01, maxTex: 1024, foliage: true },
  { id: 'shrub_02', res: '1k', simplify: 0.5, error: 0.01, maxTex: 1024, foliage: true },
  { id: 'shrub_03', res: '1k', simplify: 0.5, error: 0.01, maxTex: 1024, foliage: true },
  { id: 'fern_02', res: '1k', simplify: 0.6, error: 0.01, maxTex: 1024, foliage: true },
  { id: 'nettle_plant', res: '1k', simplify: 0.6, error: 0.01, maxTex: 1024, foliage: true },
  { id: 'dandelion_01', res: '1k', simplify: 0.6, error: 0.01, maxTex: 512, foliage: true },

  // --- grass clumps (bake source + hero instances; tiny files, keep full res) ---
  { id: 'grass_medium_01', res: '1k', simplify: 1.0, maxTex: 1024, foliage: true },
  { id: 'grass_medium_02', res: '1k', simplify: 1.0, maxTex: 1024, foliage: true },
  { id: 'grass_bermuda_01', res: '1k', simplify: 1.0, maxTex: 1024, foliage: true },

  // --- deadwood / firewood ---
  { id: 'dead_tree_trunk', res: '2k', simplify: 0.35, error: 0.005, maxTex: 2048 },
  { id: 'dead_tree_trunk_02', res: '2k', simplify: 0.35, error: 0.005, maxTex: 2048 },
  { id: 'tree_stump_01', res: '2k', simplify: 0.5, error: 0.005, maxTex: 2048 },
  { id: 'dry_branches_medium_01', res: '1k', simplify: 0.4, error: 0.01, maxTex: 1024 },
  { id: 'bark_debris_01', res: '2k', simplify: 0.1, error: 0.01, maxTex: 2048 },

  // --- rocks ---
  { id: 'rock_07', res: '2k', simplify: 0.3, error: 0.005, maxTex: 2048 },
  { id: 'boulder_01', res: '2k', simplify: 0.15, error: 0.02, maxTex: 2048 },
  { id: 'rock_moss_set_01', res: '2k', simplify: 0.3, error: 0.005, maxTex: 2048 },
  { id: 'namaqualand_boulder_02', res: '2k', simplify: 0.2, error: 0.02, maxTex: 2048 },
  { id: 'sand_rocks_small_01', res: '2k', simplify: 0.1, error: 0.02, maxTex: 2048 },

  // --- camp props ---
  { id: 'hatchet', res: '2k', simplify: 0.5, error: 0.005, maxTex: 1024 },
  { id: 'wooden_axe', res: '2k', simplify: 0.5, error: 0.005, maxTex: 1024 },
  { id: 'wooden_lantern_01', res: '2k', simplify: 0.5, error: 0.005, maxTex: 1024 },
  { id: 'wooden_crate_01', res: '2k', simplify: 0.5, error: 0.005, maxTex: 1024 },
];

// Ground PBR sets — diff/nor_gl/arm/disp at 2k JPG.
export const GROUND_TEXTURES = [
  'forest_leaves_03',
  'forrest_ground_01',
  'aerial_grass_rock',
  'brown_mud_leaves_01',
];

// Golden-hour sky candidates, 4k .hdr (A/B tested in the self-play loop).
export const HDRIS = [
  'belfast_sunset_puresky',
  'autumn_field_puresky',
  'kloofendal_48d_partly_cloudy_puresky',
];
