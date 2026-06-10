// Original nightmare characters, built entirely from primitives.
// They live in the same genre as classic animatronic-horror — tattered hide,
// exposed metal, too many teeth — but every design here is our own.
//
//   THUMP  — the left hall.  Gaunt, long bent ears, amber eyes.
//   PECK   — the right hall. Broken bird, split hooked beak, green eyes.
//   SNATCH — the closet.     Pale and lanky, needle fingers, magenta eyes.
//   GNATS  — the bed.        Three tiny chattering teeth-balls.
//   GRIMM  — night 5.        The big one. White pinprick eyes.
import * as THREE from 'three';
import { hideTexture } from './textures.js';

// ---------- shared bits ----------
let glowTex = null;
function getGlowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}

function makeEye(color, size = 0.05) {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color: 0x0a0a0a, emissive: color, emissiveIntensity: 1.9, roughness: 0.3,
  });
  const ball = new THREE.Mesh(new THREE.SphereGeometry(size, 10, 8), mat);
  group.add(ball);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: getGlowTexture(), color, transparent: true, opacity: 0.4,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  sprite.scale.setScalar(size * 4.5);
  group.add(sprite);
  return { group, mat, sprite };
}

// soft round contact shadow so characters read as standing ON the floor
let blobTex = null;
function getBlobTexture() {
  if (blobTex) return blobTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 4, 32, 32, 31);
  g.addColorStop(0, 'rgba(0,0,0,0.85)');
  g.addColorStop(0.6, 'rgba(0,0,0,0.5)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  blobTex = new THREE.CanvasTexture(c);
  return blobTex;
}

function contactShadow(radius = 0.5) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(radius * 2, radius * 2),
    new THREE.MeshBasicMaterial({
      map: getBlobTexture(), transparent: true, depthWrite: false, opacity: 0.85,
    }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.015;
  m.renderOrder = 1;
  return m;
}

function teethRow(count, width, size, mat, downward = true) {
  const g = new THREE.Group();
  const geo = new THREE.ConeGeometry(size * 0.42, size, 5);
  for (let i = 0; i < count; i++) {
    const t = new THREE.Mesh(geo, mat);
    t.position.x = -width / 2 + (i / (count - 1)) * width;
    t.position.y = downward ? -size / 2 : size / 2;
    if (downward) t.rotation.x = Math.PI;
    t.scale.y = 0.8 + Math.sin(i * 2.7) * 0.25;
    g.add(t);
  }
  return g;
}

const toothMat = new THREE.MeshStandardMaterial({ color: 0xd6cfb8, roughness: 0.35 });
const metalMat = new THREE.MeshStandardMaterial({ color: 0x55504c, roughness: 0.45, metalness: 0.8 });
const innerMat = new THREE.MeshStandardMaterial({ color: 0x1b0d0d, roughness: 1 });

function limb(mat, r0, r1, len) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, len, 8), mat);
  m.position.y = -len / 2;
  m.castShadow = true;
  const pivot = new THREE.Group();
  pivot.add(m);
  return pivot;
}

function ribCage(mat, w, h, n, parent) {
  for (let i = 0; i < n; i++) {
    const rib = new THREE.Mesh(new THREE.TorusGeometry(w * (0.85 + 0.15 * Math.sin(i)), 0.018, 6, 14, Math.PI), mat);
    rib.rotation.x = Math.PI / 2;
    rib.rotation.z = Math.PI;
    rib.position.y = -i * (h / n);
    parent.add(rib);
  }
}

