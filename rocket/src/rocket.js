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
  engineLarge: { id: 'engineLarge', name: 'Engine L “Mastodon”', type: 'engine', massDry: 880, thrust: 76000, burn: 24, height: 1.45, radius: 0.62, cdA: 0.10, blurb: '76 kN' },
  fins: { id: 'fins', name: 'Fin Set ×4', type: 'fins', massDry: 120, height: 0, radius: 0, cdA: 0.14, blurb: 'stability' },
  decoupler: { id: 'decoupler', name: 'Decoupler', type: 'decoupler', massDry: 90, height: 0.3, radius: 0.63, cdA: 0.05, blurb: 'stage split' },
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
  t.anisotropy = 4;
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
  ctx.lineWidth = 3;
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

// Tank / body paint. hPx scaled by part height so panel density matches.
function tankTexture(part, { stripeFrac = 0.18, decal = true } = {}) {
  const w = 512;
  const h = Math.round(170 * part.height);
  const [c, ctx] = makeCanvas(w, h);

  // base cream with subtle vertical shading
  const base = ctx.createLinearGradient(0, 0, w, 0);
  base.addColorStop(0, PALETTE.cream);
  base.addColorStop(0.5, '#fbf4e4');
  base.addColorStop(1, PALETTE.cream);
  ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);

  // big orange stripe band
  const bandH = Math.round(h * stripeFrac);
  const bandY = Math.round(h * 0.30);
  ctx.fillStyle = PALETTE.orange;
  ctx.fillRect(0, bandY, w, bandH);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(0, bandY, w, 6);
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(0, bandY + bandH - 6, w, 6);

  // teal pinstripes
  ctx.fillStyle = PALETTE.teal;
  ctx.fillRect(0, bandY - 16, w, 7);
  ctx.fillRect(0, bandY + bandH + 9, w, 7);

  // weld bands top/bottom
  ctx.fillStyle = PALETTE.creamShade;
  ctx.fillRect(0, 0, w, 18); ctx.fillRect(0, h - 18, w, 18);

  panelLines(ctx, w, h, 4, Math.max(2, Math.round(part.height)));

  if (decal) {
    // vertical "KARMAN-1" wordmark
    ctx.save();
    ctx.translate(w * 0.30, h * 0.56);
    ctx.rotate(Math.PI / 2);
    ctx.font = `900 ${Math.min(46, h * 0.3)}px "Trebuchet MS", sans-serif`;
    ctx.fillStyle = PALETTE.navy;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('KARMAN-1', 0, 0);
    ctx.restore();
    // flag patch
    const fx = w * 0.62, fy = h * 0.62, fw = 64, fh = 40;
    ctx.fillStyle = PALETTE.navy; ctx.fillRect(fx, fy, fw, fh);
    ctx.fillStyle = PALETTE.orange; ctx.fillRect(fx, fy + fh * 0.55, fw, fh * 0.2);
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(fx + fw * 0.28, fy + fh * 0.34, 7, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 2.5; ctx.strokeRect(fx, fy, fw, fh);
  }

  grime(ctx, w, h);
  noiseBlotches(ctx, w, h, 60, 0.05, false);
  return canvasTexture(c);
}

function podTexture() {
  const w = 512, h = 320;
  const [c, ctx] = makeCanvas(w, h);
  const base = ctx.createLinearGradient(0, 0, 0, h);
  base.addColorStop(0, '#fbf4e4');
  base.addColorStop(0.72, PALETTE.cream);
  base.addColorStop(0.78, '#b46a35');   // heat shield rim
  base.addColorStop(1, '#8a4a22');
  ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);

  // navy crown band
  ctx.fillStyle = PALETTE.navy; ctx.fillRect(0, 0, w, 34);
  ctx.fillStyle = PALETTE.orange; ctx.fillRect(0, 34, w, 9);

  panelLines(ctx, w, h * 0.74, 6, 2);

  // windows: 3 round portholes around
  for (const fx of [0.17, 0.5, 0.83]) {
    const x = w * fx, y = h * 0.38, r = 30;
    ctx.fillStyle = '#1d2531'; ctx.beginPath(); ctx.arc(x, y, r + 7, 0, 7); ctx.fill();
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
  ctx.fillStyle = PALETTE.orange; ctx.fillRect(0, 0, w, h);
  // cream chevrons
  ctx.fillStyle = PALETTE.cream;
  ctx.fillRect(0, h * 0.55, w, h * 0.45);
  ctx.fillStyle = PALETTE.teal; ctx.fillRect(0, h * 0.55, w, 8);
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
    tankSmall: new THREE.MeshStandardMaterial({
      map: tankTexture(PARTS.tankSmall), roughnessMap: roughnessCanvas(256, 256, 145),
      roughness: 1, metalness: 0.08,
    }),
    tankLarge: new THREE.MeshStandardMaterial({
      map: tankTexture(PARTS.tankLarge), roughnessMap: roughnessCanvas(256, 256, 145),
      roughness: 1, metalness: 0.08,
    }),
    pod: new THREE.MeshStandardMaterial({
      map: podTexture(), roughnessMap: roughnessCanvas(256, 256, 135),
      roughness: 1, metalness: 0.1,
    }),
    nose: new THREE.MeshStandardMaterial({
      map: noseTexture(), roughnessMap: roughnessCanvas(256, 256, 120),
      roughness: 1, metalness: 0.1,
    }),
    hazard: new THREE.MeshStandardMaterial({ map: hazardTexture(), roughness: 0.75, metalness: 0.15 }),
    metal: new THREE.MeshStandardMaterial({
      map: metalTexture(), roughness: 0.34, metalness: 0.95,
      roughnessMap: roughnessCanvas(128, 128, 90),
    }),
    metalDark: new THREE.MeshStandardMaterial({ color: PALETTE.metalDark, roughness: 0.5, metalness: 0.85 }),
    machinery: new THREE.MeshStandardMaterial({ color: PALETTE.navyDark, roughness: 0.6, metalness: 0.45 }),
    fin: new THREE.MeshStandardMaterial({ color: PALETTE.teal, roughness: 0.55, metalness: 0.12 }),
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
//   nozzles      — [{ stageIndex, worldYLocal, exitRadius }] plume anchors
// --------------------------------------------------------------------------
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
  let lastRadius = 0.62;

  stack.forEach((part, i) => {
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
      lastRadius = part.radius || lastRadius;
    }
    if (part.type === 'engine') {
      nozzles.push({ stageIndex, yLocal: yBottom + 0.02, exitRadius: mesh.userData.exitRadius });
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
  });

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
