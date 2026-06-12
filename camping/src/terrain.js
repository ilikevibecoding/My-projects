// Terrain: single analytic height function (CPU source of truth) + one radial
// seam-free mesh covering camp bowl AND distant mountains, splat-shaded.
import * as THREE from 'three';
import {
  worldNoise, detailNoise, fbm2, ridged2, clamp, lerp, smoothstep, GLSL_NOISE,
} from './noise.js';
import { makeGrassTexture, makeDirtTexture, makeRockTexture } from './textures.js';

// ---------------------------------------------------------------------------
// World layout constants
// ---------------------------------------------------------------------------
export const POND = { x: 30, z: 10, r: 10 };
export const WORLD_RADIUS = 112;     // soft player bound
export const CAMP = { x: 0, z: 0 };

function hillsHeight(x, z) {
  // rolling hills
  let h = fbm2(worldNoise, x * 0.008, z * 0.008, 4) * 9.0;
  h += fbm2(detailNoise, x * 0.045, z * 0.045, 3) * 0.9;
  // bowl rim rising into rocky slopes
  const r = Math.sqrt(x * x + z * z);
  const rimT = Math.pow(smoothstep(92, 200, r), 1.35);
  h += rimT * 50 * (0.65 + 0.7 * ridged2(worldNoise, x * 0.01 + 5.1, z * 0.01 - 3.7, 3));
  // distant mountains (same surface, far beyond the rim, sit in fog)
  const mT = smoothstep(235, 800, r);
  if (mT > 0) {
    h += mT * (55 + ridged2(worldNoise, x * 0.0014 + 11.7, z * 0.0014 + 4.2, 5) * 330);
  }
  return h;
}

const campH = hillsHeight(CAMP.x, CAMP.z);

function clearedHeight(x, z) {
  let h = hillsHeight(x, z);
  // flatten a gently tilted clearing for the camp (hillside feel preserved)
  const dCamp = Math.hypot(x - CAMP.x, z - CAMP.z);
  if (dCamp < 30) {
    const t = smoothstep(28, 9, dCamp);
    const plane = campH + (x - CAMP.x) * 0.022 + (z - CAMP.z) * 0.045;
    h = lerp(h, plane, t);
  }
  return h;
}

const rawAtPond = clearedHeight(POND.x, POND.z);
export const WATER_LEVEL = rawAtPond - 0.55;

export function getTerrainHeight(x, z) {
  let h = clearedHeight(x, z);
  // pond: blend surroundings toward shore height, then carve the bowl
  const dP = Math.hypot(x - POND.x, z - POND.z);
  if (dP < POND.r * 2.3) {
    const shoreT = smoothstep(POND.r * 2.3, POND.r * 0.9, dP);
    h = lerp(h, WATER_LEVEL + 0.5, shoreT * 0.88);
    const bowlT = smoothstep(POND.r, POND.r * 0.12, dP);
    h -= 2.6 * bowlT;
  }
  return h;
}

const EPS = 0.35;
export function getTerrainNormal(x, z, target = new THREE.Vector3()) {
  const hL = getTerrainHeight(x - EPS, z);
  const hR = getTerrainHeight(x + EPS, z);
  const hD = getTerrainHeight(x, z - EPS);
  const hU = getTerrainHeight(x, z + EPS);
  target.set(hL - hR, 2 * EPS, hD - hU).normalize();
  return target;
}

// ---------------------------------------------------------------------------
// Dirt path mask (worn spots): capsules along two paths + camp wear disc
// ---------------------------------------------------------------------------
const PATHS = [
  // camp -> pond shore
  [[1.5, 1.5], [9, 3.2], [16, 5.5], [22.5, 8.2]],
  // camp -> forest edge
  [[0, -2], [-6, -9], [-11, -18], [-15, -29]],
];
const PATH_W = 1.25;   // full-strength half width
const PATH_F = 1.6;    // falloff width

function segDist(px, pz, ax, az, bx, bz) {
  const abx = bx - ax, abz = bz - az;
  const t = clamp(((px - ax) * abx + (pz - az) * abz) / (abx * abx + abz * abz), 0, 1);
  return Math.hypot(px - (ax + abx * t), pz - (az + abz * t));
}

