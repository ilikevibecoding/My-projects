// rocket.js — part catalog, procedural canvas textures/decals, mesh builders.
// Every surface is generated: no loaded assets. Saturated paint, panel lines,
// rivets, decals, grime — nothing default-gray.

import * as THREE from 'three';
import { mulberry32 } from './effects.js';

// deterministic texture noise (same paint job every load)
const trand = mulberry32(424242);

export const PALETTE = {
  cream: '#f3ead6',
  creamShade: '#ddd2b8',
  orange: '#ff7b2e',
  orangeHot: '#ffae3d',
  teal: '#17b8a6',
  navy: '#21355e',
  navyDark: '#16223d',
  metal: '#8d949e',
  metalDark: '#4a5058',
  line: 'rgba(31,38,52,0.55)',
};

// --------------------------------------------------------------------------
// Part catalog (the full frozen scope palette).
// height = stacked height in metres. cdA = drag area contribution.
// --------------------------------------------------------------------------
export const PARTS = {
  pod: { id: 'pod', name: 'Command Pod', type: 'pod', massDry: 800, height: 1.55, radius: 0.62, cdA: 0.25, blurb: '800 kg · crew of one' },
  nose: { id: 'nose', name: 'Nose Cone', type: 'nose', massDry: 150, height: 1.25, radius: 0.62, cdA: 0.10, blurb: '150 kg · aero' },
  tankSmall: { id: 'tankSmall', name: 'Tank S “Pip”', type: 'tank', massDry: 380, fuel: 1700, height: 1.9, radius: 0.62, cdA: 0.16, blurb: '1.7 t fuel' },
  tankLarge: { id: 'tankLarge', name: 'Tank L “Tubby”', type: 'tank', massDry: 850, fuel: 4300, height: 3.4, radius: 0.62, cdA: 0.28, blurb: '4.3 t fuel' },
  engineSmall: { id: 'engineSmall', name: 'Engine S “Sprig”', type: 'engine', massDry: 320, thrust: 42000, burn: 16, height: 1.1, radius: 0.5, cdA: 0.08, blurb: '42 kN' },
  engineLarge: { id: 'engineLarge', name: 'Engine L “Mastodon”', type: 'engine', massDry: 880, thrust: 66000, burn: 21, height: 1.45, radius: 0.62, cdA: 0.10, blurb: '66 kN' },
  fins: { id: 'fins', name: 'Fin Set ×4', type: 'fins', massDry: 120, height: 0, radius: 0, cdA: 0.14, blurb: 'stability' },
  decoupler: { id: 'decoupler', name: 'Decoupler', type: 'decoupler', massDry: 90, height: 0.3, radius: 0.63, cdA: 0.05, blurb: 'connector · builds a booster stage below' },
};

export const DEFAULT_STACK = ['engineLarge', 'fins', 'tankLarge', 'pod'];
export const TWO_STAGE_STACK = ['engineLarge', 'fins', 'tankSmall', 'decoupler', 'engineSmall', 'tankSmall', 'pod'];

export function stackFromIds(ids) {
  return ids.map((id) => PARTS[id]);
}

