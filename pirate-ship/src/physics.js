// ---------------------------------------------------------------------------
// physics.js — lightweight rigid-body ship physics (pure JS, no three.js).
//
// One dynamic body: the ship. Floats on the Gerstner ocean via buoyancy
// probes spread over the hull footprint. Each probe samples the SAME wave
// function the GPU renders, so motion matches the visible surface exactly.
//
// Mass-normalised (m = 1): forces are accelerations. Local frame:
//   +x = starboard (right), +y = up, +z = forward.
// ---------------------------------------------------------------------------

import { sampleAt } from './waves.js';
import { terrainHeightAt, terrainGradientAt, SPAWN } from './islandField.js';

const GRAV = 9.81;

// --- minimal vec3 / quat helpers (allocation-free) ---------------------------
function rotate(q, x, y, z, out) {
  // v' = q * v * q^-1
  const { x: qx, y: qy, z: qz, w: qw } = q;
  const ix = qw * x + qy * z - qz * y;
  const iy = qw * y + qz * x - qx * z;
  const iz = qw * z + qx * y - qy * x;
  const iw = -qx * x - qy * y - qz * z;
  out.x = ix * qw + iw * -qx + iy * -qz - iz * -qy;
  out.y = iy * qw + iw * -qy + iz * -qx - ix * -qz;
  out.z = iz * qw + iw * -qz + ix * -qy - iy * -qx;
  return out;
}
function rotateInv(q, x, y, z, out) {
  const inv = { x: -q.x, y: -q.y, z: -q.z, w: q.w };
  return rotate(inv, x, y, z, out);
}

// --- tuning -------------------------------------------------------------------
export const TUNE = {
  draft: 1.45, // probe depth ramp distance (m)
  keelDepth: 1.8, // keel below COM (m), used for grounding
  buoyTotal: 1.8, // total buoyancy at full draft, in multiples of gravity
  vDamp: 1.7, // total vertical water damping
  hDamp: 0.07, // horizontal water coupling (wave drift / surface friction)
  maxThrust: 2.3, // full-sail acceleration (m/s^2)
  dragFwd1: 0.02,
  dragFwd2: 0.014,
  dragLat1: 0.65,
  dragLat2: 0.35,
  rudderMax: 0.45, // rad
  rudderRate: 1.6, // rad/s
  rudderTorque: 2.1,
  angDamp: { pitch: 50, roll: 13, yaw: 58 },
  inertia: { pitch: 72, roll: 11, yaw: 78 },
  heelTurn: 0.55, // outward heel while turning
  heelWind: 0.5, // heel from beam wind on sails
  keelRighting: 16, // artificial righting torque (anti-capsize)
  anchorDrag: 1.4,
  groundSpring: 15,
  groundFriction: 4.5,
};

export const SAIL_SETTINGS = [
  { name: 'Anchored', frac: 0 },
  { name: 'Slow', frac: 0.35 },
  { name: 'Half sail', frac: 0.68 },
  { name: 'Full sail', frac: 1.0 },
];

// Buoyancy probes across the hull footprint (local space).
// Wider mid-ship rows carry more displaced volume than bow/stern tips.
function buildProbes() {
  const probes = [];
  const rows = [
    { z: -11.5, w: 0.8 },
    { z: -5.0, w: 1.0 },
    { z: 1.5, w: 1.0 },
    { z: 8.0, w: 0.88 },
  ];
  for (const row of rows) {
    for (const x of [-2.55, 0, 2.55]) {
      probes.push({ x, y: -1.0, z: row.z, w: row.w * (x === 0 ? 1.08 : 1) });
    }
  }
  probes.push({ x: 0, y: -0.85, z: 12.6, w: 0.55 }); // bow tip
  probes.push({ x: 0, y: -0.95, z: -13.2, w: 0.62 }); // stern tip
  const sum = probes.reduce((s, p) => s + p.w, 0);
  for (const p of probes) p.w /= sum;
  return probes;
}

// Grounding contact circles along the keel line (local z offsets).
const CONTACTS = [11, 4, -4, -11.5];

export class ShipPhysics {
  constructor() {
    this.probes = buildProbes();
    this.pos = { x: SPAWN.x, y: 0.4, z: SPAWN.z };
    this.quat = { x: 0, y: Math.sin(SPAWN.heading / 2), z: 0, w: Math.cos(SPAWN.heading / 2) };
    this.vel = { x: 0, y: 0, z: 0 };
    this.omegaL = { x: 0, y: 0, z: 0 }; // angular velocity, LOCAL frame

    this.sailIndex = 0;
    this.rudderInput = 0; // +1 = starboard turn (D), -1 = port turn (A)
    this.rudder = 0;
    this.anchored = true;
    this.aground = false;

    this.wind = { x: Math.SQRT1_2, z: Math.SQRT1_2 };

    // scratch objects (no per-step allocation)
    this._f = { x: 0, y: 0, z: 0 };
    this._tl = { x: 0, y: 0, z: 0 };
    this._r = { x: 0, y: 0, z: 0 };
    this._v = { x: 0, y: 0, z: 0 };
    this._w = { x: 0, y: 0, z: 0 };
    this._g = { x: 0, z: 0 };
    this._sample = { height: 0, nx: 0, ny: 1, nz: 0, vx: 0, vy: 0, vz: 0 };
    this._fwd = { x: 0, y: 0, z: 1 };
    this._right = { x: 1, y: 0, z: 0 };
    this._up = { x: 0, y: 1, z: 0 };
  }

