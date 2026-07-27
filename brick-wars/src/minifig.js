// minifig.js — a properly proportioned little plastic figure, built entirely
// from primitives: studded cylinder head with a painted face, tapered torso,
// hinged arms with C-shaped claw hands, hip block and chunky legs.

import * as THREE from 'three';
import { RoundedBoxGeometry } from '../vendor/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from '../vendor/jsm/utils/BufferGeometryUtils.js';
import { PALETTE, plastic, STUD_R, STUD_H } from './bricks.js';

// Proportions (world units = modules)
const LEG_H = 1.7;
const HIP_H = 0.45;
const TORSO_H = 1.55;
const TORSO_W_BOT = 2.35;
const TORSO_W_TOP = 1.95;
const TORSO_D = 1.05;
const HEAD_R = 0.78;
const HEAD_H = 1.02;
export const FIG_HEIGHT = LEG_H + HIP_H + TORSO_H + 0.08 + HEAD_H + STUD_H;

const geoCache = new Map();
const cached = (key, build) => {
  if (!geoCache.has(key)) geoCache.set(key, build());
  return geoCache.get(key);
};

// ---------------------------------------------------------------------------
// Geometries
// ---------------------------------------------------------------------------

function torsoGeometry() {
  return cached('torso', () => {
    const g = new RoundedBoxGeometry(1, TORSO_H, TORSO_D, 2, 0.07);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const t = (y + TORSO_H / 2) / TORSO_H; // 0 bottom -> 1 top
      const w = THREE.MathUtils.lerp(TORSO_W_BOT, TORSO_W_TOP, t);
      pos.setX(i, pos.getX(i) * w);
    }
    g.computeVertexNormals();
    g.translate(0, TORSO_H / 2, 0);
    return g;
  });
}

function headGeometry() {
  return cached('head', () => {
    const side = new THREE.CylinderGeometry(HEAD_R, HEAD_R, HEAD_H, 28, 1, false);
    side.translate(0, HEAD_H / 2, 0);
    const stud = new THREE.CylinderGeometry(STUD_R + 0.12, STUD_R + 0.12, STUD_H + 0.1, 20);
    stud.translate(0, HEAD_H + (STUD_H + 0.1) / 2, 0);
    return mergeGeometries([side, stud], true); // groups: [side+caps, stud]
  });
}

function legGeometry() {
  return cached('leg', () => {
    const upper = new RoundedBoxGeometry(0.92, LEG_H - 0.42, 0.95, 2, 0.06);
    upper.translate(0, -(LEG_H - 0.42) / 2, 0.02);
    const foot = new RoundedBoxGeometry(0.92, 0.42, 1.3, 2, 0.06);
    foot.translate(0, -(LEG_H - 0.42) - 0.21, 0.18);
    return mergeGeometries([upper, foot], false);
  });
}

function hipGeometry() {
  return cached('hip', () => {
    const g = new RoundedBoxGeometry(TORSO_W_BOT - 0.3, HIP_H, 0.95, 2, 0.06);
    g.translate(0, HIP_H / 2, 0);
    return g;
  });
}

function armGeometry() {
  return cached('arm', () => {
    // rounded shoulder + upper arm + slightly bent forearm
    const shoulder = new THREE.SphereGeometry(0.36, 14, 10);
    shoulder.scale(1, 0.85, 1);
    const upper = new THREE.CylinderGeometry(0.34, 0.3, 0.85, 14);
    upper.translate(0, -0.42, 0);
    const lower = new THREE.CylinderGeometry(0.3, 0.26, 0.8, 14);
    lower.rotateX(-0.5);
    lower.translate(0, -1.05, 0.18);
    return mergeGeometries([shoulder, upper, lower], false);
  });
}

function handGeometry() {
  return cached('hand', () => {
    const wrist = new THREE.CylinderGeometry(0.17, 0.17, 0.34, 10);
    wrist.translate(0, -0.1, 0);
    const claw = new THREE.TorusGeometry(0.33, 0.15, 10, 16, Math.PI * 1.45);
    claw.rotateZ(Math.PI * 0.78);
    claw.rotateY(Math.PI / 2);
    claw.translate(0, -0.46, 0);
    return mergeGeometries([wrist, claw], false);
  });
}

// ---------------------------------------------------------------------------
// Face texture (original smiley, drawn in canvas)
// ---------------------------------------------------------------------------

