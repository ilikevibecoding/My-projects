// Life & air: the plunge-basin mist, spray and light-catching droplets of the
// waterfall, a haze layer drifting over the lagoon, fireflies in the shade,
// gnat swarms over the shallows, sun-lit pollen, tumbling leaves that float
// on the water, butterflies that land, darting dragonflies and distant bird
// flocks (plus the odd pair of parrots).
//
// Every system is ONE InstancedMesh. Sprite systems are fully GPU-animated in
// TSL from per-instance data (position/lifecycle/rotation/opacity), the CPU
// only steers the few "creatures" (leaves, butterflies, dragonflies, birds)
// and recycles anchors around the player so life is always nearby.
// Vertex work is analytic only (no texture reads) — textures are sampled in
// the fragment stage, which is what the WebGL2 fallback needs.

import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  positionGeometry,
  uv,
  texture,
  uniform,
  varying,
  attribute,
  instancedBufferAttribute,
  instanceIndex,
  hash,
  cameraPosition,
  cameraViewMatrix,
  float,
  vec2,
  vec3,
  vec4,
  sin,
  cos,
  fract,
  abs,
  atan,
  clamp,
  mix,
  smoothstep,
  step,
  positionWorld,
  normalize,
  dot,
  max,
  pow,
} from 'three/tsl';
import { WORLD } from './config.js';
import { mulberry32, smoothstep as smoothstepJs, clamp as clampJs } from './noise.js';
import { waveHeightAt } from './water.js';
import { riverCenterX } from './terrain.js';

const TAU = Math.PI * 2;
const GRAVITY = 9.8;
// Where the falling sheet hits the plunge pool (see water.js fallGeo bulge).
const IMPACT_Z = -81.2;
const NEAR_RADIUS = 55; // trees cached around the player for placement queries

// =====================================================================
// procedural sprite textures (seeded canvas → CanvasTexture)
// =====================================================================

function makeCanvas(width, height = width) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function toTexture(canvas, { srgb = true } = {}) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 4;
  return tex;
}

function radial(c, x, y, r0, r1, stops) {
  const g = c.createRadialGradient(x, y, r0, x, y, r1);
  for (const [t, color] of stops) g.addColorStop(t, color);
  return g;
}

function linear(c, x0, y0, x1, y1, c0, c1) {
  const g = c.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, c0);
  g.addColorStop(1, c1);
  return g;
}

// Billowing mist puff: lumpy overlapping blobs, wispy holes, soft radial falloff.
function createPuffTexture(seed) {
  const size = 256;
  const canvas = makeCanvas(size);
  const c = canvas.getContext('2d');
  const random = mulberry32(seed);
  c.clearRect(0, 0, size, size);
  for (let i = 0; i < 10; i += 1) {
    const a = random() * TAU;
    const r = random() * 50;
    const x = 128 + Math.cos(a) * r;
    const y = 128 + Math.sin(a) * r * 0.85;
    const rad = 44 + random() * 42;
    c.fillStyle = radial(c, x, y, 0, rad, [
      [0, 'rgba(255,255,255,0.55)'],
      [0.5, 'rgba(255,255,255,0.26)'],
      [1, 'rgba(255,255,255,0)'],
    ]);
    c.fillRect(0, 0, size, size);
  }
  c.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 16; i += 1) {
    const a = random() * TAU;
    const r = 18 + random() * 74;
    const x = 128 + Math.cos(a) * r;
    const y = 128 + Math.sin(a) * r;
    const rad = 12 + random() * 26;
    c.fillStyle = radial(c, x, y, 0, rad, [[0, 'rgba(0,0,0,0.38)'], [1, 'rgba(0,0,0,0)']]);
    c.fillRect(0, 0, size, size);
  }
  c.globalCompositeOperation = 'destination-in';
  c.fillStyle = radial(c, 128, 128, 26, 126, [
    [0, 'rgba(0,0,0,1)'],
    [0.55, 'rgba(0,0,0,0.82)'],
    [1, 'rgba(0,0,0,0)'],
  ]);
  c.fillRect(0, 0, size, size);
  c.globalCompositeOperation = 'source-over';
  return toTexture(canvas);
}

// Hot core + wide faint halo (fireflies, light-catching droplets, pollen).
function createGlowTexture() {
  const canvas = makeCanvas(128);
  const c = canvas.getContext('2d');
  c.clearRect(0, 0, 128, 128);
  c.fillStyle = radial(c, 64, 64, 0, 62, [
    [0, 'rgba(255,255,255,1)'],
    [0.1, 'rgba(255,255,255,0.95)'],
    [0.28, 'rgba(255,255,255,0.32)'],
    [0.6, 'rgba(255,255,255,0.07)'],
    [1, 'rgba(255,255,255,0)'],
  ]);
  c.fillRect(0, 0, 128, 128);
  return toTexture(canvas);
}

// Small soft dot (spray streaks, gnats).
function createSpeckTexture() {
  const canvas = makeCanvas(64);
  const c = canvas.getContext('2d');
  c.clearRect(0, 0, 64, 64);
  c.fillStyle = radial(c, 32, 32, 0, 31, [
    [0, 'rgba(255,255,255,1)'],
    [0.4, 'rgba(255,255,255,0.92)'],
    [1, 'rgba(255,255,255,0)'],
  ]);
  c.fillRect(0, 0, 64, 64);
  return toTexture(canvas);
}

const LEAF_STYLES = [
  { c0: '#3a8a2a', c1: '#78c44c', vein: 'rgba(20,60,15,0.5)', stem: '#3b6a25', w: 0.62, spots: 0 },
  { c0: '#8fa32e', c1: '#dccf52', vein: 'rgba(70,80,20,0.45)', stem: '#7a7a2a', w: 0.42, spots: 0 },
  { c0: '#7a4a22', c1: '#c98b3e', vein: 'rgba(60,30,10,0.5)', stem: '#5a3a1a', w: 0.7, spots: 9 },
  { c0: '#9a3520', c1: '#e2793c', vein: 'rgba(70,20,10,0.45)', stem: '#6a2a18', w: 0.76, spots: 3 },
];

// Four single leaves side by side (green, yellowing, dry brown, red-tinged), tips up.
function createLeafAtlas(seed) {
  const cell = 128;
  const canvas = makeCanvas(cell * 4, cell);
  const c = canvas.getContext('2d');
  const random = mulberry32(seed);
  c.clearRect(0, 0, canvas.width, canvas.height);
  LEAF_STYLES.forEach((style, k) => {
    const cx = k * cell + 64;
    const h = 98;
    const w = h * style.w;
    const top = 14;
    const bottom = top + h;
    c.save();
    c.beginPath();
    c.moveTo(cx, top);
    c.bezierCurveTo(cx + w * 0.55, top + h * 0.12, cx + w * 0.62, bottom - h * 0.34, cx, bottom);
    c.bezierCurveTo(cx - w * 0.62, bottom - h * 0.34, cx - w * 0.55, top + h * 0.12, cx, top);
    c.closePath();
    c.fillStyle = linear(c, cx, top, cx, bottom, style.c1, style.c0);
    c.fill();
    c.clip();
    // veins
    c.strokeStyle = style.vein;
    c.lineWidth = 2.2;
    c.beginPath();
    c.moveTo(cx, top + 4);
    c.lineTo(cx, bottom);
    c.stroke();
    c.lineWidth = 1.2;
    for (let i = 0; i < 6; i += 1) {
      const y = top + h * (0.16 + i * 0.13);
      const reach = w * 0.5 * (1 - Math.abs(i - 2.5) * 0.12);
      c.beginPath();
      c.moveTo(cx, y);
      c.quadraticCurveTo(cx + reach * 0.5, y + h * 0.03, cx + reach, y + h * 0.1);
      c.moveTo(cx, y);
      c.quadraticCurveTo(cx - reach * 0.5, y + h * 0.03, cx - reach, y + h * 0.1);
      c.stroke();
    }
    // decay spots
    for (let i = 0; i < style.spots; i += 1) {
      c.fillStyle = `rgba(40, 22, 8, ${0.25 + random() * 0.3})`;
      c.beginPath();
      c.arc(cx + (random() - 0.5) * w * 0.8, top + 10 + random() * (h - 20), 2 + random() * 5, 0, TAU);
      c.fill();
    }
    c.restore();
    // stem
    c.strokeStyle = style.stem;
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(cx, bottom - 2);
    c.lineTo(cx + 2, bottom + 12);
    c.stroke();
  });
  return toTexture(canvas);
}

const BUTTERFLY_STYLES = [
  // blue morpho
  {
    c0: '#3d9bff', c1: '#123fb5', border: 13, borderColor: '#0b0d14',
    pattern(c) {
      c.fillStyle = 'rgba(255,255,255,0.9)';
      for (const [x, y, r] of [[102, -62, 3.2], [113, -42, 3], [88, -84, 2.6], [66, 100, 2.6], [46, 108, 2.4]]) {
        c.beginPath();
        c.arc(x, y, r, 0, TAU);
        c.fill();
      }
    },
  },
  // monarch
  {
    c0: '#ff8c1e', c1: '#d9541a', border: 10, borderColor: '#14100c',
    pattern(c, fore, hind) {
      c.strokeStyle = '#14100c';
      c.lineWidth = 3.2;
      c.save();
      c.clip(fore);
      c.beginPath();
      for (const [x, y] of [[60, -96], [90, -84], [110, -52], [108, -30]]) {
        c.moveTo(6, 0);
        c.lineTo(x, y);
      }
      c.stroke();
      c.restore();
      c.save();
      c.clip(hind);
      c.beginPath();
      for (const [x, y] of [[70, 40], [84, 70], [64, 100], [40, 110]]) {
        c.moveTo(6, 8);
        c.lineTo(x, y);
      }
      c.stroke();
      c.restore();
      c.fillStyle = 'rgba(255,255,255,0.92)';
      for (const [x, y] of [[96, -72], [108, -48], [104, -28], [76, 90], [52, 106]]) {
        c.beginPath();
        c.arc(x, y, 2.8, 0, TAU);
        c.fill();
      }
    },
  },
  // swallowtail
  {
    c0: '#f7e57e', c1: '#e6c43a', border: 9, borderColor: '#17140f',
    pattern(c, fore, hind) {
      c.save();
      c.clip(fore);
      c.strokeStyle = '#17140f';
      c.lineWidth = 9;
      c.beginPath();
      for (const [x0, y0, x1, y1] of [[22, -14, 52, -98], [44, -4, 82, -92], [66, 4, 108, -70]]) {
        c.moveTo(x0, y0);
        c.lineTo(x1, y1);
      }
      c.stroke();
      c.restore();
      c.save();
      c.clip(hind);
      c.fillStyle = '#3a6dff';
      for (const [x, y] of [[32, 70], [46, 88], [60, 74]]) {
        c.beginPath();
        c.arc(x, y, 6, 0, TAU);
        c.fill();
      }
      c.fillStyle = '#ff7a1e';
      c.beginPath();
      c.arc(24, 96, 7, 0, TAU);
      c.fill();
      c.restore();
      c.fillStyle = '#17140f';
      c.beginPath();
      c.moveTo(56, 98);
      c.lineTo(72, 94);
      c.lineTo(66, 126);
      c.closePath();
      c.fill();
    },
  },
  // pink / violet with eyespots
  {
    c0: '#ff6fb5', c1: '#8a2ba8', border: 6, borderColor: '#2a0a2e',
    pattern(c) {
      for (const [x, y, r] of [[72, -52, 13], [54, 60, 9]]) {
        c.fillStyle = '#120612';
        c.beginPath();
        c.arc(x, y, r, 0, TAU);
        c.fill();
        c.fillStyle = 'rgba(255,255,255,0.9)';
        c.beginPath();
        c.arc(x - r * 0.3, y - r * 0.3, r * 0.3, 0, TAU);
        c.fill();
      }
    },
  },
];

