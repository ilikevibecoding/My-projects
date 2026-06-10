// ---------------------------------------------------------------------------
// islands.js — low-poly island terrain meshes built from the shared island
// field (islandField.js), with vertex-colour terrain bands:
// sand -> jungle greens -> rock on steep slopes.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ISLANDS, islandHeightAt, terrainHeightAt } from './islandField.js';
import { createFbm2D } from './noise.js';
import { mulberry32 } from './noise.js';

const C_SAND = new THREE.Color(0xe2cf96);
const C_SAND_WET = new THREE.Color(0xb89f70);
const C_JUNGLE_DEEP = new THREE.Color(0x1f5a2d);
const C_JUNGLE = new THREE.Color(0x2f7a38);
const C_GRASS = new THREE.Color(0x6a9c44);
const C_GRASS_DRY = new THREE.Color(0x96a04f);
const C_DIRT = new THREE.Color(0x7a5f3e);
const C_ROCK = new THREE.Color(0x8a8273);
const C_ROCK_DARK = new THREE.Color(0x5f594d);
const C_ROCK_HIGH = new THREE.Color(0x9b9488);

export function buildIslands(scene) {
  const fbm = createFbm2D(9001, 4);
  const ridgeFbm = createFbm2D(7007, 3);
  const colorFbm = createFbm2D(5005, 3);
  const patchFbm = createFbm2D(3303, 2);
  const parts = [];

  for (const isl of ISLANDS) {
    // per-island character: some are craggy, some gentle
    const rnd = mulberry32(isl.seed * 7 + 3);
    const bumpAmt = 3.2 + rnd() * 3.4;
    const ridgeAmt = (0.35 + rnd() * 0.65) * Math.min(isl.height * 0.16, 9);
    const tintShift = (rnd() - 0.5) * 0.10; // hue-ish variation between islands

    const segs = Math.round(THREE.MathUtils.clamp(isl.r * 0.8, 56, 120));
    const rings = Math.round(THREE.MathUtils.clamp(isl.r * 0.36, 24, 62));
    const maxR = isl.r * 1.3; // extend below sea level so the shoreline is sealed
    const verts = [];
    const cols = [];
    const idx = [];

    for (let i = 0; i <= rings; i++) {
      const tr = i / rings;
      const rad = Math.pow(tr, 0.85) * maxR; // denser rings near the summit
      for (let j = 0; j < segs; j++) {
        const a = (j / segs) * Math.PI * 2;
        const x = isl.cx + Math.cos(a) * rad;
        const z = isl.cz + Math.sin(a) * rad;
        let y = islandHeightAt(isl, x, z);
        // interior detail — only well above the shoreline so the physics &
        // shader field stays exact where it matters (the beach/collision)
        if (y > 2.0) {
          const inland = Math.min((y - 2.0) / 6.0, 1);
          const elev = Math.min(y / isl.height, 1);
          // rolling bumps
          y += fbm(x * 0.02, z * 0.02) * bumpAmt * inland;
          y += fbm(x * 0.07, z * 0.07) * 1.4 * inland;
          // ridged crags toward the summit (sharp |noise| creases)
          const ridge = 1 - Math.abs(ridgeFbm(x * 0.016, z * 0.016));
          y += ridge * ridge * ridgeAmt * elev * elev * inland;
        }
        verts.push(x, y, z);
        cols.push(0, 0, 0); // filled after normals are known
      }
    }
    for (let i = 0; i < rings; i++) {
      for (let j = 0; j < segs; j++) {
        const j1 = (j + 1) % segs;
        const a = i * segs + j;
        const b = i * segs + j1;
        const c = (i + 1) * segs + j;
        const d = (i + 1) * segs + j1;
        if (i === 0) {
          // ring 0 is the degenerate centre: fan triangles only
          idx.push(b, d, c);
        } else {
          idx.push(a, b, c, b, d, c);
        }
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();

    // colour by height, slope, and noise-driven biome patches
    const pos = geo.getAttribute('position');
    const nor = geo.getAttribute('normal');
    const col = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    const tone = new THREE.Color();
    const peak = isl.height * 1.15 + ridgeAmt;
    for (let v = 0; v < pos.count; v++) {
      const x = pos.getX(v);
      const y = pos.getY(v);
      const z = pos.getZ(v);
      const slope = 1 - nor.getY(v); // 0 flat .. 1 vertical
      const elev = Math.max(y, 0) / peak;
      const n = colorFbm(x * 0.045, z * 0.045) * 0.5 + 0.5;
      const patch = patchFbm(x * 0.02 + 31, z * 0.02 - 17) * 0.5 + 0.5;
      const grain = colorFbm(x * 0.16, z * 0.16) * 0.5 + 0.5;

      // wobble the vegetation line with noise so it isn't a straight contour
      const sandLine = 1.7 + (patch - 0.5) * 1.5;
      if (y < 0.5) {
        // wet sand at the waterline
        c.copy(C_SAND_WET).lerp(C_SAND, grain * 0.25);
      } else if (y < sandLine) {
        // dry beach with subtle grain so the band isn't flat
        c.copy(C_SAND).lerp(C_SAND_WET, (1 - y * 0.45) * 0.25 + grain * 0.12);
      } else {
        // vegetation: deep jungle in the lows, open glades and dry grass
        // patches higher up, occasional dirt breaks
        c.copy(C_JUNGLE).lerp(C_JUNGLE_DEEP, n * 0.8);
        if (patch > 0.62) c.lerp(C_GRASS, (patch - 0.62) / 0.38 * 0.85);
        if (patch < 0.22) c.lerp(C_DIRT, (0.22 - patch) / 0.22 * 0.5);
        // higher slopes dry out
        c.lerp(C_GRASS_DRY, THREE.MathUtils.clamp((elev - 0.45) * 1.6, 0, 0.55) * patch);
        // per-island tint variation
        if (tintShift > 0) c.lerp(C_GRASS_DRY, tintShift);
        else c.lerp(C_JUNGLE_DEEP, -tintShift);
        // blend sand->jungle across a noisy transition band
        if (y < sandLine + 1.1) c.lerp(C_SAND, (sandLine + 1.1 - y) / 1.1 * 0.85);
      }

      // exposed rock: steep slopes and craggy summits
      const rockiness = THREE.MathUtils.clamp((slope - 0.32) / 0.2, 0, 1) * (y > 1.2 ? 1 : 0);
      const summitRock = THREE.MathUtils.clamp((elev - 0.72) * 4.0, 0, 1) * (slope > 0.18 ? 1 : 0.4);
      const rk = Math.max(rockiness, summitRock);
      if (rk > 0) {
        tone.copy(elev > 0.6 ? C_ROCK_HIGH : C_ROCK).lerp(C_ROCK_DARK, n * 0.7);
        c.lerp(tone, Math.min(rk, 1));
      }

      col[v * 3] = c.r;
      col[v * 3 + 1] = c.g;
      col[v * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    parts.push(geo);
  }

  const merged = mergeGeometries(parts);
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    flatShading: true,
    roughness: 1.0,
    metalness: 0.0,
  });
  const mesh = new THREE.Mesh(merged, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

export { terrainHeightAt };