// =====================================================================
// THUMP — left hall stalker
// =====================================================================
export function makeThump() {
  const g = new THREE.Group();
  const hide = new THREE.MeshStandardMaterial({ map: hideTexture(74, 60, 48), roughness: 0.95 });
  const hideDark = new THREE.MeshStandardMaterial({ map: hideTexture(52, 42, 34), roughness: 0.95 });

  // pelvis/legs
  const legL = limb(hide, 0.07, 0.05, 0.95); legL.position.set(-0.14, 0.95, 0);
  const legR = limb(hide, 0.07, 0.05, 0.95); legR.position.set(0.14, 0.95, 0);
  g.add(legL, legR);

  // torso: hollowed, ribs exposed
  const torso = new THREE.Group();
  torso.position.y = 0.95;
  g.add(torso);
  const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.16, 0.72, 9), hide);
  chest.position.y = 0.42;
  chest.castShadow = true;
  torso.add(chest);
  const belly = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.13, 0.3, 9), innerMat);
  belly.position.y = 0.05;
  torso.add(belly);
  const ribs = new THREE.Group();
  ribs.position.set(0, 0.32, 0.05);
  ribCage(metalMat, 0.17, 0.3, 4, ribs);
  torso.add(ribs);

  // arms — too long, 2 segments
  function arm(side) {
    const sh = new THREE.Group();
    sh.position.set(side * 0.24, 0.72, 0);
    // shoulder ball bridges arm to torso
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 7), hide);
    sh.add(ball);
    const upper = limb(hide, 0.05, 0.04, 0.52);
    sh.add(upper);
    const elbow = new THREE.Group();
    elbow.position.y = -0.52;
    upper.add(elbow);
    const fore = limb(hideDark, 0.04, 0.03, 0.58);
    elbow.add(fore);
    const hand = new THREE.Group();
    hand.position.y = -0.6;
    fore.add(hand);
    for (let f = 0; f < 4; f++) {
      const claw = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.16, 5), toothMat);
      claw.position.set((f - 1.5) * 0.03, -0.07, 0);
      claw.rotation.x = Math.PI;
      hand.add(claw);
    }
    torso.add(sh);
    return { sh, elbow };
  }
  const armL = arm(-1), armR = arm(1);

  // head
  const head = new THREE.Group();
  head.position.y = 0.92;
  torso.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 10), hide);
  skull.scale.set(0.9, 1.0, 0.95);
  skull.castShadow = true;
  head.add(skull);
  const muzzle = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.2), hide);
  muzzle.position.set(0, -0.05, 0.16);
  head.add(muzzle);
  // upper teeth
  const upTeeth = teethRow(7, 0.17, 0.07, toothMat, true);
  upTeeth.position.set(0, -0.1, 0.24);
  head.add(upTeeth);
  // jaw
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.11, 0.04);
  head.add(jaw);
  const jawMesh = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.06, 0.24), hideDark);
  jawMesh.position.set(0, -0.04, 0.12);
  jaw.add(jawMesh);
  const loTeeth = teethRow(6, 0.14, 0.06, toothMat, false);
  loTeeth.position.set(0, 0.0, 0.22);
  jaw.add(loTeeth);
  // ears — long, one bent
  function ear(side, bend) {
    const e = new THREE.Group();
    e.position.set(side * 0.1, 0.14, -0.02);
    const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.34, 7), hide);
    lower.position.y = 0.17;
    e.add(lower);
    const tip = new THREE.Group();
    tip.position.y = 0.34;
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.035, 0.3, 7), hideDark);
    upper.position.y = 0.15;
    tip.add(upper);
    tip.rotation.x = bend;
    tip.rotation.z = side * 0.25;
    e.add(tip);
    e.rotation.z = side * -0.12;
    head.add(e);
    return e;
  }
  const earL = ear(-1, 0.35);
  const earR = ear(1, 1.25); // broken, folded over
  // eyes
  const eyeL = makeEye(0xffa030, 0.045); eyeL.group.position.set(-0.075, 0.045, 0.155); head.add(eyeL.group);
  const eyeR = makeEye(0xffa030, 0.045); eyeR.group.position.set(0.075, 0.045, 0.155); head.add(eyeR.group);

  g.add(contactShadow(0.55));

  const bones = { torso, head, jaw, armL, armR, legL, legR, earL, earR };
  const poses = {
    far: () => {
      torso.rotation.x = 0.06; head.rotation.x = 0.08; jaw.rotation.x = 0.1;
      armL.sh.rotation.z = 0.1; armR.sh.rotation.z = -0.1;
      armL.sh.rotation.x = 0.05; armR.sh.rotation.x = 0.05;
      armL.elbow.rotation.x = 0.1; armR.elbow.rotation.x = 0.1;
    },
    near: () => {
      torso.rotation.x = 0.32; head.rotation.x = -0.22; jaw.rotation.x = 0.45;
      armL.sh.rotation.x = -0.7; armR.sh.rotation.x = -0.55;
      armL.elbow.rotation.x = -0.6; armR.elbow.rotation.x = -0.75;
      armL.sh.rotation.z = 0.35; armR.sh.rotation.z = -0.35;
    },
    door: () => {
      torso.rotation.x = 0.15; torso.rotation.y = 0.5;
      head.rotation.x = -0.1; head.rotation.y = -0.4; jaw.rotation.x = 0.2;
      armL.sh.rotation.x = -1.4; armL.elbow.rotation.x = -0.4;
      armR.sh.rotation.x = -0.2; armR.elbow.rotation.x = -0.2;
    },
  };
  poses.far();

  return {
    group: g, bones,
    eyes: [eyeL, eyeR],
    setPose: (p) => poses[p] && poses[p](),
    update(t) {
      const sway = Math.sin(t * 1.7) * 0.02;
      torso.rotation.z = sway;
      head.rotation.z = -sway * 1.6 + Math.sin(t * 0.9) * 0.03;
      jaw.rotation.x += Math.sin(t * 6.0) * 0.004;
      earL.rotation.x = Math.sin(t * 1.3) * 0.05;
    },
  };
}