// --------------------------------------------------------------------------
// Canvas texture helpers
// --------------------------------------------------------------------------
function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function canvasTexture(c, { srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8; // crisper paint/decals at glancing angles
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

function noiseBlotches(ctx, w, h, n, alpha, light) {
  for (let i = 0; i < n; i++) {
    const x = trand() * w, y = trand() * h;
    const r = 4 + trand() * 26;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const v = light ? 255 : 0;
    g.addColorStop(0, `rgba(${v},${v},${v},${alpha})`);
    g.addColorStop(1, `rgba(${v},${v},${v},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

function panelLines(ctx, w, h, nx, ny) {
  ctx.strokeStyle = PALETTE.line;
  ctx.lineWidth = 4;
  for (let i = 0; i < nx; i++) {
    const x = (w / nx) * i + 0.5;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
  }
  for (let j = 1; j < ny; j++) {
    const y = (h / ny) * j + 0.5;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }
  // rivets along vertical seams
  ctx.fillStyle = 'rgba(25,30,42,0.5)';
  for (let i = 0; i < nx; i++) {
    const x = (w / nx) * i;
    for (let y = 14; y < h; y += 34) {
      ctx.beginPath(); ctx.arc(x + 9, y, 2.6, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(x - 9 + (i === 0 ? w : 0), y, 2.6, 0, 7); ctx.fill();
    }
  }
}

function grime(ctx, w, h, n = 26) {
  for (let i = 0; i < n; i++) {
    const x = trand() * w;
    const y0 = trand() * h * 0.4;
    const len = 30 + trand() * 110;
    const g = ctx.createLinearGradient(0, y0, 0, y0 + len);
    g.addColorStop(0, 'rgba(40,38,34,0.16)');
    g.addColorStop(1, 'rgba(40,38,34,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, y0, 2 + trand() * 5, len);
  }
}

function roughnessCanvas(w, h, base = 150, opts = {}) {
  const [c, ctx] = makeCanvas(w, h);
  ctx.fillStyle = `rgb(${base},${base},${base})`;
  ctx.fillRect(0, 0, w, h);
  noiseBlotches(ctx, w, h, 110, 0.10, false);
  noiseBlotches(ctx, w, h, 110, 0.10, true);
  if (opts.shinyBandY) {
    const [y, bh] = opts.shinyBandY;
    ctx.fillStyle = 'rgba(70,70,70,0.55)';
    ctx.fillRect(0, y, w, bh);
  }
  const t = canvasTexture(c, { srgb: false });
  return t;
}

// Tank / body skin: shiny brushed stainless steel ("Space X" restyle) with
// weld bands, a thin flame-orange accent, and a big SPACE X wordmark.
function tankTexture(part, { decal = true } = {}) {
  const w = 512;
  const h = Math.round(170 * part.height);
  const [c, ctx] = makeCanvas(w, h);

  // brushed steel base with subtle vertical sheen
  const base = ctx.createLinearGradient(0, 0, w, 0);
  base.addColorStop(0, '#c4c9cf');
  base.addColorStop(0.28, '#e4e8ec');
  base.addColorStop(0.55, '#cfd4da');
  base.addColorStop(0.8, '#dde2e7');
  base.addColorStop(1, '#c4c9cf');
  ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
  // horizontal brush streaks
  for (let i = 0; i < 240; i++) {
    const l = trand() > 0.5;
    ctx.fillStyle = `rgba(${l ? 255 : 40},${l ? 255 : 44},${l ? 255 : 50},${0.025 + trand() * 0.04})`;
    ctx.fillRect(0, trand() * h, w, 1 + trand() * 2);
  }

  // stainless weld band rings (the Starship look)
  ctx.fillStyle = 'rgba(96,102,110,0.55)';
  const rings = Math.max(2, Math.round(part.height));
  for (let i = 0; i <= rings; i++) {
    const y = Math.round((h / rings) * i);
    ctx.fillRect(0, y - 4, w, 8);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(0, y + 4, w, 2);
    ctx.fillStyle = 'rgba(96,102,110,0.55)';
  }

  // thin flame-orange accent stripe
  ctx.fillStyle = PALETTE.orange;
  ctx.fillRect(0, Math.round(h * 0.3) - 7, w, 14);

  panelLines(ctx, w, h, 4, rings);

  if (decal) {
    // vertical "SPACE X" wordmark — big and bold, readable in flight shots
    ctx.save();
    ctx.translate(w * 0.28, h * 0.52);
    ctx.rotate(Math.PI / 2);
    ctx.font = `900 ${Math.min(64, h * 0.4)}px "Trebuchet MS", sans-serif`;
    ctx.fillStyle = '#2c3340';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('SPACE X', 0, 0);
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.strokeText('SPACE X', 0, 0);
    ctx.restore();
    // flag patch
    const fx = w * 0.60, fy = h * 0.60, fw = 92, fh = 58;
    ctx.fillStyle = PALETTE.navy; ctx.fillRect(fx, fy, fw, fh);
    ctx.fillStyle = PALETTE.orange; ctx.fillRect(fx, fy + fh * 0.55, fw, fh * 0.2);
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(fx + fw * 0.28, fy + fh * 0.34, 10, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 3; ctx.strokeRect(fx, fy, fw, fh);
  }

  grime(ctx, w, h, 16);
  noiseBlotches(ctx, w, h, 40, 0.04, false);
  return canvasTexture(c);
}

function podTexture() {
  const w = 512, h = 320;
  const [c, ctx] = makeCanvas(w, h);
  const base = ctx.createLinearGradient(0, 0, 0, h);
  base.addColorStop(0, '#e8ecf0');
  base.addColorStop(0.72, '#c9ced4');   // brushed steel capsule
  base.addColorStop(0.78, '#5a4a44');   // heat shield rim (dark ablative)
  base.addColorStop(1, '#3c322e');
  ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 120; i++) {
    const l = trand() > 0.5;
    ctx.fillStyle = `rgba(${l ? 255 : 40},${l ? 255 : 44},${l ? 255 : 50},${0.03 + trand() * 0.035})`;
    ctx.fillRect(0, trand() * h * 0.72, w, 1 + trand() * 2);
  }

  // gunmetal crown band + orange accent
  ctx.fillStyle = '#3a414c'; ctx.fillRect(0, 0, w, 34);
  ctx.fillStyle = PALETTE.orange; ctx.fillRect(0, 34, w, 9);

  panelLines(ctx, w, h * 0.74, 6, 2);

  // windows: 3 round portholes around
  for (const fx of [0.17, 0.5, 0.83]) {
    const x = w * fx, y = h * 0.38, r = 38;
    ctx.fillStyle = '#1d2531'; ctx.beginPath(); ctx.arc(x, y, r + 9, 0, 7); ctx.fill();
    const g = ctx.createRadialGradient(x - 8, y - 10, 2, x, y, r);
    g.addColorStop(0, '#bfe8ff'); g.addColorStop(0.35, '#5e9fd6'); g.addColorStop(1, '#17304d');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath(); ctx.ellipse(x - 10, y - 12, 9, 5, -0.6, 0, 7); ctx.fill();
  }
  grime(ctx, w, h, 14);
  return canvasTexture(c);
}

function noseTexture() {
  const w = 512, h = 256;
  const [c, ctx] = makeCanvas(w, h);
  // dark gunmetal tip fading into the stainless body
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#363d48');
  g.addColorStop(0.45, '#4c545f');
  g.addColorStop(0.55, '#c9ced4');
  g.addColorStop(1, '#dde2e7');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 110; i++) {
    const l = trand() > 0.5;
    ctx.fillStyle = `rgba(${l ? 255 : 30},${l ? 255 : 34},${l ? 255 : 40},${0.03 + trand() * 0.035})`;
    ctx.fillRect(0, trand() * h, w, 1 + trand() * 2);
  }
  ctx.fillStyle = PALETTE.orange; ctx.fillRect(0, h * 0.55, w, 8);
  panelLines(ctx, w, h, 4, 1);
  grime(ctx, w, h, 8);
  return canvasTexture(c);
}

function hazardTexture() {
  const w = 256, h = 64;
  const [c, ctx] = makeCanvas(w, h);
  ctx.fillStyle = '#2a2e35'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = PALETTE.orangeHot;
  for (let x = -h; x < w + h; x += 42) {
    ctx.beginPath();
    ctx.moveTo(x, h); ctx.lineTo(x + 21, 0); ctx.lineTo(x + 42, 0); ctx.lineTo(x + 21, h);
    ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(0, 0, w, 6); ctx.fillRect(0, h - 6, w, 6);
  return canvasTexture(c);
}

// interstage shell: brushed steel ring wall with vents + warning ring
function interstageTexture() {
  const w = 512, h = 128;
  const [c, ctx] = makeCanvas(w, h);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#aeb4bb'); g.addColorStop(0.5, '#969ca4'); g.addColorStop(1, '#7e858d');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 80; i++) {
    const l = trand() > 0.5;
    ctx.fillStyle = `rgba(${l ? 255 : 30},${l ? 255 : 34},${l ? 255 : 40},0.05)`;
    ctx.fillRect(0, trand() * h, w, 1 + trand() * 2);
  }
  // vent slots
  ctx.fillStyle = '#272c33';
  for (let x = 18; x < w; x += 64) ctx.fillRect(x, h * 0.34, 30, h * 0.32);
  // bolted seams + orange warning stripe at the separation plane
  ctx.fillStyle = 'rgba(40,45,52,0.6)';
  ctx.fillRect(0, 4, w, 4);
  ctx.fillStyle = PALETTE.orange;
  ctx.fillRect(0, h - 12, w, 8);
  ctx.fillStyle = 'rgba(25,30,42,0.55)';
  for (let x = 8; x < w; x += 26) { ctx.beginPath(); ctx.arc(x, 16, 3, 0, 7); ctx.fill(); }
  return canvasTexture(c);
}

function metalTexture() {
  const w = 256, h = 256;
  const [c, ctx] = makeCanvas(w, h);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#9aa1ab'); g.addColorStop(0.5, '#7d848e'); g.addColorStop(1, '#565c66');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  // brushed streaks
  for (let i = 0; i < 90; i++) {
    ctx.fillStyle = `rgba(${trand() > 0.5 ? 255 : 0},${trand() > 0.5 ? 255 : 0},${trand() > 0.5 ? 255 : 0},0.04)`;
    ctx.fillRect(0, trand() * h, w, 1 + trand() * 2);
  }
  // heat tint near bottom (bell exit)
  const ht = ctx.createLinearGradient(0, h * 0.62, 0, h);
  ht.addColorStop(0, 'rgba(120,70,140,0)');
  ht.addColorStop(0.55, 'rgba(150,80,60,0.35)');
  ht.addColorStop(1, 'rgba(60,35,80,0.55)');
  ctx.fillStyle = ht; ctx.fillRect(0, h * 0.62, w, h * 0.38);
  return canvasTexture(c);
}

// --------------------------------------------------------------------------
// Materials (built once, shared)
// --------------------------------------------------------------------------
let MATS = null;
export function getMaterials() {
  if (MATS) return MATS;
  MATS = {
    // shiny stainless: high metalness + low-ish roughness (env map in main.js
    // gives the metal something to reflect)
    tankSmall: new THREE.MeshStandardMaterial({
      map: tankTexture(PARTS.tankSmall), roughnessMap: roughnessCanvas(256, 256, 92),
      roughness: 1, metalness: 0.82,
    }),
    tankLarge: new THREE.MeshStandardMaterial({
      map: tankTexture(PARTS.tankLarge), roughnessMap: roughnessCanvas(256, 256, 92),
      roughness: 1, metalness: 0.82,
    }),
    pod: new THREE.MeshStandardMaterial({
      map: podTexture(), roughnessMap: roughnessCanvas(256, 256, 100),
      roughness: 1, metalness: 0.7,
    }),
    nose: new THREE.MeshStandardMaterial({
      map: noseTexture(), roughnessMap: roughnessCanvas(256, 256, 95),
      roughness: 1, metalness: 0.75,
    }),
    interstage: new THREE.MeshStandardMaterial({
      map: interstageTexture(), roughness: 0.42, metalness: 0.85,
      side: THREE.DoubleSide,
    }),
    hazard: new THREE.MeshStandardMaterial({ map: hazardTexture(), roughness: 0.75, metalness: 0.15 }),
    metal: new THREE.MeshStandardMaterial({
      map: metalTexture(), roughness: 0.34, metalness: 0.95,
      roughnessMap: roughnessCanvas(128, 128, 90),
    }),
    metalDark: new THREE.MeshStandardMaterial({ color: PALETTE.metalDark, roughness: 0.5, metalness: 0.85 }),
    machinery: new THREE.MeshStandardMaterial({ color: PALETTE.navyDark, roughness: 0.6, metalness: 0.45 }),
    fin: new THREE.MeshStandardMaterial({ color: '#6d7681', roughness: 0.38, metalness: 0.8 }),
    finEdge: new THREE.MeshStandardMaterial({ color: PALETTE.orange, roughness: 0.5, metalness: 0.1 }),
    trim: new THREE.MeshStandardMaterial({ color: '#2e3a52', roughness: 0.6, metalness: 0.35 }),
    bellInner: new THREE.MeshStandardMaterial({
      color: '#30343c', roughness: 0.45, metalness: 0.7,
      emissive: new THREE.Color('#ff6a18'), emissiveIntensity: 0.0, side: THREE.BackSide,
    }),
  };
  return MATS;
}

// --------------------------------------------------------------------------
// Part mesh builders. Each occupies local Y range [0, part.height].
// --------------------------------------------------------------------------
function lathe(points, segs = 40) {
  return new THREE.LatheGeometry(points.map(([x, y]) => new THREE.Vector2(x, y)), segs);
}

function buildPod(m) {
  const g = new THREE.Group();
  const h = PARTS.pod.height;
  const geo = lathe([
    [0.40, 0], [0.62, 0.02], [0.62, 0.16], [0.586, h * 0.45], [0.46, h * 0.78],
    [0.34, h * 0.9], [0.30, h * 0.94], [0.20, h], [0, h],
  ]);
  const body = new THREE.Mesh(geo, m.pod);
  g.add(body);
  // hatch ring on top
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.1, 20), m.metalDark);
  ring.position.y = h + 0.04; g.add(ring);
  return g;
}

function buildNose(m) {
  const g = new THREE.Group();
  const h = PARTS.nose.height;
  const geo = lathe([
    [0.62, 0], [0.6, h * 0.25], [0.52, h * 0.5], [0.36, h * 0.74], [0.16, h * 0.92], [0, h],
  ]);
  g.add(new THREE.Mesh(geo, m.nose));
  return g;
}

function buildTank(part, m) {
  const g = new THREE.Group();
  const h = part.height, r = part.radius;
  const mat = part.id === 'tankLarge' ? m.tankLarge : m.tankSmall;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 36, 1), mat);
  body.position.y = h / 2;
  g.add(body);
  for (const y of [0.05, h - 0.05]) {
    const trim = new THREE.Mesh(new THREE.TorusGeometry(r + 0.012, 0.045, 10, 36), m.trim);
    trim.rotation.x = Math.PI / 2; trim.position.y = y;
    g.add(trim);
  }
  return g;
}

function buildEngine(part, m) {
  const g = new THREE.Group();
  const h = part.height;
  const big = part.id === 'engineLarge';
  const exitR = big ? 0.46 : 0.33;
  const throatR = big ? 0.15 : 0.11;
  const bellH = h * 0.6;
  // bell: exit at y=0, throat at y=bellH
  const profile = [];
  const N = 9;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const r = throatR + (exitR - throatR) * Math.pow(1 - t, 1.7);
    profile.push([r, bellH * t]);
  }
  const bell = new THREE.Mesh(lathe(profile, 36), m.metal);
  g.add(bell);
  const inner = new THREE.Mesh(lathe(profile.map(([r, y]) => [r * 0.96, y]), 36), m.bellInner);
  inner.userData.isEngineInner = true;
  g.add(inner);
  // powerhead
  const block = new THREE.Mesh(new THREE.CylinderGeometry(big ? 0.40 : 0.3, big ? 0.34 : 0.24, h * 0.3, 22), m.machinery);
  block.position.y = bellH + h * 0.14;
  g.add(block);
  // mount plate joining to tank above
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(part.radius, part.radius, h * 0.12, 28), m.trim);
  plate.position.y = h - h * 0.06;
  g.add(plate);
  // fuel pipes
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, h * 0.42, 8), m.metalDark);
    pipe.position.set(Math.cos(a) * (throatR + 0.13), bellH + h * 0.08, Math.sin(a) * (throatR + 0.13));
    pipe.rotation.z = Math.cos(a) * 0.35;
    pipe.rotation.x = -Math.sin(a) * 0.35;
    g.add(pipe);
  }
  g.userData.nozzleY = 0;            // plume anchor (local)
  g.userData.exitRadius = exitR;
  return g;
}

function buildDecoupler(m) {
  const g = new THREE.Group();
  const h = PARTS.decoupler.height;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.63, 0.63, h, 32), m.hazard);
  body.position.y = h / 2;
  g.add(body);
  return g;
}

function finShape() {
  const s = new THREE.Shape();
  // root at x=0 (against body), sweeping trapezoid
  s.moveTo(0, 0);
  s.lineTo(0.92, -0.5);
  s.lineTo(0.92, -0.95);
  s.lineTo(0, -1.5);
  s.closePath();
  return s;
}

function buildFinSet(m, bodyRadius = 0.62) {
  const g = new THREE.Group();
  const geo = new THREE.ExtrudeGeometry(finShape(), {
    depth: 0.07, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 2,
  });
  geo.translate(0, 0, -0.035);
  const edgeGeo = new THREE.CylinderGeometry(0.045, 0.045, 1.06, 8);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const fin = new THREE.Mesh(geo, m.fin);
    const holder = new THREE.Group();
    holder.rotation.y = -a;
    fin.position.set(bodyRadius - 0.04, 0, 0);
    holder.add(fin);
    // orange leading edge
    const edge = new THREE.Mesh(edgeGeo, m.finEdge);
    edge.position.set(bodyRadius + 0.86, -0.72, 0);
    edge.rotation.z = -0.04;
    holder.add(edge);
    g.add(holder);
  }
  return g;
}

export function buildPartMesh(partId) {
  const m = getMaterials();
  const part = PARTS[partId];
  switch (part.type) {
    case 'pod': return buildPod(m);
    case 'nose': return buildNose(m);
    case 'tank': return buildTank(part, m);
    case 'engine': return buildEngine(part, m);
    case 'decoupler': return buildDecoupler(m);
    case 'fins': return buildFinSet(m);
  }
  return new THREE.Group();
}

// --------------------------------------------------------------------------
// Assemble the full rocket. Returns:
//   group        — root (local +Y = rocket axis, base of stack at y=0)
//   stageGroups  — [Group] bottom-first (split at decouplers) for staging
//   partEntries  — [{ part, mesh, stackIndex, stageIndex, yBottom, yTop }]
//   height       — total stack height
//   nozzles      — [{ stageIndex, local:V3, yLocal, exitRadius }] plume anchors
//
// Consecutive engines cluster radially (KSP "moar boosters" style): they get
// scaled down and fanned out under a shared mount plate, and the physics sums
// their thrust, so 2-3 engines really do launch faster.
// --------------------------------------------------------------------------
const CLUSTER_SCALE = { 1: 1, 2: 0.62, 3: 0.54, 4: 0.47, 5: 0.44, 6: 0.42 };

export function buildRocketGroup(stack) {
  const m = getMaterials();
  const group = new THREE.Group();
  group.name = 'rocket';
  const stageGroups = [new THREE.Group()];
  stageGroups[0].name = 'stage0';
  group.add(stageGroups[0]);
  const partEntries = [];
  const nozzles = [];
  let y = 0;
  let stageIndex = 0;

  let i = 0;
  while (i < stack.length) {
    const part = stack[i];

    // ---- engine run: place the whole consecutive cluster at this height
    if (part.type === 'engine') {
      let j = i;
      while (j < stack.length && stack[j].type === 'engine') j++;
      const n = j - i;
      const s = CLUSTER_SCALE[Math.min(n, 6)] ?? 0.40;
      const runBottom = y;
      let clusterTop = y;
      for (let k = 0; k < n; k++) {
        const p = stack[i + k];
        const mesh = buildPartMesh(p.id);
        mesh.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
        mesh.scale.setScalar(s);
        const exitR = mesh.userData.exitRadius * s;
        let ox = 0, oz = 0;
        if (n > 1 && !(n >= 5 && k === 0)) {
          // 2-4: full ring; 5+: one center engine + the rest fanned in a ring
          const ringN = n >= 5 ? n - 1 : n;
          const ringK = n >= 5 ? k - 1 : k;
          const ro = Math.max(0.12, 0.62 - exitR - 0.04);
          const a = (ringK / ringN) * Math.PI * 2 + Math.PI / 6;
          ox = Math.cos(a) * ro; oz = Math.sin(a) * ro;
        }
        mesh.position.set(ox, y, oz);
        nozzles.push({
          stageIndex,
          local: new THREE.Vector3(ox, y + 0.02, oz),
          yLocal: y + 0.02,
          exitRadius: exitR,
        });
        mesh.userData.partEntry = { part: p, stackIndex: i + k, stageIndex };
        stageGroups[stageIndex].add(mesh);
        partEntries.push({ part: p, mesh, stackIndex: i + k, stageIndex, yBottom: y, yTop: y + p.height * s });
        clusterTop = Math.max(clusterTop, y + p.height * s);
      }
      if (n > 1) {
        // shared mount plate bridging the cluster to the tank above
        const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.58, 0.16, 28), m.trim);
        plate.position.y = clusterTop - 0.08;
        plate.castShadow = true;
        stageGroups[stageIndex].add(plate);
      }
      if (i > 0) {
        // engines mid-stack (an upper stage above a connector): no naked
        // engines dangling in the open — enclose them in an interstage shell.
        // The shell is added to the stage BELOW, so when you decouple, shell
        // and connector leave together and the next stage's engines appear.
        const len = clusterTop - runBottom + 0.06;
        const wall = new THREE.Mesh(
          new THREE.CylinderGeometry(0.655, 0.672, len, 32, 1, true), m.interstage);
        wall.name = 'interstage';
        wall.position.y = (runBottom + clusterTop) / 2;
        wall.castShadow = true;
        const shellStage = stageIndex > 0 ? stageIndex - 1 : stageIndex;
        stageGroups[shellStage].add(wall);
      }
      y = clusterTop;
      i = j;
      continue;
    }

    const mesh = buildPartMesh(part.id);
    mesh.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
    let yBottom = y, yTop = y;
    if (part.type === 'fins') {
      // radial attach around current stack bottom region
      mesh.position.y = Math.max(y, 1.55);
      yBottom = mesh.position.y - 1.5; yTop = mesh.position.y;
    } else {
      mesh.position.y = y;
      yTop = y + part.height;
      y = yTop;
    }
    mesh.userData.partEntry = { part, stackIndex: i, stageIndex };
    stageGroups[stageIndex].add(mesh);
    partEntries.push({ part, mesh, stackIndex: i, stageIndex, yBottom, yTop });

    if (part.type === 'decoupler') {
      stageIndex += 1;
      const sg = new THREE.Group();
      sg.name = `stage${stageIndex}`;
      stageGroups.push(sg);
      group.add(sg);
    }
    i++;
  }

  return { group, stageGroups, partEntries, height: y, nozzles };
}

// Engine glow toggling (inner bell emissive) for a given root group.
export function setEngineGlow(root, intensity) {
  root.traverse((o) => {
    if (o.isMesh && o.userData.isEngineInner) {
      o.material.emissiveIntensity = intensity;
    }
  });
}

// Stats for the builder readout.
export function stackStats(stack) {
  let mass = 0, fuel = 0;
  for (const p of stack) { mass += p.massDry + (p.fuel || 0); fuel += p.fuel || 0; }
  // bottom stage thrust = engines below the first decoupler
  let thrust = 0;
  for (const p of stack) {
    if (p.type === 'decoupler') break;
    if (p.type === 'engine') thrust += p.thrust;
  }
  const twr = mass > 0 ? thrust / (mass * 9.0) : 0;
  return { mass, fuel, thrust, twr };
}