export function pathMask(x, z) {
  let m = 0;
  for (const pts of PATHS) {
    for (let i = 0; i < pts.length - 1; i++) {
      const d = segDist(x, z, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
      // wobble the edge so it isn't a perfect capsule
      const wob = worldNoise.noise2D(x * 0.4 + 9.1, z * 0.4) * 0.45;
      m = Math.max(m, smoothstep(PATH_W + PATH_F + wob, PATH_W * 0.5, d));
    }
  }
  // worn camp area
  const dCamp = Math.hypot(x - CAMP.x, z - CAMP.z);
  m = Math.max(m, smoothstep(6.5, 1.5, dCamp) * 0.85);
  return clamp(m, 0, 1);
}

// Biome / placement info shared by vegetation + camp + rocks
const _n = new THREE.Vector3();
export function placementInfo(x, z) {
  const h = getTerrainHeight(x, z);
  getTerrainNormal(x, z, _n);
  const slopeY = _n.y; // 1 = flat
  const rockW = smoothstep(0.78, 0.6, slopeY);
  const dirtW = pathMask(x, z) * (1 - rockW);
  const water = h < WATER_LEVEL + 0.25 ? 1 : 0;
  const grassW = Math.max(0, 1 - rockW - dirtW - water);
  return { height: h, slopeY, rockW, dirtW, grassW, water };
}

// ---------------------------------------------------------------------------
// Splat control texture (dirt path baked; sampled in terrain shader)
// ---------------------------------------------------------------------------
const SPLAT_SIZE = 512;
const SPLAT_BOUND = 140; // world units, [-140, 140]
function bakeSplat() {
  const data = new Uint8Array(SPLAT_SIZE * SPLAT_SIZE * 4);
  for (let j = 0; j < SPLAT_SIZE; j++) {
    for (let i = 0; i < SPLAT_SIZE; i++) {
      const x = (i / (SPLAT_SIZE - 1)) * 2 * SPLAT_BOUND - SPLAT_BOUND;
      const z = (j / (SPLAT_SIZE - 1)) * 2 * SPLAT_BOUND - SPLAT_BOUND;
      const k = (j * SPLAT_SIZE + i) * 4;
      data[k] = pathMask(x, z) * 255;
      data[k + 1] = 0;
      data[k + 2] = 0;
      data[k + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, SPLAT_SIZE, SPLAT_SIZE);
  tex.needsUpdate = true;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}

// ---------------------------------------------------------------------------
// Geometry: radial disc, dense near camp, sparse at the mountains. Seam-free.
// ---------------------------------------------------------------------------
function buildTerrainGeometry() {
  const RINGS = 230;
  const SEGS = 256;
  const R_MAX = 1500;
  const POW = 2.7;

  const positions = [];
  const indices = [];
  positions.push(0, getTerrainHeight(0, 0), 0); // center vertex (index 0)

  for (let ri = 0; ri < RINGS; ri++) {
    const t = (ri + 1) / RINGS;
    const r = R_MAX * Math.pow(t, POW);
    for (let si = 0; si < SEGS; si++) {
      const a = (si / SEGS) * Math.PI * 2;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      positions.push(x, getTerrainHeight(x, z), z);
    }
  }
  // center fan
  for (let si = 0; si < SEGS; si++) {
    const a = 1 + si;
    const b = 1 + ((si + 1) % SEGS);
    indices.push(0, b, a);
  }
  // ring strips
  for (let ri = 0; ri < RINGS - 1; ri++) {
    const ringA = 1 + ri * SEGS;
    const ringB = 1 + (ri + 1) * SEGS;
    for (let si = 0; si < SEGS; si++) {
      const a0 = ringA + si;
      const a1 = ringA + ((si + 1) % SEGS);
      const b0 = ringB + si;
      const b1 = ringB + ((si + 1) % SEGS);
      indices.push(a0, b1, b0);
      indices.push(a0, a1, b1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

// ---------------------------------------------------------------------------
// Material: standard PBR + splat blending injected via onBeforeCompile
// ---------------------------------------------------------------------------
export function createTerrain() {
  const grassTex = makeGrassTexture();
  const dirtTex = makeDirtTexture();
  const rockTex = makeRockTexture();
  const splatTex = bakeSplat();

  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.95,
    metalness: 0.0,
  });

  material.onBeforeCompile = (shader) => {
    shader.uniforms.grassMap = { value: grassTex };
    shader.uniforms.dirtMap = { value: dirtTex };
    shader.uniforms.rockMap = { value: rockTex };
    shader.uniforms.splatMap = { value: splatTex };
    shader.uniforms.uSplatBound = { value: SPLAT_BOUND };

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNorm;')
      .replace('#include <fog_vertex>',
        '#include <fog_vertex>\nvWPos = (modelMatrix * vec4(position, 1.0)).xyz;\nvWNorm = normalize(mat3(modelMatrix) * normal);');

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vWPos;
varying vec3 vWNorm;
uniform sampler2D grassMap;
uniform sampler2D dirtMap;
uniform sampler2D rockMap;
uniform sampler2D splatMap;
uniform float uSplatBound;
${GLSL_NOISE}
float terrRockW;
float terrGrassW;
float terrDirtW;
`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec2 splatUV = (vWPos.xz + uSplatBound) / (2.0 * uSplatBound);
  float inB = step(abs(vWPos.x), uSplatBound - 1.0) * step(abs(vWPos.z), uSplatBound - 1.0);
  float dirtMaskV = texture2D(splatMap, clamp(splatUV, 0.0, 1.0)).r * inB;

  float blendN = fbm(vWPos.xz * 0.33) - 0.5;
  float slopeV = vWNorm.y;
  float rockW = smoothstep(0.78, 0.60, slopeV + blendN * 0.08);
  float dirtW = dirtMaskV * (1.0 - rockW);
  dirtW = smoothstep(0.15, 0.75, dirtW + blendN * 0.18) * (1.0 - rockW);
  float grassW = max(1.0 - rockW - dirtW, 0.0);

  vec2 uvg = vWPos.xz * 0.42;
  vec3 grassCol = mix(texture2D(grassMap, uvg).rgb, texture2D(grassMap, uvg * 0.143 + 3.1).rgb, 0.5);
  vec2 uvd = vWPos.xz * 0.5;
  vec3 dirtCol = mix(texture2D(dirtMap, uvd).rgb, texture2D(dirtMap, uvd * 0.167 + 1.7).rgb, 0.45);

  vec3 an = abs(vWNorm);
  an = an / (an.x + an.y + an.z);
  float rs = 0.16;
  vec3 rockCol = texture2D(rockMap, vWPos.zy * rs).rgb * an.x
               + texture2D(rockMap, vWPos.xz * rs).rgb * an.y
               + texture2D(rockMap, vWPos.xy * rs).rgb * an.z;
  // larger-scale rock variation for distant mountains
  vec3 rockMacro = texture2D(rockMap, vWPos.xz * 0.012 + 0.31).rgb;
  rockCol = mix(rockCol, rockMacro * vec3(0.95, 0.97, 1.05), 0.45);

  vec3 col = grassCol * grassW + dirtCol * dirtW + rockCol * rockW;

  // macro tint kills tiling, adds painterly patches
  float macro = fbm(vWPos.xz * 0.016);
  col *= 0.84 + macro * 0.32;
  float dry = fbm(vWPos.xz * 0.006 + 19.3);
  col = mix(col, col * vec3(1.16, 1.04, 0.62), grassW * smoothstep(0.45, 0.78, dry) * 0.5);

  // snow on high peaks
  float snow = smoothstep(165.0, 235.0, vWPos.y) * smoothstep(0.52, 0.78, slopeV + fbm(vWPos.xz * 0.02) * 0.18);
  col = mix(col, vec3(0.80, 0.85, 0.94), snow);

  diffuseColor.rgb *= col;
  terrRockW = rockW;
  terrGrassW = grassW;
  terrDirtW = dirtW;
}
`)
      .replace('#include <roughnessmap_fragment>', `
float roughnessFactor = roughness;
roughnessFactor = terrGrassW * 0.95 + terrDirtW * 0.9 + terrRockW * 0.78;
roughnessFactor += (fbm(vWPos.xz * 0.9) - 0.5) * 0.12;
roughnessFactor = clamp(roughnessFactor, 0.05, 1.0);
`);
  };

  const geo = buildTerrainGeometry();
  const mesh = new THREE.Mesh(geo, material);
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.name = 'terrain';
  mesh.frustumCulled = false; // single huge mesh, always visible
  return mesh;
}