// =====================================================================
// PECK — right hall stalker
// =====================================================================
export function makePeck() {
  const g = new THREE.Group();
  const hide = new THREE.MeshStandardMaterial({ map: hideTexture(96, 88, 44), roughness: 0.95 });
  const hideDark = new THREE.MeshStandardMaterial({ map: hideTexture(60, 56, 30), roughness: 0.95 });

  // backwards bird legs
  function birdLeg(side) {
    const hip = new THREE.Group();
    hip.position.set(side * 0.16, 1.0, 0);
    const upper = limb(hide, 0.06, 0.045, 0.5);
    upper.rotation.x = 0.45;
    hip.add(upper);
    const knee = new THREE.Group();
    knee.position.y = -0.5;
    upper.add(knee);
    const lower = limb(metalMat, 0.035, 0.025, 0.55);
    lower.rotation.x = -0.85;
    knee.add(lower);
    const foot = new THREE.Group();
    foot.position.y = -0.55;
    lower.add(foot);
    for (let tIdx = -1; tIdx <= 1; tIdx++) {
      const talon = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.2, 5), toothMat);
      talon.rotation.x = Math.PI / 2 + 0.25;
      talon.rotation.y = tIdx * 0.5;
      talon.position.set(tIdx * 0.05, 0, 0.08);
      foot.add(talon);
    }
    g.add(hip);
    return hip;
  }
  birdLeg(-1); birdLeg(1);

  // hunched body
  const torso = new THREE.Group();
  torso.position.y = 1.0;
  g.add(torso);
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), hide);
  body.scale.set(0.85, 1.05, 0.8);
  body.position.y = 0.3;
  body.castShadow = true;
  torso.add(body);
  // torn belly, metal underneath
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), innerMat);
  belly.scale.set(0.8, 0.9, 0.6);
  belly.position.set(0, 0.22, 0.12);
  torso.add(belly);
  ribCage(metalMat, 0.16, 0.26, 3, (() => {
    const r = new THREE.Group(); r.position.set(0, 0.4, 0.14); torso.add(r); return r;
  })());
  // feather shards — jutting plates
  for (let i = 0; i < 9; i++) {
    const shard = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.28, 4), hideDark);
    const a = (i / 9) * Math.PI * 2;
    shard.position.set(Math.cos(a) * 0.22, 0.45 + Math.sin(i * 1.7) * 0.12, Math.sin(a) * 0.18 - 0.05);
    shard.rotation.x = Math.PI + (Math.random() - 0.5);
    shard.rotation.z = (Math.random() - 0.5) * 0.8;
    torso.add(shard);
  }

  // stub wings — bone with a few ragged feather plates so they read as wings
  function wing(side) {
    const w = new THREE.Group();
    w.position.set(side * 0.26, 0.46, -0.05);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 7), hide);
    w.add(ball);
    const bone1 = limb(hideDark, 0.045, 0.032, 0.4);
    bone1.rotation.z = side * 1.15;
    w.add(bone1);
    // tattered feather plates hanging off the bone
    for (let i = 0; i < 3; i++) {
      const plate = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.22 - i * 0.04, 4), hideDark);
      plate.position.set(0, -0.13 - i * 0.11, 0.01);
      plate.rotation.x = Math.PI - 0.25;
      plate.rotation.z = (i - 1) * 0.18;
      bone1.add(plate);
    }
    const tip = new THREE.Group();
    tip.position.y = -0.4;
    bone1.add(tip);
    const bone2 = limb(metalMat, 0.024, 0.014, 0.35);
    bone2.rotation.z = side * -0.5;
    tip.add(bone2);
    torso.add(w);
    return { w, bone1, tip };
  }
  const wingL = wing(-1), wingR = wing(1);

  // neck + head
  const neck = new THREE.Group();
  neck.position.y = 0.62;
  torso.add(neck);
  const neckMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.3, 8), hideDark);
  neckMesh.position.y = 0.12;
  neck.add(neckMesh);
  const head = new THREE.Group();
  head.position.y = 0.3;
  neck.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), hide);
  skull.scale.set(0.85, 0.9, 1.0);
  skull.castShadow = true;
  head.add(skull);
  // split hooked beak: upper
  const beakUp = new THREE.Group();
  beakUp.position.set(0, -0.02, 0.13);
  head.add(beakUp);
  const beakUpMesh = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.3, 4), hideDark);
  beakUpMesh.rotation.x = Math.PI / 2 + 0.18;
  beakUpMesh.position.set(0, 0, 0.13);
  beakUp.add(beakUpMesh);
  const upTeeth = teethRow(6, 0.12, 0.06, toothMat, true);
  upTeeth.position.set(0, -0.025, 0.13);
  beakUp.add(upTeeth);
  // lower jaw
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.08, 0.1);
  head.add(jaw);
  const beakLo = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.24, 4), hideDark);
  beakLo.rotation.x = Math.PI / 2 - 0.12;
  beakLo.position.set(0, -0.02, 0.12);
  jaw.add(beakLo);
  const loTeeth = teethRow(5, 0.1, 0.055, toothMat, false);
  loTeeth.position.set(0, 0.0, 0.12);
  jaw.add(loTeeth);
  // inner maw glow — faint, just a hint of sick green inside the mouth
  const maw = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6),
    new THREE.MeshStandardMaterial({ color: 0x040404, emissive: 0x6aaa30, emissiveIntensity: 0.35 }));
  maw.position.set(0, -0.05, 0.08);
  head.add(maw);
  // eyes: one good, one dangling
  const eyeL = makeEye(0xb8ff3c, 0.042); eyeL.group.position.set(-0.08, 0.04, 0.12); head.add(eyeL.group);
  const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.16, 6), metalMat);
  wire.position.set(0.085, -0.04, 0.12);
  wire.rotation.x = 0.4;
  head.add(wire);
  const eyeR = makeEye(0xb8ff3c, 0.034); eyeR.group.position.set(0.09, -0.115, 0.16); head.add(eyeR.group);

  const poses = {
    far: () => {
      torso.rotation.x = 0.2; neck.rotation.x = -0.15; jaw.rotation.x = 0.18;
      wingL.bone1.rotation.z = -0.95; wingR.bone1.rotation.z = 0.95;
      wingL.bone1.rotation.x = 0.15; wingR.bone1.rotation.x = 0.15;
    },
    near: () => {
      torso.rotation.x = 0.5; neck.rotation.x = -0.55; jaw.rotation.x = 0.6;
      // wings half-raised and curled forward — threatening, not a T-pose
      wingL.bone1.rotation.z = -1.35; wingR.bone1.rotation.z = 1.35;
      wingL.bone1.rotation.x = 0.55; wingR.bone1.rotation.x = 0.55;
    },
    door: () => {
      torso.rotation.x = 0.3; torso.rotation.y = -0.5;
      neck.rotation.x = -0.3; head.rotation.y = 0.45; jaw.rotation.x = 0.3;
      wingL.bone1.rotation.z = -1.1; wingR.bone1.rotation.z = 1.5;
      wingL.bone1.rotation.x = 0.4; wingR.bone1.rotation.x = 0.4;
    },
  };
  poses.far();

  g.add(contactShadow(0.55));

  return {
    group: g, bones: { torso, neck, head, jaw },
    eyes: [eyeL, eyeR],
    setPose: (p) => poses[p] && poses[p](),
    update(t) {
      const tw = Math.sin(t * 2.3) * 0.03;
      neck.rotation.z = tw + Math.sin(t * 0.7) * 0.04;
      head.rotation.z = Math.sin(t * 4.1) * 0.05; // birdy tics
      head.rotation.y += Math.sin(t * 0.23) * 0.001;
      jaw.rotation.x += Math.sin(t * 7.3) * 0.003;
      eyeR.group.position.y = -0.115 + Math.sin(t * 2.8) * 0.008; // dangling eye swings
    },
  };
}

