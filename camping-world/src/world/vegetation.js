import * as THREE from 'three';
import { makeRng } from './noise.js';

/**
 * Tree & understory placement.
 *
 * - Near field (r ≲ 62m): cloned photoscan trees with full shadows + colliders.
 * - Backdrop ring (r 64–115m): instanced copies, no shadow cast — they close
 *   the horizon and read through the haze.
 * - Understory: instanced shrubs/ferns/nettles clustered near trunks and the
 *   clearing edge; dandelions sprinkled through the meadow.
 *
 * All placement is seeded/deterministic.
 */

const WIND_UNIFORM = { value: 0 };
export function setVegetationTime(t) {
  WIND_UNIFORM.value = t;
}

function prepFoliageMaterial(mat) {
  if (!mat) return;
  const hasAlpha = mat.transparent || mat.alphaTest > 0;
  if (hasAlpha) {
    mat.transparent = false;
    mat.alphaTest = 0.45;
    mat.depthWrite = true;
    mat.side = THREE.DoubleSide;
    // leaves picking up the blue sky dome as gloss reads glaucous/plastic —
    // matte them out and damp env reflections (diffuse IBL still applies)
    mat.roughness = Math.max(mat.roughness ?? 1, 0.85);
    mat.envMapIntensity = 0.55;
  }
  // subtle wind sway for alpha foliage
  if (hasAlpha) {
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = WIND_UNIFORM;
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
           uniform float uTime;`
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
           {
             #ifdef USE_INSTANCING
               vec3 wpos = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
             #else
               vec3 wpos = (modelMatrix * vec4(transformed, 1.0)).xyz;
             #endif
             float sway = sin(uTime * 1.4 + wpos.x * 0.35 + wpos.z * 0.27) *
                          sin(uTime * 0.9 + wpos.z * 0.5);
             float amp = smoothstep(0.4, 4.0, transformed.y) * 0.035;
             transformed.x += sway * amp;
             transformed.z += cos(uTime * 1.1 + wpos.x * 0.4) * amp * 0.6;
           }`
        );
    };
  }
}

export function prepareModel(root, { shadows = true } = {}) {
  root.traverse((n) => {
    if (n.isMesh) {
      n.castShadow = shadows;
      n.receiveShadow = true;
      const mats = Array.isArray(n.material) ? n.material : [n.material];
      mats.forEach(prepFoliageMaterial);
    }
  });
  return root;
}

// Tree type registry: scale ranges + collider trunk radius + plinth sink (m)
const TREE_SCALES = {
  island_tree_01: { scale: [1.5, 1.9], trunk: 0.5, sink: 0.22 },
  island_tree_02: { scale: [1.5, 2.0], trunk: 0.4, sink: 0.2 },
  tree_small_02: { scale: [1.6, 2.4], trunk: 0.3, sink: 0.18 },
  searsia_lucida: { scale: [1.0, 1.4], trunk: 0.3, sink: 0.18 },
  fir_sapling: { scale: [1.2, 1.8], trunk: 0.15, sink: 0.12 },
};
const TREE_TYPES = {};
for (const [id, cfg] of Object.entries(TREE_SCALES)) {
  TREE_TYPES[id] = cfg;
  TREE_TYPES[`${id}_hero`] = cfg;
  TREE_TYPES[`${id}_mid`] = cfg;
  TREE_TYPES[`${id}_far`] = cfg;
}

// keep a corridor toward the low sun so golden light rakes the campsite
import { SUN_AZIMUTH_DEG } from './sky.js';
const SUN_AZ = (SUN_AZIMUTH_DEG * Math.PI) / 180;
function inSunCorridor(x, z, halfWidth = 0.38) {
  const a = Math.atan2(x, z); // matches sky.js: x = sin(az), z = cos(az)
  let d = Math.abs(a - SUN_AZ);
  if (d > Math.PI) d = Math.PI * 2 - d;
  return d < halfWidth;
}

