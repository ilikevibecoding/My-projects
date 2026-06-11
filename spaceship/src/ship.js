// Ship interior: geometry kit-bash, PBR materials, lights, colliders, interactables.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  makeHullMaps, makeMetalMaps, makeFloorMaps, makeFabricMaps,
  makeGrateMaps, makeHazardMap, makeScreenMap, mulberry32,
} from './textures.js';

const E = new THREE.Euler();
const Q = new THREE.Quaternion();
const V = new THREE.Vector3();
const ONE = new THREE.Vector3(1, 1, 1);
const M = new THREE.Matrix4();

class Batch {
  constructor() { this.byMat = new Map(); }
  add(mat, geo) {
    if (geo.index) {
      const ni = geo.toNonIndexed();
      geo.dispose();
      geo = ni;
    }
    if (!this.byMat.has(mat)) this.byMat.set(mat, []);
    this.byMat.get(mat).push(geo);
  }
  build(group) {
    for (const [mat, geos] of this.byMat) {
      const merged = mergeGeometries(geos, false);
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = !mat.transparent;
      mesh.receiveShadow = true;
      group.add(mesh);
      for (const g of geos) g.dispose();
    }
  }
}

// Scale BoxGeometry per-face UVs to uniform world texel density.
function uvBoxWorld(g, w, h, d, su, sv, ou = 0, ov = 0) {
  const uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    const [du, dv] = dims[f];
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, uv.getX(i) * du * su + ou, uv.getY(i) * dv * sv + ov);
    }
  }
  uv.needsUpdate = true;
}

function uvScale(g, su, sv, ou = 0, ov = 0) {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) * su + ou, uv.getY(i) * sv + ov);
  }
  uv.needsUpdate = true;
}