// Four butterfly wing designs side by side, head at the top.
function createButterflyAtlas(seed) {
  const cell = 256;
  const canvas = makeCanvas(cell * 4, cell);
  const c = canvas.getContext('2d');
  const random = mulberry32(seed);
  c.clearRect(0, 0, canvas.width, canvas.height);
  BUTTERFLY_STYLES.forEach((style, k) => {
    c.save();
    c.translate(k * cell + 128, 128);
    for (const side of [-1, 1]) {
      c.save();
      c.scale(side, 1);
      const fore = new Path2D();
      fore.moveTo(6, 0);
      fore.bezierCurveTo(70, -110, 124, -86, 112, -26);
      fore.bezierCurveTo(104, 6, 52, 16, 6, 6);
      fore.closePath();
      const hind = new Path2D();
      hind.moveTo(6, 8);
      hind.bezierCurveTo(72, 18, 96, 66, 64, 102);
      hind.bezierCurveTo(34, 124, 8, 76, 6, 18);
      hind.closePath();
      c.fillStyle = linear(c, 0, 0, 110, -80, style.c0, style.c1);
      c.fill(fore);
      c.fillStyle = linear(c, 0, 0, 90, 80, style.c1, style.c0);
      c.fill(hind);
      style.pattern(c, fore, hind, random);
      c.strokeStyle = style.borderColor;
      c.lineWidth = style.border * 2;
      c.save();
      c.clip(fore);
      c.stroke(fore);
      c.restore();
      c.save();
      c.clip(hind);
      c.stroke(hind);
      c.restore();
      c.restore();
    }
    c.fillStyle = '#20150c';
    c.beginPath();
    c.ellipse(0, 0, 7, 40, 0, 0, TAU);
    c.fill();
    c.beginPath();
    c.arc(0, -44, 8, 0, TAU);
    c.fill();
    c.strokeStyle = '#20150c';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(-3, -50);
    c.quadraticCurveTo(-18, -78, -30, -84);
    c.moveTo(3, -50);
    c.quadraticCurveTo(18, -78, 30, -84);
    c.stroke();
    c.restore();
  });
  return toTexture(canvas);
}

// Left half: body (head up). Right half: one translucent veined wing (root left).
function createDragonflyTexture(seed) {
  const canvas = makeCanvas(256, 128);
  const c = canvas.getContext('2d');
  const random = mulberry32(seed);
  c.clearRect(0, 0, 256, 128);

  // body
  c.fillStyle = linear(c, 0, 20, 0, 124, '#25c4d2', '#1c4fb8');
  c.beginPath();
  c.roundRect(58, 44, 12, 80, 5);
  c.fill();
  c.fillStyle = 'rgba(8, 20, 30, 0.75)';
  for (let y = 52; y < 122; y += 8) {
    c.fillRect(58, y, 12, 2);
  }
  c.fillStyle = linear(c, 52, 20, 76, 50, '#1e8f9c', '#12505c');
  c.beginPath();
  c.ellipse(64, 34, 12, 15, 0, 0, TAU);
  c.fill();
  c.fillStyle = '#0d3038';
  c.beginPath();
  c.arc(64, 14, 9, 0, TAU);
  c.fill();
  c.fillStyle = '#3ce6ee';
  for (const ex of [58, 70]) {
    c.beginPath();
    c.arc(ex, 11, 5.5, 0, TAU);
    c.fill();
  }
  c.fillStyle = 'rgba(255,255,255,0.7)';
  for (const ex of [56, 68]) {
    c.beginPath();
    c.arc(ex, 9, 1.8, 0, TAU);
    c.fill();
  }

  // wing (root at x=132, tip at x=252, leading edge at the top)
  const wing = new Path2D();
  wing.moveTo(132, 44);
  wing.quadraticCurveTo(190, 26, 238, 30);
  wing.quadraticCurveTo(254, 36, 250, 54);
  wing.quadraticCurveTo(228, 84, 176, 92);
  wing.quadraticCurveTo(146, 92, 132, 70);
  wing.closePath();
  c.fillStyle = 'rgba(228, 242, 250, 0.32)';
  c.fill(wing);
  c.save();
  c.clip(wing);
  c.strokeStyle = 'rgba(30, 50, 60, 0.6)';
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(132, 48);
  c.quadraticCurveTo(190, 34, 246, 38);
  c.moveTo(132, 58);
  c.quadraticCurveTo(190, 52, 244, 52);
  c.moveTo(132, 66);
  c.quadraticCurveTo(180, 74, 230, 70);
  c.stroke();
  c.strokeStyle = 'rgba(30, 50, 60, 0.35)';
  for (let i = 0; i < 16; i += 1) {
    const x = 138 + i * 7 + random() * 3;
    c.beginPath();
    c.moveTo(x, 30 + random() * 8);
    c.lineTo(x - 2 + random() * 4, 92 - i * 1.4);
    c.stroke();
  }
  c.fillStyle = 'rgba(20, 30, 40, 0.85)';
  c.fillRect(230, 33, 11, 6);
  c.fillStyle = 'rgba(255,255,255,0.18)';
  c.beginPath();
  c.ellipse(190, 46, 40, 8, -0.1, 0, TAU);
  c.fill();
  c.restore();
  c.strokeStyle = 'rgba(255,255,255,0.55)';
  c.lineWidth = 1.5;
  c.stroke(wing);
  return toTexture(canvas);
}

// Bird masks, tinted per instance in TSL. Top view (flat card): R = body,
// G = wings, head at the top. Side view (vertical card): B = body profile,
// tail at the left, head at the right. Channels are additive so all three
// masks share the one texture.
function createBirdTexture() {
  const canvas = makeCanvas(128);
  const c = canvas.getContext('2d');
  c.clearRect(0, 0, 128, 128);
  c.fillStyle = 'rgb(0,255,0)';
  for (const side of [-1, 1]) {
    c.save();
    c.translate(64, 0);
    c.scale(side, 1);
    c.beginPath();
    c.moveTo(6, 50);
    c.quadraticCurveTo(30, 36, 60, 40);
    c.lineTo(58, 48);
    c.lineTo(52, 46);
    c.lineTo(48, 56);
    c.lineTo(40, 55);
    c.quadraticCurveTo(24, 70, 8, 74);
    c.closePath();
    c.fill();
    c.restore();
  }
  c.fillStyle = 'rgb(255,0,0)';
  c.beginPath();
  c.ellipse(64, 66, 8, 30, 0, 0, TAU);
  c.fill();
  c.beginPath();
  c.arc(64, 30, 7, 0, TAU);
  c.fill();
  c.beginPath();
  c.moveTo(60, 90);
  c.lineTo(68, 90);
  c.lineTo(78, 122);
  c.lineTo(64, 116);
  c.lineTo(50, 122);
  c.closePath();
  c.fill();
  // side profile: streamlined body, head + beak forward, forked tail behind
  c.globalCompositeOperation = 'lighter';
  c.fillStyle = 'rgb(0,0,255)';
  c.beginPath();
  c.ellipse(62, 68, 34, 9, -0.06, 0, TAU);
  c.fill();
  c.beginPath();
  c.arc(98, 61, 7.5, 0, TAU);
  c.fill();
  c.beginPath();
  c.moveTo(104, 58);
  c.lineTo(118, 62);
  c.lineTo(104, 65);
  c.closePath();
  c.fill();
  c.beginPath();
  c.moveTo(32, 62);
  c.lineTo(6, 56);
  c.lineTo(12, 68);
  c.lineTo(6, 80);
  c.lineTo(32, 74);
  c.closePath();
  c.fill();
  c.globalCompositeOperation = 'source-over';
  return toTexture(canvas, { srgb: false });
}

// =====================================================================
// geometry helpers
// =====================================================================

// Flat card lying in XZ (normal +y), texture top → -z (the forward direction).
function flatCard(width, depth, wSegs = 1, dSegs = 1) {
  const geometry = new THREE.PlaneGeometry(width, depth, wSegs, dSegs);
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

// Bake a flipped-winding copy so both faces render as front faces (see
// vegetation.prepareFoliage) — lit alpha-tested cards without DoubleSide.
function twoSided(geometry) {
  const flipped = geometry.clone();
  const idx = flipped.index.array;
  for (let i = 0; i < idx.length; i += 3) {
    const tmp = idx[i + 1];
    idx[i + 1] = idx[i + 2];
    idx[i + 2] = tmp;
  }
  const merged = mergeGeometries([geometry, flipped]);
  geometry.dispose();
  flipped.dispose();
  return merged;
}

// Body (two crossed slivers) + two wing pairs; aPart: 0 body, 1 fore, 2 hind.
function dragonflyGeometry() {
  const parts = [];
  function piece(w, d, part, remapUV, transform) {
    const g = flatCard(w, d);
    if (transform) transform(g);
    const uvAttr = g.attributes.uv;
    for (let i = 0; i < uvAttr.count; i += 1) {
      const [u, v] = remapUV(uvAttr.getX(i), uvAttr.getY(i));
      uvAttr.setXY(i, u, v);
    }
    g.setAttribute('aPart', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(part), 1));
    parts.push(g);
  }
  piece(0.03, 0.2, 0, (u, v) => [u * 0.5, v]);
  piece(0.03, 0.2, 0, (u, v) => [u * 0.5, v], (g) => g.rotateZ(Math.PI / 2));
  const wingLen = 0.15;
  const root = 0.012;
  for (const side of [1, -1]) {
    const wingUV = (u, v) => [0.5 + 0.5 * (side > 0 ? u : 1 - u), v];
    piece(wingLen, 0.05, 1, wingUV, (g) => g.translate(side * (root + wingLen / 2), 0, -0.02));
    piece(wingLen * 0.9, 0.06, 2, wingUV, (g) => g.translate(side * (root + wingLen * 0.45), 0, 0.035));
  }
  const merged = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  return merged;
}