function faceTexture(skinHex) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = `#${skinHex.toString(16).padStart(6, '0')}`;
  ctx.fillRect(0, 0, 512, 128);

  // face occupies a band around u = 0.5
  const cx = 256;
  ctx.fillStyle = '#1b1207';
  // eyes
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(cx + side * 26, 52, 7.5, 10.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // smile
  ctx.strokeStyle = '#1b1207';
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(cx, 58, 30, Math.PI * 0.22, Math.PI * 0.78);
  ctx.stroke();
  // tiny chin dimples
  ctx.lineWidth = 4;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(cx + side * 28, 86);
    ctx.lineTo(cx + side * 24, 90);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// ---------------------------------------------------------------------------
// Energy sword
// ---------------------------------------------------------------------------

export function createEnergySword({ color = 0x66ccff, ghost = false } = {}) {
  const sword = new THREE.Group();

  const hilt = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.18, 0.95, 12),
    plastic(PALETTE.darkGray, { roughness: 0.3, extra: { metalness: 0.6 } })
  );
  hilt.position.y = 0.1;
  sword.add(hilt);

  const emitter = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.16, 0.16, 12),
    plastic(PALETTE.black)
  );
  emitter.position.y = 0.62;
  sword.add(emitter);

  const bladeLen = 3.4;
  const blade = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.11, bladeLen, 4, 10),
    new THREE.MeshBasicMaterial({ color, toneMapped: false })
  );
  blade.material.color.multiplyScalar(4.2); // well past the bloom threshold
  blade.position.y = 0.7 + bladeLen / 2;
  sword.add(blade);

  const glow = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.24, bladeLen, 4, 10),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.32,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    })
  );
  glow.position.copy(blade.position);
  sword.add(glow);

  if (!ghost) {
    // subtle local glow — kept weak so it never pushes the ground into bloom
    const light = new THREE.PointLight(color, 3.2, 9, 2);
    light.position.y = 2.2;
    sword.add(light);
  }
  return sword;
}

// ---------------------------------------------------------------------------
// Minifig
// ---------------------------------------------------------------------------

/**
 * Builds a minifig rig.
 * options: { torso, legs, skin, ghost, sword }
 * Returns { group, joints, animate(dt, pose), swordTip }
 */
