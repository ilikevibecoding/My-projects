// physics.js — pure, deterministic fixed-step simulation.
// Pad sits at world origin; planet center is at (0, -R, 0). Up at pad = +Y.
// No rendering concerns in here: main.js owns the loop, this owns the math.

import * as THREE from 'three';

export const CONST = {
  R: 4000,            // planet radius (m)
  g0: 9.0,            // surface gravity (m/s^2)
  rho0: 1.2,          // sea-level air density (kg/m^3)
  H: 1100,            // atmosphere scale height (m)
  SPACE_ALT: 5000,    // the "space line" (m)
  ATMO_TOP: 5200,     // visual atmosphere shell thickness above surface (m)
  DT: 1 / 120,        // fixed physics step (s)
  CRASH_SPEED: 14,    // impact speed beyond which we poof (m/s)
  TILT_MAX: 0.22,     // max tilt from local up (rad), "a few degrees" of authority
  TILT_RATE: 0.25,    // tilt rate (rad/s)
};

export const PLANET_CENTER = new THREE.Vector3(0, -CONST.R, 0);

export function airDensity(alt) {
  if (alt < 0) alt = 0;
  return CONST.rho0 * Math.exp(-alt / CONST.H);
}

export function gravityAt(alt) {
  const r = CONST.R / (CONST.R + Math.max(0, alt));
  return CONST.g0 * r * r;
}

export function altitudeOf(pos) {
  return pos.distanceTo(PLANET_CENTER) - CONST.R;
}

export function localUp(pos, out = new THREE.Vector3()) {
  return out.copy(pos).sub(PLANET_CENTER).normalize();
}

// ---------------------------------------------------------------------------
// Stage bookkeeping. A "stage" is a contiguous run of stack parts split at
// decouplers, bottom first. Each has its own engines + tanks.
//   { dry, fuel, fuelMax, thrust, burnRate, cdA, attached }
// Active (thrusting) stage = lowest still-attached stage.
// ---------------------------------------------------------------------------

export function stagesFromStack(stack, fuelFraction = 1) {
  const stages = [];
  let cur = null;
  const open = () => { cur = { dry: 0, fuel: 0, fuelMax: 0, thrust: 0, burnRate: 0, cdA: 0.30 }; stages.push(cur); };
  open();
  for (const part of stack) {
    cur.dry += part.massDry;
    if (part.type === 'tank') {
      cur.fuel += part.fuel * fuelFraction;
      cur.fuelMax += part.fuel;
    }
    if (part.type === 'engine') { cur.thrust += part.thrust; cur.burnRate += part.burn; }
    cur.cdA += part.cdA ?? 0.08;
    if (part.type === 'decoupler') open(); // decoupler stays with the LOWER group
  }
  for (const s of stages) s.attached = true;
  return stages;
}

export function createSimState(stack, opts = {}) {
  const stages = stagesFromStack(stack, opts.fuelFraction ?? 1);
  return {
    t: 0,
    pos: new THREE.Vector3(0, 0, 0),
    vel: new THREE.Vector3(0, 0, 0),
    axis: new THREE.Vector3(0, 1, 0),  // body +Y (thrust direction)
    tiltX: 0, tiltZ: 0,                 // accumulated tilt angles (rad)
    stages,
    activeStage: 0,                     // index of lowest attached stage
    ignited: false,
    throttle: 0,
    onGround: true,
    phase: 'ready',                     // ready | flying | space | crashed | landed
    spaceReached: false,
    events: [],                         // [{t, type}] for HUD + telemetry
    debris: [],                         // detached spent stages, ballistic + tumbling
    // per-step diagnostics for HUD / telemetry
    diag: { accel: 0, drag: 0, gravity: CONST.g0, rho: CONST.rho0, twr: 0, vSpeed: 0 },
  };
}

export function attachedMass(state) {
  let m = 0;
  for (const s of state.stages) if (s.attached) m += s.dry + s.fuel;
  return m;
}

export function attachedCdA(state) {
  let c = 0;
  for (const s of state.stages) if (s.attached) c += s.cdA;
  return c;
}

