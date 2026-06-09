// bricks.js — the graphics core of Brick Wars.
//
// Everything visible in the game is assembled from procedurally generated
// injection-molded-style plastic parts built at true construction-toy ratios.
// Base unit: 1 world unit = 1 module (8 mm).
//   - plate height  = 0.4   (3.2 mm)
//   - brick height  = 1.2   (9.6 mm)
//   - stud diameter = 0.6   (4.8 mm)
//   - stud height   = 0.21  (1.7 mm)

import * as THREE from 'three';
import { RoundedBoxGeometry } from '../vendor/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from '../vendor/jsm/utils/BufferGeometryUtils.js';

export const PLATE = 0.4;
export const BRICK = 1.2;
export const STUD_R = 0.3;
export const STUD_H = 0.21;
export const CHAMFER = 0.05;

// ---------------------------------------------------------------------------
// Toy plastic palette (original selection, tuned for a sunny desert diorama)
// ---------------------------------------------------------------------------
export const PALETTE = {
  red: 0xc4281c,
  darkRed: 0x83201a,
  blue: 0x1f6fd0,
  darkBlue: 0x1a3a6e,
  yellow: 0xf5cd2f,
  sand: 0xdec69c,
  darkSand: 0xbfa371,
  warmTan: 0xcdaa74,
  brown: 0x7b5d41,
  darkBrown: 0x57432f,
  white: 0xf4f4f4,
  lightGray: 0xa9adb1,
  gray: 0x8a8d8f,
  darkGray: 0x595d60,
  green: 0x2e8540,
  darkGreen: 0x1d5e2e,
  orange: 0xdf7e14,
  black: 0x1b1d22,
  gold: 0xf7c531,
};

// ---------------------------------------------------------------------------
// Shared materials
// ---------------------------------------------------------------------------

const materialCache = new Map();

/** Glossy ABS-style plastic. Cached per color. */
export function plastic(colorHex, opts = {}) {
  const key = `${colorHex}|${JSON.stringify(opts)}`;
  if (materialCache.has(key)) return materialCache.get(key);
  const mat = new THREE.MeshPhysicalMaterial({
    color: colorHex,
    roughness: opts.roughness ?? 0.34,
    metalness: 0,
    clearcoat: opts.clearcoat ?? 0.55,
    clearcoatRoughness: 0.28,
    envMapIntensity: opts.envMapIntensity ?? 0.7,
    ...((opts.extra ?? {})),
  });
  materialCache.set(key, mat);
  return mat;
}

/** White-base plastic used by InstancedMesh with per-instance colors. */
export function instancePlastic() {
  return new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.34,
    metalness: 0,
    clearcoat: 0.55,
    clearcoatRoughness: 0.28,
    envMapIntensity: 0.7,
  });
}

export function goldMetal() {
  return plastic(PALETTE.gold, {
    roughness: 0.22,
    clearcoat: 0.9,
    envMapIntensity: 1.4,
    extra: { metalness: 0.85, emissive: 0x3a2a00, emissiveIntensity: 0.35 },
  });
}

// ---------------------------------------------------------------------------
// Geometry factories (all cached)
// ---------------------------------------------------------------------------

const geometryCache = new Map();

function cached(key, build) {
  if (!geometryCache.has(key)) geometryCache.set(key, build());
  return geometryCache.get(key);
}

/** A single stud cylinder, origin at its base. */
export function studGeometry(segments = 20) {
  return cached(`stud${segments}`, () => {
    const g = new THREE.CylinderGeometry(STUD_R, STUD_R, STUD_H, segments);
    g.translate(0, STUD_H / 2, 0);
    return g;
  });
}

/**
 * Rectangular brick/plate with studs.
 * Origin: center of footprint at y = 0 (bottom), so it sits on the ground.
 *
 * @param sx     studs along X
 * @param sz     studs along Z
 * @param plates height in plate units (3 = standard brick, 1 = plate)
 * @param studs  whether to mold studs on top (false = smooth tile)
 */
export function brickGeometry(sx, sz, plates = 3, studs = true) {
  return cached(`brick:${sx}x${sz}x${plates}:${studs}`, () => {
    const h = plates * PLATE;
    const body = new RoundedBoxGeometry(sx, h, sz, 2, CHAMFER);
    body.translate(0, h / 2, 0);
    const parts = [body];
    if (studs) {
      const stud = studGeometry();
      for (let ix = 0; ix < sx; ix++) {
        for (let iz = 0; iz < sz; iz++) {
          const s = stud.clone();
          s.translate(ix - (sx - 1) / 2, h, iz - (sz - 1) / 2);
          parts.push(s);
        }
      }
    }
    const merged = mergeGeometries(parts, false);
    parts.forEach((p) => p !== body || p.dispose?.());
    return merged;
  });
}

/** Smooth tile (no studs). */
export function tileGeometry(sx, sz, plates = 1) {
  return brickGeometry(sx, sz, plates, false);
}

/**
 * Classic 45-degree slope brick, 1 stud wide, `sz` studs deep
 * (1 stud of flat top with a stud + (sz-1) studs of slope).
 * The slope descends toward -Z; the flat studded part sits at +Z.
 * Origin: footprint center, y = 0.
 */