// =====================================================================
// SNATCH — the closet thing (plus its harmless-looking plush form)
// =====================================================================
export function makeSnatch() {
  const g = new THREE.Group();
  const hide = new THREE.MeshStandardMaterial({ map: hideTexture(120, 116, 112), roughness: 0.9 });
  const hideDark = new THREE.MeshStandardMaterial({ map: hideTexture(70, 68, 66), roughness: 0.9 });

  const legL = limb(hide, 0.055, 0.04, 1.05); legL.position.set(-0.12, 1.05, 0);
  const legR = limb(hide, 0.055, 0.04, 1.05); legR.position.set(0.12, 1.05, 0);
  g.add(legL, legR);

  const torso = new THREE.Group();
  torso.position.y = 1.05;
  g.add(torso);
  const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.12, 0.78, 9), hide);
  chest.position.y = 0.42;
  chest.castShadow = true;
  torso.add(chest);
  ribCage(metalMat, 0.14, 0.3, 4, (() => {
    const r = new THREE.Group(); r.position.set(0, 0.45, 0.04); torso.add(r); return r;
  })());

  // needle-finger arms (signature)
  function arm(side) {
    const sh = new THREE.Group();
    sh.position.set(side * 0.21, 0.74, 0);
    const upper = limb(hide, 0.04, 0.032, 0.55);
    sh.add(upper);
    const elbow = new THREE.Group();
    elbow.position.y = -0.55;
    upper.add(elbow);
    const fore = limb(hideDark, 0.032, 0.024, 0.6);
    elbow.add(fore);
    const hand = new THREE.Group();
    hand.position.y = -0.62;
    fore.add(hand);
    for (let f = 0; f < 5; f++) {
      const needle = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.34, 5), toothMat);
      needle.position.set((f - 2) * 0.025, -0.16, 0);
      needle.rotation.x = Math.PI;
      needle.rotation.z = (f - 2) * 0.1;
      hand.add(needle);
    }
    torso.add(sh);
    return { sh, elbow, hand };
  }
  const armL = arm(-1), armR = arm(1);

  // narrow head, magenta eyes
  const head = new THREE.Group();
  head.position.y = 0.95;
  torso.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), hide);
  skull.scale.set(0.75, 1.15, 0.9);
  skull.castShadow = true;
  head.add(skull);
  const snout = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.24, 6), hideDark);
  snout.rotation.x = Math.PI / 2;
  snout.position.set(0, -0.05, 0.18);
  head.add(snout);
  const upTeeth = teethRow(8, 0.15, 0.06, toothMat, true);
  upTeeth.position.set(0, -0.085, 0.16);
  head.add(upTeeth);
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.12, 0.03);
  head.add(jaw);
  const jawMesh = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.2, 5), hideDark);
  jawMesh.rotation.x = Math.PI / 2 - 0.2;
  jawMesh.position.set(0, -0.03, 0.12);
  jaw.add(jawMesh);
  const loTeeth = teethRow(7, 0.12, 0.05, toothMat, false);
  loTeeth.position.set(0, 0, 0.13);
  jaw.add(loTeeth);
  // torn pointed ears
  for (const side of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.26, 5), hideDark);
    e.position.set(side * 0.09, 0.2, -0.02);
    e.rotation.z = side * -0.3;
    head.add(e);
  }
  const eyeL = makeEye(0xff3cb8, 0.04); eyeL.group.position.set(-0.06, 0.05, 0.12); head.add(eyeL.group);
  const eyeR = makeEye(0xff3cb8, 0.04); eyeR.group.position.set(0.06, 0.05, 0.12); head.add(eyeR.group);

  g.add(contactShadow(0.45));

  const poses = {
    crouched: () => {
      g.scale.setScalar(1);
      legL.rotation.x = -1.5; legR.rotation.x = -1.4;
      g.position.y = -0.62;
      torso.rotation.x = 0.7; head.rotation.x = -0.7; jaw.rotation.x = 0.15;
      armL.sh.rotation.x = -0.5; armR.sh.rotation.x = -0.45;
      armL.elbow.rotation.x = -1.4; armR.elbow.rotation.x = -1.5;
    },
    standing: () => {
      g.scale.setScalar(1);
      legL.rotation.x = 0; legR.rotation.x = 0;
      g.position.y = 0;
      torso.rotation.x = 0.18; head.rotation.x = -0.1; jaw.rotation.x = 0.55;
      armL.sh.rotation.x = -0.9; armR.sh.rotation.x = -0.85;
      armL.sh.rotation.z = 0.4; armR.sh.rotation.z = -0.4;
      armL.elbow.rotation.x = -0.5; armR.elbow.rotation.x = -0.55;
    },
  };
  poses.standing();

  return {
    group: g, bones: { torso, head, jaw, armL, armR },
    eyes: [eyeL, eyeR],
    setPose: (p) => poses[p] && poses[p](),
    update(t) {
      const sway = Math.sin(t * 1.2) * 0.025;
      torso.rotation.z = sway;
      head.rotation.z = -sway + Math.sin(t * 3.4) * 0.02;
      jaw.rotation.x += Math.sin(t * 9.0) * 0.005; // chattering
    },
  };
}

