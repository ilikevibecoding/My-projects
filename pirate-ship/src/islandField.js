// ---------------------------------------------------------------------------
// islandField.js — pure math describing the archipelago (no three.js).
//
// Every island is a radial mound whose shoreline radius wobbles with three
// deterministic harmonics. The SAME function is used for:
//   * terrain mesh generation (islands.js)
//   * ship collision / grounding (physics.js)
//   * shallow-water tint + shore foam in the ocean shader (GLSL mirror below)
// ---------------------------------------------------------------------------

import { mulberry32, createFbm2D } from './noise.js';

export const SEA_FLOOR_DEPTH = 16; // open-ocean seabed depth (m)
export const BEACH_SLOPE = 0.085; // vertical rise per metre across the beach

function makeIsland(cx, cz, r, height, seed) {
  const rand = mulberry32(seed);
  return {
    cx,
    cz,
    r,
    height,
    seed,
    beachW: 16 + r * 0.05,
    w1: 0.05 + rand() * 0.07,
    p1: rand() * Math.PI * 2,
    w2: 0.03 + rand() * 0.05,
    p2: rand() * Math.PI * 2,
    w3: 0.02 + rand() * 0.035,
    p3: rand() * Math.PI * 2,
  };
}

// The cove: a large jungle arc to the south-west plus scattered islets,
// leaving wide open channels for sailing. Ship spawns near the origin.
export const ISLANDS = [
  // main jungle island (three overlapping mounds form a crescent)
  makeIsland(-520, -180, 230, 58, 101),
  makeIsland(-330, -430, 262, 74, 202),
  makeIsland(20, -560, 212, 52, 303),
  // outlying islets
  makeIsland(470, -290, 96, 26, 404),
  makeIsland(640, 180, 122, 36, 505),
  makeIsland(265, 430, 86, 22, 606),
  makeIsland(-250, 395, 112, 30, 707),
  makeIsland(-640, 270, 78, 18, 808),
];

export const SPAWN = { x: 90, z: 60, heading: Math.PI * 0.75 };

/** Wobbly shoreline radius of an island at polar angle `a` from its centre. */
export function shoreRadius(isl, a) {
  return (
    isl.r *
    (1 +
      isl.w1 * Math.sin(3 * a + isl.p1) +
      isl.w2 * Math.sin(5 * a + isl.p2) +
      isl.w3 * Math.sin(7 * a + isl.p3))
  );
}

/** Terrain height of a single island at world (x, z). Sea level = 0. */
export function islandHeightAt(isl, x, z) {
  const dx = x - isl.cx;
  const dz = z - isl.cz;
  const d = Math.hypot(dx, dz);
  const a = Math.atan2(dz, dx);
  const reff = shoreRadius(isl, a);
  // Gentle beach plane crossing sea level exactly at the shoreline...
  let y = Math.min(BEACH_SLOPE * (reff - d), 2.2);
  // ...plus the jungle mound rising further inland.
  const u = 1 - d / reff;
  if (u > 0.1) {
    const m = Math.min((u - 0.1) / 0.9, 1);
    y += isl.height * Math.pow(m, 1.6);
  }
  return Math.max(y, -SEA_FLOOR_DEPTH);
}

/** Combined terrain height (max over islands). -SEA_FLOOR_DEPTH in open water. */
export function terrainHeightAt(x, z) {
  let y = -SEA_FLOOR_DEPTH;
  for (let i = 0; i < ISLANDS.length; i++) {
    const isl = ISLANDS[i];
    // cheap reject: outside the island's maximum possible footprint
    const dx = x - isl.cx;
    const dz = z - isl.cz;
    const maxR = isl.r * 1.18 + SEA_FLOOR_DEPTH / BEACH_SLOPE;
    if (dx * dx + dz * dz > maxR * maxR) continue;
    const h = islandHeightAt(isl, x, z);
    if (h > y) y = h;
  }
  return y;
}

// Jungle canopy density mask, 0 (clearing) .. 1 (dense canopy).
// Shared by vegetation placement AND terrain colouring, so trees grow in
// organic clusters and the ground visibly darkens beneath them.
const _jungleFbm = createFbm2D(7777, 3);
export function jungleDensityAt(x, z) {
  const n = _jungleFbm(x * 0.016, z * 0.016) * 0.5 + 0.5;
  const t = Math.min(Math.max((n - 0.36) / (0.72 - 0.36), 0), 1);
  return t * t * (3 - 2 * t); // smoothstep
}

/** Finite-difference terrain gradient (uphill direction). */
export function terrainGradientAt(x, z, out) {
  const e = 2.0;
  out.x = (terrainHeightAt(x + e, z) - terrainHeightAt(x - e, z)) / (2 * e);
  out.z = (terrainHeightAt(x, z + e) - terrainHeightAt(x, z - e)) / (2 * e);
  return out;
}

// --- GPU mirror --------------------------------------------------------------

/** Pack island data for the ocean shader. */
export function packIslands() {
  const n = ISLANDS.length;
  const a = new Float32Array(n * 4); // cx, cz, r, beachW
  const b = new Float32Array(n * 4); // w1, p1, w2, p2
  const c = new Float32Array(n * 4); // w3, p3, height, 0
  ISLANDS.forEach((isl, i) => {
    a.set([isl.cx, isl.cz, isl.r, isl.beachW], i * 4);
    b.set([isl.w1, isl.p1, isl.w2, isl.p2], i * 4);
    c.set([isl.w3, isl.p3, isl.height, 0], i * 4);
  });
  return { a, b, c, count: n };
}

/**
 * GLSL mirror of the terrain function. Returns the approximate seabed/terrain
 * height at a world position — used for shallow tint and shore foam bands.
 */
export const ISLAND_GLSL = /* glsl */ `
float terrainHeight(vec2 p, vec4 islA[NUM_ISLANDS], vec4 islB[NUM_ISLANDS], vec4 islC[NUM_ISLANDS]) {
  float y = -SEA_FLOOR_DEPTH;
  for (int i = 0; i < NUM_ISLANDS; i++) {
    vec2 d2 = p - islA[i].xy;
    float d = length(d2);
    float r = islA[i].z;
    if (d > r * 1.18 + SEA_FLOOR_DEPTH / BEACH_SLOPE) continue;
    float a = atan(d2.y, d2.x);
    float reff = r * (1.0
      + islB[i].x * sin(3.0 * a + islB[i].y)
      + islB[i].z * sin(5.0 * a + islB[i].w)
      + islC[i].x * sin(7.0 * a + islC[i].y));
    float h = min(BEACH_SLOPE * (reff - d), 2.2);
    float u = 1.0 - d / reff;
    if (u > 0.1) {
      float m = min((u - 0.1) / 0.9, 1.0);
      h += islC[i].z * pow(m, 1.6);
    }
    y = max(y, h);
  }
  return y;
}
`;