export function activeStage(state) {
  for (let i = 0; i < state.stages.length; i++) {
    if (state.stages[i].attached) return state.stages[i];
  }
  return null;
}

export function currentTWR(state) {
  const m = attachedMass(state);
  const st = activeStage(state);
  if (!st || m <= 0) return 0;
  const alt = altitudeOf(state.pos);
  const usable = st.fuel > 0 ? st.thrust : 0;
  return usable / (m * gravityAt(alt));
}

// Returns true if a decoupler boundary exists (i.e. more than one attached stage).
export function canStage(state) {
  return state.stages.filter((s) => s.attached).length > 1;
}

// Fire the next staging event: detach the lowest attached stage.
// Returns the detached stage descriptor (for spawning debris visuals) or null.
export function fireStage(state, rng = Math.random) {
  const idx = state.stages.findIndex((s) => s.attached);
  if (idx < 0 || idx >= state.stages.length - 1) return null;
  const spent = state.stages[idx];
  spent.attached = false;
  state.activeStage = idx + 1;
  const up = localUp(state.pos);
  const side = new THREE.Vector3(rng() - 0.5, 0, rng() - 0.5).normalize().multiplyScalar(2.2);
  const debris = {
    id: `stage${idx}`,
    stageIndex: idx,
    pos: state.pos.clone(),
    vel: state.vel.clone().addScaledVector(up, -4.5).add(side),
    axis: state.axis.clone(),
    spinAxis: new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5).normalize(),
    spinRate: 1.4 + rng() * 1.6,
    spin: 0,
    mass: spent.dry + spent.fuel,
    cdA: spent.cdA,
    alive: true,
    t: 0,
  };
  state.debris.push(debris);
  state.events.push({ t: state.t, type: 'stage', index: idx });
  return debris;
}

// ---------------------------------------------------------------------------
// The fixed step. input = { throttle: 0|1, tiltX: -1..1, tiltZ: -1..1 }
// ---------------------------------------------------------------------------
const _up = new THREE.Vector3();
const _acc = new THREE.Vector3();
const _drag = new THREE.Vector3();
const _tmp = new THREE.Vector3();

