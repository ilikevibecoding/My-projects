// Central tunables for the jungle biome. One place to balance looks vs perf.

export const WORLD = {
  // World footprint (meters). Terrain is centered on the origin.
  size: 400,
  terrainSegments: 256,
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