  get speed() {
    const f = this._fwd;
    return this.vel.x * f.x + this.vel.y * f.y + this.vel.z * f.z;
  }

  get heading() {
    return Math.atan2(this._fwd.x, this._fwd.z);
  }

  get sail() {
    return SAIL_SETTINGS[this.sailIndex];
  }

  setSail(i) {
    this.sailIndex = Math.max(0, Math.min(SAIL_SETTINGS.length - 1, i));
    if (this.sailIndex > 0) this.anchored = false;
  }

  changeSail(delta) {
    this.setSail(this.sailIndex + delta);
    if (this.sailIndex === 0) this.anchored = true;
  }

  toggleAnchor() {
    this.anchored = !this.anchored;
    if (this.anchored) this.sailIndex = 0;
  }

  reset() {
    this.pos.x = SPAWN.x;
    this.pos.y = 0.4;
    this.pos.z = SPAWN.z;
    const h = SPAWN.heading;
    this.quat.x = 0;
    this.quat.y = Math.sin(h / 2);
    this.quat.z = 0;
    this.quat.w = Math.cos(h / 2);
    this.vel.x = this.vel.y = this.vel.z = 0;
    this.omegaL.x = this.omegaL.y = this.omegaL.z = 0;
    this.sailIndex = 0;
    this.anchored = true;
    this.rudder = 0;
  }

  /** force F at world offset r from COM -> accumulate force + torque */
  _applyAt(fx, fy, fz, rx, ry, rz, F, T) {
    F.x += fx;
    F.y += fy;
    F.z += fz;
    T.x += ry * fz - rz * fy;
    T.y += rz * fx - rx * fz;
    T.z += rx * fy - ry * fx;
  }