export function step(state, input, dt = CONST.DT) {
  if (state.phase === 'crashed') return state;
  state.t += dt;

  const alt = altitudeOf(state.pos);
  const rho = airDensity(alt);
  const g = gravityAt(alt);
  const mass = attachedMass(state);
  const stage = activeStage(state);
  localUp(state.pos, _up);

  // --- steering: a few degrees of tilt authority ---
  state.tiltX = THREE.MathUtils.clamp(
    state.tiltX + (input.tiltX || 0) * CONST.TILT_RATE * dt, -CONST.TILT_MAX, CONST.TILT_MAX);
  state.tiltZ = THREE.MathUtils.clamp(
    state.tiltZ + (input.tiltZ || 0) * CONST.TILT_RATE * dt, -CONST.TILT_MAX, CONST.TILT_MAX);
  // axis = local up tilted by tiltX about world X and tiltZ about world Z
  state.axis.copy(_up)
    .applyAxisAngle(_tmp.set(1, 0, 0), state.tiltX)
    .applyAxisAngle(_tmp.set(0, 0, 1), state.tiltZ)
    .normalize();

  // --- forces ---
  _acc.set(0, 0, 0);

  // thrust
  let thrusting = false;
  state.throttle = 0;
  if (state.ignited && stage && stage.fuel > 0 && (input.throttle ?? 1) > 0) {
    state.throttle = 1;
    thrusting = true;
    _acc.addScaledVector(state.axis, stage.thrust / mass);
    stage.fuel = Math.max(0, stage.fuel - stage.burnRate * dt);
    if (stage.fuel === 0) state.events.push({ t: state.t, type: 'flameout' });
  }

  // gravity
  _acc.addScaledVector(_up, -g);

  // drag: 1/2 rho v^2 Cd A, opposing velocity
  const speed = state.vel.length();
  let dragAcc = 0;
  if (speed > 0.01) {
    const f = 0.5 * rho * speed * speed * attachedCdA(state);
    dragAcc = f / mass;
    _drag.copy(state.vel).normalize().multiplyScalar(-dragAcc);
    _acc.add(_drag);
  }

  // --- integrate (semi-implicit Euler) ---
  state.vel.addScaledVector(_acc, dt);
  state.pos.addScaledVector(state.vel, dt);

  // --- ground interaction ---
  const newAlt = altitudeOf(state.pos);
  const vUp = state.vel.dot(localUp(state.pos, _tmp));
  if (newAlt <= 0) {
    if (state.onGround || vUp <= 0) {
      const impact = Math.abs(vUp);
      if (!state.onGround && impact > CONST.CRASH_SPEED) {
        state.phase = 'crashed';
        state.events.push({ t: state.t, type: 'crash', speed: impact });
      } else {
        // sit on the pad (TWR < 1 burns fuel without lifting)
        localUp(state.pos, _tmp);
        state.pos.copy(PLANET_CENTER).addScaledVector(_tmp, CONST.R);
        if (vUp < 0) state.vel.set(0, 0, 0);
        if (!state.onGround && state.phase === 'flying') {
          state.phase = 'landed';
          state.events.push({ t: state.t, type: 'landed' });
        }
        state.onGround = state.vel.lengthSq() < 0.5;
      }
    }
  } else if (newAlt > 0.5 && state.onGround) {
    state.onGround = false;
    if (state.phase === 'ready') state.phase = 'flying';
    state.events.push({ t: state.t, type: 'liftoff' });
  }

  // --- space line ---
  if (!state.spaceReached && newAlt >= CONST.SPACE_ALT) {
    state.spaceReached = true;
    state.phase = 'space';
    state.events.push({ t: state.t, type: 'space' });
  }

  // --- debris (spent stages): ballistic + drag + tumble ---
  for (const d of state.debris) {
    if (!d.alive) continue;
    d.t += dt;
    const dAlt = altitudeOf(d.pos);
    const dRho = airDensity(dAlt);
    localUp(d.pos, _tmp);
    _acc.copy(_tmp).multiplyScalar(-gravityAt(dAlt));
    const ds = d.vel.length();
    if (ds > 0.01) {
      _acc.addScaledVector(_tmp.copy(d.vel).normalize(), -(0.5 * dRho * ds * ds * d.cdA * 2.5) / d.mass);
    }
    d.vel.addScaledVector(_acc, dt);
    d.pos.addScaledVector(d.vel, dt);
    d.spin += d.spinRate * dt;
    if (altitudeOf(d.pos) <= 0.5) {
      d.alive = false;
      state.events.push({ t: state.t, type: 'debrisDown', id: d.id });
    }
  }

  // --- diagnostics ---
  state.diag.accel = thrusting ? (stage.thrust / mass) - g : -g;
  state.diag.drag = dragAcc;
  state.diag.gravity = g;
  state.diag.rho = rho;
  state.diag.twr = stage && stage.fuel > 0 ? stage.thrust / (mass * g) : 0;
  state.diag.vSpeed = vUp;
  return state;
}

export function ignite(state) {
  if (state.ignited) return false;
  state.ignited = true;
  state.events.push({ t: state.t, type: 'ignition' });
  return true;
}

export function telemetrySample(state) {
  const alt = altitudeOf(state.pos);
  const stage = activeStage(state);
  return {
    t: +state.t.toFixed(2),
    alt: +alt.toFixed(1),
    speed: +state.vel.length().toFixed(2),
    vSpeed: +state.diag.vSpeed.toFixed(2),
    mass: +attachedMass(state).toFixed(1),
    fuel: stage ? +stage.fuel.toFixed(1) : 0,
    twr: +state.diag.twr.toFixed(3),
    dragAcc: +state.diag.drag.toFixed(3),
    rho: +state.diag.rho.toFixed(4),
    phase: state.phase,
    onGround: state.onGround,
  };
}