// Crossed cards: the flat wing card (aPart 0, flaps) plus a vertical body
// profile along the flight axis (aPart 1) so a bird seen side-on still has a
// body instead of collapsing into a hairline.
function birdGeometry() {
  const flat = flatCard(1.5, 0.6, 6, 1);
  flat.setAttribute('aPart', new THREE.BufferAttribute(new Float32Array(flat.attributes.position.count).fill(0), 1));
  const side = new THREE.PlaneGeometry(0.6, 0.3, 1, 1);
  side.rotateY(Math.PI / 2); // +u (head) → -z, +v → +y
  side.translate(0, -0.02, 0);
  side.setAttribute('aPart', new THREE.BufferAttribute(new Float32Array(side.attributes.position.count).fill(1), 1));
  const merged = mergeGeometries([flat, side]);
  flat.dispose();
  side.dispose();
  return merged;
}

// =====================================================================
// TSL helpers
// =====================================================================

// Per-instance vec4 stream (InstancedBufferAttribute + TSL attribute node).
function instanceStream(count, dynamic = false) {
  const array = new Float32Array(count * 4);
  const attribute = new THREE.InstancedBufferAttribute(array, 4);
  attribute.setUsage(dynamic ? THREE.DynamicDrawUsage : THREE.StaticDrawUsage);
  const node = instancedBufferAttribute(attribute, 'vec4');
  return {
    array,
    attribute,
    node,
    set(i, x, y, z, w) {
      const o = i * 4;
      array[o] = x;
      array[o + 1] = y;
      array[o + 2] = z;
      array[o + 3] = w;
    },
    upload() {
      attribute.needsUpdate = true;
    },
  };
}

// local card vertex → world, from aPos (x,y,z,scale) and aRot (yaw,pitch,roll).
function placeCard(local, aPos, aRot) {
  const p0 = local.mul(aPos.w);
  const cp = cos(aRot.y);
  const sp = sin(aRot.y);
  const p1 = vec3(p0.x, p0.y.mul(cp).sub(p0.z.mul(sp)), p0.y.mul(sp).add(p0.z.mul(cp)));
  const cr = cos(aRot.z);
  const sr = sin(aRot.z);
  const p2 = vec3(p1.x.mul(cr).sub(p1.y.mul(sr)), p1.x.mul(sr).add(p1.y.mul(cr)), p1.z);
  const cy = cos(aRot.x);
  const sy = sin(aRot.x);
  const p3 = vec3(p2.x.mul(cy).add(p2.z.mul(sy)), p2.y, p2.z.mul(cy).sub(p2.x.mul(sy)));
  return p3.add(aPos.xyz);
}

// Wings hinge along the body axis: fold angle = rest + amplitude * sin(phase).
function foldWings(theta) {
  return vec3(
    positionGeometry.x.mul(cos(theta)),
    positionGeometry.y.add(abs(positionGeometry.x).mul(sin(theta))),
    positionGeometry.z
  );
}

// yaw so that local -z points along the world direction (dx, dz)
function yawFor(dx, dz) {
  return Math.atan2(-dx, -dz);
}

function sheetZ(y) {
  const t = clampJs((y + 0.6) / 20.1, 0, 1);
  return -85.4 + Math.pow(1 - t, 1.8) * 4.2;
}

// =====================================================================
// the particle systems
// =====================================================================