export function makeSnatchPlush(suspicious = false) {
  const g = new THREE.Group();
  const plushMat = new THREE.MeshStandardMaterial({ color: 0x8e8a86, roughness: 1 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), plushMat);
  body.scale.set(0.9, 1.0, 0.8);
  body.position.y = 0.13;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), plushMat);
  head.position.y = 0.3;
  g.add(head);
  for (const side of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.14, 5), plushMat);
    e.position.set(side * 0.06, 0.42, 0);
    g.add(e);
  }
  const eyeMatColor = suspicious ? 0xff3cb8 : 0x222222;
  for (const side of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 6),
      new THREE.MeshStandardMaterial({
        color: 0x111111,
        emissive: eyeMatColor,
        emissiveIntensity: suspicious ? 1.6 : 0.05,
      }));
    e.position.set(side * 0.04, 0.31, 0.085);
    g.add(e);
  }
  // stitched smile
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.006, 5, 10, Math.PI), 
    new THREE.MeshStandardMaterial({ color: 0x3a3a3a }));
  smile.position.set(0, 0.27, 0.09);
  smile.rotation.x = Math.PI;
  g.add(smile);
  if (suspicious) g.rotation.y = 0.6; // head turned, watching
  return g;
}

// =====================================================================
// GNATS — bed gremlins
// =====================================================================
export function makeGnat(seed = 0) {
  const g = new THREE.Group();
  // inner group carries the hop/turn animation, so the outer group can be
  // freely positioned (e.g. on the bed) without update() fighting it
  const inner = new THREE.Group();
  g.add(inner);
  const fuzz = new THREE.MeshStandardMaterial({ map: hideTexture(40 + seed * 8, 32, 30), roughness: 1 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), fuzz);
  body.position.y = 0.1;
  body.scale.y = 0.92;
  body.castShadow = true;
  inner.add(body);
  // huge jaw — half the body opens
  const jaw = new THREE.Group();
  jaw.position.set(0, 0.07, 0.02);
  inner.add(jaw);
  const jawMesh = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 6, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.45), fuzz);
  jawMesh.position.y = 0.03;
  jaw.add(jawMesh);
  const upT = teethRow(7, 0.13, 0.045, toothMat, true);
  upT.position.set(0, 0.045, 0.05);
  upT.rotation.x = -0.4;
  inner.add(upT);
  const loT = teethRow(6, 0.11, 0.04, toothMat, false);
  loT.position.set(0, -0.005, 0.05);
  loT.rotation.x = 0.3;
  jaw.add(loT);
  const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), innerMat);
  mouth.position.set(0, 0.08, 0.02);
  inner.add(mouth);
  // little limbs
  for (const side of [-1, 1]) {
    const armP = limb(fuzz, 0.018, 0.012, 0.1);
    armP.position.set(side * 0.1, 0.12, 0.02);
    armP.rotation.z = side * 0.7;
    inner.add(armP);
  }
  const eyeL = makeEye(0xff4444, 0.022); eyeL.group.position.set(-0.045, 0.16, 0.075); inner.add(eyeL.group);
  const eyeR = makeEye(0xff4444, 0.022); eyeR.group.position.set(0.045, 0.16, 0.075); inner.add(eyeR.group);
  // pointy ears
  for (const side of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.09, 5), fuzz);
    e.position.set(side * 0.07, 0.21, -0.01);
    e.rotation.z = side * -0.4;
    inner.add(e);
  }
  return {
    group: g,
    eyes: [eyeL, eyeR],
    update(t) {
      jaw.rotation.x = 0.25 + Math.sin(t * 11 + seed * 3) * 0.22; // chitter chitter
      inner.rotation.y = Math.sin(t * 1.4 + seed * 7) * 0.4;
      inner.position.y = Math.abs(Math.sin(t * 5 + seed * 2)) * 0.012;
    },
  };
}