export function buildVegetation(scene, models, getHeight) {
  const rng = makeRng(4242);
  const colliders = [];
  const placed = []; // {x, z, r} for spacing
  const group = new THREE.Group();
  group.name = 'vegetation';

  function tryPlace(minR, maxR, spacing, tries = 40) {
    for (let i = 0; i < tries; i++) {
      const a = rng() * Math.PI * 2;
      const r = minR + (maxR - minR) * Math.sqrt(rng());
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (placed.every((p) => Math.hypot(p.x - x, p.z - z) > spacing + p.r)) {
        return { x, z };
      }
    }
    return null;
  }

  function addTree(typeId, x, z, { shadows = true, scaleMul = 1 } = {}) {
    const type = TREE_TYPES[typeId];
    const src = models[typeId];
    if (!src) return;
    const obj = src.scene.clone(true);
    const s = (type.scale[0] + rng() * (type.scale[1] - type.scale[0])) * scaleMul;
    obj.scale.setScalar(s);
    obj.rotation.y = rng() * Math.PI * 2;
    obj.position.set(x, getHeight(x, z) - type.sink * s, z);
    prepareModel(obj, { shadows });
    group.add(obj);
    placed.push({ x, z, r: 2.5 * s });
    colliders.push({ x, z, radius: type.trunk * s });
    return obj;
  }

  // --- hero trees framing the campsite (dense-canopy hero LODs) ---
  addTree('island_tree_01_hero', -8.5, -6.5);
  addTree('tree_small_02_hero', 10.5, -11);
  addTree('searsia_lucida', -13, 12);

  // --- sparse mid-field singles (keep the clearing open) ---
  const midTypes = ['tree_small_02', 'searsia_lucida', 'island_tree_02', 'fir_sapling'];
  for (let i = 0; i < 7; i++) {
    const spot = tryPlace(20, 36, 11);
    if (spot) addTree(midTypes[Math.floor(rng() * midTypes.length)], spot.x, spot.z);
  }

  // --- clearing edge: denser mixed band (mid-LOD — silhouettes read at 38m+) ---
  const edgeTypes = ['island_tree_01_mid', 'island_tree_02_mid', 'tree_small_02_mid', 'tree_small_02_mid', 'searsia_lucida_mid', 'fir_sapling_mid'];
  for (let i = 0; i < 42; i++) {
    const spot = tryPlace(38, 62, 6.5);
    if (!spot) continue;
    if (inSunCorridor(spot.x, spot.z) && rng() < 0.7) continue; // sun corridor
    addTree(edgeTypes[Math.floor(rng() * edgeTypes.length)], spot.x, spot.z);
  }

  // --- backdrop treeline ring (instanced far-LODs, no shadows, hazy) ---
  // two staggered rows so the horizon is a continuous wall of canopy
  const ringTypes = ['island_tree_02_far', 'tree_small_02_far'];
  const ringSpots = [];
  for (let i = 0; i < 240; i++) {
    const a = (i / 240) * Math.PI * 2 + rng() * 0.05;
    // three staggered rows: 64–78, 80–98, and a tall outer row riding the
    // raised ridge (100–130) — together they wall off the horizon haze band
    const row = i % 3;
    const r = row === 0 ? 64 + rng() * 14 : row === 1 ? 80 + rng() * 18 : 100 + rng() * 30;
    // corridor stays open only in the near ring — distant hazy treeline still
    // closes the horizon behind the sun gap (no bald-sand horizon)
    if (r < 80 && inSunCorridor(Math.cos(a) * r, Math.sin(a) * r, 0.2) && rng() < 0.55) continue;
    ringSpots.push({
      a,
      r,
      type: ringTypes[Math.floor(rng() * ringTypes.length)],
      s: row === 2 ? 3.0 + rng() * 1.8 : 2.4 + rng() * 1.5,
      rot: rng() * Math.PI * 2,
    });
  }
  for (const typeId of ringTypes) {
    const spots = ringSpots.filter((sp) => sp.type === typeId);
    const src = models[typeId];
    if (!src || spots.length === 0) continue;
    src.scene.updateMatrixWorld(true);
    src.scene.traverse((n) => {
      if (!n.isMesh) return;
      const im = new THREE.InstancedMesh(n.geometry, n.material, spots.length);
      im.castShadow = false;
      im.receiveShadow = false;
      const m = new THREE.Matrix4();
      const place = new THREE.Matrix4();
      spots.forEach((sp, idx) => {
        const x = Math.cos(sp.a) * sp.r;
        const z = Math.sin(sp.a) * sp.r;
        place.compose(
          new THREE.Vector3(x, getHeight(x, z) - 0.3 * sp.s, z),
          new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), sp.rot),
          new THREE.Vector3(sp.s, sp.s, sp.s)
        );
        m.multiplyMatrices(place, n.matrixWorld);
        im.setMatrixAt(idx, m);
      });
      im.instanceMatrix.needsUpdate = true;
      const mats = Array.isArray(im.material) ? im.material : [im.material];
      mats.forEach(prepFoliageMaterial);
      group.add(im);
    });
  }

  // --- understory: shrubs / ferns / nettles near trees & clearing edge ---
  const underTypes = [
    { id: 'shrub_02', count: 30, minR: 18, maxR: 58, scale: [0.8, 1.4], sink: 0.06 },
    { id: 'shrub_03', count: 24, minR: 16, maxR: 58, scale: [0.8, 1.5], sink: 0.06 },
    { id: 'fern_02', count: 30, minR: 12, maxR: 50, scale: [0.9, 1.6], sink: 0.04 },
    { id: 'nettle_plant', count: 12, minR: 14, maxR: 45, scale: [0.7, 1.1], sink: 0.04 },
    { id: 'dandelion_01', count: 36, minR: 4, maxR: 30, scale: [0.6, 1.0], sink: 0.03 },
    { id: 'shrub_01', count: 12, minR: 26, maxR: 60, scale: [0.9, 1.5], sink: 0.08 },
  ];
  for (const u of underTypes) {
    const src = models[u.id];
    if (!src) continue;
    src.scene.updateMatrixWorld(true);
    const spots = [];
    for (let i = 0; i < u.count; i++) {
      const a = rng() * Math.PI * 2;
      const r = u.minR + (u.maxR - u.minR) * Math.sqrt(rng());
      spots.push({
        x: Math.cos(a) * r,
        z: Math.sin(a) * r,
        s: u.scale[0] + rng() * (u.scale[1] - u.scale[0]),
        rot: rng() * Math.PI * 2,
      });
    }
    src.scene.traverse((n) => {
      if (!n.isMesh) return;
      const im = new THREE.InstancedMesh(n.geometry, n.material, spots.length);
      im.castShadow = true;
      im.receiveShadow = true;
      const m = new THREE.Matrix4();
      const place = new THREE.Matrix4();
      spots.forEach((sp, idx) => {
        place.compose(
          new THREE.Vector3(sp.x, getHeight(sp.x, sp.z) - u.sink * sp.s, sp.z),
          new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), sp.rot),
          new THREE.Vector3(sp.s, sp.s, sp.s)
        );
        m.multiplyMatrices(place, n.matrixWorld);
        im.setMatrixAt(idx, m);
      });
      im.instanceMatrix.needsUpdate = true;
      const mats = Array.isArray(im.material) ? im.material : [im.material];
      mats.forEach(prepFoliageMaterial);
      group.add(im);
    });
  }

  scene.add(group);
  return { group, colliders };
}
