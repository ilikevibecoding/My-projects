// ---------------------------------------------------------------------------
// vegetation.js — instanced jungle: palms, undergrowth and rocks scattered on
// the islands by height/slope. A handful of draw calls for hundreds of plants.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ISLANDS, terrainHeightAt, terrainGradientAt, jungleDensityAt } from './islandField.js';
import { mulberry32 } from './noise.js';

const TRUNK = new THREE.Color(0x7a5a38);
const TRUNK_D = new THREE.Color(0x5d4329);
const FROND_A = new THREE.Color(0x2f8f3c);
const FROND_B = new THREE.Color(0x57b54a);
const LEAF_DARK = new THREE.Color(0x256e30);
const CANOPY_A = new THREE.Color(0x1c4f24);
const CANOPY_B = new THREE.Color(0x39752f);
const COCONUT = new THREE.Color(0x4f3a22);
const ROCK_C = new THREE.Color(0x878073);

function colorize(geo, color, color2 = null, axis = 'y') {
  const pos = geo.getAttribute('position');
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    const v = axis === 'y' ? pos.getY(i) : pos.getX(i);
    min = Math.min(min, v);
    max = Math.max(max, v);
  }
  for (let i = 0; i < pos.count; i++) {
    const v = axis === 'y' ? pos.getY(i) : pos.getX(i);
    const t = (v - min) / (max - min || 1);
    c.copy(color);
    if (color2) c.lerp(color2, t);
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

/** A palm tree: bent trunk + radial drooping fronds + coconuts. */
function makePalmGeometry(rand, height) {
  const parts = [];
  const bend = 1.2 + rand() * 1.6;
  const bendDir = rand() * Math.PI * 2;
  const bx = Math.cos(bendDir);
  const bz = Math.sin(bendDir);

  // trunk: cylinder bent along a parabola
  const trunk = new THREE.CylinderGeometry(0.14, 0.26, height, 5, 6, true);
  trunk.translate(0, height / 2, 0);
  {
    const p = trunk.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      const t = p.getY(i) / height;
      p.setX(i, p.getX(i) + bx * bend * t * t);
      p.setZ(i, p.getZ(i) + bz * bend * t * t);
    }
  }
  parts.push(colorize(trunk, TRUNK_D, TRUNK));

  const topX = bx * bend;
  const topZ = bz * bend;

  // fronds: drooping strips arranged radially around the crown
  const nFronds = 7 + Math.floor(rand() * 3);
  for (let f = 0; f < nFronds; f++) {
    const frond = new THREE.PlaneGeometry(0.55, 3.0 + rand() * 1.2, 1, 4);
    frond.rotateX(-Math.PI / 2); // lie flat, length along -z .. +z
    const p = frond.getAttribute('position');
    const len = 3.0;
    for (let i = 0; i < p.count; i++) {
      const t = Math.max(0, p.getZ(i) + len / 2) / len; // 0 at base, 1 at tip
      p.setY(i, p.getY(i) - t * t * 2.0); // droop
      p.setX(i, p.getX(i) * (1 - t * 0.75)); // taper
    }
    colorize(frond, FROND_A, FROND_B, 'y');
    const a = (f / nFronds) * Math.PI * 2 + rand() * 0.5;
    frond.translate(0, 0, 0.5);
    frond.rotateZ((rand() - 0.5) * 0.25);
    frond.rotateY(a);
    frond.translate(topX, height + 0.25, topZ);
    parts.push(frond);
  }

  // coconuts
  for (let k = 0; k < 3; k++) {
    const nut = new THREE.SphereGeometry(0.16, 5, 4);
    const a = rand() * Math.PI * 2;
    nut.translate(topX + Math.cos(a) * 0.3, height - 0.1, topZ + Math.sin(a) * 0.3);
    parts.push(colorize(nut, COCONUT));
  }

  return mergeGeometries(parts);
}

/** Low leafy shrub: a couple of squashed blobs (reads well from any angle). */
function makeShrubGeometry(rand, scale) {
  const parts = [];
  const blobs = 2 + Math.floor(rand() * 2);
  for (let b = 0; b < blobs; b++) {
    const r = (0.55 + rand() * 0.5) * scale;
    // detail 0 (20 tris) is plenty for knee-high shrubs
    const blob = new THREE.IcosahedronGeometry(r, 0);
    const p = blob.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      const s = 0.8 + rand() * 0.4;
      p.setXYZ(i, p.getX(i) * s * 1.1, p.getY(i) * s * 0.55, p.getZ(i) * s * 1.1);
    }
    blob.computeVertexNormals();
    const a = rand() * Math.PI * 2;
    const d = b === 0 ? 0 : (0.4 + rand() * 0.5) * scale;
    blob.translate(Math.cos(a) * d, r * 0.4, Math.sin(a) * d);
    parts.push(colorize(blob, CANOPY_A, FROND_B));
  }
  return mergeGeometries(parts);
}