export function slopeGeometry(sz = 2) {
  return cached(`slope:${sz}`, () => {
    const lip = 0.22;
    const h = BRICK;
    const depth = sz;
    // Profile drawn in the shape's (x, y) plane; we treat shape.x as the
    // brick's depth axis. Flat top from -depth/2 to -depth/2+1, then a 45ish
    // slope falling to a small lip at the front edge.
    const shape = new THREE.Shape();
    shape.moveTo(-depth / 2, 0);
    shape.lineTo(depth / 2, 0);
    shape.lineTo(depth / 2, lip);
    shape.lineTo(-depth / 2 + 1, h);
    shape.lineTo(-depth / 2, h);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false });
    // rotateY(PI/2): world.x = extrude depth, world.z = -shape.x.
    // Flat top (shape.x near -depth/2) ends up at +Z, slope falls toward -Z.
    geo.rotateY(Math.PI / 2);
    geo.computeBoundingBox();
    const bb = geo.boundingBox;
    geo.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
    // Stud centered on the flat part (+Z end).
    const stud = studGeometry().clone();
    stud.translate(0, h, depth / 2 - 0.5);
    const merged = mergeGeometries([geo, stud], false);
    merged.computeVertexNormals();
    return merged;
  });
}

/** 1x1 round brick (origin at bottom). */
export function roundBrickGeometry(plates = 3, radius = 0.5, segments = 24) {
  return cached(`round:${plates}:${radius}`, () => {
    const h = plates * PLATE;
    const body = new THREE.CylinderGeometry(radius, radius, h, segments);
    body.translate(0, h / 2, 0);
    const stud = studGeometry().clone();
    stud.translate(0, h, 0);
    return mergeGeometries([body, stud], false);
  });
}

/** Cone part (origin at bottom). */
export function coneGeometry(radius = 1, plates = 3, segments = 24) {
  return cached(`cone:${radius}:${plates}`, () => {
    const h = plates * PLATE;
    const body = new THREE.CylinderGeometry(STUD_R + 0.05, radius, h, segments);
    body.translate(0, h / 2, 0);
    const stud = studGeometry().clone();
    stud.translate(0, h, 0);
    return mergeGeometries([body, stud], false);
  });
}

/** Gold stud collectible disc (a loose stud, slightly chunkier for readability). */
export function lootStudGeometry() {
  return cached('lootStud', () => {
    const g = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 24);
    g.translate(0, 0.15, 0);
    return g;
  });
}

// ---------------------------------------------------------------------------
// Instanced brick fields
// ---------------------------------------------------------------------------

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3(1, 1, 1);
const _p = new THREE.Vector3();
const _e = new THREE.Euler();
const _c = new THREE.Color();

/**
 * Accumulates placements for one geometry, then bakes a single InstancedMesh
 * with per-instance colors. Keeps the whole desert at a handful of draw calls.
 */
export class BrickField {
  constructor(geometry, material = instancePlastic()) {
    this.geometry = geometry;
    this.material = material;
    this.items = [];
  }

  /** @param rotY radians @param jitter HSL lightness jitter for molded-batch variation */
  add(x, y, z, colorHex, rotY = 0, jitter = 0.035, scale = 1) {
    this.items.push({ x, y, z, colorHex, rotY, jitter, scale });
    return this;
  }

  build({ castShadow = true, receiveShadow = true } = {}) {
    const mesh = new THREE.InstancedMesh(this.geometry, this.material, this.items.length);
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      _p.set(it.x, it.y, it.z);
      _e.set(0, it.rotY, 0);
      _q.setFromEuler(_e);
      _s.setScalar(it.scale);
      _m.compose(_p, _q, _s);
      mesh.setMatrixAt(i, _m);
      _c.setHex(it.colorHex);
      if (it.jitter > 0) {
        const dl = (hash01(it.x * 13.37 + it.z * 7.77 + i * 0.123) - 0.5) * 2 * it.jitter;
        _c.offsetHSL(0, 0, dl);
      }
      mesh.setColorAt(i, _c);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = castShadow;
    mesh.receiveShadow = receiveShadow;
    return mesh;
  }
}

/** Deterministic hash -> [0,1). Used for repeatable per-brick color jitter. */
export function hash01(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * Merge several placed geometries into one static colored mesh
 * (used for small builds like crates that must be removable as a unit).
 * Items: { geo, x, y, z, rotY, color }
 */
export function mergeColoredBricks(items, material) {
  const parts = [];
  for (const it of items) {
    const g = it.geo.clone();
    if (it.rotY) g.rotateY(it.rotY);
    g.translate(it.x, it.y, it.z);
    const count = g.attributes.position.count;
    const colors = new Float32Array(count * 3);
    _c.setHex(it.color);
    for (let i = 0; i < count; i++) {
      colors[i * 3] = _c.r;
      colors[i * 3 + 1] = _c.g;
      colors[i * 3 + 2] = _c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    parts.push(g);
  }
  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  const mat =
    material ??
    new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      roughness: 0.34,
      clearcoat: 0.55,
      clearcoatRoughness: 0.28,
      envMapIntensity: 0.7,
      vertexColors: true,
    });
  const mesh = new THREE.Mesh(merged, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