  step(dt, t) {
    const T = TUNE;
    const q = this.quat;
    const F = this._f; // accumulated world force
    const TQ = this._w; // accumulated world torque
    F.x = F.y = F.z = 0;
    TQ.x = TQ.y = TQ.z = 0;

    // basis vectors
    rotate(q, 0, 0, 1, this._fwd);
    rotate(q, 1, 0, 0, this._right);
    rotate(q, 0, 1, 0, this._up);
    const fwd = this._fwd;
    const right = this._right;
    const up = this._up;

    // world angular velocity (for probe velocities)
    const omegaW = rotate(q, this.omegaL.x, this.omegaL.y, this.omegaL.z, { x: 0, y: 0, z: 0 });

    // --- gravity
    F.y -= GRAV;

    // --- buoyancy + water damping per probe
    let submergedFrac = 0;
    for (let i = 0; i < this.probes.length; i++) {
      const p = this.probes[i];
      const r = rotate(q, p.x, p.y, p.z, this._r); // world offset from COM
      const px = this.pos.x + r.x;
      const py = this.pos.y + r.y;
      const pz = this.pos.z + r.z;
      const s = sampleAt(px, pz, t, this._sample);
      const depth = s.height - py;
      if (depth <= 0) continue;
      const ramp = Math.min(depth / T.draft, 1.6);
      submergedFrac += p.w * Math.min(ramp, 1);
      // buoyant push straight up, applied at the probe -> natural righting
      let fy = GRAV * T.buoyTotal * p.w * ramp;
      // probe velocity relative to the moving water surface
      const pvx = this.vel.x + omegaW.y * r.z - omegaW.z * r.y;
      const pvy = this.vel.y + omegaW.z * r.x - omegaW.x * r.z;
      const pvz = this.vel.z + omegaW.x * r.y - omegaW.y * r.x;
      const wet = Math.min(ramp, 1);
      fy -= (pvy - s.vy) * T.vDamp * p.w * wet;
      const fx = -(pvx - s.vx) * T.hDamp * p.w * wet;
      const fz = -(pvz - s.vz) * T.hDamp * p.w * wet;
      this._applyAt(fx, fy, fz, r.x, r.y, r.z, F, TQ);
    }
    this.submergedFrac = submergedFrac;

    // --- velocity decomposition
    const vf = this.vel.x * fwd.x + this.vel.z * fwd.z; // forward speed (planar)
    const vl = this.vel.x * right.x + this.vel.z * right.z; // lateral speed

    // --- sails
    const sailFrac = this.anchored ? 0 : SAIL_SETTINGS[this.sailIndex].frac;
    if (sailFrac > 0) {
      const windDot = this.wind.x * fwd.x + this.wind.z * fwd.z; // -1..1
      const windFactor = 0.45 + 0.55 * Math.max(0, windDot * 0.5 + 0.5);
      const thrust = T.maxThrust * sailFrac * windFactor * Math.min(1, submergedFrac * 3);
      F.x += fwd.x * thrust;
      F.z += fwd.z * thrust;
      // beam wind heels the ship
      const beam = this.wind.x * right.x + this.wind.z * right.z;
      TQ.x += fwd.x * -beam * T.heelWind * sailFrac;
      TQ.y += fwd.y * -beam * T.heelWind * sailFrac;
      TQ.z += fwd.z * -beam * T.heelWind * sailFrac;
    }

    // --- hull drag
    const dragF = T.dragFwd1 * vf + T.dragFwd2 * vf * Math.abs(vf);
    const dragL = T.dragLat1 * vl + T.dragLat2 * vl * Math.abs(vl);
    F.x -= fwd.x * dragF + right.x * dragL;
    F.z -= fwd.z * dragF + right.z * dragL;
    if (this.anchored) {
      F.x -= this.vel.x * T.anchorDrag;
      F.z -= this.vel.z * T.anchorDrag;
    }

    // --- rudder
    const target = this.rudderInput * T.rudderMax;
    const dr = target - this.rudder;
    const maxStep = T.rudderRate * dt;
    this.rudder += Math.max(-maxStep, Math.min(maxStep, dr));
    // yaw torque scales with water flow over the rudder
    TQ.y += this.rudder * vf * T.rudderTorque;
    // heel outward in turns
    const heel = -this.rudder * Math.max(0, vf) * T.heelTurn;
    TQ.x += fwd.x * heel;
    TQ.y += fwd.y * heel;
    TQ.z += fwd.z * heel;

    // --- keel righting assist (anti-capsize)
    // Torque axis = cross(shipUp, worldUp) = (-up.z, 0, up.x): rotates the
    // ship's up vector back toward world up.
    TQ.x += -up.z * T.keelRighting;
    TQ.z += up.x * T.keelRighting;

    // --- grounding on islands (soft beaching)
    this.aground = false;
    for (let i = 0; i < CONTACTS.length; i++) {
      const r = rotate(q, 0, -1.0, CONTACTS[i], this._r);
      const px = this.pos.x + r.x;
      const pz = this.pos.z + r.z;
      const keelY = this.pos.y + r.y - (T.keelDepth - 1.0);
      const ground = terrainHeightAt(px, pz);
      const pen = ground - keelY;
      if (pen <= 0) continue;
      this.aground = true;
      const capped = Math.min(pen, 1.0);
      const g = terrainGradientAt(px, pz, this._g); // uphill
      const gl = Math.hypot(g.x, g.z) || 1;
      const dhx = -g.x / gl; // downhill (push back to sea)
      const dhz = -g.z / gl;
      // gentle spring push + lift, applied at the contact, and only while the
      // ship still moves shoreward or sits still — never slingshots it out
      const vDown = this.vel.x * dhx + this.vel.z * dhz; // speed already heading to sea
      const springScale = vDown > 1.5 ? 0.15 : 1.0;
      this._applyAt(
        dhx * capped * T.groundSpring * springScale,
        capped * T.groundSpring * 0.25,
        dhz * capped * T.groundSpring * springScale,
        r.x,
        r.y,
        r.z,
        F,
        TQ
      );
      // friction
      F.x -= this.vel.x * T.groundFriction * Math.min(capped, 1);
      F.z -= this.vel.z * T.groundFriction * Math.min(capped, 1);
    }

    // --- integrate linear
    this.vel.x += F.x * dt;
    this.vel.y += F.y * dt;
    this.vel.z += F.z * dt;
    this.pos.x += this.vel.x * dt;
    this.pos.y += this.vel.y * dt;
    this.pos.z += this.vel.z * dt;

    // --- integrate angular (local frame, diagonal inertia)
    const tl = rotateInv(q, TQ.x, TQ.y, TQ.z, this._tl);
    const I = T.inertia;
    const D = T.angDamp;
    this.omegaL.x += ((tl.x - this.omegaL.x * D.pitch) / I.pitch) * dt;
    this.omegaL.y += ((tl.y - this.omegaL.y * D.yaw) / I.yaw) * dt;
    this.omegaL.z += ((tl.z - this.omegaL.z * D.roll) / I.roll) * dt;

    // quaternion integration: dq = 0.5 * (omega_world) * q
    const ow = rotate(q, this.omegaL.x, this.omegaL.y, this.omegaL.z, this._v);
    const hx = ow.x * 0.5 * dt;
    const hy = ow.y * 0.5 * dt;
    const hz = ow.z * 0.5 * dt;
    const nqx = q.x + (hx * q.w + hy * q.z - hz * q.y);
    const nqy = q.y + (hy * q.w + hz * q.x - hx * q.z);
    const nqz = q.z + (hz * q.w + hx * q.y - hy * q.x);
    const nqw = q.w + (-hx * q.x - hy * q.y - hz * q.z);
    const il = 1 / Math.hypot(nqx, nqy, nqz, nqw);
    q.x = nqx * il;
    q.y = nqy * il;
    q.z = nqz * il;
    q.w = nqw * il;

    // refresh cached basis for getters
    rotate(q, 0, 0, 1, this._fwd);
    rotate(q, 1, 0, 0, this._right);
    rotate(q, 0, 1, 0, this._up);
  }
}