/** Undergrowth: a star of leafy planes. */
function makeBushGeometry(rand, scale, dark) {
  const parts = [];
  const blades = 6;
  for (let i = 0; i < blades; i++) {
    const w = (0.9 + rand() * 0.5) * scale;
    const h = (1.0 + rand() * 0.6) * scale;
    const leaf = new THREE.PlaneGeometry(w, h, 1, 2);
    const p = leaf.getAttribute('position');
    for (let v = 0; v < p.count; v++) {
      const t = (p.getY(v) / h + 0.5);
      p.setZ(v, t * t * 0.45 * scale); // curl outward
      p.setX(v, p.getX(v) * (1 - t * 0.55));
    }
    colorize(leaf, dark ? LEAF_DARK : FROND_A, FROND_B, 'y');
    leaf.translate(0, h * 0.42, 0.12 * scale);
    leaf.rotateX(-0.5 - rand() * 0.35);
    leaf.rotateY((i / blades) * Math.PI * 2 + rand());
    parts.push(leaf);
  }
  return mergeGeometries(parts);
}

/** Broadleaf jungle canopy tree: trunk + clustered leaf blobs. */
function makeCanopyTreeGeometry(rand, height) {
  const parts = [];
  const lean = (rand() - 0.5) * 0.8;
  const leanDir = rand() * Math.PI * 2;
  const lx = Math.cos(leanDir) * lean;
  const lz = Math.sin(leanDir) * lean;

  const trunk = new THREE.CylinderGeometry(0.22, 0.38, height, 6, 3);
  trunk.translate(0, height / 2, 0);
  {
    const p = trunk.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      const t = p.getY(i) / height;
      p.setX(i, p.getX(i) + lx * t * t * 2.2);
      p.setZ(i, p.getZ(i) + lz * t * t * 2.2);
    }
  }
  // IcosahedronGeometry blobs are non-indexed; merge requires consistency
  parts.push(colorize(trunk.toNonIndexed(), TRUNK_D, TRUNK));

  // canopy: wide, flattened, overlapping leaf masses (not "broccoli balls")
  const blobs = 3 + Math.floor(rand() * 2);
  for (let b = 0; b < blobs; b++) {
    const r = 2.1 + rand() * 1.6;
    const blob = new THREE.IcosahedronGeometry(r, 1);
    const p = blob.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      const s = 0.78 + rand() * 0.44;
      p.setXYZ(i, p.getX(i) * s * 1.15, p.getY(i) * s * 0.45, p.getZ(i) * s * 1.15);
    }
    blob.computeVertexNormals();
    const a = rand() * Math.PI * 2;
    const d = b === 0 ? 0 : 1.1 + rand() * 2.3;
    blob.translate(
      lx * 2.2 + Math.cos(a) * d,
      height - 0.5 + (rand() - 0.35) * 1.6,
      lz * 2.2 + Math.sin(a) * d
    );
    parts.push(colorize(blob, CANOPY_A, CANOPY_B));
  }
  return mergeGeometries(parts);
}

function makeRockGeometry(rand) {
  const rock = new THREE.IcosahedronGeometry(1, 1);
  const p = rock.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const s = 0.75 + rand() * 0.5;
    p.setXYZ(i, p.getX(i) * s, p.getY(i) * s * 0.7, p.getZ(i) * s);
  }
  rock.computeVertexNormals();
  return colorize(rock, ROCK_C, new THREE.Color(0x9d968a));
}