export function createMinifig(options = {}) {
  const {
    torsoColor = PALETTE.white,
    legColor = PALETTE.blue,
    skinColor = PALETTE.yellow,
    ghost = false,
    sword = false,
    swordColor = 0x66ccff,
  } = options;

  const matFor = (hex, opts) =>
    ghost
      ? ghostMaterial()
      : plastic(hex, opts);

  const group = new THREE.Group();
  const joints = {};

  // legs
  const legY = LEG_H;
  for (const side of ['L', 'R']) {
    const pivot = new THREE.Group();
    pivot.position.set(side === 'L' ? -0.52 : 0.52, legY, 0);
    const leg = new THREE.Mesh(legGeometry(), matFor(legColor));
    setShadow(leg, ghost);
    pivot.add(leg);
    group.add(pivot);
    joints[`leg${side}`] = pivot;
  }

  // hips
  const hip = new THREE.Mesh(hipGeometry(), matFor(legColor === PALETTE.blue ? PALETTE.darkGray : legColor));
  hip.position.y = LEG_H;
  setShadow(hip, ghost);
  group.add(hip);

  // torso (pivot at its base so the body can lean)
  const torsoPivot = new THREE.Group();
  torsoPivot.position.y = LEG_H + HIP_H;
  group.add(torsoPivot);
  joints.torso = torsoPivot;

  const torso = new THREE.Mesh(torsoGeometry(), matFor(torsoColor));
  setShadow(torso, ghost);
  torsoPivot.add(torso);

  // arms — clearly outside the torso, angled slightly outward like the real toy
  const shoulderY = TORSO_H - 0.4;
  for (const side of ['L', 'R']) {
    const s = side === 'L' ? -1 : 1;
    const pivot = new THREE.Group();
    pivot.position.set(s * (TORSO_W_TOP / 2 + 0.3), shoulderY, 0);
    pivot.rotation.z = s * 0.17;
    const arm = new THREE.Mesh(armGeometry(), matFor(torsoColor));
    setShadow(arm, ghost);
    pivot.add(arm);
    const hand = new THREE.Mesh(handGeometry(), matFor(skinColor));
    setShadow(hand, ghost);
    hand.position.set(0, -1.42, 0.38);
    pivot.add(hand);
    torsoPivot.add(pivot);
    joints[`arm${side}`] = pivot;
    joints[`hand${side}`] = hand;
  }

  // head
  const headPivot = new THREE.Group();
  headPivot.position.y = TORSO_H + 0.06;
  torsoPivot.add(headPivot);
  joints.head = headPivot;

  let headMesh;
  if (ghost) {
    headMesh = new THREE.Mesh(headGeometry(), ghostMaterial());
  } else {
    const sideMat = new THREE.MeshPhysicalMaterial({
      map: faceTexture(skinColor),
      roughness: 0.3,
      clearcoat: 0.6,
      clearcoatRoughness: 0.25,
      envMapIntensity: 0.7,
    });
    const capMat = plastic(skinColor, { roughness: 0.3, clearcoat: 0.6 });
    headMesh = new THREE.Mesh(headGeometry(), [sideMat, capMat]);
  }
  // face band sits at u=0.5 (+Z on three's cylinder); flip it to -Z, the
  // direction the hero walks in
  headMesh.rotation.y = Math.PI;
  setShadow(headMesh, ghost);
  headPivot.add(headMesh);

  // sword
  let swordGroup = null;
  let swordTip = null;
  if (sword) {
    swordGroup = createEnergySword({ color: swordColor, ghost });
    swordGroup.position.set(0, -1.5, 0.55);
    swordGroup.rotation.x = 0.45; // blade tilts forward, away from the body
    joints.armR.add(swordGroup);
    swordTip = new THREE.Object3D();
    swordTip.position.y = 4;
    swordGroup.add(swordTip);
  }

  // ---- procedural animation ----
  const anim = { t: Math.random() * 10, swingT: -1 };

  function animate(dt, pose = {}) {
    const speed = THREE.MathUtils.clamp(pose.speed ?? 0, 0, 1);
    const grounded = pose.grounded ?? true;
    anim.t += dt * (3.5 + speed * 7.5);

    const swing = Math.sin(anim.t);
    const amp = speed * 0.78;

    if (!grounded) {
      joints.legL.rotation.x = -0.45;
      joints.legR.rotation.x = 0.3;
      joints.armL.rotation.x = -2.6;
    } else {
      joints.legL.rotation.x = swing * amp;
      joints.legR.rotation.x = -swing * amp;
      joints.armL.rotation.x = -swing * amp * 0.75 + Math.sin(anim.t * 0.31) * 0.04;
    }

    // right arm: walk-swing unless attacking
    if (anim.swingT >= 0) {
      anim.swingT += dt / 0.34; // swing duration
      const k = anim.swingT;
      if (k >= 1) {
        anim.swingT = -1;
      } else {
        // raise fast, sweep down across the body
        const raise = Math.min(1, k * 3.2);
        const sweep = Math.max(0, (k - 0.3) / 0.7);
        joints.armR.rotation.x = -2.4 * raise + 2.9 * easeOut(sweep);
        joints.armR.rotation.z = 0.09 + 0.7 * easeOut(sweep);
      }
    }
    if (anim.swingT < 0) {
      joints.armR.rotation.x = grounded ? swing * amp * 0.75 : -0.4;
      joints.armR.rotation.z = 0.09;
    }

    // body lean + idle bob
    joints.torso.rotation.x = speed * 0.12;
    group.position.y = pose.baseY ?? group.position.y;
    joints.head.rotation.x = Math.sin(anim.t * 0.23) * 0.04;
    joints.head.rotation.y = Math.sin(anim.t * 0.17) * 0.06;
  }

  function startSwing() {
    if (anim.swingT < 0 || anim.swingT > 0.45) anim.swingT = 0;
  }

  const isSwinging = () => anim.swingT >= 0 && anim.swingT < 0.8;

  return { group, joints, animate, startSwing, isSwinging, swordTip, anim };
}

function setShadow(mesh, ghost) {
  mesh.castShadow = !ghost;
  mesh.receiveShadow = !ghost;
}

const easeOut = (t) => 1 - Math.pow(1 - THREE.MathUtils.clamp(t, 0, 1), 3);

// ---------------------------------------------------------------------------
// Ghost material (spirits)
// ---------------------------------------------------------------------------

let _ghostMat = null;
export function ghostMaterial() {
  if (!_ghostMat) {
    _ghostMat = new THREE.MeshPhysicalMaterial({
      color: 0x9ff2ff,
      emissive: 0x37c4e8,
      emissiveIntensity: 3.2,
      transparent: true,
      opacity: 0.55,
      roughness: 0.15,
      clearcoat: 1,
    });
  }
  return _ghostMat;
}
