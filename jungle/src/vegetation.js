// Vegetation: thousands of GPU-instanced plants, all swaying in TSL wind.

import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  time,
  positionLocal,
  vec3,
  sin,
  cos,
  float,
  hash,
  instanceIndex,
  mix,
  texture,
} from 'three/tsl';
import { WORLD } from './config.js';
import { mulberry32 } from './noise.js';
import { riverCenterX } from './terrain.js';

const TAU = Math.PI * 2;

// ---------- TSL wind ----------
// Sway amplitude grows with local height (or hang depth), every instance gets
// its own phase + direction from its index hash.
function applyWind(material, { strength = 0.16, speed = 1.1, heightRef = 3, pivotTop = false, heightPow = 1.4, uniform = false } = {}) {
  const phase = hash(instanceIndex).mul(TAU);
  const t = time.mul(speed).add(phase);
  const gust = sin(t)
    .add(sin(t.mul(1.71).add(1.3)).mul(0.5))
    .add(sin(t.mul(3.13).add(2.2)).mul(0.27));

  let heightFactor;
  if (uniform) {
    heightFactor = float(1);
  } else {
    const rawFactor = pivotTop
      ? positionLocal.y.negate().div(heightRef)
      : positionLocal.y.div(heightRef);
    heightFactor = rawFactor.clamp(0, 1).pow(heightPow);
  }

  const sway = gust.mul(strength).mul(heightFactor);
  const dir = hash(instanceIndex.add(77)).mul(TAU);
  material.positionNode = positionLocal.add(vec3(sway.mul(cos(dir)), 0, sway.mul(sin(dir))));
}

function foliageMaterial(map, { roughness = 0.85, tintSpread = 0.14 } = {}) {
  const material = new THREE.MeshStandardNodeMaterial({
    map,
    side: THREE.FrontSide, // geometry carries a flipped-winding copy instead
    roughness,
    metalness: 0,
    alphaTest: 0.45,
  });
  // Per-instance brightness/green variation so fields never look copy-pasted.
  const brightness = mix(float(1 - tintSpread), float(1 + tintSpread), hash(instanceIndex.add(123)));
  const greenShift = mix(float(1 - tintSpread * 0.6), float(1 + tintSpread * 0.6), hash(instanceIndex.add(321)));
  const mapColor = texture(map);
  material.colorNode = mapColor.rgb.mul(vec3(brightness, brightness.mul(greenShift), brightness));
  material.opacityNode = mapColor.a;
  return material;
}

// ---------- geometry helpers ----------

// Foliage cards: soften normals toward straight-up (so leaves take light like
// the ground does), then bake a flipped-winding copy so both sides render as
// front faces with the authored normals — no dark backfaces, no DoubleSide.
function prepareFoliage(geometry, upFactor = 0.7) {
  const normal = geometry.attributes.normal;
  for (let i = 0; i < normal.count; i += 1) {
    const nx = normal.getX(i) * (1 - upFactor);
    const ny = Math.abs(normal.getY(i)) * (1 - upFactor) + upFactor;
    const nz = normal.getZ(i) * (1 - upFactor);
    const len = Math.hypot(nx, ny, nz) || 1;
    normal.setXYZ(i, nx / len, ny / len, nz / len);
  }
  normal.needsUpdate = true;

  const flipped = geometry.clone();
  if (flipped.index) {
    const idx = flipped.index.array;
    for (let i = 0; i < idx.length; i += 3) {
      const tmp = idx[i + 1];
      idx[i + 1] = idx[i + 2];
      idx[i + 2] = tmp;
    }
    flipped.index.needsUpdate = true;
  }
  const merged = mergeGeometries([geometry, flipped]);
  geometry.dispose();
  flipped.dispose();
  return merged;
}

