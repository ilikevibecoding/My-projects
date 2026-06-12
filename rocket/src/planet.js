// planet.js — a real (small) sphere planet, plus a detailed launch-site patch:
// stylized grass terrain, concrete pad, service tower, props. All canvas-textured.

import * as THREE from 'three';
import { CONST } from './physics.js';
import { mulberry32 } from './effects.js';
import { PALETTE } from './rocket.js';

const rng = mulberry32(20260612);

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}
function tex(c, repeat = 1) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 4;
  return t;
}

// --------------------------------------------------------------------------
// Planet-wide equirect texture (low detail — seen from altitude)
// --------------------------------------------------------------------------
function planetTexture() {
  const W = 2048, H = 1024;
  const [c, ctx] = makeCanvas(W, H);
  // ocean
  const og = ctx.createLinearGradient(0, 0, 0, H);
  og.addColorStop(0, '#2f7fb8');
  og.addColorStop(0.5, '#2a6fa8');
  og.addColorStop(1, '#3a86b5');
  ctx.fillStyle = og; ctx.fillRect(0, 0, W, H);
  // subtle ocean noise
  for (let i = 0; i < 400; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.015 + rng() * 0.02})`;
    const x = rng() * W, y = rng() * H;
    ctx.beginPath(); ctx.ellipse(x, y, 20 + rng() * 90, 6 + rng() * 18, rng() * 3, 0, 7); ctx.fill();
  }
  const blob = (cx, cy, r, color, n = 14) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const rr = r * (0.65 + rng() * 0.5);
      const x = cx + Math.cos(a) * rr * 1.6;
      const y = cy + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath(); ctx.fill();
  };
  // polar launch continent (top of equirect = north pole where the pad sits)
  ctx.fillStyle = '#5da348';
  ctx.fillRect(0, 0, W, 70);
  for (let x = 0; x < W; x += 60) blob(x, 95, 55, '#5da348');
  for (let x = 30; x < W; x += 90) blob(x, 60, 40, '#6cb554');
  // scattered continents
  for (let i = 0; i < 13; i++) {
    const cx = rng() * W, cy = H * (0.22 + rng() * 0.6), r = 40 + rng() * 110;
    blob(cx, cy, r, '#5da348');
    blob(cx + r * 0.2, cy - r * 0.15, r * 0.55, '#6cb554');
    if (rng() > 0.5) blob(cx - r * 0.3, cy + r * 0.2, r * 0.3, '#c9b97c'); // beaches/desert
  }
  // south ice cap
  ctx.fillStyle = '#e8f2f4';
  ctx.fillRect(0, H - 46, W, 46);
  for (let x = 0; x < W; x += 70) blob(x, H - 60, 38, '#e8f2f4');
  const t = tex(c);
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// --------------------------------------------------------------------------
// Launch patch grass (tiled detail texture)
// --------------------------------------------------------------------------
function grassTexture() {
  const S = 512;
  const [c, ctx] = makeCanvas(S, S);
  ctx.fillStyle = '#5aa843'; ctx.fillRect(0, 0, S, S);
  // large soft mottling so the field doesn't read as flat neon
  for (let i = 0; i < 38; i++) {
    const x = rng() * S, y = rng() * S, r = 40 + rng() * 110;
    const dark = rng() > 0.45;
    const g = ctx.createRadialGradient(x, y, 4, x, y, r);
    g.addColorStop(0, dark ? 'rgba(36,92,30,0.22)' : 'rgba(150,200,90,0.18)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // mow stripes
  for (let y = 0; y < S; y += 64) {
    ctx.fillStyle = (y / 64) % 2 === 0 ? 'rgba(255,255,255,0.06)' : 'rgba(0,40,0,0.08)';
    ctx.fillRect(0, y, S, 64);
  }
  // tuft noise
  for (let i = 0; i < 2600; i++) {
    const x = rng() * S, y = rng() * S;
    const g = 120 + rng() * 90;
    ctx.fillStyle = `rgba(${30 + rng() * 40},${g},${30 + rng() * 36},0.16)`;
    ctx.fillRect(x, y, 2 + rng() * 3, 2 + rng() * 4);
  }
  // occasional clover patches
  for (let i = 0; i < 26; i++) {
    const x = rng() * S, y = rng() * S, r = 8 + rng() * 26;
    const g = ctx.createRadialGradient(x, y, 1, x, y, r);
    g.addColorStop(0, 'rgba(120,190,80,0.35)');
    g.addColorStop(1, 'rgba(120,190,80,0)');
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  return tex(c, 26);
}

function concreteTexture() {
  const S = 512;
  const [c, ctx] = makeCanvas(S, S);
  ctx.fillStyle = '#9b9c97'; ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 2000; i++) {
    const v = 130 + rng() * 60;
    ctx.fillStyle = `rgba(${v},${v},${v - 6},0.25)`;
    ctx.fillRect(rng() * S, rng() * S, 1 + rng() * 3, 1 + rng() * 3);
  }
  // expansion joints
  ctx.strokeStyle = 'rgba(60,60,58,0.6)'; ctx.lineWidth = 3;
  for (let i = 0; i <= 4; i++) {
    ctx.beginPath(); ctx.moveTo((S / 4) * i, 0); ctx.lineTo((S / 4) * i, S); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, (S / 4) * i); ctx.lineTo(S, (S / 4) * i); ctx.stroke();
  }
  return tex(c, 3);
}

// Pad top: markings + scorch
function padTopTexture() {
  const S = 1024;
  const [c, ctx] = makeCanvas(S, S);
  ctx.fillStyle = '#a4a59f'; ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 4000; i++) {
    const v = 140 + rng() * 50;
    ctx.fillStyle = `rgba(${v},${v},${v - 6},0.2)`;
    ctx.fillRect(rng() * S, rng() * S, 1 + rng() * 3, 1 + rng() * 3);
  }
  const cx = S / 2;
  // joints (radial sectors)
  ctx.strokeStyle = 'rgba(70,70,66,0.5)'; ctx.lineWidth = 4;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ctx.beginPath(); ctx.moveTo(cx, cx); ctx.lineTo(cx + Math.cos(a) * S, cx + Math.sin(a) * S); ctx.stroke();
  }
  // yellow warning ring + center circle marking (high contrast)
  ctx.strokeStyle = '#f2bd1d'; ctx.lineWidth = 20;
  ctx.beginPath(); ctx.arc(cx, cx, S * 0.43, 0, 7); ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(cx, cx, S * 0.41, 0, 7); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cx, S * 0.45, 0, 7); ctx.stroke();
  ctx.strokeStyle = '#f4f0e4'; ctx.lineWidth = 12;
  ctx.beginPath(); ctx.arc(cx, cx, S * 0.18, 0, 7); ctx.stroke();
  // "01" pad number (oriented toward the standard camera heading)
  ctx.save();
  ctx.translate(cx, cx);
  ctx.rotate(-Math.PI / 2.55);
  ctx.font = `900 ${S * 0.12}px "Trebuchet MS", sans-serif`;
  ctx.fillStyle = '#f4f0e4'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('01', 0, S * 0.31);
  ctx.restore();
  // center scorch
  const sc = ctx.createRadialGradient(cx, cx, 4, cx, cx, S * 0.2);
  sc.addColorStop(0, 'rgba(24,20,18,0.95)');
  sc.addColorStop(0.5, 'rgba(38,34,30,0.6)');
  sc.addColorStop(1, 'rgba(40,36,32,0)');
  ctx.fillStyle = sc; ctx.fillRect(0, 0, S, S);
  // streak scorches outward
  for (let i = 0; i < 30; i++) {
    const a = rng() * Math.PI * 2;
    ctx.save(); ctx.translate(cx, cx); ctx.rotate(a);
    const len = S * (0.14 + rng() * 0.14);
    const g = ctx.createLinearGradient(0, 0, len, 0);
    g.addColorStop(0, 'rgba(28,24,22,0.6)'); g.addColorStop(1, 'rgba(30,26,24,0)');
    ctx.fillStyle = g; ctx.fillRect(S * 0.05, -6 - rng() * 8, len, 12 + rng() * 18);
    ctx.restore();
  }
  const t = tex(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

function flagTexture() {
  const [c, ctx] = makeCanvas(256, 160);
  ctx.fillStyle = PALETTE.navy; ctx.fillRect(0, 0, 256, 160);
  ctx.fillStyle = PALETTE.orange; ctx.fillRect(0, 92, 256, 26);
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(70, 56, 26, 0, 7); ctx.fill();
  ctx.fillStyle = PALETTE.navy;
  ctx.beginPath(); ctx.arc(80, 50, 22, 0, 7); ctx.fill();
  return tex(c);
}

// --------------------------------------------------------------------------
// Geometry helpers
// --------------------------------------------------------------------------
function mergeBoxes(boxes, material) {
  // cheap merge: one Group of boxes shares material; modest count, fine for v1
  const g = new THREE.Group();
  for (const [w, h, d, x, y, z, ry] of boxes) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    m.position.set(x, y, z);
    if (ry) m.rotation.y = ry;
    m.castShadow = true; m.receiveShadow = true;
    g.add(m);
  }
  return g;
}

function buildTower() {
  const red = new THREE.MeshStandardMaterial({ color: '#c9402e', roughness: 0.6, metalness: 0.3 });
  const boxes = [];
  const H = 17, S = 1.25;
  // 4 corner columns
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    boxes.push([0.22, H, 0.22, sx * S, H / 2, sz * S]);
  }
  // horizontal braces every 2.4m + cross members
  for (let y = 2.2; y < H; y += 2.4) {
    boxes.push([S * 2 + 0.2, 0.16, 0.16, 0, y, -S]);
    boxes.push([S * 2 + 0.2, 0.16, 0.16, 0, y, S]);
    boxes.push([0.16, 0.16, S * 2 + 0.2, -S, y, 0]);
    boxes.push([0.16, 0.16, S * 2 + 0.2, S, y, 0]);
    // diagonals (rotated thin boxes)
    boxes.push([Math.SQRT2 * S * 2, 0.12, 0.12, 0, y + 1.2, -S, Math.PI / 4 * 0]);
  }
  const g = mergeBoxes(boxes, red);
  // crane arm toward the rocket
  const arm = mergeBoxes([
    [6.2, 0.35, 0.7, 3.0, H - 0.6, 0],
    [0.3, 1.6, 0.3, 6.0, H - 1.6, 0],
  ], red);
  g.add(arm);
  // hook block
  const block = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, 0.6),
    new THREE.MeshStandardMaterial({ color: '#e0b428', roughness: 0.5, metalness: 0.4 }));
  block.position.set(6.0, H - 2.7, 0);
  block.castShadow = true;
  g.add(block);
  // dish on top
  const dish = new THREE.Mesh(new THREE.SphereGeometry(0.8, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2.4),
    new THREE.MeshStandardMaterial({ color: '#ddd9ce', roughness: 0.4, metalness: 0.5, side: THREE.DoubleSide }));
  dish.position.set(-0.6, H + 0.5, -0.6);
  dish.rotation.z = 0.8;
  dish.castShadow = true;
  g.add(dish);
  return g;
}

function buildPropTank(r) {
  const g = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: '#e8e2d2', roughness: 0.35, metalness: 0.25 });
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 18), white);
  sphere.position.y = r + 0.9;
  sphere.castShadow = true; sphere.receiveShadow = true;
  g.add(sphere);
  // teal equator stripe
  const stripe = new THREE.Mesh(new THREE.TorusGeometry(r * 1.002, 0.07, 8, 36),
    new THREE.MeshStandardMaterial({ color: PALETTE.teal, roughness: 0.5 }));
  stripe.rotation.x = Math.PI / 2;
  stripe.position.y = r + 0.9;
  g.add(stripe);
  // legs
  const legMat = new THREE.MeshStandardMaterial({ color: '#4a5058', roughness: 0.6, metalness: 0.6 });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, r + 1.2, 8), legMat);
    leg.position.set(Math.cos(a) * r * 0.7, (r + 1.2) / 2, Math.sin(a) * r * 0.7);
    leg.castShadow = true;
    g.add(leg);
  }
  return g;
}

function buildFloodlight() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: '#5b6068', roughness: 0.55, metalness: 0.5 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 7.5, 10), mat);
  pole.position.y = 3.75; pole.castShadow = true;
  g.add(pole);
  const head = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.8, 0.4), mat);
  head.position.y = 7.6; head.castShadow = true;
  g.add(head);
  const lamp = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.6),
    new THREE.MeshStandardMaterial({ color: '#fffbe8', emissive: '#fff6d8', emissiveIntensity: 1.6 }));
  lamp.position.set(0, 7.6, 0.21);
  g.add(lamp);
  return g;
}

// --------------------------------------------------------------------------
// World assembly
// --------------------------------------------------------------------------
export function createWorld(scene) {
  const world = new THREE.Group();
  world.name = 'world';

  // ---- the planet itself (rendered ~2m below the local terrain to avoid z-fights)
  const planetMat = new THREE.MeshStandardMaterial({
    map: planetTexture(), roughness: 0.96, metalness: 0,
  });
  const planet = new THREE.Mesh(new THREE.SphereGeometry(CONST.R - 2.5, 128, 96), planetMat);
  planet.position.set(0, -CONST.R, 0);
  planet.rotation.x = 0; // pole up: equirect top = +Y pole = launch site
  world.add(planet);

  // ---- launch-site terrain patch (follows sphere curvature, gentle hills)
  const PATCH_R = 380;
  const patchGeo = new THREE.CircleGeometry(PATCH_R, 96, 0, Math.PI * 2);
  patchGeo.rotateX(-Math.PI / 2);
  {
    const pos = patchGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const d = Math.sqrt(x * x + z * z);
      let y = -(d * d) / (2 * CONST.R); // follow curvature
      if (d > 60) {
        const k = Math.min(1, (d - 60) / 110);
        y += k * (Math.sin(x * 0.025) * Math.cos(z * 0.02) * 2.6 + Math.sin(d * 0.013) * 1.7);
      }
      pos.setY(i, y);
    }
    patchGeo.computeVertexNormals();
  }
  const patch = new THREE.Mesh(patchGeo, new THREE.MeshStandardMaterial({
    map: grassTexture(), roughness: 0.95, metalness: 0,
  }));
  patch.receiveShadow = true;
  world.add(patch);

  // ---- dirt road from pad toward props
  const roadGeo = new THREE.PlaneGeometry(7, 150, 1, 30);
  roadGeo.rotateX(-Math.PI / 2);
  {
    const pos = roadGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i) + 92;
      const d = Math.sqrt(x * x + z * z);
      pos.setY(i, -(d * d) / (2 * CONST.R) + 0.08);
    }
  }
  const roadCanvas = (() => {
    const [c, ctx] = makeCanvas(128, 512);
    ctx.fillStyle = '#8a7a5c'; ctx.fillRect(0, 0, 128, 512);
    for (let i = 0; i < 800; i++) {
      const v = 110 + rng() * 60;
      ctx.fillStyle = `rgba(${v},${v - 14},${v - 40},0.3)`;
      ctx.fillRect(rng() * 128, rng() * 512, 2, 2 + rng() * 4);
    }
    ctx.fillStyle = 'rgba(70,60,40,0.4)';
    ctx.fillRect(18, 0, 10, 512); ctx.fillRect(100, 0, 10, 512);
    return tex(c);
  })();
  const road = new THREE.Mesh(roadGeo, new THREE.MeshStandardMaterial({ map: roadCanvas, roughness: 1 }));
  road.position.set(0, 0.02, 92);
  road.receiveShadow = true;
  world.add(road);

  // ---- concrete launch pad
  const padGroup = new THREE.Group();
  const PAD_R = 13, PAD_H = 1.0;
  const padSide = new THREE.Mesh(
    new THREE.CylinderGeometry(PAD_R, PAD_R + 0.7, PAD_H, 48, 1, true),
    new THREE.MeshStandardMaterial({ map: concreteTexture(), roughness: 0.9 }));
  padSide.position.y = PAD_H / 2;
  padSide.castShadow = true; padSide.receiveShadow = true;
  padGroup.add(padSide);
  const padTop = new THREE.Mesh(new THREE.CircleGeometry(PAD_R, 48),
    new THREE.MeshStandardMaterial({ map: padTopTexture(), roughness: 0.85 }));
  padTop.rotation.x = -Math.PI / 2;
  padTop.position.y = PAD_H;
  padTop.receiveShadow = true;
  padGroup.add(padTop);

  // launch mount: 4 angled legs + ring the rocket sits on
  const mountMat = new THREE.MeshStandardMaterial({ color: '#3a4250', roughness: 0.55, metalness: 0.6 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.13, 10, 28), mountMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = PAD_H + 1.18;
  ring.castShadow = true;
  padGroup.add(ring);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 1.45, 10), mountMat);
    leg.position.set(Math.cos(a) * 1.35, PAD_H + 0.62, Math.sin(a) * 1.35);
    leg.rotation.z = Math.cos(a) * 0.42;
    leg.rotation.x = -Math.sin(a) * 0.42;
    leg.castShadow = true;
    padGroup.add(leg);
  }
  // hold-down clamps: chunky yellow bases with angled arms toward the mount
  const clampYellow = new THREE.MeshStandardMaterial({ color: '#e8b32a', roughness: 0.55, metalness: 0.35 });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const cg = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.42, 0.6), clampYellow);
    base.position.y = 0.21;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.22, 0.3), mountMat);
    arm.position.set(-0.62, 0.62, 0);
    arm.rotation.z = 0.45;
    const piston = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.8, 8), mountMat);
    piston.position.set(-0.25, 0.5, 0);
    piston.rotation.z = 0.9;
    cg.add(base, arm, piston);
    cg.position.set(Math.cos(a) * 2.7, PAD_H, Math.sin(a) * 2.7);
    cg.rotation.y = -a;
    cg.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    padGroup.add(cg);
  }
  world.add(padGroup);

  // ---- service tower
  const tower = buildTower();
  tower.position.set(-7.4, PAD_H, 0);
  world.add(tower);

  // generator boxes + cable run between tower and mount
  {
    const genMat = new THREE.MeshStandardMaterial({ color: PALETTE.navy, roughness: 0.6, metalness: 0.3 });
    const accentMat = new THREE.MeshStandardMaterial({ color: PALETTE.teal, roughness: 0.55 });
    for (const [x, z, w] of [[-9.6, 3.4, 1.5], [-9.2, -3.0, 1.1]]) {
      const box = new THREE.Mesh(new THREE.BoxGeometry(w, 0.85, 0.9), genMat);
      box.position.set(x, PAD_H + 0.43, z);
      box.castShadow = true; box.receiveShadow = true;
      const vent = new THREE.Mesh(new THREE.BoxGeometry(w * 0.8, 0.16, 0.94), accentMat);
      vent.position.set(x, PAD_H + 0.78, z);
      world.add(box, vent);
    }
    const tray = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.12, 0.5),
      new THREE.MeshStandardMaterial({ color: '#3a4250', roughness: 0.7, metalness: 0.4 }));
    tray.position.set(-4.2, PAD_H + 0.06, 0.8);
    tray.rotation.y = 0.18;
    tray.receiveShadow = true; tray.castShadow = true;
    world.add(tray);
  }

  // ---- props
  const tank1 = buildPropTank(2.4); tank1.position.set(30, 0, -16); world.add(tank1);
  const tank2 = buildPropTank(1.7); tank2.position.set(36, 0, -8); world.add(tank2);

  for (const [x, z] of [[22, 18], [-20, 21], [-23, -17], [20, -21]]) {
    const fl = buildFloodlight();
    fl.position.set(x, 0, z);
    fl.rotation.y = Math.atan2(-x, -z); // yaw only: keep the pole vertical
    world.add(fl);
  }

  // flag
  {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 6.2, 8),
      new THREE.MeshStandardMaterial({ color: '#cfcabd', roughness: 0.4, metalness: 0.7 }));
    pole.position.set(13.5, 3.1, 13.5); pole.castShadow = true;
    world.add(pole);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.5, 12, 1),
      new THREE.MeshStandardMaterial({ map: flagTexture(), side: THREE.DoubleSide, roughness: 0.8 }));
    flag.position.set(13.5 + 1.25, 5.4, 13.5);
    flag.castShadow = true;
    flag.userData.isFlag = true;
    world.add(flag);
  }

  // crates
  const crateMat = new THREE.MeshStandardMaterial({ color: '#b98a4a', roughness: 0.8 });
  const crateMat2 = new THREE.MeshStandardMaterial({ color: PALETTE.teal, roughness: 0.7 });
  for (const [x, z, s, m] of [[18.5, 9, 1.2, crateMat], [19.8, 9.6, 0.9, crateMat2], [18.9, 10.6, 0.8, crateMat], [-15, -12, 1.1, crateMat2]]) {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), m);
    crate.position.set(x, s / 2 + 0.02, z);
    crate.rotation.y = rng() * 1.2;
    crate.castShadow = true; crate.receiveShadow = true;
    world.add(crate);
  }

  // grass tufts + rocks (instanced)
  {
    const tuftGeo = new THREE.ConeGeometry(0.32, 0.55, 5);
    const tuftMat = new THREE.MeshStandardMaterial({ color: '#3f8a33', roughness: 1 });
    const tufts = new THREE.InstancedMesh(tuftGeo, tuftMat, 240);
    const rockGeo = new THREE.DodecahedronGeometry(0.4, 0);
    const rockMat = new THREE.MeshStandardMaterial({ color: '#8e8d84', roughness: 0.95 });
    const rocks = new THREE.InstancedMesh(rockGeo, rockMat, 70);
    const m4 = new THREE.Matrix4();
    let ti = 0, ri = 0;
    while (ti < 240 || ri < 70) {
      const a = rng() * Math.PI * 2;
      const d = 24 + rng() * (PATCH_R * 0.72 - 24);
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (Math.abs(x) < 5 && z > 0 && z < 170) continue; // keep off the road
      const y = -(d * d) / (2 * CONST.R);
      const s = 0.5 + rng() * 1.3;
      m4.makeRotationY(rng() * 6.28);
      m4.scale(new THREE.Vector3(s, s * (0.7 + rng() * 0.7), s));
      m4.setPosition(x, y + 0.1, z);
      if (ti < 240) { tufts.setMatrixAt(ti++, m4); }
      else if (ri < 70) { rocks.setMatrixAt(ri++, m4); }
    }
    tufts.receiveShadow = true;
    rocks.castShadow = true; rocks.receiveShadow = true;
    world.add(tufts, rocks);
  }

  scene.add(world);

  return {
    group: world,
    planet,
    padGroup,
    padTopY: PAD_H,
    rocketBaseY: PAD_H + 1.32, // rocket base sits on the launch mount ring
    update(t) {
      // gentle flag wave
      world.traverse((o) => {
        if (o.userData.isFlag) {
          const pos = o.geometry.attributes.position;
          for (let i = 0; i < pos.count; i++) {
            const x = pos.getX(i);
            if (x > -1.1) {
              pos.setZ(i, Math.sin(x * 2.4 + t * 3.2) * 0.09 * (x + 1.2));
            }
          }
          pos.needsUpdate = true;
        }
      });
    },
  };
}
