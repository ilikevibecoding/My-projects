// ---------------------------------------------------------------------------
// islands.js — low-poly island terrain meshes built from the shared island
// field (islandField.js), with vertex-colour terrain bands:
// sand -> jungle greens -> rock on steep slopes.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ISLANDS, islandHeightAt, terrainHeightAt } from './islandField.js';
import { createFbm2D } from './noise.js';

const C_SAND = new THREE.Color(0xe6d49c);
const C_SAND_WET = new THREE.Color(0xc5ad7c);
const C_GRASS_A = new THREE.Color(0x2e7136);
const C_GRASS_B = new THREE.Color(0x55a047);
const C_ROCK = new THREE.Color(0x8a8273);
const C_ROCK_DARK = new THREE.Color(0x6e6759);

export function buildIslands(scene) {
  const fbm = createFbm2D(9001, 4);
  const colorFbm = createFbm2D(5005, 3);
  const parts = [];

  for (const isl of ISLANDS) {
    const segs = Math.round(THREE.MathUtils.clamp(isl.r * 0.55, 40, 92));
    const rings = Math.round(THREE.MathUtils.clamp(isl.r * 0.26, 18, 48));
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
        // interior detail bumps — only well above the shoreline so the
        // physics/shader field stays exact where it matters (the beach)
        if (y > 2.0) {
          const inland = Math.min((y - 2.0) / 6.0, 1);
          y += fbm(x * 0.02, z * 0.02) * 4.2 * inland;
          y += fbm(x * 0.07, z * 0.07) * 1.3 * inland;
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

    // colour by height + slope
    const pos = geo.getAttribute('position');
    const nor = geo.getAttribute('normal');
    const col = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    for (let v = 0; v < pos.count; v++) {
      const x = pos.getX(v);
      const y = pos.getY(v);
      const z = pos.getZ(v);
      const slope = 1 - nor.getY(v); // 0 flat .. 1 vertical
      const n = colorFbm(x * 0.045, z * 0.045) * 0.5 + 0.5;

      if (y < 0.45) c.copy(C_SAND_WET);
      else if (y < 1.7) c.copy(C_SAND).lerp(C_SAND_WET, Math.max(0, (1.0 - y) * 0.4));
      else {
        c.copy(C_GRASS_A).lerp(C_GRASS_B, n);
        // blend sand->grass across the 1.7..2.6 band
        if (y < 2.6) c.lerp(C_SAND, (2.6 - y) / 0.9);
      }
      if (slope > 0.38 && y > 1.2) {
        c.copy(C_ROCK).lerp(C_ROCK_DARK, n);
      } else if (slope > 0.3 && y > 1.2) {
        c.lerp(C_ROCK, (slope - 0.3) / 0.08 * 0.7);
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