// Card bent along its height (pivot at y=0, +y up).
function bentCard(width, height, bend = 0.35, lengthSegments = 5) {
  const geometry = new THREE.PlaneGeometry(width, height, 1, lengthSegments);
  geometry.translate(0, height / 2, 0);
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i += 1) {
    const y = pos.getY(i);
    const t = y / height;
    pos.setZ(i, pos.getZ(i) + Math.sin(t * Math.PI * 0.5) * bend * height);
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

// N cards fanned radially around the pivot.
function radialCards(cardBuilder, count, { startTilt = 0.5, tiltJitter = 0.25, yawJitter = 0.4, seed = 1 } = {}) {
  const random = mulberry32(seed);
  const parts = [];
  for (let i = 0; i < count; i += 1) {
    const card = cardBuilder(i);
    const yaw = (i / count) * TAU + (random() - 0.5) * yawJitter;
    card.rotateX(startTilt + (random() - 0.5) * tiltJitter);
    card.rotateY(yaw);
    parts.push(card);
  }
  const merged = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  return merged;
}

// Crossed quads (for canopies / grass).
function crossedCards(width, height, cards = 2, horizontalCap = false) {
  const parts = [];
  for (let i = 0; i < cards; i += 1) {
    const plane = new THREE.PlaneGeometry(width, height);
    plane.rotateY((i / cards) * Math.PI);
    parts.push(plane);
  }
  if (horizontalCap) {
    const cap = new THREE.PlaneGeometry(width, width);
    cap.rotateX(-Math.PI / 2);
    cap.translate(0, height * 0.22, 0);
    parts.push(cap);
  }
  const merged = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  return merged;
}

// Curved palm trunk: cylinder bent toward +x, pivot at base. Tip ≈ (2.1, 9, 0).
function palmTrunkGeometry() {
  const height = 9;
  const geometry = new THREE.CylinderGeometry(0.16, 0.34, height, 7, 8);
  geometry.translate(0, height / 2, 0);
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i += 1) {
    const y = pos.getY(i);
    const t = y / height;
    pos.setX(i, pos.getX(i) + t * t * 2.1);
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

// Gnarled jungle-tree trunk, pivot at base, height 12.
function canopyTrunkGeometry() {
  const height = 12;
  const geometry = new THREE.CylinderGeometry(0.38, 0.95, height, 8, 6);
  geometry.translate(0, height / 2, 0);
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i += 1) {
    const y = pos.getY(i);
    const wobble = Math.sin(y * 1.7) * 0.16;
    pos.setX(i, pos.getX(i) * (1 + Math.sin(y * 0.9) * 0.12) + wobble);
    pos.setZ(i, pos.getZ(i) * (1 + Math.cos(y * 1.1) * 0.12));
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

// ---------- the vegetation system ----------

export function createVegetation(ctx) {
  const { scene, terrain, textures } = ctx;
  const random = mulberry32(WORLD.seed + 99);
  const half = WORLD.size / 2 - 8;
  const lagoon = WORLD.lagoonCenter;

  const dummy = new THREE.Object3D();
  const meshes = [];
  const categories = [];

  function nearSpawn(x, z) {
    return Math.hypot(x - WORLD.spawn.x, z - WORLD.spawn.z) < 7;
  }

  function distToLagoon(x, z) {
    return Math.hypot(x - lagoon.x, z - lagoon.z);
  }

  function distToRiver(x, z) {
    if (z < lagoon.z) {
      return Infinity;
    }
    return Math.abs(x - riverCenterX(z));
  }

  // Generic scatter with rejection rules. Understory concentrates in the
  // explorable core (centerHalf) — trees may roam the full map for skyline.
  function scatter(count, rules = {}) {
    const placements = [];
    const areaHalf = rules.areaHalf ?? 150;
    const cx = rules.centerX ?? 0;
    const cz = rules.centerZ ?? -10;
    let tries = 0;
    const maxTries = count * 60;
    while (placements.length < count && tries < maxTries) {
      tries += 1;
      let x;
      let z;
      if (rules.fullMap || random() < 0.18) {
        x = (random() * 2 - 1) * half;
        z = (random() * 2 - 1) * half;
      } else {
        x = cx + (random() * 2 - 1) * areaHalf;
        z = cz + (random() * 2 - 1) * areaHalf;
      }
      if (Math.abs(x) > half || Math.abs(z) > half) continue;
      const h = terrain.sampleHeight(x, z);
      if (h < (rules.minHeight ?? 0.7)) continue;
      if (h > (rules.maxHeight ?? Infinity)) continue;
      if (nearSpawn(x, z)) continue;
      const normal = terrain.sampleNormal(x, z);
      if (normal.y < (rules.minNormalY ?? 0.72)) continue;
      if (rules.shoreline) {
        const nearLagoonShore = Math.abs(distToLagoon(x, z) - (WORLD.lagoonRadius + 5)) < 17;
        const nearRiverShore = Math.abs(distToRiver(x, z) - (WORLD.riverHalfWidth + 6)) < 11;
        if (!nearLagoonShore && !nearRiverShore) continue;
      }
      if (rules.accept && !rules.accept(x, z, h)) continue;
      placements.push({ x, y: h, z });
    }
    return placements;
  }

  function register(mesh, { castShadow = false } = {}) {
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false; // instances span the map; skip whole-mesh culling
    scene.add(mesh);
    meshes.push(mesh);
    categories.push({ mesh, maxCount: mesh.count });
    return mesh;
  }

  function buildSimple({ name, geometry, material, placements, scaleRange = [0.8, 1.3], yJitter = 0.25, sink = 0.05, castShadow = false, randomTilt = 0 }) {
    const mesh = new THREE.InstancedMesh(geometry, material, placements.length);
    mesh.name = name;
    placements.forEach((p, i) => {
      const s = scaleRange[0] + random() * (scaleRange[1] - scaleRange[0]);
      dummy.position.set(p.x, p.y - sink, p.z);
      dummy.rotation.set(
        randomTilt ? (random() - 0.5) * randomTilt : 0,
        random() * TAU,
        randomTilt ? (random() - 0.5) * randomTilt : 0
      );
      dummy.scale.set(s, s * (1 + (random() - 0.5) * yJitter), s);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    return register(mesh, { castShadow });
  }

  // ============ canopy trees (trunk + crown clusters share per-tree scale) ============
  const treePlacements = scatter(330, {
    minHeight: 1.1,
    minNormalY: 0.72,
    fullMap: true,
    accept: (x, z) => distToLagoon(x, z) > WORLD.lagoonRadius + 9 && distToRiver(x, z) > WORLD.riverHalfWidth + 8,
  });

  const trunkMat = new THREE.MeshStandardNodeMaterial({ map: textures.bark, roughness: 0.95 });
  const treeTrunks = new THREE.InstancedMesh(canopyTrunkGeometry(), trunkMat, treePlacements.length);
  treeTrunks.name = 'tree-trunks';

  const clusterTransforms = [];
  treePlacements.forEach((p, i) => {
    const s = 0.75 + random() * 0.85; // tree height 9–19 m
    dummy.position.set(p.x, p.y - 0.35, p.z);
    dummy.rotation.set(0, random() * TAU, 0);
    dummy.scale.set(s * (0.85 + random() * 0.3), s, s * (0.85 + random() * 0.3));
    dummy.updateMatrix();
    treeTrunks.setMatrixAt(i, dummy.matrix);

    // crown: a dome of leaf-card clusters sitting on the trunk top
    const crownY = p.y - 0.35 + 11.4 * s;
    const clusters = 6 + Math.floor(random() * 3);
    for (let c = 0; c < clusters; c += 1) {
      const angle = random() * TAU;
      const radius = Math.pow(random(), 0.7) * 4.4 * s;
      clusterTransforms.push({
        x: p.x + Math.cos(angle) * radius,
        y: crownY + (random() - 0.5) * 2.4 - radius * 0.42,
        z: p.z + Math.sin(angle) * radius,
        s: (0.85 + random() * 0.7) * s,
      });
    }
  });
  register(treeTrunks, { castShadow: true });

  const clusterGeo = prepareFoliage(crossedCards(7.2, 5.4, 3, true), 0.62);
  const clusterMats = [foliageMaterial(textures.canopy), foliageMaterial(textures.canopyB)];
  applyWind(clusterMats[0], { strength: 0.4, speed: 0.5, uniform: true });
  applyWind(clusterMats[1], { strength: 0.45, speed: 0.45, uniform: true });

  clusterMats.forEach((mat, half) => {
    const list = clusterTransforms.filter((_, i) => i % 2 === half);
    const mesh = new THREE.InstancedMesh(clusterGeo, mat, list.length);
    mesh.name = `tree-canopy-${half}`;
    list.forEach((t, i) => {
      dummy.position.set(t.x, t.y, t.z);
      dummy.rotation.set((random() - 0.5) * 0.4, random() * TAU, (random() - 0.5) * 0.4);
      dummy.scale.set(t.s, t.s * (0.8 + random() * 0.3), t.s);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    register(mesh, { castShadow: true });
  });

  // ============ palms (shoreline) ============
  const palmPlacements = scatter(120, {
    minHeight: 0.55,
    maxHeight: 3.4,
    minNormalY: 0.8,
    shoreline: true,
    fullMap: true,
  });

  const palmTrunkMat = new THREE.MeshStandardNodeMaterial({ map: textures.palmBark, roughness: 0.92 });
  applyWind(palmTrunkMat, { strength: 0.12, speed: 0.7, heightRef: 9, heightPow: 2 });
  const frondGeo = prepareFoliage(
    radialCards(() => bentCard(1.5, 4.6, 0.5), 9, { startTilt: 0.66, tiltJitter: 0.5, yawJitter: 0.5, seed: 7 }),
    0.55
  );
  const frondMat = foliageMaterial(textures.palmFrond);
  applyWind(frondMat, { strength: 0.34, speed: 0.85, heightRef: 4.4, heightPow: 1.2 });

  const palmTrunks = new THREE.InstancedMesh(palmTrunkGeometry(), palmTrunkMat, palmPlacements.length);
  const palmHeads = new THREE.InstancedMesh(frondGeo, frondMat, palmPlacements.length);
  palmTrunks.name = 'palm-trunks';
  palmHeads.name = 'palm-heads';
  palmPlacements.forEach((p, i) => {
    const s = 0.7 + random() * 0.55;
    const yaw = random() * TAU;

    dummy.position.set(p.x, p.y - 0.25, p.z);
    dummy.rotation.set(0, yaw, 0);
    dummy.scale.setScalar(s);
    dummy.updateMatrix();
    palmTrunks.setMatrixAt(i, dummy.matrix);

    // trunk tip (2.1, 8.8, 0) rotated by yaw → world offset (cos·2.1, 8.8, -sin·2.1)
    dummy.position.set(
      p.x + Math.cos(yaw) * 2.05 * s,
      p.y - 0.25 + 8.75 * s,
      p.z - Math.sin(yaw) * 2.05 * s
    );
    dummy.rotation.set(0, random() * TAU, 0);
    dummy.scale.setScalar(s * 1.05);
    dummy.updateMatrix();
    palmHeads.setMatrixAt(i, dummy.matrix);
  });
  register(palmTrunks, { castShadow: true });
  register(palmHeads, { castShadow: true });

  // ============ ferns ============
  const fernGeo = prepareFoliage(
    radialCards(() => bentCard(0.9, 1.5, 0.55), 7, { startTilt: 0.8, tiltJitter: 0.4, seed: 11 }),
    0.6
  );
  const fernMat = foliageMaterial(textures.fern);
  applyWind(fernMat, { strength: 0.09, speed: 1.4, heightRef: 1.3 });
  buildSimple({
    name: 'ferns',
    geometry: fernGeo,
    material: fernMat,
    placements: scatter(2400, { minHeight: 0.75, minNormalY: 0.62 }),
    scaleRange: [0.55, 1.6],
  });

  // ============ banana / broadleaf plants ============
  const bananaGeo = prepareFoliage(
    radialCards(() => bentCard(1.5, 3.0, 0.6), 6, { startTilt: 0.55, tiltJitter: 0.5, seed: 13 }),
    0.6
  );
  const bananaMat = foliageMaterial(textures.bananaLeaf);
  applyWind(bananaMat, { strength: 0.15, speed: 1.0, heightRef: 2.6 });
  buildSimple({
    name: 'banana-plants',
    geometry: bananaGeo,
    material: bananaMat,
    placements: scatter(650, { minHeight: 0.7, minNormalY: 0.68 }),
    scaleRange: [0.6, 1.5],
    castShadow: true,
  });

  // ============ grass ============
  const grassGeoBase = crossedCards(1.15, 0.85, 2);
  grassGeoBase.translate(0, 0.4, 0);
  const grassGeo = prepareFoliage(grassGeoBase, 0.78);
  const grassMat = foliageMaterial(textures.grassBlade);
  applyWind(grassMat, { strength: 0.13, speed: 1.7, heightRef: 0.8 });
  buildSimple({
    name: 'grass',
    geometry: grassGeo,
    material: grassMat,
    placements: scatter(13000, { minHeight: 0.6, minNormalY: 0.58 }),
    scaleRange: [0.65, 1.7],
    sink: 0.12,
  });

  // ============ flowers ============
  const flowerGeoBase = crossedCards(0.85, 0.85, 2);
  flowerGeoBase.translate(0, 0.42, 0);
  const flowerGeo = prepareFoliage(flowerGeoBase, 0.7);
  const flowerMats = [foliageMaterial(textures.flower), foliageMaterial(textures.flowerB)];
  applyWind(flowerMats[0], { strength: 0.07, speed: 1.5, heightRef: 0.8 });
  applyWind(flowerMats[1], { strength: 0.07, speed: 1.6, heightRef: 0.8 });
  const flowerSpots = scatter(460, { minHeight: 0.65, minNormalY: 0.7 });
  flowerMats.forEach((mat, half) => {
    buildSimple({
      name: `flowers-${half}`,
      geometry: flowerGeo,
      material: mat,
      placements: flowerSpots.filter((_, i) => i % 2 === half),
      scaleRange: [0.6, 1.1],
    });
  });

  // ============ hanging vines ============
  // Pivot at top (y: 0 → -6) so wind makes them swing from the branch.
  const vineGeoBase = new THREE.PlaneGeometry(0.55, 6, 1, 6);
  vineGeoBase.translate(0, -3, 0);
  vineGeoBase.computeVertexNormals();
  const vineGeo = prepareFoliage(vineGeoBase, 0.55);
  const vineMat = foliageMaterial(textures.vine);
  applyWind(vineMat, { strength: 0.4, speed: 0.55, heightRef: 6, pivotTop: true, heightPow: 1.6 });
  const vinePlacements = [];
  for (const t of clusterTransforms) {
    if (random() < 0.14 && vinePlacements.length < 260) {
      vinePlacements.push({ x: t.x, y: t.y + 1.0, z: t.z });
    }
  }
  buildSimple({
    name: 'vines',
    geometry: vineGeo,
    material: vineMat,
    placements: vinePlacements,
    scaleRange: [0.6, 1.25],
    sink: 0,
  });

  // ---------- quality scaling ----------
  function applyQuality(preset) {
    for (const { mesh, maxCount } of categories) {
      const density = mesh.name === 'grass' ? preset.grassDensity : preset.vegetationDensity;
      mesh.count = Math.max(1, Math.round(maxCount * density));
    }
    for (const mesh of meshes) {
      if (mesh.material.map) {
        mesh.material.map.anisotropy = preset.anisotropy;
      }
    }
  }

  return {
    meshes,
    applyQuality,
    update() {},
  };
}