// =====================================================================
// GRIMM — the night-5 boss
// =====================================================================
export function makeGrimm() {
  const g = new THREE.Group();
  const hide = new THREE.MeshStandardMaterial({ map: hideTexture(34, 30, 32), roughness: 1 });
  const hideDark = new THREE.MeshStandardMaterial({ map: hideTexture(20, 18, 20), roughness: 1 });

  const legL = limb(hide, 0.11, 0.08, 1.0); legL.position.set(-0.22, 1.0, 0);
  const legR = limb(hide, 0.11, 0.08, 1.0); legR.position.set(0.22, 1.0, 0);
  g.add(legL, legR);

  const torso = new THREE.Group();
  torso.position.y = 1.0;
  g.add(torso);
  const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.26, 0.95, 10), hide);
  chest.position.y = 0.5;
  chest.castShadow = true;
  torso.add(chest);
  // cracked plates jutting from shoulders/back like broken antlers
  for (let i = 0; i < 7; i++) {
    const plate = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.4 + (i % 3) * 0.15, 4), hideDark);
    const a = -0.7 + i * 0.23;
    plate.position.set(Math.sin(a) * 0.36, 0.85 + (i % 2) * 0.1, -0.18);
    plate.rotation.x = -0.6;
    plate.rotation.z = -a;
    torso.add(plate);
  }
  ribCage(metalMat, 0.26, 0.4, 5, (() => {
    const r = new THREE.Group(); r.position.set(0, 0.55, 0.1); torso.add(r); return r;
  })());

  function arm(side) {
    const sh = new THREE.Group();
    sh.position.set(side * 0.45, 0.85, 0);
    const upper = limb(hide, 0.09, 0.07, 0.6);
    sh.add(upper);
    const elbow = new THREE.Group();
    elbow.position.y = -0.6;
    upper.add(elbow);
    const fore = limb(hideDark, 0.07, 0.05, 0.62);
    elbow.add(fore);
    const hand = new THREE.Group();
    hand.position.y = -0.64;
    fore.add(hand);
    for (let f = 0; f < 4; f++) {
      const claw = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.26, 5), toothMat);
      claw.position.set((f - 1.5) * 0.05, -0.12, 0);
      claw.rotation.x = Math.PI;
      hand.add(claw);
    }
    torso.add(sh);
    return { sh, elbow };
  }
  const armL = arm(-1), armR = arm(1);

  const head = new THREE.Group();
  head.position.y = 1.08;
  torso.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), hide);
  skull.scale.set(1.0, 0.95, 0.95);
  skull.castShadow = true;
  head.add(skull);
  // small round ears (bear-generic)
  for (const side of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), hideDark);
    e.position.set(side * 0.18, 0.22, -0.02);
    e.scale.z = 0.5;
    head.add(e);
  }
  const muzzle = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.16, 0.22), hideDark);
  muzzle.position.set(0, -0.08, 0.2);
  head.add(muzzle);
  const upTeeth = teethRow(9, 0.24, 0.1, toothMat, true);
  upTeeth.position.set(0, -0.14, 0.28);
  head.add(upTeeth);
  // the jaw — comically, horribly oversized
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.16, 0.0);
  head.add(jaw);
  const jawMesh = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.1, 0.3), hideDark);
  jawMesh.position.set(0, -0.05, 0.16);
  jaw.add(jawMesh);
  const loTeeth = teethRow(8, 0.2, 0.09, toothMat, false);
  loTeeth.position.set(0, 0.0, 0.28);
  jaw.add(loTeeth);
  const throat = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), innerMat);
  throat.position.set(0, -0.1, 0.08);
  head.add(throat);
  // white pinprick eyes — small and far too steady
  const eyeL = makeEye(0xffffff, 0.028); eyeL.group.position.set(-0.1, 0.04, 0.22); head.add(eyeL.group);
  const eyeR = makeEye(0xffffff, 0.028); eyeR.group.position.set(0.1, 0.04, 0.22); head.add(eyeR.group);

  g.add(contactShadow(0.7));

  const poses = {
    far: () => {
      torso.rotation.x = 0.08; head.rotation.x = 0.05; jaw.rotation.x = 0.25;
      armL.sh.rotation.z = 0.18; armR.sh.rotation.z = -0.18;
    },
    near: () => {
      torso.rotation.x = 0.3; head.rotation.x = -0.25; jaw.rotation.x = 0.75;
      armL.sh.rotation.x = -0.8; armR.sh.rotation.x = -0.75;
      armL.elbow.rotation.x = -0.7; armR.elbow.rotation.x = -0.8;
    },
    door: () => {
      torso.rotation.x = 0.2; torso.rotation.y = 0.4;
      head.rotation.y = -0.35; jaw.rotation.x = 0.45;
      armL.sh.rotation.x = -1.3; armR.sh.rotation.x = -0.3;
    },
  };
  poses.far();

  return {
    group: g, bones: { torso, head, jaw, armL, armR },
    eyes: [eyeL, eyeR],
    setPose: (p) => poses[p] && poses[p](),
    update(t) {
      const breathe = Math.sin(t * 0.9) * 0.018;
      torso.scale.y = 1 + breathe;
      head.rotation.z = Math.sin(t * 0.6) * 0.03;
      jaw.rotation.x += Math.sin(t * 2.2) * 0.006;
    },
  };
}