export function buildVegetation(scene, timeUniform) {
  const rand = mulberry32(4242);
  const grad = { x: 0, z: 0 };

  // --- gather placement points per kind
  const palmPts = [];
  const canopyPts = [];
  const bushPts = [];
  const rockPts = [];
  for (const isl of ISLANDS) {
    const nTry = Math.round((isl.r * isl.r) / 26);
    for (let i = 0; i < nTry; i++) {
      const a = rand() * Math.PI * 2;
      const r = Math.sqrt(rand()) * isl.r * 1.02;
      const x = isl.cx + Math.cos(a) * r;
      const z = isl.cz + Math.sin(a) * r;
      const y = terrainHeightAt(x, z);
      terrainGradientAt(x, z, grad);
      const slope = Math.hypot(grad.x, grad.z);
      const roll = rand();
      // same mask that darkens the ground; small islets get a floor so they
      // never end up completely bald
      const dens = Math.max(jungleDensityAt(x, z), isl.r < 140 ? 0.55 : 0);
      // canopy masses follow the density clusters; palms own the coast band;
      // undergrowth fills edges; rocks collect in clearings and beaches
      if (y > 3.0 && y < isl.height * 0.9 && slope < 0.66 && dens > 0.45 && roll < 0.55 * dens) {
        canopyPts.push({ x, y, z });
      } else if (y > 1.9 && y < 9 && slope < 0.55 && roll < 0.45) {
        palmPts.push({ x, y, z });
      } else if (y > 1.6 && slope < 0.75 && roll < 0.35 + dens * 0.3) {
        bushPts.push({ x, y, z });
      } else if (y > 0.35 && y < 6 && dens < 0.35 && roll < 0.55) {
        rockPts.push({ x, y, z });
      }
    }
  }

  const sets = [];

  // --- palms: 3 variants, sway in the wind via a shader patch
  const palmVariants = [
    makePalmGeometry(mulberry32(11), 7.5),
    makePalmGeometry(mulberry32(22), 9.5),
    makePalmGeometry(mulberry32(33), 11.0),
  ];
  const palmMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    flatShading: true,
    roughness: 1,
    side: THREE.DoubleSide,
    alphaTest: 0,
  });
  palmMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = timeUniform;
    shader.vertexShader =
      'uniform float uTime;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          vec3 instPos = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
          float phase = instPos.x * 0.31 + instPos.z * 0.27;
          float swayAmt = pow(max(transformed.y, 0.0) / 10.0, 2.0);
          transformed.x += sin(uTime * 1.15 + phase) * swayAmt * 0.55;
          transformed.z += cos(uTime * 0.93 + phase * 1.3) * swayAmt * 0.45;
        }`
      );
  };
  palmVariants.forEach((geo, vi) => {
    const pts = palmPts.filter((_, i) => i % palmVariants.length === vi);
    sets.push(makeInstances(geo, palmMat, pts, rand, { minS: 0.8, maxS: 1.35, tilt: 0.1, sink: 0.25 }));
  });

  // --- jungle canopy trees (2 variants)
  const canopyMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    flatShading: true,
    roughness: 1,
  });
  const canopyVariants = [makeCanopyTreeGeometry(mulberry32(77), 6.5), makeCanopyTreeGeometry(mulberry32(88), 8.5)];
  canopyVariants.forEach((geo, vi) => {
    const pts = canopyPts.filter((_, i) => i % canopyVariants.length === vi);
    sets.push(makeInstances(geo, canopyMat, pts, rand, { minS: 0.75, maxS: 1.5, tilt: 0.08, sink: 0.3 }));
  });

  // --- undergrowth: leafy shrubs (most) + fern stars (accents)
  const shrubGeo = makeShrubGeometry(mulberry32(66), 1.6);
  const fernGeo = makeBushGeometry(mulberry32(44), 1.2, false);
  const bushMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    flatShading: true,
    roughness: 1,
    side: THREE.DoubleSide,
  });
  const shrubPts = bushPts.filter((_, i) => i % 3 !== 2);
  const fernPts = bushPts.filter((_, i) => i % 3 === 2);
  sets.push(makeInstances(shrubGeo, bushMat, shrubPts, rand, { minS: 0.7, maxS: 1.6, tilt: 0.1, sink: 0.25 }));
  sets.push(makeInstances(fernGeo, bushMat, fernPts, rand, { minS: 0.7, maxS: 1.3, tilt: 0.12, sink: 0.1 }));

  // --- rocks
  const rockMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 });
  sets.push(makeInstances(makeRockGeometry(mulberry32(66)), rockMat, rockPts, rand, { minS: 0.5, maxS: 2.4, tilt: 0.4, sink: 0.4 }));

  let count = 0;
  for (const s of sets) {
    if (!s) continue;
    scene.add(s);
    count += s.count;
  }
  return { count };
}

function makeInstances(geo, mat, pts, rand, opt) {
  if (pts.length === 0) return null;
  const mesh = new THREE.InstancedMesh(geo, mat, pts.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const c = new THREE.Color();
  pts.forEach((pt, i) => {
    const scale = opt.minS + rand() * (opt.maxS - opt.minS);
    e.set((rand() - 0.5) * opt.tilt * 2, rand() * Math.PI * 2, (rand() - 0.5) * opt.tilt * 2);
    q.setFromEuler(e);
    s.setScalar(scale);
    p.set(pt.x, pt.y - opt.sink, pt.z);
    m.compose(p, q, s);
    mesh.setMatrixAt(i, m);
    // subtle per-instance tint so foliage doesn't look copy-pasted
    const b = 0.82 + rand() * 0.3;
    c.setRGB(b * (0.94 + rand() * 0.12), b, b * (0.92 + rand() * 0.1));
    mesh.setColorAt(i, c);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
