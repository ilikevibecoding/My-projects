// ---------------------------------------------------------------------------
// vegetation.js — instanced jungle: palms, undergrowth and rocks scattered on
// the islands by height/slope. A handful of draw calls for hundreds of plants.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ISLANDS, terrainHeightAt, terrainGradientAt } from './islandField.js';
import { mulberry32 } from './noise.js';

const TRUNK = new THREE.Color(0x7a5a38);
const TRUNK_D = new THREE.Color(0x5d4329);
const FROND_A = new THREE.Color(0x2f8f3c);
const FROND_B = new THREE.Color(0x57b54a);
const LEAF_DARK = new THREE.Color(0x256e30);
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
  const bushPts = [];
  const rockPts = [];
  for (const isl of ISLANDS) {
    const nTry = Math.round((isl.r * isl.r) / 55);
    for (let i = 0; i < nTry; i++) {
      const a = rand() * Math.PI * 2;
      const r = Math.sqrt(rand()) * isl.r * 1.02;
      const x = isl.cx + Math.cos(a) * r;
      const z = isl.cz + Math.sin(a) * r;
      const y = terrainHeightAt(x, z);
      terrainGradientAt(x, z, grad);
      const slope = Math.hypot(grad.x, grad.z);
      const roll = rand();
      if (y > 1.9 && y < isl.height * 0.8 && slope < 0.55 && roll < 0.42) {
        palmPts.push({ x, y, z });
      } else if (y > 1.6 && slope < 0.7 && roll < 0.78) {
        bushPts.push({ x, y, z });
      } else if (y > 0.35 && y < 5 && roll < 0.92) {
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

  // --- undergrowth
  const bushGeoA = makeBushGeometry(mulberry32(44), 1.6, false);
  const bushGeoB = makeBushGeometry(mulberry32(55), 2.6, true);
  const bushMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    flatShading: true,
    roughness: 1,
    side: THREE.DoubleSide,
  });
  const bushA = bushPts.filter((_, i) => i % 2 === 0);
  const bushB = bushPts.filter((_, i) => i % 2 === 1);
  sets.push(makeInstances(bushGeoA, bushMat, bushA, rand, { minS: 0.7, maxS: 1.5, tilt: 0.12, sink: 0.1 }));
  sets.push(makeInstances(bushGeoB, bushMat, bushB, rand, { minS: 0.7, maxS: 1.4, tilt: 0.12, sink: 0.1 }));

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
  pts.forEach((pt, i) => {
    const scale = opt.minS + rand() * (opt.maxS - opt.minS);
    e.set((rand() - 0.5) * opt.tilt * 2, rand() * Math.PI * 2, (rand() - 0.5) * opt.tilt * 2);
    q.setFromEuler(e);
    s.setScalar(scale);
    p.set(pt.x, pt.y - opt.sink, pt.z);
    m.compose(p, q, s);
    mesh.setMatrixAt(i, m);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