// =====================================================================
// Jumpscare rig — lunges a fresh character instance into the camera.
// =====================================================================
export class JumpscareRig {
  constructor(camera) {
    this.camera = camera;
    this.active = null;
    this.holder = new THREE.Group();
    camera.add(this.holder);
    this.light = new THREE.PointLight(0xffffff, 0, 4);
    this.light.position.set(0, 0.3, -0.6);
    this.holder.add(this.light);
  }

  start(builderFn, onDone, opts = {}) {
    this.clear();
    const ch = builderFn();
    const s = opts.scale ?? 1;
    ch.group.scale.setScalar(s);
    this.active = { ch, t: 0, onDone, dur: opts.dur ?? 0.85, done: false };
    // start low & far, lunge to fill the screen
    ch.group.position.set(0, -2.1 * s, -2.4);
    ch.group.rotation.y = Math.PI * (Math.random() > 0.5 ? 0.06 : -0.06);
    if (ch.setPose) ch.setPose('near');
    this.holder.add(ch.group);
  }

  clear() {
    if (this.active) {
      this.holder.remove(this.active.ch.group);
      this.active = null;
    }
    this.light.intensity = 0;
  }

  update(dt) {
    if (!this.active) return 0;
    const a = this.active;
    a.t += dt;
    const k = Math.min(a.t / a.dur, 1);
    const lunge = 1 - Math.pow(1 - Math.min(k * 1.45, 1), 3);
    const g = a.ch.group;
    const s = g.scale.x || 1;
    g.position.z = -2.4 + lunge * 1.78;
    g.position.y = -2.1 * s + lunge * (1.62 * s);
    // violent head shake at the end
    const shake = k > 0.45 ? (k - 0.45) * 2 : 0;
    g.rotation.z = Math.sin(a.t * 60) * 0.09 * shake;
    g.rotation.y += Math.sin(a.t * 47) * 0.02 * shake;
    if (a.ch.bones && a.ch.bones.jaw) {
      a.ch.bones.jaw.rotation.x = 0.2 + Math.min(k * 1.8, 1.15) + Math.sin(a.t * 50) * 0.1 * shake;
    }
    this.light.intensity = k < 0.12 ? 0 : 2.6 + Math.sin(a.t * 70) * 1.2;
    if (k >= 1 && !a.done) {
      a.done = true;
      const cb = a.onDone;
      setTimeout(() => cb && cb(), 60);
    }
    return shake; // feed to screen-shake
  }
}