export function createParticles(ctx) {
  const { scene, terrain, camera, player } = ctx;
  const placeRandom = mulberry32(WORLD.seed + 4242); // initial layout
  const liveRandom = mulberry32(WORLD.seed + 4343); // runtime respawns
  const lagoon = WORLD.lagoonCenter;
  const meshes = [];
  const updaters = [];
  const systems = [];

  const sprites = {
    puff: createPuffTexture(4801),
    glow: createGlowTexture(),
    speck: createSpeckTexture(),
    leaves: createLeafAtlas(4802),
    butterflies: createButterflyAtlas(4803),
    dragonfly: createDragonflyTexture(4804),
    bird: createBirdTexture(),
  };

  // ---------- global wind / gusts ----------
  const wind = { gust: 0, time: 0, dirX: 1, dirZ: 0, angle: 0.6 };
  const uTime = uniform(0);
  const uSunDir = uniform(new THREE.Vector3(0, 1, 0));
  if (ctx.sky?.sunDirection) uSunDir.value.copy(ctx.sky.sunDirection);
  const uWind = uniform(0); // gust-integrated drift time
  const uGust = uniform(0);
  const uBoost = uniform(1); // debug/tuning multiplier for the glow systems
  const debug = { uBoost };

  function updateWind(dt, t) {
    const raw = Math.sin(t * 0.13) * 0.6 + Math.sin(t * 0.071 + 1.3) * 0.5 + Math.sin(t * 0.29 + 2.1) * 0.3 - 0.35;
    const target = clampJs(raw * 1.6, 0, 1);
    wind.gust += (target - wind.gust) * Math.min(1, dt * 1.4);
    wind.time += dt * (1 + wind.gust * 1.8);
    wind.angle = 0.6 + Math.sin(t * 0.02) * 0.9;
    wind.dirX = Math.cos(wind.angle);
    wind.dirZ = Math.sin(wind.angle);
    uTime.value = t;
    uWind.value = wind.time;
    uGust.value = wind.gust;
  }

  // ---------- world queries ----------
  const groundAt = (x, z) => terrain.sampleHeight(x, z);
  const px = () => player.position.x;
  const pz = () => player.position.z;

  // Trees: read back from the vegetation trunk layers (read-only). The crown
  // sits at the top of the trunk geometry; its radius is the species' crown
  // half-width. Instance k of a layer is live while k < mesh.count, so the
  // preset density is honoured per layer.
  const TRUNK_LAYERS = [
    { name: 'emergent-trunks', crownR: 5.6 },
    { name: 'canopy-trunks', crownR: 3.8 },
    { name: 'understory-trunks', crownR: 2.3 },
  ];
  const treeLayers = [];
  const trees = [];
  {
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    for (const spec of TRUNK_LAYERS) {
      const mesh = ctx.vegetation?.meshes?.find((mm) => mm.name === spec.name) ?? null;
      if (!mesh) continue;
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      const trunkTop = mesh.geometry.boundingBox.max.y;
      const list = [];
      for (let i = 0; i < mesh.instanceMatrix.count; i += 1) {
        mesh.getMatrixAt(i, m);
        m.decompose(p, q, s);
        if (s.y < 0.01) continue;
        list.push({ x: p.x, y: p.y, z: p.z, crownY: p.y + trunkTop * s.y * 0.92, crownR: spec.crownR * s.x });
      }
      treeLayers.push({ mesh, list });
      trees.push(...list);
    }
  }
  const activeTrees = () => treeLayers.reduce((n, l) => n + Math.min(l.list.length, l.mesh.count), 0);
  debug.trees = trees;
  debug.trunks = treeLayers[0]?.mesh ?? null;
  const nearCache = { x: NaN, z: NaN, count: -1, list: [], close: [] };
  function refreshNear() {
    const x = px();
    const z = pz();
    const count = activeTrees();
    if (nearCache.count === count && Math.hypot(x - nearCache.x, z - nearCache.z) < 4) {
      return;
    }
    const list = [];
    const close = [];
    for (const layer of treeLayers) {
      const n = Math.min(layer.list.length, layer.mesh.count);
      for (let i = 0; i < n; i += 1) {
        const tr = layer.list[i];
        const d = Math.hypot(tr.x - x, tr.z - z);
        if (d < NEAR_RADIUS) list.push(tr);
        if (d < 32) close.push(tr);
      }
    }
    Object.assign(nearCache, { x, z, count, list, close });
  }
  // trees within 55 m of the player (for shade queries)
  function treesNearPlayer() {
    refreshNear();
    return nearCache.list;
  }
  // trees within 32 m — where shed leaves / fireflies are actually visible
  function treesClose() {
    refreshNear();
    return nearCache.close.length > 0 ? nearCache.close : nearCache.list;
  }
  function treesWithin(list, x, z, radius) {
    let n = 0;
    for (const tr of list) {
      if (Math.hypot(tr.x - x, tr.z - z) < radius) n += 1;
    }
    return n;
  }
  function pick(list, random) {
    return list[Math.floor(random() * list.length) % list.length];
  }
  function distToLagoon(x, z) {
    return Math.hypot(x - lagoon.x, z - lagoon.z);
  }
  function isWater(x, z) {
    return groundAt(x, z) < WORLD.waterLevel - 0.3;
  }
  // nearest open-water target: lagoon center or the river center line
  function waterTarget(x, z, out) {
    if (z < lagoon.z + 44 && distToLagoon(x, z) < 70) {
      out.x = lagoon.x;
      out.z = lagoon.z;
    } else {
      out.x = riverCenterX(z);
      out.z = z;
    }
    return out;
  }
  // random point on water (or wet shore when `shore`) within radius of the player
  function findWaterPoint(random, minR, maxR, shore, out) {
    for (let k = 0; k < 30; k += 1) {
      const a = random() * TAU;
      const r = minR + random() * (maxR - minR);
      const x = px() + Math.cos(a) * r;
      const z = pz() + Math.sin(a) * r;
      const g = groundAt(x, z);
      const ok = shore ? g < WORLD.waterLevel + 0.3 && g > WORLD.waterLevel - 3 : g < WORLD.waterLevel - 0.6;
      if (ok) {
        out.x = x;
        out.z = z;
        return true;
      }
    }
    return false;
  }

  // ---------- material / mesh factories ----------
  // The post scene pass is MRT (color + view normals for GTAO) and the normal
  // attachment is written without blending, so a transparent sprite stamps
  // its normal over its whole quad. Give sprites a camera-facing normal (the
  // least harmful value for GTAO) and discard fragments that are invisible
  // anyway so the stamped footprint shrinks to what the sprite really covers.
  function spriteSystem({ name, count, min, blending = THREE.NormalBlending, fog = true, renderOrder = 3, alphaTest = 0.008 }) {
    const material = new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false, blending, alphaTest });
    material.fog = fog;
    material.normalNode = vec3(0, 0, 1);
    const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), material, count);
    mesh.name = name;
    mesh.frustumCulled = false;
    mesh.renderOrder = renderOrder;
    scene.add(mesh);
    meshes.push(mesh);
    systems.push({ mesh, max: count, min });
    return { mesh, material };
  }

  function cardSystem({ name, geometry, material, count, min, renderOrder = 0 }) {
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    mesh.name = name;
    mesh.frustumCulled = false;
    mesh.renderOrder = renderOrder;
    scene.add(mesh);
    meshes.push(mesh);
    systems.push({ mesh, max: count, min });
    const pos = instanceStream(count, true);
    const rot = instanceStream(count, true);
    const anim = instanceStream(count, true);
    return { mesh, pos, rot, anim };
  }

  const camDist = (center) => center.sub(cameraPosition).length();

  // =================================================================
  // 1. waterfall mist volume + lagoon haze layer (one system)
  // =================================================================
  const MIST_COUNT = 140;
  {
    const { mesh, material } = spriteSystem({ name: 'mist', count: MIST_COUNT, min: 24, renderOrder: 3, alphaTest: 0.003 });
    const d0 = instanceStream(MIST_COUNT); // x y z size
    const d1 = instanceStream(MIST_COUNT); // period rise driftZ alpha
    const d2 = instanceStream(MIST_COUNT); // spin growth driftX phase
    const d3 = instanceStream(MIST_COUNT); // aspect brightness wobble -
    const tri = (r) => (placeRandom() + placeRandom() - 1) * r;
    for (let i = 0; i < MIST_COUNT; i += 1) {
      const haze = i % 7 === 3 || i % 7 === 6; // ~2/7 of the instances, interleaved
      if (haze) {
        const x0 = tri(28);
        d0.set(i, x0, 0.4 + placeRandom() * 1.2, -80 + placeRandom() * 30, 11 + placeRandom() * 8);
        d1.set(i, 16 + placeRandom() * 14, 0.3 + placeRandom() * 1.0, 6 + placeRandom() * 8, 0.04 + placeRandom() * 0.04);
        d2.set(i, (placeRandom() - 0.5) * 0.06, 0.2 + placeRandom() * 0.4, tri(4), placeRandom());
        d3.set(i, 0.42, 0.9 + placeRandom() * 0.1, 0.4 + placeRandom() * 0.5, 0);
      } else {
        const x0 = tri(5.4);
        // plunge mist: thinner + lower so the falling sheet stays legible above it
        d0.set(i, x0, 0.1 + placeRandom() * 0.9, IMPACT_Z + tri(1.6), 1.6 + placeRandom() * 1.5);
        d1.set(i, 3.2 + placeRandom() * 3.0, 1.8 + placeRandom() * 2.8, 1.5 + placeRandom() * 3.5, 0.085 + placeRandom() * 0.075);
        d2.set(i, (placeRandom() - 0.5) * 0.56, 0.7 + placeRandom() * 0.7, x0 * (0.15 + placeRandom() * 0.45) + tri(0.8), placeRandom());
        d3.set(i, 1, 0.85 + placeRandom() * 0.15, 0.6 + placeRandom() * 0.8, 0);
      }
    }
    const D0 = d0.node;
    const D1 = d1.node;
    const D2 = d2.node;
    const D3 = d3.node;
    const age = fract(uTime.div(D1.x).add(D2.w));
    const ease = age.mul(float(2).sub(age)); // fast initial rise, then slow
    const wobble = sin(uWind.mul(0.35).add(D2.w.mul(TAU))).mul(D0.w).mul(0.08).mul(D3.z);
    const center = vec3(
      D0.x.add(D2.z.mul(age)).add(wobble),
      D0.y.add(D1.y.mul(ease)),
      D0.z.add(D1.z.mul(age)).add(uGust.mul(D1.z).mul(0.25).mul(age))
    );
    const rotation = D2.w.mul(TAU).add(uTime.mul(D2.x));
    const fade = smoothstep(0.0, 0.12, age).mul(smoothstep(0.45, 1.0, age).oneMinus());
    const nearFade = smoothstep(2.0, 9.0, camDist(center));
    const alphaV = varying(D1.w.mul(fade).mul(nearFade));
    // billboard-space vertical (0 bottom → 1 top) for a light-from-above tint
    const shadeV = varying(positionGeometry.x.mul(sin(rotation)).add(positionGeometry.y.mul(cos(rotation))).add(0.5));
    const brightV = varying(D3.y);
    material.positionNode = center;
    material.scaleNode = vec2(D0.w, D0.w.mul(D3.x)).mul(float(1).add(D2.y.mul(age)));
    material.rotationNode = rotation;
    const tex = texture(sprites.puff, uv());
    material.colorNode = mix(vec3(0.8, 0.86, 0.93), vec3(1.06, 1.06, 1.06), shadeV).mul(brightV);
    material.opacityNode = tex.a.mul(alphaV);
    d0.upload();
    d1.upload();
    d2.upload();
    d3.upload();
    mesh.userData.kind = 'mist+haze';
  }

  // =================================================================
  // 2. spray: ballistic droplets and arcing jets thrown from the impact line
  // =================================================================
  const SPRAY_COUNT = 240;
  function ballisticSystem({ name, count, min, map, blending, renderOrder, fog, additive }) {
    const { mesh, material } = spriteSystem({ name, count, min, blending, fog, renderOrder, alphaTest: additive ? 0.02 : 0.008 });
    const d0 = instanceStream(count); // x0 y0 z0 size
    const d1 = instanceStream(count); // vx vy vz flightTime
    const d2 = instanceStream(count); // phase alpha stretch twinkleRate
    const D0 = d0.node;
    const D1 = d1.node;
    const D2 = d2.node;
    const age = fract(uTime.div(D1.w).add(D2.x));
    const t = age.mul(D1.w);
    const center = vec3(
      D0.x.add(D1.x.mul(t)),
      D0.y.add(D1.y.mul(t)).sub(t.mul(t).mul(GRAVITY * 0.5)),
      D0.z.add(D1.z.mul(t))
    );
    const vel = vec3(D1.x, D1.y.sub(t.mul(GRAVITY)), D1.z);
    const vView = cameraViewMatrix.mul(vec4(vel, 0.0)).xy;
    const rotation = atan(vView.y, vView.x).sub(Math.PI / 2);
    const speed = vel.length();
    const fade = smoothstep(0.0, 0.06, age).mul(smoothstep(0.55, 1.0, age).oneMinus());
    const nearFade = smoothstep(0.8, 4.0, camDist(center));
    let intensity = D2.y.mul(fade).mul(nearFade);
    if (additive) {
      const twinkle = sin(uTime.mul(D2.w).add(D2.x.mul(TAU))).mul(0.5).add(0.5);
      intensity = intensity.mul(twinkle.mul(twinkle).mul(0.85).add(0.15));
    }
    const alphaV = varying(intensity);
    material.positionNode = center;
    material.rotationNode = rotation;
    material.scaleNode = vec2(D0.w, D0.w.mul(float(1).add(speed.mul(D2.z))));
    const tex = texture(map, uv());
    material.colorNode = (additive ? vec3(1.0, 0.98, 0.9).mul(1.7) : vec3(0.93, 0.98, 1.0)).mul(tex.rgb);
    material.opacityNode = tex.a.mul(alphaV);
    return { mesh, material, d0, d1, d2 };
  }
  {
    const spray = ballisticSystem({ name: 'spray', count: SPRAY_COUNT, min: 40, map: sprites.speck, renderOrder: 4 });
    const tri = (r) => (placeRandom() + placeRandom() - 1) * r;
    const flight = (vy, y0) => (vy + Math.sqrt(vy * vy + 2 * GRAVITY * y0)) / GRAVITY;
    let i = 0;
    // loose droplets
    for (; i < 150; i += 1) {
      const x0 = tri(4.6);
      const y0 = 0.1 + placeRandom() * 1.2;
      const vy = 2.2 + placeRandom() * 5.0;
      // fine droplets (a few cm) — big blobs read as cartoon foam from mid-distance
      spray.d0.set(i, x0, y0, IMPACT_Z + tri(1.0), 0.035 + placeRandom() * 0.06);
      spray.d1.set(i, x0 * 0.25 + tri(2.2), vy, 0.6 + placeRandom() * 3.6, flight(vy, y0));
      spray.d2.set(i, placeRandom(), 0.35 + placeRandom() * 0.4, 0.08 + placeRandom() * 0.08, 0);
    }
    // arcing jets: 15 arcs × 6 beads following the same trajectory
    for (let a = 0; a < 15; a += 1) {
      const x0 = tri(4.2);
      const y0 = 0.2 + placeRandom() * 0.8;
      const z0 = IMPACT_Z + tri(0.8);
      const vx = x0 * 0.35 + tri(1.6);
      const vy = 3.5 + placeRandom() * 4.0;
      const vz = 1.2 + placeRandom() * 3.2;
      const T = flight(vy, y0);
      const phase = placeRandom();
      for (let k = 0; k < 6; k += 1, i += 1) {
        spray.d0.set(i, x0, y0, z0, 0.085 - k * 0.007);
        spray.d1.set(i, vx, vy, vz, T);
        spray.d2.set(i, phase + k * 0.055, 0.55 - k * 0.05, 0.12, 0);
      }
    }
    spray.d0.upload();
    spray.d1.upload();
    spray.d2.upload();
  }

  // =================================================================
  // 3. droplets catching the light (additive twinkles, basin + along the sheet)
  // =================================================================
  const DROPLET_COUNT = 150;
  {
    const drops = ballisticSystem({
      name: 'droplets', count: DROPLET_COUNT, min: 30, map: sprites.glow,
      blending: THREE.AdditiveBlending, fog: false, renderOrder: 6, additive: true,
    });
    const tri = (r) => (placeRandom() + placeRandom() - 1) * r;
    const flight = (vy, y0) => (vy + Math.sqrt(vy * vy + 2 * GRAVITY * y0)) / GRAVITY;
    for (let i = 0; i < DROPLET_COUNT; i += 1) {
      if (i % 9 < 5) {
        const x0 = tri(4.6);
        const y0 = 0.2 + placeRandom() * 1.0;
        const vy = 3.5 + placeRandom() * 5.0;
        drops.d0.set(i, x0, y0, IMPACT_Z + tri(1.0), 0.04 + placeRandom() * 0.05);
        drops.d1.set(i, x0 * 0.3 + tri(2.4), vy, 0.5 + placeRandom() * 3.5, flight(vy, y0));
      } else {
        const y0 = 1 + placeRandom() * 15;
        const x0 = tri(4.4);
        const vy = -0.6 + placeRandom() * 1.8;
        drops.d0.set(i, x0, y0, sheetZ(y0) + 0.15 + placeRandom() * 0.5, 0.035 + placeRandom() * 0.045);
        drops.d1.set(i, tri(1.0), vy, 0.5 + placeRandom() * 2.2, flight(vy, y0));
      }
      drops.d2.set(i, placeRandom(), 0.5 + placeRandom() * 0.5, 0.05, 5 + placeRandom() * 6);
    }
    drops.d0.upload();
    drops.d1.upload();
    drops.d2.upload();
  }

  // =================================================================
  // 4. fireflies in the shade under the canopy (recycled around the player)
  // =================================================================
  const FIREFLY_COUNT = 120;
  {
    const { mesh, material } = spriteSystem({
      name: 'fireflies', count: FIREFLY_COUNT, min: 16, blending: THREE.AdditiveBlending, fog: false, renderOrder: 6, alphaTest: 0.02,
    });
    const d0 = instanceStream(FIREFLY_COUNT, true); // anchor xyz, size
    const d1 = instanceStream(FIREFLY_COUNT, true); // phaseA phaseB blinkRate brightness
    // Fireflies only read as fireflies in deep shade: a glowing dot hanging in
    // noon sunlight is just "a particle system". Candidates are drawn around
    // nearby trees and kept only where the canopy closes over (density ≥ 0.55);
    // a firefly that finds no shade is parked dark (size 0) until recycled.
    const canopyAt = (x, z) => (terrain.canopyDensity ? terrain.canopyDensity(x, z) : 1);
    function place(i, random) {
      const list = treesClose();
      let x = px();
      let z = pz();
      let shaded = false;
      for (let k = 0; k < 8 && !shaded; k += 1) {
        if (list.length > 0) {
          const tr = pick(list, random);
          const a = random() * TAU;
          const r = 0.8 + random() * 4.6;
          x = tr.x + Math.cos(a) * r;
          z = tr.z + Math.sin(a) * r;
        } else {
          const a = random() * TAU;
          const r = 8 + random() * 22;
          x = px() + Math.cos(a) * r;
          z = pz() + Math.sin(a) * r;
        }
        shaded = canopyAt(x, z) >= 0.55 && groundAt(x, z) > WORLD.waterLevel + 0.2;
      }
      const g = Math.max(groundAt(x, z), WORLD.waterLevel);
      const rate = 0.7 + random() * 1.1;
      // start in the dark part of the blink so respawns never pop
      const pa = (-Math.PI / 2 - uTime.value * rate) / 7 + Math.floor(random() * 4) * (TAU / 7);
      d0.set(i, x, g + 0.4 + random() * 2.2, z, shaded ? 0.16 + random() * 0.1 : 0);
      d1.set(i, pa, random() * TAU, rate, 0.55 + random() * 0.35);
    }
    for (let i = 0; i < FIREFLY_COUNT; i += 1) place(i, placeRandom);
    d0.upload();
    d1.upload();
    const D0 = d0.node;
    const D1 = d1.node;
    const pa = D1.x;
    const pb = D1.y;
    const w = uWind.mul(0.55);
    const wander = vec3(
      sin(w.mul(0.37).add(pa)).mul(0.9).add(sin(w.mul(0.61).add(pb)).mul(0.5)),
      sin(w.mul(0.29).add(pb)).mul(0.45).add(sin(w.mul(0.83).add(pa)).mul(0.2)),
      sin(w.mul(0.41).add(pa.mul(1.3))).mul(0.9).add(sin(w.mul(0.67).add(pb)).mul(0.5))
    );
    const center = D0.xyz.add(wander);
    const blink = smoothstep(0.15, 0.65, sin(uTime.mul(D1.z).add(pa.mul(7))));
    const envelope = smoothstep(-0.2, 0.4, sin(uTime.mul(0.13).add(pb.mul(3)))).mul(0.5).add(0.5);
    const flicker = sin(uTime.mul(23).add(pa)).mul(0.12).add(0.88);
    const dist = camDist(center);
    const rangeFade = smoothstep(24, 40, dist).oneMinus().mul(smoothstep(0.4, 1.5, dist));
    const intensityV = varying(blink.mul(envelope).mul(flicker).mul(D1.w).mul(rangeFade).mul(uBoost));
    material.positionNode = center;
    material.scaleNode = D0.w.mul(blink.mul(0.5).add(0.7));
    const tex = texture(sprites.glow, uv());
    material.colorNode = vec3(1.0, 0.9, 0.34).mul(tex.rgb).mul(1.4);
    material.opacityNode = tex.a.mul(intensityV);
    let cursor = 0;
    updaters.push(() => {
      const n = mesh.count;
      let changed = false;
      for (let k = 0; k < 10; k += 1) {
        cursor = (cursor + 1) % n;
        const o = cursor * 4;
        // recycle when the player has moved on, and retry parked (unshaded) ones
        if (d0.array[o + 3] === 0 || Math.hypot(d0.array[o] - px(), d0.array[o + 2] - pz()) > 42) {
          place(cursor, liveRandom);
          changed = true;
        }
      }
      if (changed) {
        d0.upload();
        d1.upload();
      }
    });
  }

  // =================================================================
  // 5. gnat swarms over the shallows (recycled around the player)
  // =================================================================
  const GNAT_SWARMS = 10;
  const GNATS_PER_SWARM = 16;
  const GNAT_COUNT = GNAT_SWARMS * GNATS_PER_SWARM;
  {
    const { mesh, material } = spriteSystem({ name: 'gnats', count: GNAT_COUNT, min: 32, renderOrder: 4 });
    const d0 = instanceStream(GNAT_COUNT, true); // swarm center xyz, size
    const d1 = instanceStream(GNAT_COUNT, true); // phaseA phaseB radius shade
    const swarms = Array.from({ length: GNAT_SWARMS }, () => ({ x: 0, z: 0 }));
    const tmp = { x: 0, z: 0 };
    function placeSwarm(s, random) {
      const sw = swarms[s];
      if (!findWaterPoint(random, 5, 32, true, tmp)) {
        const a = random() * TAU;
        tmp.x = lagoon.x + Math.cos(a) * (WORLD.lagoonRadius - 4);
        tmp.z = lagoon.z + Math.sin(a) * (WORLD.lagoonRadius - 4);
      }
      sw.x = tmp.x;
      sw.z = tmp.z;
      const cy = WORLD.waterLevel + 0.35 + random() * 0.8;
      for (let k = 0; k < GNATS_PER_SWARM; k += 1) {
        const i = s * GNATS_PER_SWARM + k;
        d0.set(i, sw.x + (random() - 0.5) * 0.6, cy + (random() - 0.5) * 0.3, sw.z + (random() - 0.5) * 0.6, 0.028 + random() * 0.022);
        d1.set(i, random() * TAU, random() * TAU, 0.25 + random() * 0.4, random() < 0.35 ? 1 : 0);
      }
    }
    for (let s = 0; s < GNAT_SWARMS; s += 1) placeSwarm(s, placeRandom);
    d0.upload();
    d1.upload();
    const D0 = d0.node;
    const D1 = d1.node;
    const pa = D1.x;
    const pb = D1.y;
    const j = uTime.mul(4.5);
    const jitter = vec3(
      sin(j.mul(1.3).add(pa)).mul(sin(j.mul(0.7).add(pb))),
      sin(j.mul(1.1).add(pb)).mul(0.6),
      cos(j.mul(0.9).add(pa)).mul(sin(j.mul(1.7).add(pb)))
    ).mul(D1.z);
    const swarmDrift = vec3(sin(uWind.mul(0.2).add(pb)).mul(0.8), 0, cos(uWind.mul(0.17).add(pa)).mul(0.8));
    const center = D0.xyz.add(jitter).add(swarmDrift);
    const dist = camDist(center);
    const alphaV = varying(smoothstep(14, 26, dist).oneMinus().mul(smoothstep(0.3, 1.0, dist)).mul(0.85).mul(uBoost));
    const shadeV = varying(D1.w);
    material.positionNode = center;
    material.scaleNode = D0.w;
    const tex = texture(sprites.speck, uv());
    material.colorNode = mix(vec3(0.1, 0.1, 0.08), vec3(0.95, 0.95, 0.85), shadeV).mul(tex.rgb);
    material.opacityNode = tex.a.mul(alphaV);
    let cursor = 0;
    updaters.push(() => {
      const activeSwarms = Math.max(1, Math.ceil(mesh.count / GNATS_PER_SWARM));
      cursor = (cursor + 1) % activeSwarms;
      const sw = swarms[cursor];
      if (Math.hypot(sw.x - px(), sw.z - pz()) > 40) {
        placeSwarm(cursor, liveRandom);
        d0.upload();
        d1.upload();
      }
    });
  }

  // =================================================================
  // 6. pollen / motes — bright where the sun reaches, soft under the trees
  // =================================================================
  const POLLEN_COUNT = 320;
  {
    const { mesh, material } = spriteSystem({
      name: 'pollen', count: POLLEN_COUNT, min: 40, blending: THREE.AdditiveBlending, fog: false, renderOrder: 6, alphaTest: 0.02,
    });
    const d0 = instanceStream(POLLEN_COUNT, true); // anchor xyz, size
    const d1 = instanceStream(POLLEN_COUNT, true); // phaseA phaseB sunlit -
    function place(i, random) {
      const a = random() * TAU;
      const r = 2 + Math.pow(random(), 0.75) * 32;
      const x = px() + Math.cos(a) * r;
      const z = pz() + Math.sin(a) * r;
      const g = Math.max(groundAt(x, z), WORLD.waterLevel);
      const hf = Math.pow(random(), 1.4);
      const open = clampJs(1 - treesWithin(treesNearPlayer(), x, z, 7.5) * 0.5, 0, 1);
      const clearing = 1 - smoothstepJs(35, 85, distToLagoon(x, z));
      const sunlit = clampJs(open * (0.35 + 0.45 * clearing + 0.3 * hf), 0, 1);
      d0.set(i, x, g + 0.4 + hf * 6.5, z, 0.07 + random() * 0.08);
      d1.set(i, random() * TAU, random() * TAU, sunlit, 0);
    }
    for (let i = 0; i < POLLEN_COUNT; i += 1) place(i, placeRandom);
    d0.upload();
    d1.upload();
    const D0 = d0.node;
    const D1 = d1.node;
    const pa = D1.x;
    const pb = D1.y;
    const w = uWind;
    const drift = vec3(
      sin(w.mul(0.31).add(pa)).mul(1.4).add(sin(w.mul(0.11).add(pb)).mul(2.0)),
      sin(w.mul(0.23).add(pb)).mul(0.9).add(sin(w.mul(0.05).add(pa)).mul(1.5)),
      sin(w.mul(0.27).add(pa.mul(1.7))).mul(1.4).add(cos(w.mul(0.13).add(pb)).mul(2.0))
    );
    const center = D0.xyz.add(drift);
    const sunlit = D1.z;
    const twinkle = sin(uTime.mul(0.9).add(pa.mul(3))).mul(0.45).add(0.55);
    const dist = camDist(center);
    const rangeFade = smoothstep(24, 38, dist).oneMinus().mul(smoothstep(0.8, 3.0, dist));
    const intensityV = varying(mix(float(0.3), float(1.0), sunlit).mul(twinkle).mul(rangeFade).mul(uBoost));
    material.positionNode = center;
    material.scaleNode = D0.w.mul(mix(float(1.35), float(1.0), sunlit));
    const tex = texture(sprites.glow, uv());
    material.colorNode = mix(vec3(0.85, 0.9, 0.7), vec3(1.0, 0.94, 0.6), sunlit).mul(tex.rgb).mul(2.2);
    material.opacityNode = tex.a.mul(intensityV);
    let cursor = 0;
    updaters.push(() => {
      const n = mesh.count;
      let changed = false;
      for (let k = 0; k < 24; k += 1) {
        cursor = (cursor + 1) % n;
        const o = cursor * 4;
        if (Math.hypot(d0.array[o] - px(), d0.array[o + 2] - pz()) > 40) {
          place(cursor, liveRandom);
          changed = true;
        }
      }
      if (changed) {
        d0.upload();
        d1.upload();
      }
    });
  }

  // =================================================================
  // 7. falling leaves — shed from nearby canopies, flutter down, float, sink
  // =================================================================
  const LEAF_COUNT = 64;
  {
    const leafMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.75, metalness: 0, alphaTest: 0.5, side: THREE.FrontSide });
    const sys = cardSystem({ name: 'falling-leaves', geometry: twoSided(flatCard(0.7, 1.0, 2, 3)), material: leafMat, count: LEAF_COUNT, min: 10 });
    sys.mesh.receiveShadow = true;
    const aPos = sys.pos.node;
    const aRot = sys.rot.node;
    const aAnim = sys.anim.node;
    const ph = aAnim.x;
    const flutter = vec3(
      0,
      sin(uTime.mul(6).add(ph)).mul(positionGeometry.x.mul(positionGeometry.x)).mul(0.5)
        .add(sin(uTime.mul(4.3).add(ph)).mul(positionGeometry.z).mul(0.12)),
      0
    );
    leafMat.positionNode = placeCard(positionGeometry.add(flutter), aPos, aRot);
    const cellV = varying(aRot.w);
    const tex = texture(sprites.leaves, vec2(uv().x.add(cellV).div(4), uv().y));
    const brightV = varying(hash(instanceIndex.add(41)).mul(0.3).add(0.8));
    leafMat.colorNode = tex.rgb.mul(brightV);
    leafMat.opacityNode = tex.a;
    // thin leaves transmit light: glow when seen against the sun, and never
    // drop to a black chip against the bright sky
    const toEye = normalize(cameraPosition.sub(positionWorld));
    const backlit = pow(max(dot(toEye.negate(), uSunDir), 0), 3).mul(0.9);
    leafMat.emissiveNode = tex.rgb.mul(brightV).mul(backlit.add(0.16));

    const leaves = Array.from({ length: LEAF_COUNT }, (_, i) => ({
      state: 'wait', timer: placeRandom() * 9, x: 0, y: 0, z: 0, vy: 0.7, spin: 0, yaw: 0, pitch: 0, roll: 0,
      ph: placeRandom() * TAU, variant: i % 4, size: 0.3, wobble: 1, hold: 0,
    }));
    debug.leaves = leaves;
    function shed(s, random) {
      const list = treesClose();
      if (list.length === 0) {
        s.state = 'wait';
        s.timer = 1.5;
        return;
      }
      const tr = pick(list, random);
      const a = random() * TAU;
      const r = Math.sqrt(random()) * tr.crownR * 0.9;
      s.x = tr.x + Math.cos(a) * r;
      s.z = tr.z + Math.sin(a) * r;
      s.y = tr.crownY - 0.5 + (random() - 0.5) * 2.5;
      s.vy = 0.55 + random() * 0.5;
      s.ph = random() * TAU;
      s.spin = (random() - 0.5) * 4;
      s.yaw = random() * TAU;
      s.pitch = 0;
      s.roll = 0;
      // mostly senescent leaves (yellow / dry / red-tinged): live green ones
      // rarely let go, and a shower of bright green chips against the sky is
      // the first thing that reads as "particle system" from the overlook
      s.variant = random() < 0.22 ? 0 : 1 + Math.floor(random() * 3);
      // 10–20 cm blades: any larger and a leaf 10 m out reads as a blob
      s.size = 0.12 + random() * 0.12;
      s.wobble = 0.6 + random() * 0.8;
      s.state = 'fall';
      s.timer = 0;
    }
    updaters.push((dt, t) => {
      const n = sys.mesh.count;
      for (let i = 0; i < n; i += 1) {
        const s = leaves[i];
        let visible = true;
        if (s.state === 'wait') {
          visible = false;
          s.timer -= dt * (1 + wind.gust * 3);
          if (s.timer <= 0) shed(s, liveRandom);
        } else if (s.state === 'fall') {
          s.timer += dt;
          const flap = Math.sin(t * 2.3 * s.wobble + s.ph);
          s.y -= s.vy * (0.62 + 0.38 * Math.abs(flap)) * dt;
          const gustK = 0.5 + wind.gust * 2.4;
          s.x += (Math.sin(t * 1.7 + s.ph) * 0.9 + wind.dirX * gustK) * dt;
          s.z += (Math.cos(t * 1.3 + s.ph) * 0.7 + wind.dirZ * gustK) * dt;
          s.yaw += s.spin * 0.5 * dt;
          s.pitch = flap * 1.0;
          s.roll = Math.cos(t * 1.9 * s.wobble + s.ph * 1.3) * 0.8;
          const g = groundAt(s.x, s.z);
          if (g < WORLD.waterLevel - 0.1) {
            if (s.y <= WORLD.waterLevel + 0.03) {
              s.state = 'float';
              s.timer = 0;
              s.hold = 5 + liveRandom() * 5;
            }
          } else if (s.y <= g + 0.04) {
            s.state = 'rest';
            s.timer = 0;
            s.hold = 2.5 + liveRandom() * 3;
            s.y = g + 0.02;
            s.pitch = (liveRandom() - 0.5) * 0.3;
            s.roll = (liveRandom() - 0.5) * 0.3;
          }
          if (s.timer > 40 || Math.hypot(s.x - px(), s.z - pz()) > 70) {
            s.state = 'wait';
            s.timer = 0.5;
          }
        } else if (s.state === 'float') {
          s.timer += dt;
          s.x += wind.dirX * 0.12 * dt;
          s.z += wind.dirZ * 0.12 * dt;
          s.yaw += 0.15 * dt;
          const h = waveHeightAt(s.x, s.z, t);
          s.y = WORLD.waterLevel + h + 0.015;
          s.pitch = (waveHeightAt(s.x, s.z + 0.3, t) - waveHeightAt(s.x, s.z - 0.3, t)) * 1.5;
          s.roll = (waveHeightAt(s.x - 0.3, s.z, t) - waveHeightAt(s.x + 0.3, s.z, t)) * 1.5;
          if (s.timer > s.hold) {
            s.state = 'sink';
            s.timer = 0;
          }
        } else if (s.state === 'rest') {
          s.timer += dt;
          if (s.timer > s.hold) {
            s.state = 'sink';
            s.timer = 0;
          }
        } else if (s.state === 'sink') {
          s.timer += dt;
          s.y -= 0.3 * dt;
          if (s.timer > 1.2) {
            s.state = 'wait';
            s.timer = 0.5 + liveRandom() * 6;
          }
        }
        sys.pos.set(i, s.x, s.y, s.z, visible ? s.size : 0);
        sys.rot.set(i, s.yaw, s.pitch, s.roll, s.variant);
        sys.anim.set(i, s.ph, 0, 0, 0);
      }
      sys.pos.upload();
      sys.rot.upload();
      sys.anim.upload();
    });
  }

  // =================================================================
  // 8. butterflies — four wing designs, flap-glide flight, landing to rest
  // =================================================================
  const BUTTERFLY_COUNT = 24;
  {
    const mat = new THREE.MeshBasicNodeMaterial({ alphaTest: 0.5, side: THREE.DoubleSide });
    const sys = cardSystem({ name: 'butterflies', geometry: flatCard(1, 0.8, 4, 1), material: mat, count: BUTTERFLY_COUNT, min: 6 });
    const aPos = sys.pos.node;
    const aRot = sys.rot.node;
    const aAnim = sys.anim.node;
    const theta = clamp(aAnim.z.add(aAnim.y.mul(sin(aAnim.x))), -1.25, 1.5);
    mat.positionNode = placeCard(foldWings(theta), aPos, aRot);
    const cellV = varying(aRot.w);
    const tex = texture(sprites.butterflies, vec2(uv().x.add(cellV).div(4), uv().y));
    const shadeV = varying(hash(instanceIndex.add(7)).mul(0.25).add(0.85));
    mat.colorNode = tex.rgb.mul(shadeV);
    mat.opacityNode = tex.a;

    const flies = Array.from({ length: BUTTERFLY_COUNT }, (_, i) => ({
      x: 0, z: 0, y: 1, heading: 0, turnPhase: placeRandom() * TAU, bobPhase: placeRandom() * TAU,
      h: 0.8 + placeRandom() * 1.8, speed: 1.4 + placeRandom() * 0.8, timer: 6 + placeRandom() * 12,
      state: 'fly', flap: placeRandom() * TAU, hz: 9 + placeRandom() * 4, ampl: 0.75, rest: 0.2,
      variant: i % 4, size: 0.26 + placeRandom() * 0.14, grow: 1, target: 0, roll: 0,
    }));
    debug.butterflies = flies;
    function spawn(s, random, initial) {
      for (let k = 0; k < 14; k += 1) {
        const a = random() * TAU;
        const r = initial ? 6 + random() * 30 : 18 + random() * 24;
        const x = px() + Math.cos(a) * r;
        const z = pz() + Math.sin(a) * r;
        const g = groundAt(x, z);
        if (g > WORLD.waterLevel + 0.3 || k === 13) {
          s.x = x;
          s.z = z;
          s.y = Math.max(g, WORLD.waterLevel) + s.h;
          break;
        }
      }
      s.heading = random() * TAU;
      s.state = 'fly';
      s.timer = 6 + random() * 12;
      s.grow = initial ? 1 : 0;
    }
    flies.forEach((s) => spawn(s, placeRandom, true));
    updaters.push((dt, t) => {
      const n = sys.mesh.count;
      for (let i = 0; i < n; i += 1) {
        const s = flies[i];
        s.grow = Math.min(1, s.grow + dt * 1.6);
        if (s.state === 'fly') {
          const turn = Math.sin(t * 0.7 + s.turnPhase) * 1.4 + Math.sin(t * 1.9 + s.turnPhase * 2.3) * 0.6;
          s.heading += turn * dt;
          s.roll += (-turn * 0.3 - s.roll) * Math.min(1, dt * 4);
          const glide = smoothstepJs(0.55, 0.85, Math.sin(t * 0.45 + s.turnPhase));
          s.ampl = 0.75 - glide * 0.65;
          s.rest = 0.22 - glide * 0.12;
          s.flap += dt * TAU * s.hz * (1 - glide * 0.6);
          s.x += Math.cos(s.heading) * s.speed * dt;
          s.z += Math.sin(s.heading) * s.speed * dt;
          const base = Math.max(groundAt(s.x, s.z), WORLD.waterLevel);
          const wantY = base + s.h + Math.sin(t * 1.9 + s.bobPhase) * 0.35;
          s.y += (wantY - s.y) * Math.min(1, dt * 3);
          s.timer -= dt;
          if (s.timer <= 0) {
            if (base > WORLD.waterLevel + 0.4) {
              s.state = 'descend';
              s.target = base + 0.08;
            } else {
              s.timer = 4;
            }
          }
          if (Math.hypot(s.x - px(), s.z - pz()) > 48) spawn(s, liveRandom, false);
        } else if (s.state === 'descend') {
          s.flap += dt * TAU * s.hz * 0.9;
          s.ampl = 0.6;
          s.rest = 0.35;
          s.x += Math.cos(s.heading) * 0.7 * dt;
          s.z += Math.sin(s.heading) * 0.7 * dt;
          s.target = groundAt(s.x, s.z) + 0.08;
          s.y += (s.target - s.y) * Math.min(1, dt * 2.2) - 0.35 * dt;
          s.roll *= 0.9;
          if (s.y <= s.target + 0.04) {
            s.y = s.target;
            s.state = 'land';
            s.timer = 3 + liveRandom() * 4;
          }
        } else if (s.state === 'land') {
          s.timer -= dt;
          // slow open–close of the wings while perched
          s.flap += dt * TAU * 0.9;
          s.ampl = 0.45;
          s.rest = 0.95;
          s.roll = 0;
          if (s.timer <= 0) {
            s.state = 'takeoff';
            s.timer = 0.9;
            s.heading += (liveRandom() - 0.5) * 2;
          }
        } else if (s.state === 'takeoff') {
          s.timer -= dt;
          s.flap += dt * TAU * (s.hz + 3);
          s.ampl = 0.85;
          s.rest = 0.2;
          s.y += 1.4 * dt;
          s.x += Math.cos(s.heading) * 0.8 * dt;
          s.z += Math.sin(s.heading) * 0.8 * dt;
          if (s.timer <= 0) {
            s.state = 'fly';
            s.timer = 8 + liveRandom() * 12;
          }
        }
        sys.pos.set(i, s.x, s.y, s.z, s.size * s.grow);
        sys.rot.set(i, yawFor(Math.cos(s.heading), Math.sin(s.heading)), 0, s.roll, s.variant);
        sys.anim.set(i, s.flap, s.ampl, s.rest, 0);
      }
      sys.pos.upload();
      sys.rot.upload();
      sys.anim.upload();
    });
  }

  // =================================================================
  // 9. dragonflies — hover, dart, hover; four shimmering wings
  // =================================================================
  const DRAGONFLY_COUNT = 8;
  {
    const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, alphaTest: 0.03, side: THREE.DoubleSide });
    const sys = cardSystem({ name: 'dragonflies', geometry: dragonflyGeometry(), material: mat, count: DRAGONFLY_COUNT, min: 3, renderOrder: 5 });
    const aPos = sys.pos.node;
    const aRot = sys.rot.node;
    const aAnim = sys.anim.node;
    const part = attribute('aPart', 'float');
    const wingFlag = step(0.5, part);
    const hindFlag = step(1.5, part);
    const beat = uTime.mul(TAU * 27).add(hash(instanceIndex).mul(TAU)).add(hindFlag.mul(Math.PI));
    const theta = aAnim.z.add(aAnim.y.mul(sin(beat))).mul(wingFlag);
    mat.positionNode = placeCard(foldWings(theta), aPos, aRot);
    const partV = varying(part);
    const wingV = varying(wingFlag);
    const seedV = varying(hash(instanceIndex.add(5)).mul(TAU));
    const shimmer = sin(uTime.mul(41).add(seedV).add(partV.mul(2.1))).mul(0.5).add(0.5);
    // occasional sun glint racing along the wings
    const glint = smoothstep(0.86, 1.0, sin(uTime.mul(5.3).add(seedV).add(uv().x.mul(6)))).mul(wingV);
    const tex = texture(sprites.dragonfly, uv());
    mat.colorNode = tex.rgb.mul(float(1).add(wingV.mul(shimmer).mul(1.2))).add(glint.mul(1.4));
    mat.opacityNode = tex.a.mul(mix(float(1), shimmer.mul(0.45).add(0.45), wingV)).add(glint.mul(tex.a).mul(0.5));

    const target = { x: 0, z: 0 };
    const dragons = Array.from({ length: DRAGONFLY_COUNT }, () => ({
      x: 0, z: 0, y: 0.5, heading: placeRandom() * TAU, want: 0, speed: 0, state: 'hover', timer: 0,
      dur: 0.6 + placeRandom() * 1.2, hx: 0, hz: 0, hy: 0.5, ph: placeRandom() * TAU, roll: 0, pitch: 0,
      size: 0.95 + placeRandom() * 0.4, turnRate: 0,
    }));
    debug.dragonflies = dragons;
    function spawn(s, random) {
      if (!findWaterPoint(random, 4, 36, false, target)) {
        const a = random() * TAU;
        const r = random() * (WORLD.lagoonRadius - 10);
        target.x = lagoon.x + Math.cos(a) * r;
        target.z = lagoon.z + Math.sin(a) * r;
      }
      s.x = target.x;
      s.z = target.z;
      s.hx = s.x;
      s.hz = s.z;
      s.hy = 0.3 + random() * 0.8;
      s.state = 'hover';
      s.timer = 0;
      s.dur = 0.5 + random() * 1.3;
    }
    dragons.forEach((s) => spawn(s, placeRandom));
    updaters.push((dt, t) => {
      const n = sys.mesh.count;
      for (let i = 0; i < n; i += 1) {
        const s = dragons[i];
        s.timer += dt;
        if (s.state === 'hover') {
          s.x = s.hx + Math.sin(t * 4.1 + s.ph) * 0.06;
          s.z = s.hz + Math.cos(t * 3.7 + s.ph) * 0.06;
          s.heading += Math.sin(t * 0.9 + s.ph) * 0.5 * dt;
          s.roll *= 1 - Math.min(1, dt * 4);
          s.pitch *= 1 - Math.min(1, dt * 4);
          if (s.timer > s.dur) {
            s.state = 'dart';
            s.timer = 0;
            s.dur = 0.25 + liveRandom() * 0.35;
            s.speed = 5 + liveRandom() * 4;
            s.want = s.heading + (liveRandom() - 0.5) * 2.6;
            // keep them over the water: aim back if the dart would leave it
            const ahead = s.speed * s.dur * 0.7;
            if (!isWater(s.x + Math.cos(s.want) * ahead, s.z + Math.sin(s.want) * ahead)) {
              waterTarget(s.x, s.z, target);
              s.want = Math.atan2(target.z - s.z, target.x - s.x) + (liveRandom() - 0.5) * 0.8;
            }
            s.hy = clampJs(s.hy + (liveRandom() - 0.5) * 0.7, 0.25, 1.3);
          }
        } else {
          const frac = Math.min(1, s.timer / s.dur);
          const ease = Math.sin(frac * Math.PI);
          let d = s.want - s.heading;
          d = Math.atan2(Math.sin(d), Math.cos(d));
          const turn = clampJs(d * 9, -8, 8);
          s.heading += turn * dt;
          s.roll += (-turn * 0.12 - s.roll) * Math.min(1, dt * 6);
          s.pitch += (-0.3 * ease - s.pitch) * Math.min(1, dt * 6);
          const v = s.speed * ease;
          s.x += Math.cos(s.heading) * v * dt;
          s.z += Math.sin(s.heading) * v * dt;
          if (s.timer > s.dur) {
            s.state = 'hover';
            s.timer = 0;
            s.dur = 0.5 + liveRandom() * 1.4;
            s.hx = s.x;
            s.hz = s.z;
          }
        }
        const wantY = WORLD.waterLevel + waveHeightAt(s.x, s.z, t) + s.hy + Math.sin(t * 6.3 + s.ph) * 0.03;
        s.y += (wantY - s.y) * Math.min(1, dt * 5);
        if (Math.hypot(s.x - px(), s.z - pz()) > 46) spawn(s, liveRandom);
        sys.pos.set(i, s.x, s.y, s.z, s.size);
        sys.rot.set(i, yawFor(Math.cos(s.heading), Math.sin(s.heading)), s.pitch, s.roll, 0);
        sys.anim.set(i, 0, 0.5, 0.15, 0);
      }
      sys.pos.upload();
      sys.rot.upload();
      sys.anim.upload();
    });
  }

  // =================================================================
  // 10. birds — V-formation flocks + soaring soloists + parrot fly-bys
  // =================================================================
  const FLOCKS = [7, 5, 9];
  const SOLO_COUNT = 5;
  const PARROT_COUNT = 4;
  const BIRD_COUNT = FLOCKS.reduce((a, b) => a + b, 0) + SOLO_COUNT + PARROT_COUNT;
  {
    const mat = new THREE.MeshBasicNodeMaterial({ alphaTest: 0.5, side: THREE.DoubleSide });
    // not density-scaled: the roles (flocks, soloists, parrot pairs) are
    // hand-assigned by index and 30 two-card birds cost nothing
    const sys = cardSystem({ name: 'birds', geometry: birdGeometry(), material: mat, count: BIRD_COUNT, min: BIRD_COUNT });
    const colA = instanceStream(BIRD_COUNT, true);
    const colB = instanceStream(BIRD_COUNT, true);
    const aPos = sys.pos.node;
    const aRot = sys.rot.node;
    const aAnim = sys.anim.node;
    const theta = clamp(aAnim.z.add(aAnim.y.mul(sin(aAnim.x))), -1.2, 1.5);
    // the side card sits on x = 0, so the wing fold leaves it untouched
    mat.positionNode = placeCard(foldWings(theta), aPos, aRot);
    const sideV = varying(step(0.5, attribute('aPart', 'float')));
    const tex = texture(sprites.bird, uv());
    const cA = varying(colA.node.rgb);
    const cB = varying(colB.node.rgb);
    mat.colorNode = mix(cA.mul(tex.r).add(cB.mul(tex.g)), cA, sideV);
    mat.opacityNode = mix(tex.r.add(tex.g), tex.b, sideV);

    const birds = Array.from({ length: BIRD_COUNT }, () => ({ x: 0, y: 0, z: 0, yaw: 0, roll: 0, pitch: 0, flap: placeRandom() * TAU, ampl: 0.6, rest: 0.2, size: 1.3 }));
    debug.birds = birds;
    const setColor = (i, a, b) => {
      colA.set(i, a[0], a[1], a[2], 1);
      colB.set(i, b[0], b[1], b[2], 1);
    };
    const DARK = [0.05, 0.06, 0.07];
    let idx = 0;
    const flocks = FLOCKS.map((size, f) => {
      const flock = {
        members: [], cx: (placeRandom() - 0.5) * 60, cz: -60 + (placeRandom() - 0.3) * 80, R: 70 + placeRandom() * 60,
        H: 46 + placeRandom() * 24, angle: placeRandom() * TAU, dir: placeRandom() > 0.5 ? 1 : -1, speed: 9 + placeRandom() * 3,
        phase: placeRandom() * TAU, follow: f === 0 ? 0.02 : 0,
      };
      if (f === 0) {
        // this flock slowly wanders after the player so the sky is never empty
        flock.cx = px();
        flock.cz = pz();
        flock.R = 60 + placeRandom() * 20;
        flock.H = 40 + placeRandom() * 15;
      }
      for (let k = 0; k < size; k += 1, idx += 1) {
        flock.members.push(idx);
        birds[idx].size = 1.2 + placeRandom() * 0.3;
        setColor(idx, DARK, DARK);
      }
      return flock;
    });
    const solos = [];
    for (let k = 0; k < SOLO_COUNT; k += 1, idx += 1) {
      const overhead = k < 2; // two raptors circle high above the player's area
      solos.push({
        i: idx, cx: overhead ? px() + (placeRandom() - 0.5) * 40 : (placeRandom() - 0.5) * 200,
        cz: overhead ? pz() + (placeRandom() - 0.5) * 40 : (placeRandom() - 0.5) * 200, R: 18 + placeRandom() * 20,
        H: 45 + placeRandom() * 30, angle: placeRandom() * TAU, dir: placeRandom() > 0.5 ? 1 : -1, speed: 6 + placeRandom() * 2,
        phase: placeRandom() * TAU, follow: overhead ? 0.015 : 0,
      });
      birds[idx].size = 1.7 + placeRandom() * 0.5;
      setColor(idx, DARK, [0.07, 0.07, 0.08]);
    }
    const PARROT_PALETTES = [
      [[0.9, 0.12, 0.08], [0.15, 0.35, 0.95]], // scarlet macaw
      [[0.15, 0.45, 0.9], [0.95, 0.75, 0.12]], // blue-and-gold macaw
      [[0.2, 0.65, 0.2], [0.9, 0.25, 0.15]], // green parrot, red wing patches
    ];
    const parrots = { pairs: [[idx, idx + 1], [idx + 2, idx + 3]], next: 0, timer: 8, active: null, elapsed: 0, dur: 11, sx: 0, sz: 0, ex: 0, ez: 0, y: 12, cross: 0 };
    debug.parrots = parrots;
    for (let k = 0; k < PARROT_COUNT; k += 1) {
      birds[idx + k].size = 0;
      setColor(idx + k, PARROT_PALETTES[0][0], PARROT_PALETTES[0][1]);
    }
    colA.upload();
    colB.upload();

    function circleBird(group, k, t, dt, bursty) {
      const b = birds[group.members ? group.members[k] : group.i];
      if (group.follow && k === 0) {
        const f = Math.min(1, dt * group.follow);
        group.cx += (px() - group.cx) * f;
        group.cz += (pz() - group.cz) * f;
      }
      group.angle += (group.dir * group.speed / group.R) * dt;
      const lx = group.cx + Math.cos(group.angle) * group.R;
      const lz = group.cz + Math.sin(group.angle) * group.R;
      const ly = group.H + Math.sin(t * 0.1 + group.phase) * 4;
      const fx = -Math.sin(group.angle) * group.dir;
      const fz = Math.cos(group.angle) * group.dir;
      const rx = -fz;
      const rz = fx;
      const rank = Math.ceil(k / 2);
      const side = k % 2 === 1 ? 1 : -1;
      b.x = lx - fx * rank * 2.8 + rx * side * rank * 2.3;
      b.z = lz - fz * rank * 2.8 + rz * side * rank * 2.3;
      b.y = ly - rank * 0.12 + Math.sin(t * 0.9 + k) * 0.25;
      b.yaw = yawFor(fx, fz);
      b.roll = group.dir * 0.12;
      const burst = Math.sin(t * (bursty ? 0.42 : 0.2) + group.phase + k * 0.25);
      const flapAmp = smoothstepJs(bursty ? 0.15 : 0.82, bursty ? 0.55 : 0.95, burst);
      b.ampl = 0.12 + 0.7 * flapAmp;
      b.rest = 0.42 - 0.37 * flapAmp;
      b.flap += dt * TAU * 3.4 * (0.25 + 0.75 * flapAmp);
    }

    updaters.push((dt, t) => {
      for (const flock of flocks) {
        for (let k = 0; k < flock.members.length; k += 1) circleBird(flock, k, t, dt, true);
      }
      for (const solo of solos) circleBird(solo, 0, t, dt, false);

      // parrot pairs cross near the player every 20–40 s
      const pr = parrots;
      if (pr.active === null) {
        pr.timer -= dt;
        if (pr.timer <= 0) {
          pr.active = pr.pairs[pr.next];
          pr.next = (pr.next + 1) % pr.pairs.length;
          const a = liveRandom() * TAU;
          pr.sx = px() + Math.cos(a) * 52;
          pr.sz = pz() + Math.sin(a) * 52;
          pr.ex = px() - Math.cos(a) * 52;
          pr.ez = pz() - Math.sin(a) * 52;
          pr.y = camera.position.y + 8 + liveRandom() * 9;
          pr.elapsed = 0;
          pr.dur = 104 / (8.5 + liveRandom() * 2);
          const pal = PARROT_PALETTES[Math.floor(liveRandom() * PARROT_PALETTES.length)];
          for (const i of pr.active) setColor(i, pal[0], pal[1]);
          colA.upload();
          colB.upload();
        }
      } else {
        pr.elapsed += dt;
        const f = pr.elapsed / pr.dur;
        const dx = pr.ex - pr.sx;
        const dz = pr.ez - pr.sz;
        const len = Math.hypot(dx, dz);
        const fx = dx / len;
        const fz = dz / len;
        pr.active.forEach((i, k) => {
          const b = birds[i];
          const back = k * 1.6;
          const side = k * 1.9;
          b.x = pr.sx + dx * f - fx * back - fz * side;
          b.z = pr.sz + dz * f - fz * back + fx * side;
          b.y = pr.y + Math.sin(t * 1.7 + k) * 0.5 + Math.sin(f * Math.PI) * 2;
          b.yaw = yawFor(fx, fz);
          b.roll = Math.sin(t * 1.1 + k) * 0.18;
          b.size = 0.8;
          b.flap += dt * TAU * 5;
          b.ampl = 0.7;
          b.rest = 0.12;
        });
        if (f >= 1) {
          for (const i of pr.active) birds[i].size = 0;
          pr.active = null;
          pr.timer = 20 + liveRandom() * 20;
        }
      }

      const n = sys.mesh.count;
      for (let i = 0; i < n; i += 1) {
        const b = birds[i];
        sys.pos.set(i, b.x, b.y, b.z, b.size);
        sys.rot.set(i, b.yaw, b.pitch, b.roll, 0);
        sys.anim.set(i, b.flap, b.ampl, b.rest, 0);
      }
      sys.pos.upload();
      sys.rot.upload();
      sys.anim.upload();
    });
  }

  // =================================================================
  // frame update / quality
  // =================================================================
  function update(dt, t) {
    updateWind(dt, t);
    for (const updater of updaters) {
      updater(dt, t);
    }
  }

  function applyQuality(preset) {
    const density = preset.particleDensity ?? 1;
    for (const { mesh, max, min } of systems) {
      mesh.count = Math.max(min ?? 1, Math.min(max, Math.round(max * density)));
    }
  }

  function stats() {
    return {
      drawCalls: meshes.length,
      instances: Object.fromEntries(meshes.map((m) => [m.name, m.count])),
      gust: wind.gust,
    };
  }

  return { update, applyQuality, meshes, wind, stats, debug };
}
