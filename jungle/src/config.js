// Central tunables for the jungle biome. One place to balance looks vs perf.

export const WORLD = {
  // World footprint (meters). Terrain is centered on the origin.
  size: 400,
  terrainSegments: 384,
  seed: 1337,

  // Water bodies
  waterLevel: 0.0, // world-space height of the lagoon/river surface
  lagoonCenter: { x: 0, z: -40 },
  lagoonRadius: 46,
  // The river leaves the lagoon toward +z, winding as it goes.
  riverHalfWidth: 9,
  // Cliff arc that feeds the waterfall on the north side of the lagoon.
  cliffAngle: Math.PI * 1.5, // direction from lagoon center (north = -z)
  cliffHeight: 26,
  waterfallX: 0,
  waterfallZ: -86,

  // Player
  eyeHeight: 1.7,
  spawn: { x: -24, z: 20 }, // dry bank south-west of the lagoon
  spawnYaw: -0.24, // facing the lagoon + waterfall
  walkSpeed: 5.2,
  sprintMultiplier: 1.85,
  swimSpeed: 3.0,
  jumpSpeed: 5.4,
  gravity: 14.5,

  // Sun (bright tropical late morning)
  sunElevation: 68, // degrees
  sunAzimuth: 160, // degrees — high sun, slightly east so the falls get side light

  fogColor: 0xc2ddb6,

  // ---------- authored landforms (all inside the same 400 m map) ----------
  // East ridge with a cliff-top overlook facing the lagoon + falls.
  ridge: { x: 128, halfWidthWest: 22, halfWidthEast: 48, height: 21, zFrom: -150, zTo: 120 },
  overlook: { x: 124, z: -12, radius: 14 },
  // Shaded ravine running north–south on the west side.
  ravine: { x: -112, wiggle: 9, halfWidth: 12, depth: 3.2, zFrom: -150, zTo: 70 },
  // Stepped rock terraces north-east of the lagoon.
  terraces: { x: 78, z: -102, radius: 50, step: 3.6 },
  // Sunlit clearing (meadow) south-east — flowers, butterflies, the signature tree nearby.
  clearing: { x: 62, z: 68, radius: 28, height: 3.4 },
  // Low knoll south-west carrying the ruins.
  ruins: { x: -72, z: 86, radius: 16, height: 6.2 },
  // Signature giant tree at the clearing's edge.
  giantTree: { x: 82, z: 48 },
  // Bleached dead emergent on the cliff top — the skyline landmark seen from spawn.
  sentinelSnag: { x: 30, z: -105, height: 28 },
  // Walkable trail network (polylines, meters). Ground blends to dirt; plants avoid it.
  trails: [
    // spawn → lagoon south shore → east shore → climb to the overlook
    [[-44, 66], [-30, 34], [-22, 20], [-6, 11], [14, 8], [30, 6], [48, -2], [62, -8], [80, -18], [98, -26], [112, -22], [124, -12]],
    // shore junction → clearing → around south → ruins knoll
    [[30, 6], [40, 22], [50, 42], [62, 64], [50, 90], [22, 106], [-12, 110], [-44, 100], [-64, 90], [-72, 86]],
    // spawn junction → west into the ravine
    [[-22, 20], [-46, 12], [-72, 2], [-96, -8], [-108, -30], [-112, -60], [-110, -95]],
    // clearing → bamboo corridor → terraces
    [[62, 64], [86, 40], [92, 20], [96, -4], [88, -34], [82, -60], [80, -84]],
  ],
  trailHalfWidth: 2.2,
  rimHeight: 24,
};

export const QUALITY_PRESETS = {
  low: {
    label: 'Low',
    pixelRatioCap: 1,
    shadowMapSize: 1024,
    shadowsEnabled: true,
    vegetationDensity: 0.32,
    grassDensity: 0.22,
    planarReflection: false,
    reflectionSize: 256,
    rippleSimSize: 128,
    godRays: false,
    bloom: true,
    bloomStrength: 0.5,
    particleDensity: 0.35,
    fxaa: true,
    anisotropy: 2,
    ao: false,
    aoScale: 0.5,
    shadowCascades: 0,
  },
  medium: {
    label: 'Medium',
    pixelRatioCap: 1.5,
    shadowMapSize: 2048,
    shadowsEnabled: true,
    vegetationDensity: 0.6,
    grassDensity: 0.5,
    planarReflection: false,
    reflectionSize: 384,
    rippleSimSize: 256,
    godRays: true,
    bloom: true,
    bloomStrength: 0.55,
    particleDensity: 0.6,
    fxaa: true,
    anisotropy: 4,
    ao: false,
    aoScale: 0.5,
    shadowCascades: 0,
  },
  high: {
    label: 'High',
    pixelRatioCap: 2,
    shadowMapSize: 2048,
    shadowsEnabled: true,
    vegetationDensity: 0.85,
    grassDensity: 0.8,
    planarReflection: true,
    reflectionSize: 512,
    rippleSimSize: 256,
    godRays: true,
    bloom: true,
    bloomStrength: 0.6,
    particleDensity: 0.85,
    fxaa: true,
    anisotropy: 8,
    ao: true,
    aoScale: 0.5,
    shadowCascades: 0,
  },
  ultra: {
    label: 'Ultra',
    pixelRatioCap: 2,
    shadowMapSize: 4096,
    shadowsEnabled: true,
    vegetationDensity: 1,
    grassDensity: 1,
    planarReflection: true,
    reflectionSize: 1024,
    rippleSimSize: 512,
    godRays: true,
    bloom: true,
    bloomStrength: 0.65,
    particleDensity: 1,
    fxaa: true,
    anisotropy: 16,
    ao: true,
    aoScale: 1,
    shadowCascades: 3,
  },
};

export function detectQualityName() {
  const params = new URLSearchParams(window.location.search);
  const override = params.get('q');
  if (override && QUALITY_PRESETS[override]) {
    return override;
  }

  const isTouch = window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
  return isTouch ? 'medium' : 'high';
}

export function isWebGLForced() {
  return new URLSearchParams(window.location.search).has('webgl');
}