export function buildShip(scene, rand) {
  const group = new THREE.Group();
  const colliders = [];
  const interactables = [];
  const lights = [];          // { light, day, night }
  const emissives = [];       // { mat, day, night }
  const batch = new Batch();

  // ---------------------------------------------------------------- materials
  const hull = makeHullMaps(rand);
  const hullLower = makeHullMaps(mulberry32((rand() * 0xffffffff) >>> 0), { base: [40, 8, 0.40] });
  const metal = makeMetalMaps(rand);
  const metalDark = makeMetalMaps(rand, { tone: 58 });
  const floorMaps = makeFloorMaps(rand);
  const fabricW = makeFabricMaps(rand, { color: '#cbc2ae' });
  const fabricO = makeFabricMaps(rand, { color: '#a04e1c' });
  const grate = makeGrateMaps(rand);
  const hazardMap = makeHazardMap(rand);

  const mats = {
    hull: new THREE.MeshStandardMaterial({
      map: hull.map, roughnessMap: hull.roughnessMap, normalMap: hull.normalMap,
      roughness: 1, metalness: 0.22, envMapIntensity: 0.7,
      normalScale: new THREE.Vector2(0.8, 0.8),
    }),
    hullLower: new THREE.MeshStandardMaterial({
      map: hullLower.map, roughnessMap: hullLower.roughnessMap, normalMap: hullLower.normalMap,
      roughness: 1, metalness: 0.3, envMapIntensity: 0.6,
      normalScale: new THREE.Vector2(0.8, 0.8),
    }),
    metal: new THREE.MeshStandardMaterial({
      map: metal.map, roughnessMap: metal.roughnessMap, normalMap: metal.normalMap,
      roughness: 0.85, metalness: 0.95, envMapIntensity: 1.0,
      normalScale: new THREE.Vector2(0.5, 0.5),
    }),
    metalDark: new THREE.MeshStandardMaterial({
      map: metalDark.map, roughnessMap: metalDark.roughnessMap, normalMap: metalDark.normalMap,
      roughness: 0.9, metalness: 0.9, envMapIntensity: 0.9,
      normalScale: new THREE.Vector2(0.6, 0.6),
    }),
    metalTube: new THREE.MeshStandardMaterial({
      map: metalDark.map, roughnessMap: metalDark.roughnessMap,
      roughness: 0.9, metalness: 0.9, envMapIntensity: 0.7, side: THREE.DoubleSide,
    }),
    floor: new THREE.MeshStandardMaterial({
      map: floorMaps.map, roughnessMap: floorMaps.roughnessMap, normalMap: floorMaps.normalMap,
      roughness: 0.9, metalness: 0.85, envMapIntensity: 1.1,
      normalScale: new THREE.Vector2(1.1, 1.1),
    }),
    rubber: new THREE.MeshStandardMaterial({
      color: 0x1d1e20, roughness: 0.92, metalness: 0.0, envMapIntensity: 0.25,
    }),
    fabricWhite: new THREE.MeshStandardMaterial({
      map: fabricW.map, normalMap: fabricW.normalMap,
      roughness: 0.96, metalness: 0, envMapIntensity: 0.3,
    }),
    fabricOrange: new THREE.MeshStandardMaterial({
      map: fabricO.map, normalMap: fabricO.normalMap,
      roughness: 0.96, metalness: 0, envMapIntensity: 0.3,
    }),
    grate: new THREE.MeshStandardMaterial({
      map: grate.map, alphaMap: grate.alphaMap, alphaTest: 0.5,
      roughness: 0.8, metalness: 0.9, side: THREE.DoubleSide, envMapIntensity: 0.6,
    }),
    hazard: new THREE.MeshStandardMaterial({
      map: hazardMap, roughness: 0.7, metalness: 0.3, envMapIntensity: 0.5,
    }),
    glass: new THREE.MeshStandardMaterial({
      color: 0x6a8fa0, roughness: 0.08, metalness: 0.0,
      transparent: true, opacity: 0.06, envMapIntensity: 0.3,
      depthWrite: false, side: THREE.DoubleSide,
    }),
    mirror: new THREE.MeshStandardMaterial({
      color: 0xc8d4d8, roughness: 0.05, metalness: 1.0, envMapIntensity: 1.8,
    }),
    plastic: new THREE.MeshStandardMaterial({
      color: 0xd8d4c8, roughness: 0.5, metalness: 0.1, envMapIntensity: 0.4,
    }),
    // emissives
    stripWarm: new THREE.MeshStandardMaterial({
      color: 0x111111, emissive: 0xffd9a8, emissiveIntensity: 1.7, roughness: 0.4,
    }),
    stripTeal: new THREE.MeshStandardMaterial({
      color: 0x05110f, emissive: 0x19d4d0, emissiveIntensity: 1.8, roughness: 0.4,
    }),
    stripOrange: new THREE.MeshStandardMaterial({
      color: 0x110803, emissive: 0xff7a20, emissiveIntensity: 1.5, roughness: 0.4,
    }),
    ledRed: new THREE.MeshStandardMaterial({
      color: 0x110404, emissive: 0xff3020, emissiveIntensity: 1.6, roughness: 0.4,
    }),
  };
  emissives.push({ mat: mats.stripWarm, day: 1.7, night: 0.35 });
  emissives.push({ mat: mats.stripTeal, day: 1.8, night: 2.6 });
  emissives.push({ mat: mats.stripOrange, day: 1.5, night: 1.0 });

  const screenMats = {};
  for (const kind of ['nav', 'eng', 'wave', 'text']) {
    const m = makeScreenMap(rand, kind);
    screenMats[kind] = new THREE.MeshStandardMaterial({
      color: 0x000000, emissive: 0xffffff, emissiveMap: m, emissiveIntensity: 1.5,
      roughness: 0.25, metalness: 0.0,
    });
    emissives.push({ mat: screenMats[kind], day: 1.5, night: 0.9 });
  }

  // ------------------------------------------------------------ geometry utils
  const HSU = 1 / 4.8, HSV = 1 / 2.5; // hull texture: 4.8m x 2.5m
  const WALL_T = 0.12;
  const CEIL = 2.5;

  function box(mat, w, h, d, x, y, z, o = {}) {
    const g = new THREE.BoxGeometry(w, h, d);
    if (o.hullUV) uvBoxWorld(g, w, h, d, HSU, HSV, o.ou || 0, o.ov || 0);
    else if (o.texel) uvBoxWorld(g, w, h, d, o.texel, o.texel);
    M.compose(V.set(x, y, z), Q.setFromEuler(E.set(o.rx || 0, o.ry || 0, o.rz || 0)), ONE);
    g.applyMatrix4(M);
    if (o.collide) {
      g.computeBoundingBox();
      colliders.push(g.boundingBox.clone());
    }
    batch.add(mat, g);
  }
  function cyl(mat, rTop, rBot, h, segs, x, y, z, o = {}) {
    const g = new THREE.CylinderGeometry(rTop, rBot, h, segs, 1, o.open || false);
    if (o.texel) uvScale(g, o.texel * Math.PI * 2 * rTop, o.texel * h);
    M.compose(V.set(x, y, z), Q.setFromEuler(E.set(o.rx || 0, o.ry || 0, o.rz || 0)), ONE);
    g.applyMatrix4(M);
    if (o.collide) { g.computeBoundingBox(); colliders.push(g.boundingBox.clone()); }
    batch.add(mat, g);
  }
  function torus(mat, R, r, x, y, z, o = {}) {
    const g = new THREE.TorusGeometry(R, r, 8, 24, o.arc || Math.PI * 2);
    M.compose(V.set(x, y, z), Q.setFromEuler(E.set(o.rx || 0, o.ry || 0, o.rz || 0)), ONE);
    g.applyMatrix4(M);
    batch.add(mat, g);
  }
  function collideBox(x1, y1, z1, x2, y2, z2) {
    colliders.push(new THREE.Box3(new THREE.Vector3(x1, y1, z1), new THREE.Vector3(x2, y2, z2)));
  }

  // Wall panel with a circular hole (for portholes). Local: spans length along
  // +X, height from 0, hole at (0, holeY). Rotated by ry then moved to (x,0,z).
  function holedPanel(mat, len, hgt, holeY, holeR, x, z, ry, uOff = 0, vOff = 0) {
    const shape = new THREE.Shape();
    shape.moveTo(-len / 2, 0);
    shape.lineTo(len / 2, 0);
    shape.lineTo(len / 2, hgt);
    shape.lineTo(-len / 2, hgt);
    shape.closePath();
    const hole = new THREE.Path();
    hole.absarc(0, holeY, holeR, 0, Math.PI * 2, true);
    shape.holes.push(hole);
    const g = new THREE.ExtrudeGeometry(shape, { depth: WALL_T, bevelEnabled: false, curveSegments: 24 });
    uvScale(g, HSU, HSV, uOff, vOff);
    g.translate(0, 0, -WALL_T / 2);
    M.compose(V.set(x, 0, z), Q.setFromEuler(E.set(0, ry, 0)), ONE);
    g.applyMatrix4(M);
    batch.add(mat, g);
  }

  // Plain wall span (lower dark band + upper hull) along Z at given x.
  function wallSpanZ(x, z0, z1, ry) {
    const len = z1 - z0, zc = (z0 + z1) / 2;
    box(mats.hullLower, WALL_T, 0.5, len, x, 0.25, zc, { collide: true, texel: 0.5 });
    const g = new THREE.BoxGeometry(len, CEIL - 0.5, WALL_T);
    uvBoxWorld(g, len, CEIL - 0.5, WALL_T, HSU, HSV, (z0 + 8) * HSU, 0.5 * HSV);
    M.compose(V.set(x, (CEIL - 0.5) / 2 + 0.5, zc), Q.setFromEuler(E.set(0, ry, 0)), ONE);
    g.applyMatrix4(M);
    g.computeBoundingBox();
    colliders.push(g.boundingBox.clone());
    batch.add(mats.hull, g);
  }
  // Plain wall span along X at given z.
  function wallSpanX(z, x0, x1, flip = false) {
    const len = x1 - x0, xc = (x0 + x1) / 2;
    box(mats.hullLower, len, 0.5, WALL_T, xc, 0.25, z, { collide: true, texel: 0.5 });
    const g = new THREE.BoxGeometry(len, CEIL - 0.5, WALL_T);
    uvBoxWorld(g, len, CEIL - 0.5, WALL_T, HSU, HSV, (x0 + 8) * HSU, 0.5 * HSV);
    M.compose(V.set(xc, (CEIL - 0.5) / 2 + 0.5, z), Q.setFromEuler(E.set(0, flip ? Math.PI : 0, 0)), ONE);
    g.applyMatrix4(M);
    g.computeBoundingBox();
    colliders.push(g.boundingBox.clone());
    batch.add(mats.hull, g);
  }

  // Porthole assembly at a wall position. `dir` is outward normal sign on X.
  function porthole(x, z, dir) {
    torus(mats.metal, 0.46, 0.07, x - dir * 0.02, 1.6, z, { ry: Math.PI / 2 });
    torus(mats.metalDark, 0.38, 0.035, x - dir * 0.08, 1.6, z, { ry: Math.PI / 2 });
    const g = new THREE.CylinderGeometry(0.40, 0.40, 0.02, 24);
    M.compose(V.set(x + dir * 0.10, 1.6, z), Q.setFromEuler(E.set(0, 0, Math.PI / 2)), ONE);
    g.applyMatrix4(M);
    batch.add(mats.glass, g);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.39;
      cyl(mats.metalDark, 0.028, 0.028, 0.05, 8, x - dir * 0.05, 1.6 + Math.cos(a) * 0.51, z + Math.sin(a) * 0.51, { rz: Math.PI / 2 });
    }
    // depth tube through the wall
    cyl(mats.metalTube, 0.42, 0.42, 0.30, 18, x + dir * 0.06, 1.6, z, { rz: Math.PI / 2, open: true });
  }

  // =========================================================================
  // CORRIDOR  x[-1.2,1.2] z[-8,8]
  // =========================================================================
  const CW = 1.2;

  {
    const g = new THREE.BoxGeometry(2.0, 0.1, 16.4);
    uvBoxWorld(g, 2.0, 0.1, 16.4, 1 / 2.4, 1 / 2.4);
    M.makeTranslation(0, -0.05, 0);
    g.applyMatrix4(M);
    batch.add(mats.floor, g);
  }
  // side floor trenches with teal glow + grates
  for (const s of [-1, 1]) {
    box(mats.metalDark, 0.4, 0.1, 16.4, s * 1.0, -0.1, 0, { texel: 1 });
    box(mats.stripTeal, 0.34, 0.02, 16.0, s * 1.0, -0.062, 0, {});
    const g = new THREE.BoxGeometry(0.4, 0.012, 16.4);
    uvBoxWorld(g, 0.4, 0.012, 16.4, 2.5, 2.5);
    M.makeTranslation(s * 1.0, -0.006, 0);
    g.applyMatrix4(M);
    batch.add(mats.grate, g);
  }
  box(mats.hullLower, 2.4, 0.1, 16.4, 0, CEIL + 0.05, 0, { hullUV: true });

  // Corridor walls.
  // Right (x=+1.2, faces -x): quarters door z[1.65,2.75]; porthole z=-4.
  // Left  (x=-1.2, faces +x): galley door z[-3.95,-2.85]; bathroom door z[3.15,4.05]; porthole z=0.7.
  const RWX = CW + WALL_T / 2;
  // right wall
  wallSpanZ(RWX, -8, -4.6, -Math.PI / 2);
  holedPanel(mats.hull, 1.2, CEIL, 1.6, 0.43, RWX, -4.0, -Math.PI / 2);
  collideBox(CW, 0, -4.6, CW + WALL_T, CEIL, -3.4);
  wallSpanZ(RWX, -3.4, 1.65, -Math.PI / 2);
  wallSpanZ(RWX, 2.75, 8, -Math.PI / 2);
  // left wall
  wallSpanZ(-RWX, -8, -3.95, Math.PI / 2);
  wallSpanZ(-RWX, -2.85, 0.1, Math.PI / 2);
  holedPanel(mats.hull, 1.2, CEIL, 1.6, 0.43, -RWX, 0.7, Math.PI / 2);
  collideBox(-CW - WALL_T, 0, 0.1, -CW, CEIL, 1.3);
  wallSpanZ(-RWX, 1.3, 3.15, Math.PI / 2);
  wallSpanZ(-RWX, 4.05, 8, Math.PI / 2);

  // door headers + frames + hazard trims
  function doorTrim(side, z0, z1) {
    const x = side * RWX;
    const len = z1 - z0, zc = (z0 + z1) / 2;
    box(mats.hull, WALL_T, CEIL - 2.1, len, x, (CEIL + 2.1) / 2, zc, { collide: true, hullUV: true });
    box(mats.metalDark, 0.3, 2.16, 0.12, x, 1.05, z0 - 0.06, { texel: 1 });
    box(mats.metalDark, 0.3, 2.16, 0.12, x, 1.05, z1 + 0.06, { texel: 1 });
    box(mats.metalDark, 0.3, 0.14, len + 0.36, x, 2.16, zc, { texel: 1 });
    // vertical hazard strips on door posts (corridor side)
    box(mats.hazard, 0.015, 1.8, 0.1, x - side * 0.155, 0.95, z0 - 0.06, {});
    box(mats.hazard, 0.015, 1.8, 0.1, x - side * 0.155, 0.95, z1 + 0.06, {});
    // door sign light above
    box(mats.stripOrange, 0.03, 0.06, 0.45, x - side * 0.145, 2.32, zc, {});
  }
  doorTrim(1, 1.65, 2.75);
  doorTrim(-1, -3.95, -2.85);
  doorTrim(-1, 3.15, 4.05);

  // corridor ribs every 2 m
  for (let z = -7; z <= 7; z += 2) {
    if (Math.abs(z - 2.2) < 0.8 || Math.abs(z + 3.4) < 0.8 || Math.abs(z - 3.6) < 0.8) continue;
    if (Math.abs(z + 4) < 0.7 || Math.abs(z - 0.7) < 0.7) continue; // portholes
    for (const s of [-1, 1]) {
      box(mats.metal, 0.18, CEIL, 0.22, s * (CW - 0.09), CEIL / 2, z, { texel: 1, collide: true });
      box(mats.metal, 0.5, 0.18, 0.22, s * (CW - 0.28), CEIL - 0.22, z, { rz: s * 0.6, texel: 1 });
      box(mats.metalDark, 0.22, 0.3, 0.26, s * (CW - 0.09), 0.15, z, { texel: 1 });
    }
    box(mats.metal, 2.4, 0.16, 0.22, 0, CEIL - 0.08, z, { texel: 1 });
    box(mats.stripTeal, 0.04, 0.18, 0.05, -(CW - 0.09) + 0.11, 1.65, z, {});
    box(mats.stripOrange, 0.04, 0.05, 0.05, (CW - 0.09) - 0.11, 1.65, z, {});
  }

  // ceiling light fixtures
  for (let z = -6; z <= 6; z += 3) {
    box(mats.metalDark, 0.7, 0.07, 1.4, 0, CEIL - 0.035, z, { texel: 1 });
    box(mats.stripWarm, 0.5, 0.02, 1.2, 0, CEIL - 0.075, z, {});
  }
  for (const z of [-6, 0, 6]) {
    const pl = new THREE.PointLight(0xffd9a8, 10, 5.5, 2);
    pl.position.set(0, CEIL - 0.25, z);
    group.add(pl);
    lights.push({ light: pl, day: 10, night: 1.2 });
  }
  {
    const nl = new THREE.PointLight(0x2a55a0, 0, 12, 2);
    nl.position.set(0, CEIL - 0.3, 0);
    group.add(nl);
    lights.push({ light: nl, day: 0, night: 9 });
  }

  // ceiling pipe runs + clamps
  for (const s of [-1, 1]) {
    const radii = [0.055, 0.04, 0.07];
    for (let i = 0; i < 3; i++) {
      const r = radii[i];
      const px = s * (CW - 0.18 - i * 0.14);
      cyl(i === 1 ? mats.metalDark : mats.metal, r, r, 16.0, 10, px, CEIL - 0.16 - (i === 2 ? 0.11 : 0), 0, { rx: Math.PI / 2, texel: 1 });
    }
    for (let z = -7; z <= 7; z += 2) {
      box(mats.metalDark, 0.46, 0.06, 0.08, s * (CW - 0.32), CEIL - 0.18, z, { texel: 1 });
    }
  }

  // wall conduits + junction boxes between ribs
  for (let z = -7; z < 8; z += 2) {
    for (const s of [-1, 1]) {
      if (s > 0 && z > 0.6 && z < 3.4) continue;
      if (s > 0 && z + 1 > -4.7 && z + 1 < -3.3) continue;
      if (s < 0 && ((z > -4.6 && z < -2.2) || (z > 2.6 && z < 4.6))) continue;
      if (s < 0 && z + 1 > 0.0 && z + 1 < 1.4) continue;
      const x = s * (CW - 0.04);
      cyl(mats.metalDark, 0.025, 0.025, 1.7, 8, x, 0.95, z + 1, { rx: Math.PI / 2 });
      cyl(mats.metalDark, 0.018, 0.018, 1.7, 8, x, 1.03, z + 1, { rx: Math.PI / 2 });
      if ((z + 7) % 4 === 0) {
        box(mats.metal, 0.07, 0.34, 0.5, x, 1.3, z + 1, { texel: 2 });
        box(mats.stripTeal, 0.02, 0.04, 0.04, x - s * 0.05, 1.4, z + 0.85, {});
        box(mats.ledRed, 0.02, 0.04, 0.04, x - s * 0.05, 1.4, z + 1.0, {});
      }
    }
  }

  porthole(RWX, -4.0, 1);
  porthole(-RWX, 0.7, -1);

  // ============================ COCKPIT  z[-13.4,-8] ============================
  {
    const bz = -8 - WALL_T / 2;
    // bulkhead with center opening x[-0.7,0.7]
    box(mats.hull, 1.0, CEIL, WALL_T, -1.2, CEIL / 2, bz, { hullUV: true, collide: true });
    box(mats.hull, 1.0, CEIL, WALL_T, 1.2, CEIL / 2, bz, { hullUV: true, collide: true });
    box(mats.hull, 1.4, CEIL - 2.1, WALL_T, 0, (CEIL + 2.1) / 2, bz, { hullUV: true });
    box(mats.metalDark, 0.34, 2.2, 0.3, -0.78, 1.05, bz, { collide: true, texel: 1 });
    box(mats.metalDark, 0.34, 2.2, 0.3, 0.78, 1.05, bz, { collide: true, texel: 1 });
    box(mats.metalDark, 1.9, 0.18, 0.3, 0, 2.18, bz, { texel: 1 });
    box(mats.stripWarm, 1.3, 0.05, 0.06, 0, 2.12, bz - 0.16, {});
    // corner fillers behind bulkhead (cockpit is wider than corridor)
    box(mats.hull, 1.0, CEIL, WALL_T, -1.95, CEIL / 2, bz - 0.12, { hullUV: true, collide: true });
    box(mats.hull, 1.0, CEIL, WALL_T, 1.95, CEIL / 2, bz - 0.12, { hullUV: true, collide: true });

    // floor / ceiling
    {
      const g = new THREE.BoxGeometry(4.6, 0.1, 5.6);
      uvBoxWorld(g, 4.6, 0.1, 5.6, 1 / 2.4, 1 / 2.4);
      M.makeTranslation(0, -0.05, -10.8);
      g.applyMatrix4(M);
      batch.add(mats.floor, g);
    }
    box(mats.hullLower, 4.6, 0.1, 5.6, 0, CEIL + 0.05, -10.8, { hullUV: true });

    // tapered side walls
    for (const s of [-1, 1]) {
      box(mats.hull, 0.12, CEIL, 5.2, s * 1.95, CEIL / 2, -10.5, { ry: s * 0.2, hullUV: true, collide: true });
    }

    // nose: sill, header, glass panels, mullions, corner posts
    const noseZ = -12.9;
    box(mats.hullLower, 4.2, 0.92, 0.45, 0, 0.46, noseZ + 0.05, { hullUV: true, collide: true });
    box(mats.hullLower, 4.2, 0.4, 0.6, 0, CEIL - 0.2, noseZ + 0.1, { hullUV: true });
    // raked glass: 3 near-coplanar panels
    const panels = [
      { x: 0, w: 1.06, ry: 0 },
      { x: -1.08, w: 1.1, ry: 0.22 },
      { x: 1.08, w: 1.1, ry: -0.22 },
    ];
    for (const p of panels) {
      const zoff = noseZ + Math.abs(p.x) * 0.12;
      const g = new THREE.BoxGeometry(p.w, 1.46, 0.04);
      M.compose(V.set(p.x, 1.62, zoff), Q.setFromEuler(E.set(-0.20, p.ry, 0)), ONE);
      g.applyMatrix4(M);
      batch.add(mats.glass, g);
    }
    // mullions between panels
    for (const s of [-1, 1]) {
      box(mats.metalDark, 0.10, 1.62, 0.18, s * 0.55, 1.6, noseZ + 0.03, { rx: -0.20, ry: s * 0.1, texel: 1 });
    }
    // corner posts sealing the angled edges
    for (const s of [-1, 1]) {
      box(mats.hull, 0.55, CEIL, 0.7, s * 1.78, CEIL / 2, noseZ + 0.35, { ry: s * 0.45, hullUV: true, collide: true });
    }
    collideBox(-2.2, 0, noseZ - 0.5, 2.2, CEIL, noseZ + 0.3);

    // dashboard
    box(mats.metalDark, 3.4, 0.16, 0.9, 0, 0.97, -12.15, { rx: -0.18, texel: 1 });
    box(mats.hullLower, 3.4, 0.55, 0.7, 0, 0.62, -12.05, { hullUV: true, collide: true });
    // screen housing bank behind the screens
    {
      const g = new THREE.BoxGeometry(3.0, 0.46, 0.1);
      uvBoxWorld(g, 3.0, 0.46, 0.1, 1, 1);
      M.compose(V.set(0, 1.21, -12.42), Q.setFromEuler(E.set(-0.42, 0, 0)), ONE);
      g.applyMatrix4(M);
      batch.add(mats.metalDark, g);
    }
    const dashScreens = [
      { x: -1.05, kind: 'nav', w: 0.62 }, { x: -0.35, kind: 'wave', w: 0.6 },
      { x: 0.35, kind: 'eng', w: 0.6 }, { x: 1.05, kind: 'text', w: 0.62 },
    ];
    for (const s of dashScreens) {
      const g = new THREE.BoxGeometry(s.w, 0.34, 0.02);
      M.compose(V.set(s.x, 1.22, -12.36), Q.setFromEuler(E.set(-0.42, 0, 0)), ONE);
      g.applyMatrix4(M);
      batch.add(screenMats[s.kind], g);
    }
    for (let i = 0; i < 26; i++) {
      const bx = -1.5 + rand() * 3.0, bz2 = -12.25 + rand() * 0.45;
      const mat = [mats.stripTeal, mats.stripOrange, mats.ledRed][rand() * 3 | 0];
      box(mat, 0.035, 0.025, 0.035, bx, 1.06 - (bz2 + 12.25) * 0.18, bz2, {});
    }
    // center pedestal + throttle levers
    box(mats.metalDark, 0.5, 0.7, 0.8, 0, 0.35, -11.3, { collide: true, texel: 1 });
    box(mats.metal, 0.4, 0.06, 0.7, 0, 0.73, -11.3, { texel: 1 });
    for (const s of [-1, 1]) {
      cyl(mats.metalDark, 0.02, 0.02, 0.26, 8, s * 0.1, 0.85, -11.35, { rx: -0.5 });
      box(mats.stripOrange, 0.07, 0.05, 0.07, s * 0.1, 0.96, -11.42, {});
    }

    // pilot seats
    for (const s of [-1, 1]) {
      const sx = s * 0.62, sz = -10.7;
      cyl(mats.metalDark, 0.09, 0.13, 0.35, 10, sx, 0.18, sz, {});
      box(mats.rubber, 0.56, 0.13, 0.55, sx, 0.42, sz, { collide: true });
      box(mats.fabricOrange, 0.5, 0.07, 0.48, sx, 0.52, sz, { texel: 2 });
      box(mats.rubber, 0.56, 0.75, 0.14, sx, 0.82, sz + 0.3, { rx: 0.1, collide: true });
      box(mats.fabricOrange, 0.48, 0.6, 0.06, sx, 0.84, sz + 0.235, { rx: 0.1, texel: 2 });
      box(mats.rubber, 0.3, 0.2, 0.1, sx, 1.28, sz + 0.34, { rx: 0.1 });
      for (const a of [-1, 1]) box(mats.metalDark, 0.06, 0.05, 0.4, sx + a * 0.3, 0.62, sz + 0.05, { texel: 2 });
    }

    // overhead switch panel
    box(mats.metalDark, 1.4, 0.06, 0.6, 0, CEIL - 0.28, -11.9, { rx: 0.3, texel: 1 });
    for (let i = 0; i < 12; i++) {
      const mat = [mats.stripTeal, mats.stripWarm, mats.stripOrange][rand() * 3 | 0];
      const row = (i / 6) | 0;
      box(mat, 0.04, 0.02, 0.04, -0.6 + (i % 6) * 0.24, CEIL - 0.36 + row * 0.07, -11.78 + row * 0.22, { rx: 0.3 });
    }

    // side consoles
    for (const s of [-1, 1]) {
      box(mats.hullLower, 0.5, 0.85, 1.8, s * 1.58, 0.42, -10.6, { ry: s * 0.2, hullUV: true, collide: true });
      const g = new THREE.BoxGeometry(0.44, 0.3, 0.02);
      M.compose(V.set(s * 1.47, 0.92, -10.6), Q.setFromEuler(E.set(-1.25, s * 0.2, 0)), ONE);
      g.applyMatrix4(M);
      batch.add(screenMats[s > 0 ? 'eng' : 'text'], g);
    }

    // lights
    box(mats.stripWarm, 0.6, 0.02, 0.3, 0, CEIL - 0.06, -9.0, {});
    const cl = new THREE.PointLight(0xffd0a0, 9, 6, 2);
    cl.position.set(0, CEIL - 0.4, -9.2);
    group.add(cl);
    lights.push({ light: cl, day: 9, night: 1.2 });
    const cg = new THREE.PointLight(0x2ad2cc, 2, 2.6, 2);
    cg.position.set(0, 1.25, -11.9);
    group.add(cg);
    lights.push({ light: cg, day: 2, night: 1.6 });
  }

  // ============================ REAR BULKHEAD z=8 ============================
  {
    const z = 8 + WALL_T / 2;
    box(mats.hull, 2.6, CEIL, WALL_T, 0, CEIL / 2, z, { hullUV: true, collide: true });
    torus(mats.metal, 0.78, 0.1, 0, 1.25, z - 0.12, {});
    cyl(mats.metalDark, 0.72, 0.72, 0.08, 24, 0, 1.25, z - 0.1, { rx: Math.PI / 2, texel: 1 });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      box(mats.metal, 0.1, 0.62, 0.06, Math.cos(a) * 0.35, 1.25 + Math.sin(a) * 0.35, z - 0.16, { rz: a + Math.PI / 2, texel: 2 });
    }
    torus(mats.metal, 0.2, 0.035, 0, 1.25, z - 0.22, {});
    cyl(mats.metalDark, 0.05, 0.05, 0.16, 8, 0, 1.25, z - 0.18, { rx: Math.PI / 2 });
    // hazard band above hatch
    box(mats.hazard, 2.3, 0.18, 0.03, 0, 2.32, z - 0.09, {});
    box(mats.ledRed, 0.1, 0.06, 0.05, -0.9, 2.14, z - 0.1, {});
    box(mats.stripOrange, 0.1, 0.06, 0.05, 0.9, 2.14, z - 0.1, {});
    for (const s of [-1, 1]) {
      cyl(mats.metal, 0.06, 0.06, 1.6, 10, s * 1.0, 1.9, z - 0.16, { rz: s * 1.0, texel: 1 });
      cyl(mats.metal, 0.06, 0.06, 1.2, 10, s * 0.5, 0.5, z - 0.16, { rz: s * 2.2, texel: 1 });
      torus(mats.metal, 0.09, 0.02, s * 0.9, 0.7, z - 0.24, {});
    }
    collideBox(-1.3, 0, 7.85, 1.3, CEIL, 8.3);
  }

  // ============================ CREW QUARTERS x[1.2,5.6] z[1.2,6.4] ==========
  {
    const x0 = 1.2 + WALL_T, x1 = 5.6, z0 = 1.2, z1 = 6.4;
    const cxm = (x0 + x1) / 2, czm = (z0 + z1) / 2;
    {
      const g = new THREE.BoxGeometry(x1 - x0 + 0.2, 0.1, z1 - z0 + 0.2);
      uvBoxWorld(g, x1 - x0, 0.1, z1 - z0, 1 / 2.4, 1 / 2.4);
      M.makeTranslation(cxm, -0.05, czm);
      g.applyMatrix4(M);
      batch.add(mats.floor, g);
    }
    cyl(mats.fabricOrange, 0.8, 0.8, 0.025, 20, 3.0, 0.012, 3.4, { texel: 1 });
    box(mats.hullLower, x1 - x0 + 0.2, 0.1, z1 - z0 + 0.2, cxm, CEIL + 0.05, czm, { hullUV: true });

    // outer wall x=5.6 with porthole at z=4.4
    const OWX = x1 + WALL_T / 2;
    wallSpanZ(OWX, z0, 3.8, Math.PI / 2);
    holedPanel(mats.hull, 1.2, CEIL, 1.6, 0.43, OWX, 4.4, Math.PI / 2);
    collideBox(x1, 0, 3.8, x1 + WALL_T, CEIL, 5.0);
    wallSpanZ(OWX, 5.0, z1, Math.PI / 2);
    porthole(OWX, 4.4, 1);
    // far + near walls
    wallSpanX(z1 + WALL_T / 2, x0 - 0.15, x1 + 0.15, true);
    wallSpanX(z0 - WALL_T / 2, x0 - 0.15, x1 + 0.15, false);

    // bunk against far wall
    const bedX = 4.35, bedZ = 5.75;
    box(mats.metalDark, 2.3, 0.4, 1.15, bedX, 0.2, bedZ, { collide: true, texel: 1 });
    box(mats.fabricWhite, 2.24, 0.18, 1.05, bedX, 0.49, bedZ, { texel: 2 });
    box(mats.fabricOrange, 1.5, 0.08, 1.07, bedX - 0.38, 0.60, bedZ, { texel: 2 });
    box(mats.fabricWhite, 0.5, 0.12, 0.7, bedX + 0.82, 0.61, bedZ, { ry: 0.08, texel: 2 });
    for (let i = 0; i < 3; i++) {
      box(mats.hullLower, 0.68, 0.26, 0.04, bedX - 0.72 + i * 0.74, 0.18, bedZ - 0.6, { hullUV: true });
      box(mats.metal, 0.3, 0.03, 0.03, bedX - 0.72 + i * 0.74, 0.18, bedZ - 0.63, {});
    }
    box(mats.stripTeal, 0.03, 0.03, 1.1, 5.62, 1.45, bedZ, {});
    box(mats.metalDark, 0.3, 0.04, 1.1, 5.46, 1.25, bedZ, { texel: 1 });
    cyl(mats.metal, 0.06, 0.06, 0.18, 10, 5.46, 1.36, bedZ - 0.3, { texel: 2 });
    box(mats.fabricOrange, 0.14, 0.18, 0.1, 5.46, 1.36, bedZ + 0.25, { ry: 0.4, texel: 2 });
    // wall cabinet above the bed
    box(mats.hullLower, 0.4, 0.55, 1.4, 5.45, 2.05, bedZ + 0.1, { hullUV: true });
    box(mats.metal, 0.03, 0.2, 0.03, 5.24, 2.05, bedZ - 0.3, {});
    box(mats.metal, 0.03, 0.2, 0.03, 5.24, 2.05, bedZ + 0.5, {});
    box(mats.stripOrange, 0.02, 0.03, 1.2, 5.26, 1.81, bedZ + 0.1, {});

    // lockers along near wall
    for (let i = 0; i < 3; i++) {
      const lx = 2.2 + i * 0.78;
      box(mats.hullLower, 0.72, 1.9, 0.5, lx, 0.95, z0 + 0.27, { collide: true, hullUV: true, ou: i * 0.3 });
      box(mats.metal, 0.05, 0.3, 0.03, lx + 0.25, 1.0, z0 + 0.54, {});
      for (let k = 0; k < 4; k++) box(mats.metalDark, 0.4, 0.025, 0.02, lx, 1.62 - k * 0.07, z0 + 0.53, {});
      box(i === 1 ? mats.stripTeal : mats.stripOrange, 0.08, 0.03, 0.02, lx - 0.2, 1.78, z0 + 0.53, {});
    }

    // desk + stool + wall screen
    box(mats.metal, 0.6, 0.05, 1.1, 5.25, 0.78, 2.4, { collide: true, texel: 1 });
    box(mats.hullLower, 0.5, 0.76, 0.5, 5.3, 0.38, 2.7, { hullUV: true, collide: true });
    {
      const qs = new THREE.BoxGeometry(0.02, 0.5, 0.8);
      M.makeTranslation(5.52, 1.6, 2.4);
      qs.applyMatrix4(M);
      batch.add(screenMats['text'], qs);
    }
    cyl(mats.metalDark, 0.18, 0.22, 0.45, 12, 4.5, 0.22, 2.4, { collide: true });
    cyl(mats.fabricOrange, 0.2, 0.2, 0.06, 12, 4.5, 0.48, 2.4, { texel: 2 });

    // reading lamp (warm key) in the far corner, clear of the porthole
    cyl(mats.metalDark, 0.025, 0.04, 0.5, 8, 5.32, 1.9, 6.12, { rz: 0.5 });
    cyl(mats.metal, 0.09, 0.13, 0.16, 10, 5.2, 2.1, 6.1, { rz: 0.7, open: true });
    box(mats.stripWarm, 0.06, 0.04, 0.06, 5.2, 2.05, 6.1, {});
    const lamp = new THREE.SpotLight(0xffc890, 20, 8, 0.95, 0.55, 1.6);
    lamp.position.set(5.12, 2.15, 6.05);
    lamp.target.position.set(4.0, 0.5, 5.5);
    lamp.castShadow = true;
    lamp.shadow.mapSize.set(512, 512);
    lamp.shadow.bias = -0.0015;
    lamp.shadow.normalBias = 0.02;
    group.add(lamp, lamp.target);
    lights.push({ light: lamp, day: 20, night: 4 });
    box(mats.stripWarm, 0.5, 0.02, 0.5, 3.0, CEIL - 0.04, 3.2, {});
    const ql = new THREE.PointLight(0xffd9a8, 7, 6, 2);
    ql.position.set(3.0, CEIL - 0.3, 3.2);
    group.add(ql);
    lights.push({ light: ql, day: 7, night: 0.9 });
    const qn = new THREE.PointLight(0x1980d4, 0, 7, 2);
    qn.position.set(4.5, 1.0, 5.5);
    group.add(qn);
    lights.push({ light: qn, day: 0, night: 5 });

    // greebles: conduit, junction, ceiling light housing + vent
    cyl(mats.metalDark, 0.03, 0.03, 4.2, 8, 1.45, 2.3, czm + 0.3, { rx: Math.PI / 2 });
    box(mats.metal, 0.08, 0.3, 0.4, 1.42, 2.1, 4.0, { texel: 2 });
    box(mats.metalDark, 0.7, 0.07, 1.2, 3.0, CEIL - 0.035, 3.2, { texel: 1 });
    box(mats.metalDark, 0.5, 0.06, 0.7, 4.6, CEIL - 0.03, 2.0, { texel: 2 });
    for (let k = 0; k < 4; k++) box(mats.metal, 0.4, 0.02, 0.07, 4.6, CEIL - 0.065, 1.75 + k * 0.16, {});
    cyl(mats.metal, 0.045, 0.045, 4.0, 8, 3.4, CEIL - 0.1, 4.6, { rz: Math.PI / 2, texel: 1 });

    interactables.push({
      id: 'bed',
      prompt: 'E: Sleep',
      center: new THREE.Vector3(bedX, 0.55, bedZ),
      size: new THREE.Vector3(2.4, 0.7, 1.25),
    });
  }

  // ============================ GALLEY x[-5.2,-1.2] z[-5.6,-1.2] =============
  {
    const x0 = -5.2, x1 = -1.2 - WALL_T, z0 = -5.6, z1 = -1.2;
    const cxm = (x0 + x1) / 2, czm = (z0 + z1) / 2;
    {
      const g = new THREE.BoxGeometry(x1 - x0 + 0.2, 0.1, z1 - z0 + 0.2);
      uvBoxWorld(g, x1 - x0, 0.1, z1 - z0, 1 / 2.4, 1 / 2.4);
      M.makeTranslation(cxm, -0.05, czm);
      g.applyMatrix4(M);
      batch.add(mats.floor, g);
    }
    box(mats.hullLower, x1 - x0 + 0.2, 0.1, z1 - z0 + 0.2, cxm, CEIL + 0.05, czm, { hullUV: true });
    wallSpanZ(x0 - WALL_T / 2, z0, z1, Math.PI / 2);
    wallSpanX(z0 - WALL_T / 2, x0 - 0.15, x1 + 0.15, false);
    wallSpanX(z1 + WALL_T / 2, x0 - 0.15, x1 + 0.15, true);

    // counter run along x0 wall
    const cD = 0.62;
    box(mats.hullLower, cD, 0.85, 3.6, x0 + cD / 2, 0.43, czm, { collide: true, hullUV: true });
    box(mats.metal, cD + 0.06, 0.05, 3.66, x0 + cD / 2, 0.88, czm, { texel: 1 });
    box(mats.rubber, cD, 0.1, 3.6, x0 + cD / 2, 0.05, czm, {});
    box(mats.stripOrange, 0.02, 0.04, 3.3, x0 + cD + 0.01, 0.83, czm, {});
    for (let i = 0; i < 5; i++) {
      box(mats.metal, 0.03, 0.03, 0.3, x0 + cD + 0.02, 0.68, z0 + 0.7 + i * 0.7, {});
    }
    // sink
    box(mats.metalDark, 0.4, 0.04, 0.5, x0 + cD / 2, 0.9, -4.5, { texel: 1 });
    cyl(mats.metal, 0.025, 0.025, 0.3, 8, x0 + 0.2, 1.0, -4.3, { rz: -0.5 });
    // cooktop with glowing rings
    box(mats.rubber, 0.5, 0.012, 0.8, x0 + cD / 2, 0.906, -3.2, {});
    for (const dz of [-0.2, 0.2]) {
      torus(mats.stripOrange, 0.11, 0.018, x0 + cD / 2, 0.915, -3.2 + dz, { rx: Math.PI / 2 });
    }
    // overhead cabinets + under-cabinet teal strip
    box(mats.hullLower, 0.45, 0.75, 3.4, x0 + 0.27, 1.95, czm, { hullUV: true });
    for (let i = 0; i < 4; i++) {
      box(mats.metal, 0.03, 0.25, 0.03, x0 + 0.51, 1.95, z0 + 0.85 + i * 0.85, {});
    }
    box(mats.stripTeal, 0.012, 0.02, 3.2, x0 + 0.50, 1.56, czm, {});

    // shelf with canisters on z0 wall
    box(mats.metal, 1.6, 0.04, 0.35, -2.0, 1.5, z0 + 0.3, { texel: 1 });
    for (let i = 0; i < 5; i++) {
      const ch = 0.16 + rand() * 0.18;
      cyl(i % 2 ? mats.metal : mats.plastic, 0.07, 0.07, ch, 10, -2.7 + i * 0.36, 1.52 + ch / 2, z0 + 0.3, { texel: 2 });
    }

    // table + stools
    cyl(mats.metalDark, 0.06, 0.1, 0.74, 10, -2.6, 0.37, -2.3, {});
    cyl(mats.metal, 0.55, 0.55, 0.05, 20, -2.6, 0.76, -2.3, { texel: 1, collide: true });
    for (const [sx, sz] of [[-3.3, -2.0], [-2.0, -2.8]]) {
      cyl(mats.metalDark, 0.16, 0.2, 0.45, 12, sx, 0.22, sz, { collide: true });
      cyl(mats.fabricOrange, 0.18, 0.18, 0.06, 12, sx, 0.48, sz, { texel: 2 });
    }

    // wall menu screen
    {
      const ms = new THREE.BoxGeometry(0.9, 0.55, 0.02);
      M.compose(V.set(-3.0, 1.65, z1 - 0.04), Q.setFromEuler(E.set(0, Math.PI, 0)), ONE);
      ms.applyMatrix4(M);
      batch.add(screenMats['wave'], ms);
    }

    // pendant lamp over table
    cyl(mats.metalDark, 0.012, 0.012, 0.5, 6, -2.6, CEIL - 0.25, -2.3, {});
    cyl(mats.metal, 0.16, 0.05, 0.18, 12, -2.6, CEIL - 0.55, -2.3, { open: true });
    box(mats.stripWarm, 0.1, 0.03, 0.1, -2.6, CEIL - 0.62, -2.3, {});
    const pend = new THREE.SpotLight(0xffc890, 24, 7, 1.15, 0.6, 1.5);
    pend.position.set(-2.6, CEIL - 0.6, -2.3);
    pend.target.position.set(-2.6, 0, -2.3);
    pend.castShadow = true;
    pend.shadow.mapSize.set(512, 512);
    pend.shadow.bias = -0.0015;
    pend.shadow.normalBias = 0.02;
    group.add(pend, pend.target);
    lights.push({ light: pend, day: 24, night: 3 });
    const gFill = new THREE.PointLight(0xffd9a8, 8, 6, 2);
    gFill.position.set(-4.2, 2.1, -3.4);
    group.add(gFill);
    lights.push({ light: gFill, day: 8, night: 0.9 });

    interactables.push({
      id: 'galley',
      prompt: 'E: Eat',
      center: new THREE.Vector3(x0 + cD / 2, 0.7, -3.2),
      size: new THREE.Vector3(0.9, 0.9, 1.3),
    });
  }

  // ============================ BATHROOM x[-4.0,-1.2] z[2.6,5.4] =============
  {
    const x0 = -4.0, x1 = -1.2 - WALL_T, z0 = 2.6, z1 = 5.4;
    const cxm = (x0 + x1) / 2, czm = (z0 + z1) / 2;
    {
      const g = new THREE.BoxGeometry(x1 - x0 + 0.2, 0.1, z1 - z0 + 0.2);
      uvBoxWorld(g, x1 - x0, 0.1, z1 - z0, 1 / 2.4, 1 / 2.4);
      M.makeTranslation(cxm, -0.05, czm);
      g.applyMatrix4(M);
      batch.add(mats.floor, g);
    }
    box(mats.hullLower, x1 - x0 + 0.2, 0.1, z1 - z0 + 0.2, cxm, CEIL + 0.05, czm, { hullUV: true });
    wallSpanZ(x0 - WALL_T / 2, z0, z1, Math.PI / 2);
    wallSpanX(z0 - WALL_T / 2, x0 - 0.15, x1 + 0.15, false);
    wallSpanX(z1 + WALL_T / 2, x0 - 0.15, x1 + 0.15, true);

    // sink unit
    box(mats.hullLower, 0.45, 0.8, 0.9, x0 + 0.27, 0.45, 4.6, { collide: true, hullUV: true });
    box(mats.metal, 0.5, 0.06, 0.95, x0 + 0.27, 0.88, 4.6, { texel: 1 });
    cyl(mats.metalDark, 0.16, 0.2, 0.1, 16, x0 + 0.3, 0.93, 4.6, { open: true });
    cyl(mats.metal, 0.02, 0.02, 0.25, 8, x0 + 0.16, 1.05, 4.6, { rz: -0.6 });
    box(mats.mirror, 0.02, 0.7, 0.6, x0 + 0.09, 1.55, 4.6, {});
    box(mats.metalDark, 0.04, 0.78, 0.68, x0 + 0.06, 1.55, 4.6, { texel: 1 });
    box(mats.stripTeal, 0.03, 0.03, 0.6, x0 + 0.11, 1.95, 4.6, {});

    // toilet unit
    box(mats.hullLower, 0.5, 0.42, 0.42, x0 + 0.4, 0.21, 3.1, { collide: true, hullUV: true });
    cyl(mats.plastic, 0.19, 0.21, 0.06, 14, x0 + 0.4, 0.45, 3.1, {});
    box(mats.hullLower, 0.16, 0.6, 0.5, x0 + 0.1, 0.72, 3.1, { hullUV: true });
    box(mats.stripTeal, 0.03, 0.04, 0.04, x0 + 0.19, 0.85, 3.1, {});

    // shower pod corner
    box(mats.rubber, 0.9, 0.04, 0.9, -1.85, 0.02, 4.85, {});
    cyl(mats.metal, 0.07, 0.07, 0.04, 12, -1.85, 2.3, 4.85, {});
    cyl(mats.metalDark, 0.02, 0.02, 2.3, 8, -1.45, 1.15, 4.95, {});
    {
      const g = new THREE.BoxGeometry(0.04, 2.0, 0.9);
      M.makeTranslation(-2.32, 1.0, 4.85);
      g.applyMatrix4(M);
      batch.add(mats.glass, g);
      collideBox(-2.36, 0, 4.4, -2.28, 2.0, 5.3);
    }

    // cool light
    box(mats.stripTeal, 0.4, 0.02, 0.4, cxm, CEIL - 0.04, czm, {});
    const bl = new THREE.PointLight(0x9fe8e0, 8, 5.5, 2);
    bl.position.set(cxm, CEIL - 0.3, czm);
    group.add(bl);
    lights.push({ light: bl, day: 8, night: 2.8 });

    interactables.push({
      id: 'bathroom',
      prompt: 'E: Freshen up',
      center: new THREE.Vector3(x0 + 0.35, 0.9, 4.6),
      size: new THREE.Vector3(0.8, 1.2, 1.1),
    });
  }

  batch.build(group);
  scene.add(group);

  return { group, colliders, interactables, lights, emissives, mats };
}
