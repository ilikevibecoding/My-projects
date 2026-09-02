// First-person controller.
//
// Movement: friction/acceleration model (Quake-style ground friction with a
// linear stop regime so the player really stops), reduced air control, slope
// handling (uphill penalty, downhill boost, gravity slide on cliffs), coyote
// time + jump buffering + variable-height jumps, and wading/swimming with a
// critically damped buoyancy loop so the surface never oscillates.
//
// Camera: mouse smoothing, soft pitch limit, 2-axis figure-8 head bob, landing
// dip spring, idle breathing, strafe lean, sprint FOV, terrain clearance and a
// water-plane bias so the eye never sits edge-on with the surface.
//
// Events for other systems: onStep / onLand / onSplash / onSurface, plus a
// `state` string ('idle'|'walk'|'sprint'|'air'|'slide'|'wade'|'swim'|'dive').

import * as THREE from 'three/webgpu';
import { WORLD } from './config.js';
import { clamp, lerp, smoothstep } from './noise.js';
import { waveHeightAt } from './water.js';

const DEG = Math.PI / 180;

export const FEEL = {
  // ---- look ----
  sensitivity: 0.0022, // rad per mouse pixel, multiplied by ?sens=
  lookSmoothing: 0.028, // s — exponential filter on look deltas (kills sensor jitter, no float)
  pitchLimit: Math.PI / 2 - 0.05,
  pitchSoftZone: 0.3, // rad — input is progressively damped this far before the limit

  // ---- ground ----
  groundAccel: 12, // fraction of wish speed gained per second (Quake units) → ~0.12 s to full speed
  groundFriction: 10,
  stopSpeed: 1.5, // below this, friction becomes linear so the stop completes
  sprintRamp: 0.35, // s to fully build up sprint speed
  sprintRelease: 0.22,

  // ---- air ----
  airAccel: 1.6,
  airDrag: 0.3,

  // ---- slopes ----
  slopeStart: 18 * DEG, // penalties start here
  slopeNoClimb: 45 * DEG, // straight uphill speed reaches zero here
  slopeSlide: 50 * DEG, // steeper than this: gravity slide, no jumping
  slopeSlideExit: 46 * DEG,
  slideAccel: 0.55, // fraction of g·sin(angle) that pulls you down a cliff
  slideMaxSpeed: 6,
  slideEntryKeep: 0.35, // uphill momentum kept when the feet lose grip (scramble ~1 m, then slide)
  bodyRadius: 0.4, // m — how far short of a cliff face / steep bank the body stops
  wallAngle: 62 * DEG, // faces steeper than this over the body radius are walls even mid-air / mid-slide
  downhillBoost: 0.18,
  traversePenalty: 0.55, // lateral speed loss on a no-climb slope

  // ---- jump ----
  coyoteTime: 0.1,
  jumpBuffer: 0.12,
  riseGravity: 0.8, // while rising with the button held
  releaseGravity: 1.9, // rising after an early release → short hop
  fallGravity: 1.1,

  // ---- water ----
  swimEnterDepth: 1.3, // water column deeper than this → swim
  swimExitDepth: 1.05, // shallower than this → feet find the bed again
  floatEyeAbove: 0.46, // eye height above the surface while floating
  wadeAccel: 10,
  wadeFriction: 8,
  swimAccel: 4.5,
  swimFriction: 2.6,
  swimSprint: 1.25,
  buoyancyRate: 3, // 1/s — proportional approach of the float height
  buoyancyResponse: 12, // 1/s — vertical velocity tracking (≥ 4×rate → critically damped)
  buoyancyMaxRise: 2.2,
  diveSpeed: 2.6,
  surfaceSpeed: 1.8,
  entryDrag: 0.78, // horizontal momentum kept on splashing in

  // ---- camera ----
  baseFov: 70,
  sprintFov: 76,
  fovSmoothing: 0.18,
  bobVertical: 0.036,
  bobLateral: 0.022,
  bobRollDeg: 0.55,
  bobPitchDeg: 0.22,
  bobSprintScale: 1.5,
  bobWadeScale: 0.6,
  stepBaseHz: 1.9,
  stepHzPerMs: 0.17, // extra steps/s per m/s
  breathAmp: 0.006,
  breathHz: 0.22,
  leanDeg: 1.0,
  leanSmoothing: 0.12,
  landDipScale: 0.36, // camera spring impulse per m/s of impact (≈7 cm dip for a normal jump)
  landDipMax: 6.5, // ≈20 cm dip for a big fall
  landPitchPerMeter: 0.5, // rad of forward nod per meter of dip
  eyeClearance: 0.35,
  eyeClearanceRadius: 0.3,
  waterPlaneBias: 0.1,
};

function readSensitivityOverride() {
  try {
    const raw = new URLSearchParams(window.location.search).get('sens');
    const value = Number.parseFloat(raw);
    if (Number.isFinite(value) && value > 0) {
      return clamp(value, 0.1, 6);
    }
  } catch {
    // no window / malformed query — keep the default
  }
  return 1;
}

function approach(current, target, rate, dt) {
  return lerp(current, target, 1 - Math.exp(-rate * dt));
}

function moveToward(current, target, maxDelta) {
  const delta = target - current;
  if (Math.abs(delta) <= maxDelta) {
    return target;
  }
  return current + Math.sign(delta) * maxDelta;
}

// Damped harmonic oscillator used for the landing dip / surface breath.
function createSpring(stiffness, damping) {
  const c = 2 * damping * Math.sqrt(stiffness);
  let x = 0;
  let v = 0;
  return {
    get value() {
      return x;
    },
    kick(impulse) {
      v += impulse;
    },
    reset() {
      x = 0;
      v = 0;
    },
    update(dt) {
      // semi-implicit Euler, substepped so the heavy damping integrates accurately
      // and a 50 ms frame stays stable
      const steps = dt > 0.02 ? 8 : 4;
      const h = dt / steps;
      for (let i = 0; i < steps; i += 1) {
        v += (-stiffness * x - c * v) * h;
        x += v * h;
      }
      return x;
    },
  };
}

const EYE_RING = (() => {
  const ring = [];
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2;
    ring.push([Math.cos(a) * FEEL.eyeClearanceRadius, Math.sin(a) * FEEL.eyeClearanceRadius]);
  }
  ring.push([0, 0]);
  return ring;
})();

export function createPlayer(ctx) {
  const { camera, input, terrain } = ctx;

  // walkable floor = terrain, raised by any landmark surface (logs, ruin tiers, rocks)
  const floorAt = (x, z) => Math.max(terrain.sampleHeight(x, z), ctx.landmarks?.heightAt?.(x, z) ?? -Infinity);

  // Lateral colliders: tree trunks (the heightfield + landmark surfaces stop
  // you at rocks and walls, but nothing stops you walking through a tree).
  // Built lazily from the instanced trunk layers into a 6 m spatial hash;
  // instance k of a layer only collides while k < mesh.count (quality density).
  const TRUNK_RADII = { 'emergent-trunks': 0.95, 'canopy-trunks': 0.34, 'understory-trunks': 0.2, 'palm-trunks': 0.24, 'fan-palm-trunks': 0.16, 'tree-fern-trunks': 0.17 };
  const COLLIDER_CELL = 6;
  let colliderHash = null;
  function buildColliders() {
    colliderHash = new Map();
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    for (const mesh of ctx.vegetation?.meshes ?? []) {
      const radius = TRUNK_RADII[mesh.name];
      if (!radius) continue;
      for (let i = 0; i < mesh.instanceMatrix.count; i += 1) {
        mesh.getMatrixAt(i, m);
        m.decompose(p, q, s);
        if (s.x < 0.01) continue;
        const key = `${Math.floor(p.x / COLLIDER_CELL)},${Math.floor(p.z / COLLIDER_CELL)}`;
        let cell = colliderHash.get(key);
        if (!cell) {
          cell = [];
          colliderHash.set(key, cell);
        }
        cell.push({ x: p.x, z: p.z, r: radius * s.x, mesh, index: i });
      }
    }
  }
  // Push the feet out of any trunk they overlap; returns true when it moved us.
  function resolveTrunks(pos, vel, bodyRadius) {
    if (!colliderHash) buildColliders();
    const cx = Math.floor(pos.x / COLLIDER_CELL);
    const cz = Math.floor(pos.z / COLLIDER_CELL);
    let pushed = false;
    for (let dz = -1; dz <= 1; dz += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const cell = colliderHash.get(`${cx + dx},${cz + dz}`);
        if (!cell) continue;
        for (const c of cell) {
          if (c.index >= c.mesh.count) continue;
          const ox = pos.x - c.x;
          const oz = pos.z - c.z;
          const minDist = c.r + bodyRadius;
          const d2 = ox * ox + oz * oz;
          if (d2 >= minDist * minDist) continue;
          const d = Math.sqrt(d2) || 1e-4;
          const nx = ox / d;
          const nz = oz / d;
          pos.x = c.x + nx * minDist;
          pos.z = c.z + nz * minDist;
          const into = -(vel.x * nx + vel.z * nz);
          if (into > 0) {
            vel.x += nx * into;
            vel.z += nz * into;
          }
          pushed = true;
        }
      }
    }
    return pushed;
  }

  const spawnGround = terrain.sampleHeight(WORLD.spawn.x, WORLD.spawn.z);
  const position = new THREE.Vector3(WORLD.spawn.x, spawnGround, WORLD.spawn.z); // feet
  const velocity = new THREE.Vector3();

  // ---- look state (target = raw input, yaw/pitch = smoothed, what the camera shows) ----
  let yawTarget = WORLD.spawnYaw;
  let pitchTarget = -0.06;
  let yaw = yawTarget;
  let pitch = pitchTarget;
  let sensitivityScale = readSensitivityOverride();

  // ---- locomotion state ----
  let grounded = true;
  let sliding = false;
  let swimming = false;
  let wasInWater = false;
  let timeSinceGrounded = 0;
  let airTime = 0;
  let hasJumped = false;
  let jumpHoldActive = false;
  let jumpBufferTimer = 0;
  let sprintBlend = 0;
  let time = 0;

  // ---- camera rig state ----
  let bobPhase = 0;
  let bobAmp = 0;
  let lastStepCycle = 0;
  let lean = 0;
  let fov = FEEL.baseFov;
  let clearanceLift = 0;
  let eyeUnderwater = false;
  let prevYaw = yaw;
  const landSpring = createSpring(180, 0.8);
  const breathSpring = createSpring(60, 0.7);

  const listeners = { step: [], land: [], splash: [], surface: [] };
  function on(type, listener) {
    if (typeof listener !== 'function') {
      return () => {};
    }
    listeners[type].push(listener);
    return () => {
      const index = listeners[type].indexOf(listener);
      if (index >= 0) {
        listeners[type].splice(index, 1);
      }
    };
  }
  function emit(type, payload) {
    for (const listener of listeners[type]) {
      try {
        listener(payload);
      } catch (error) {
        console.error(`player ${type} listener failed`, error);
      }
    }
  }

  const player = {
    position,
    velocity,
    eye: new THREE.Vector3(),
    isSwimming: false,
    isWading: false,
    headUnderwater: false,
    grounded: true,
    sliding: false,
    stirring: false,
    waterDepth: 0,
    speed2D: 0,
    state: 'idle',
    surface: 'grass',
    slopeAngle: 0,
    sprintBlend: 0,
    fov: FEEL.baseFov,
    yawObject: {
      get yaw() {
        return yaw;
      },
      get pitch() {
        return pitch;
      },
    },
    get sensitivity() {
      return sensitivityScale;
    },
    set sensitivity(value) {
      if (Number.isFinite(value) && value > 0) {
        sensitivityScale = clamp(value, 0.1, 6);
      }
    },
    // events — every subscription returns an unsubscribe function
    onStep: (listener) => on('step', listener), // ({ speed, surface, sprinting, position, player })
    onLand: (listener) => on('land', listener), // ({ speed, airTime, surface, position, player })
    onSplash: (listener) => on('splash', listener), // ({ intensity, speed, verticalSpeed, position, player })
    onSurface: (listener) => on('surface', listener), // ({ position, player })
    on(type, listener) {
      return listeners[type] ? on(type, listener) : () => {};
    },
    // debug/testing helper — places the feet on the terrain (or floating, over deep water)
    teleport(x, z, newYaw = yawTarget, newPitch = pitchTarget) {
      const ground = floorAt(x, z);
      const deep = WORLD.waterLevel - ground > FEEL.swimEnterDepth;
      position.set(x, deep ? floatFeetY() : ground, z);
      velocity.set(0, 0, 0);
      yawTarget = newYaw;
      yaw = newYaw;
      prevYaw = newYaw;
      pitchTarget = clamp(newPitch, -FEEL.pitchLimit, FEEL.pitchLimit);
      pitch = pitchTarget;
      swimming = deep;
      grounded = !deep;
      sliding = false;
      hasJumped = false;
      jumpHoldActive = false;
      jumpBufferTimer = 0;
      timeSinceGrounded = 0;
      airTime = 0;
      sprintBlend = 0;
      bobAmp = 0;
      bobPhase = 0;
      lastStepCycle = 0;
      lean = 0;
      fov = FEEL.baseFov;
      clearanceLift = 0;
      landSpring.reset();
      breathSpring.reset();
      wasInWater = WORLD.waterLevel - ground > 0.04;
      eyeUnderwater = false; // feet on the ground or floating → the eye is always above the surface
      player.isSwimming = deep;
      player.isWading = wasInWater && !deep;
      player.speed2D = 0;
      composeCamera(0, true);
    },
    feel: FEEL,
  };

  camera.rotation.order = 'YXZ';
  camera.fov = FEEL.baseFov;
  camera.updateProjectionMatrix();

  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const wishDir = new THREE.Vector3();
  const normal = new THREE.Vector3(0, 1, 0);
  const wallNormalTmp = new THREE.Vector3(0, 1, 0);
  const downhill = new THREE.Vector2();

  function floatFeetY() {
    // ride the swells: the buoyancy tracker chases this, so the bob is damped
    return WORLD.waterLevel - WORLD.eyeHeight + FEEL.floatEyeAbove + waveHeightAt(position.x, position.z, ctx.time || 0);
  }

  // Same classification the terrain shader uses for its splat masks
  // (rock on steep/high ground, sand on the shore band, dirt on trails).
  function classifySurface(x, z, height, normalY, wading) {
    if (wading) {
      return 'water';
    }
    const slope = 1 - normalY;
    if (slope > 0.28 || (height > 14.5 && slope > 0.125)) {
      return 'rock';
    }
    const shore = terrain.waterProximity ? terrain.waterProximity(x, z) : 1;
    if (height < 1.2 && shore > 0.5) {
      return 'sand';
    }
    if (terrain.trailMask && terrain.trailMask(x, z) > 0.5) {
      return 'dirt';
    }
    return 'grass';
  }

  function applyFriction(friction, dt) {
    const speed = Math.hypot(velocity.x, velocity.z);
    if (speed < 1e-5) {
      velocity.x = 0;
      velocity.z = 0;
      return;
    }
    const control = Math.max(speed, FEEL.stopSpeed);
    const newSpeed = Math.max(0, speed - control * friction * dt);
    const scale = newSpeed / speed;
    velocity.x *= scale;
    velocity.z *= scale;
  }

  function accelerate(dirX, dirZ, wishSpeed, accel, dt) {
    const currentSpeed = velocity.x * dirX + velocity.z * dirZ;
    const addSpeed = wishSpeed - currentSpeed;
    if (addSpeed <= 0) {
      return;
    }
    const accelSpeed = Math.min(accel * wishSpeed * dt, addSpeed);
    velocity.x += dirX * accelSpeed;
    velocity.z += dirZ * accelSpeed;
  }

  function land(impactSpeed, surface) {
    grounded = true;
    hasJumped = false;
    jumpHoldActive = false;
    const meaningful = airTime > 0.12 || impactSpeed > 2;
    if (meaningful) {
      landSpring.kick(-Math.min(FEEL.landDipMax, impactSpeed * FEEL.landDipScale));
      emit('land', { speed: impactSpeed, airTime, surface, position, player });
    }
    airTime = 0;
  }

  // ------------------------------------------------------------------ update
  function update(dt) {
    dt = clamp(dt, 0, 0.05);
    time += dt;
    input.pollGamepad?.(dt);

    // ---------- look ----------
    const look = input.consumeLook(dt);
    const sens = FEEL.sensitivity * sensitivityScale;
    yawTarget -= look.dx * sens;
    let dPitch = -look.dy * sens;
    if (dPitch !== 0 && Math.sign(dPitch) === Math.sign(pitchTarget)) {
      // soft end: pushing further into the last degrees before the clamp gets heavier
      const depth = clamp((Math.abs(pitchTarget) - (FEEL.pitchLimit - FEEL.pitchSoftZone)) / FEEL.pitchSoftZone, 0, 1);
      dPitch *= lerp(1, 0.22, depth * depth);
    }
    pitchTarget = clamp(pitchTarget + dPitch, -FEEL.pitchLimit, FEEL.pitchLimit);
    const lookK = 1 - Math.exp(-dt / FEEL.lookSmoothing);
    yaw += (yawTarget - yaw) * lookK;
    pitch += (pitchTarget - pitch) * lookK;
    if (Math.abs(yaw) > Math.PI * 6) {
      // keep both angles small for float precision; the offset is identical so nothing visible changes
      const wrap = Math.round(yaw / (Math.PI * 2)) * Math.PI * 2;
      yaw -= wrap;
      yawTarget -= wrap;
      prevYaw -= wrap;
    }

    forward.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    right.set(-forward.z, 0, forward.x); // camera +x

    // ---------- water state ----------
    const groundY = floorAt(position.x, position.z);
    const columnDepth = WORLD.waterLevel - groundY;
    const submersion = WORLD.waterLevel - position.y;
    player.waterDepth = Math.max(0, submersion);
    const inWater = columnDepth > 0.04 && submersion > 0.04;
    if (!swimming) {
      if (inWater && columnDepth > FEEL.swimEnterDepth && submersion > FEEL.swimEnterDepth - 0.1) {
        swimming = true;
        grounded = false;
      }
    } else if (!inWater || columnDepth < FEEL.swimExitDepth) {
      swimming = false;
    }
    const wading = inWater && !swimming;

    if (inWater && !wasInWater) {
      // splashing in: lose some momentum, tell the world how hard we hit
      const verticalSpeed = Math.max(0, -velocity.y);
      const speed2D = Math.hypot(velocity.x, velocity.z);
      velocity.x *= FEEL.entryDrag;
      velocity.z *= FEEL.entryDrag;
      const intensity = clamp(0.12 + verticalSpeed * 0.11 + speed2D * 0.045, 0, 1);
      emit('splash', { intensity, speed: speed2D, verticalSpeed, position, player });
    }
    wasInWater = inWater;

    // ---------- terrain under the feet ----------
    terrain.sampleNormal(position.x, position.z, normal);
    const slopeAngle = Math.acos(clamp(normal.y, -1, 1));
    player.slopeAngle = slopeAngle;
    const horiz = Math.hypot(normal.x, normal.z);
    if (horiz > 1e-5) {
      downhill.set(normal.x / horiz, normal.z / horiz);
    } else {
      downhill.set(0, 0);
    }
    // The smoothed normal spills ~0.65 m past the foot/top of a cliff, so a
    // slide also needs the ground to really fall away right under the feet —
    // otherwise pressing into a wall would rubber-band you back and forth.
    const groundFallsAway = (minAngle) => {
      if (horiz < 1e-5) {
        return false;
      }
      const e = 0.25;
      const drop = groundY - terrain.sampleHeight(position.x + downhill.x * e, position.z + downhill.y * e);
      return drop > e * Math.tan(minAngle) * 0.8;
    };
    if (grounded && !swimming) {
      if (!sliding && slopeAngle > FEEL.slopeSlide && groundFallsAway(FEEL.slopeSlide)) {
        sliding = true;
        // grip is gone: sprinting at a cliff (or swimming into a steep bank) no
        // longer carries you metres up the face on momentum alone
        const uphill = -(velocity.x * downhill.x + velocity.z * downhill.y);
        if (uphill > 0) {
          const shed = uphill * (1 - FEEL.slideEntryKeep);
          velocity.x += downhill.x * shed;
          velocity.z += downhill.y * shed;
        }
      } else if (sliding && (slopeAngle < FEEL.slopeSlideExit || !groundFallsAway(FEEL.slopeSlideExit))) {
        sliding = false;
      }
    } else {
      sliding = false;
    }

    // ---------- movement intent ----------
    const moveX = clamp(input.state.moveX, -1, 1);
    const moveZ = clamp(input.state.moveZ, -1, 1);
    wishDir.set(0, 0, 0).addScaledVector(forward, moveZ).addScaledVector(right, moveX);
    let wishMag = wishDir.length();
    if (wishMag > 1) {
      wishDir.divideScalar(wishMag);
      wishMag = 1;
    } else if (wishMag > 1e-4) {
      wishDir.divideScalar(wishMag);
    } else {
      wishMag = 0;
    }
    const hasInput = wishMag > 0.02;

    const wantSprint = Boolean(input.state.sprint) && moveZ > 0.2 && !swimming && !sliding && submersion < 0.6;
    sprintBlend = moveToward(sprintBlend, wantSprint ? 1 : 0, dt / (wantSprint ? FEEL.sprintRamp : FEEL.sprintRelease));

    let wishSpeed = WORLD.walkSpeed * lerp(1, WORLD.sprintMultiplier, sprintBlend) * wishMag;
    if (swimming) {
      wishSpeed = WORLD.swimSpeed * (input.state.sprint ? FEEL.swimSprint : 1) * wishMag;
    } else if (wading) {
      wishSpeed *= lerp(1, 0.42, clamp(submersion / 1.1, 0, 1)); // deeper = slower
    }

    // ---------- horizontal velocity ----------
    let dirX = wishDir.x;
    let dirZ = wishDir.z;
    if (grounded && !swimming) {
      if (hasInput && slopeAngle > FEEL.slopeStart) {
        // decompose the wish into an uphill/downhill part and a traverse part
        const along = -(dirX * downhill.x + dirZ * downhill.y); // +1 straight uphill
        const climb = smoothstep(FEEL.slopeStart, FEEL.slopeNoClimb, slopeAngle);
        const steep = smoothstep(FEEL.slopeStart, FEEL.slopeSlide, slopeAngle);
        const upX = -downhill.x * along;
        const upZ = -downhill.y * along;
        const sideX = dirX - upX;
        const sideZ = dirZ - upZ;
        const upScale = along > 0 ? 1 - climb : 1 + FEEL.downhillBoost * steep;
        const sideScale = 1 - FEEL.traversePenalty * climb;
        const nx = upX * upScale + sideX * sideScale;
        const nz = upZ * upScale + sideZ * sideScale;
        const len = Math.hypot(nx, nz);
        if (len > 1e-4) {
          dirX = nx / len;
          dirZ = nz / len;
          wishSpeed *= Math.min(len, 1.25);
        } else {
          wishSpeed = 0;
        }
      }
      if (sliding) {
        // gravity slide: friction is almost gone and the cliff pulls you down
        applyFriction(0.6, dt);
        const pull = WORLD.gravity * Math.sin(slopeAngle) * FEEL.slideAccel * dt;
        velocity.x += downhill.x * pull;
        velocity.z += downhill.y * pull;
        const slideSpeed = Math.hypot(velocity.x, velocity.z);
        if (slideSpeed > FEEL.slideMaxSpeed) {
          velocity.x *= FEEL.slideMaxSpeed / slideSpeed;
          velocity.z *= FEEL.slideMaxSpeed / slideSpeed;
        }
        if (hasInput) {
          accelerate(dirX, dirZ, wishSpeed * 0.35, 2.5, dt);
        }
      } else {
        applyFriction(wading ? FEEL.wadeFriction : FEEL.groundFriction, dt);
        if (hasInput) {
          accelerate(dirX, dirZ, wishSpeed, wading ? FEEL.wadeAccel : FEEL.groundAccel, dt);
        }
      }
    } else if (swimming) {
      applyFriction(FEEL.swimFriction, dt);
      if (hasInput) {
        accelerate(dirX, dirZ, wishSpeed, FEEL.swimAccel, dt);
      }
    } else {
      const drag = 1 / (1 + FEEL.airDrag * dt);
      velocity.x *= drag;
      velocity.z *= drag;
      if (hasInput) {
        accelerate(dirX, dirZ, wishSpeed, FEEL.airAccel, dt);
      }
    }

    // ---------- jump ----------
    if (input.consumeJump()) {
      jumpBufferTimer = FEEL.jumpBuffer;
    }
    let jumpedNow = false;
    if (!swimming) {
      const canCoyote = !grounded && !hasJumped && timeSinceGrounded < FEEL.coyoteTime;
      if (jumpBufferTimer > 0 && !sliding && (grounded || canCoyote)) {
        velocity.y = WORLD.jumpSpeed;
        grounded = false;
        hasJumped = true;
        jumpHoldActive = true;
        jumpedNow = true;
        jumpBufferTimer = 0;
        airTime = 0;
      }
    } else {
      jumpBufferTimer = 0;
    }
    jumpBufferTimer = Math.max(0, jumpBufferTimer - dt);
    if (!input.state.jumpHeld) {
      jumpHoldActive = false;
    }

    // ---------- vertical ----------
    if (swimming) {
      const movingForward = moveZ > 0.15;
      const diveAmount = smoothstep(0.25, 0.6, -pitch);
      const riseAmount = smoothstep(0.25, 0.6, pitch);
      let vyWish = 0;
      if (hasInput && movingForward) {
        vyWish -= diveAmount * FEEL.diveSpeed * moveZ;
        vyWish += riseAmount * FEEL.surfaceSpeed * moveZ;
      }
      if (input.state.jumpHeld) {
        vyWish += FEEL.surfaceSpeed;
      }
      const target = floatFeetY();
      const submergedCruise = eyeUnderwater && hasInput;
      if (Math.abs(vyWish) > 0.01) {
        // active dive/ascent: a little buoyancy still leans on you
        vyWish += clamp((target - position.y) * 0.35, -0.5, 0.5);
      } else {
        // critically damped buoyancy: proportional approach fed into a fast velocity tracker
        const rate = submergedCruise ? 0.9 : FEEL.buoyancyRate;
        vyWish = clamp((target - position.y) * rate, -FEEL.buoyancyMaxRise, FEEL.buoyancyMaxRise);
      }
      velocity.y = approach(velocity.y, vyWish, FEEL.buoyancyResponse, dt);
      grounded = false;
    } else {
      let g = WORLD.gravity;
      if (velocity.y > 0 && hasJumped) {
        g *= jumpHoldActive && input.state.jumpHeld ? FEEL.riseGravity : FEEL.releaseGravity;
      } else if (velocity.y < 0) {
        g *= FEEL.fallGravity;
      }
      velocity.y -= g * dt;
      if (inWater && velocity.y < 0) {
        velocity.y *= 1 / (1 + 3 * dt); // water slows the plunge
      }
    }

    // ---------- integrate ----------
    const prevX = position.x;
    const prevZ = position.z;
    const prevY = position.y;
    position.x += velocity.x * dt;
    position.z += velocity.z * dt;

    const limit = WORLD.size / 2 - 6;
    position.x = clamp(position.x, -limit, limit);
    position.z = clamp(position.z, -limit, limit);

    // Walls. A heightfield can only push you up, so three kinds of horizontal
    // step are refused and turned into a slide along the face instead:
    //  - the feet would be lifted faster than a ~45° ramp (a near-vertical face),
    //  - walkable ground → uphill onto a slope you would only slide back down
    //    (pressing into a cliff keeps you flush against it, no bounce),
    //  - swimming into a bank that is above the feet and too steep to stand on.
    // The tests use the height gradient along the actual step (not the smoothed
    // normal) so a terrace face cannot be climbed through its rounded foot, and
    // they look one body radius ahead so you stop short of a face instead of
    // with the lens inside it (which would also make the eye-clearance lift pop).
    const wallFrom = grounded && !sliding && !swimming;
    const tanSlide = Math.tan(FEEL.slopeSlide);
    const tanWall = Math.tan(FEEL.wallAngle);
    let floorY = floorAt(position.x, position.z);
    const isWall = (x, z, floor) => {
      const travelled = Math.hypot(x - prevX, z - prevZ);
      if (travelled < 1e-6) {
        return false;
      }
      const reach = travelled + FEEL.bodyRadius;
      const scale = reach / travelled;
      const floorAhead = floorAt(prevX + (x - prevX) * scale, prevZ + (z - prevZ) * scale);
      if (swimming) {
        return (floor > prevY + 0.02 || floorAhead > prevY + 0.02) && floorAhead - groundY > reach * tanSlide;
      }
      if (floor - prevY > 0.35 + travelled || floorAhead - prevY > 0.35 + reach * tanWall) {
        return true;
      }
      return wallFrom && floorAhead - prevY > 0.01 && floorAhead - prevY > reach * tanSlide;
    };
    if (isWall(position.x, position.z, floorY)) {
      const wallNormal = terrain.sampleNormal(position.x, position.z, wallNormalTmp);
      const wn = Math.hypot(wallNormal.x, wallNormal.z);
      position.x = prevX;
      position.z = prevZ;
      if (wn > 1e-5) {
        const nx = wallNormal.x / wn;
        const nz = wallNormal.z / wn;
        const into = -(velocity.x * nx + velocity.z * nz);
        if (into > 0) {
          velocity.x += nx * into;
          velocity.z += nz * into;
        }
        position.x = clamp(prevX + velocity.x * dt, -limit, limit);
        position.z = clamp(prevZ + velocity.z * dt, -limit, limit);
        floorY = floorAt(position.x, position.z);
        if (isWall(position.x, position.z, floorY)) {
          position.x = prevX;
          position.z = prevZ;
          velocity.x = 0;
          velocity.z = 0;
          floorY = floorAt(prevX, prevZ);
        }
      } else {
        velocity.x = 0;
        velocity.z = 0;
        floorY = floorAt(prevX, prevZ);
      }
    }
    if (resolveTrunks(position, velocity, FEEL.bodyRadius * 0.8)) {
      position.x = clamp(position.x, -limit, limit);
      position.z = clamp(position.z, -limit, limit);
      floorY = floorAt(position.x, position.z);
    }
    position.y += velocity.y * dt;

    // ---------- ground collision / snapping ----------
    const wasGrounded = grounded;
    if (!swimming) {
      const speed2D = Math.hypot(velocity.x, velocity.z);
      const snapDistance = 0.45 + speed2D * 0.06;
      if (position.y <= floorY) {
        const impact = Math.max(0, -velocity.y) * (inWater ? 0.5 : 1);
        position.y = floorY;
        velocity.y = Math.max(0, velocity.y);
        if (!wasGrounded) {
          land(impact, classifySurface(position.x, position.z, floorY, normal.y, wading));
        }
        grounded = true;
      } else if (wasGrounded && !jumpedNow && velocity.y <= 0.01 && position.y - floorY < snapDistance) {
        // walking down a slope: stay glued to it instead of micro-hopping
        position.y = floorY;
        velocity.y = 0;
        grounded = true;
      } else {
        grounded = false;
      }
    } else {
      // swimming: keep a body's thickness above the bed once we are actually
      // diving; right at the wade→swim hand-over the feet are still on the bed,
      // so the clearance fades in with depth instead of popping the camera up
      const bedClearance = 0.35 * clamp((WORLD.waterLevel - position.y - FEEL.swimEnterDepth) / 0.8, 0, 1);
      if (position.y < floorY + bedClearance) {
        position.y = floorY + bedClearance;
        velocity.y = Math.max(0, velocity.y);
      }
    }

    if (grounded) {
      timeSinceGrounded = 0;
    } else {
      timeSinceGrounded += dt;
      airTime = swimming ? 0 : airTime + dt;
    }

    // ---------- derived state ----------
    player.speed2D = Math.hypot(velocity.x, velocity.z);
    player.isSwimming = swimming;
    player.isWading = wading;
    player.grounded = grounded;
    player.sliding = sliding;
    player.sprintBlend = sprintBlend;
    player.surface = classifySurface(position.x, position.z, floorY, normal.y, wading);
    const moving = player.speed2D > 0.6;
    player.stirring = (swimming || wading) && moving;

    if (swimming) {
      player.state = eyeUnderwater ? 'dive' : 'swim';
    } else if (!grounded) {
      player.state = 'air';
    } else if (sliding) {
      player.state = 'slide';
    } else if (wading) {
      player.state = moving ? 'wade' : 'idle';
    } else if (!moving) {
      player.state = 'idle';
    } else {
      player.state = sprintBlend > 0.5 && player.speed2D > WORLD.walkSpeed * 1.15 ? 'sprint' : 'walk';
    }

    // ---------- head bob + footsteps ----------
    const bobbing = grounded && moving && !sliding;
    if (bobbing) {
      bobPhase += dt * (FEEL.stepBaseHz + player.speed2D * FEEL.stepHzPerMs) * Math.PI; // one step per π
      bobAmp = approach(bobAmp, wading ? FEEL.bobWadeScale : 1, 8, dt);
    } else {
      bobAmp = approach(bobAmp, 0, 7, dt);
      if (bobAmp < 0.02) {
        bobPhase = 0;
        lastStepCycle = 0;
      }
    }
    const stepCycle = Math.floor(bobPhase / Math.PI);
    if (bobbing && stepCycle !== lastStepCycle && bobAmp > 0.25) {
      lastStepCycle = stepCycle;
      emit('step', {
        speed: player.speed2D,
        surface: player.surface,
        sprinting: sprintBlend > 0.5,
        position,
        player,
      });
    }

    composeCamera(dt, false);
  }

  // ------------------------------------------------------------ camera rig
  function composeCamera(dt, instant) {
    const speedNorm = clamp(player.speed2D / WORLD.walkSpeed, 0, 2);
    const ampScale = (0.55 + 0.45 * Math.min(speedNorm, 1)) * lerp(1, FEEL.bobSprintScale, sprintBlend) * bobAmp;
    const bobY = Math.sin(bobPhase * 2) * FEEL.bobVertical * ampScale;
    const bobX = Math.sin(bobPhase) * FEEL.bobLateral * ampScale;
    const bobRoll = -Math.sin(bobPhase) * FEEL.bobRollDeg * DEG * ampScale;
    const bobPitch = Math.sin(bobPhase * 2 + 0.6) * FEEL.bobPitchDeg * DEG * ampScale;

    // idle breathing fades in when the bob fades out
    const idleWeight = (1 - bobAmp) * (swimming ? 0.5 : 1);
    const breathPhase = time * Math.PI * 2 * FEEL.breathHz;
    const breathY = Math.sin(breathPhase) * FEEL.breathAmp * idleWeight;
    const breathPitch = Math.sin(breathPhase - 0.9) * 0.0016 * idleWeight;
    const breathRoll = Math.sin(time * 0.61) * 0.0009 * idleWeight;

    // lean into strafes (and a touch into fast turns)
    const lateral = (velocity.x * right.x + velocity.z * right.z) / WORLD.walkSpeed;
    const yawRate = dt > 0 ? (yaw - prevYaw) / dt : 0;
    prevYaw = yaw;
    const leanTarget = -clamp(lateral, -1, 1) * FEEL.leanDeg * DEG + clamp(yawRate * 0.004, -0.5 * DEG, 0.5 * DEG);
    lean = instant ? leanTarget : approach(lean, leanTarget, 1 / FEEL.leanSmoothing, dt);

    // sprint widens the view only when we are actually moving fast
    const sprintSpeedNorm = smoothstep(WORLD.walkSpeed * 1.05, WORLD.walkSpeed * WORLD.sprintMultiplier * 0.97, player.speed2D);
    const fovTarget = lerp(FEEL.baseFov, FEEL.sprintFov, sprintSpeedNorm * sprintBlend);
    fov = instant ? FEEL.baseFov : approach(fov, fovTarget, 1 / FEEL.fovSmoothing, dt);
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    player.fov = fov;

    const landY = dt > 0 ? landSpring.update(dt) : landSpring.value;
    const breathBump = dt > 0 ? breathSpring.update(dt) : breathSpring.value;

    const eye = player.eye;
    eye.set(
      position.x + right.x * bobX,
      position.y + WORLD.eyeHeight + bobY + breathY + landY + breathBump,
      position.z + right.z * bobX
    );

    // never let the lens touch the ground — on slopes (or when the rig pulls the
    // eye down) sample a ring around the eye and lift it clear of the terrain
    let neededLift = 0;
    const eyeAboveFeetGround = eye.y - position.y;
    if (player.slopeAngle > 20 * DEG || eyeAboveFeetGround < 1.2 || clearanceLift > 0.001) {
      let maxTerrain = -Infinity;
      for (const [ox, oz] of EYE_RING) {
        const h = terrain.sampleHeight(eye.x + ox, eye.z + oz);
        if (h > maxTerrain) {
          maxTerrain = h;
        }
      }
      neededLift = Math.max(0, maxTerrain + FEEL.eyeClearance - eye.y);
    }
    clearanceLift = instant || neededLift > clearanceLift ? neededLift : approach(clearanceLift, neededLift, 6, dt);
    eye.y += clearanceLift;

    // never straddle the water plane: pick a side, then stay a bias away from it
    const rel = eye.y - WORLD.waterLevel;
    if (eyeUnderwater) {
      if (rel > 0.02) {
        eyeUnderwater = false;
        breathSpring.kick(0.35);
        emit('surface', { position, player });
      }
    } else if (rel < -0.02) {
      eyeUnderwater = true;
    }
    if (eyeUnderwater) {
      eye.y = Math.min(eye.y, WORLD.waterLevel - FEEL.waterPlaneBias);
    } else {
      eye.y = Math.max(eye.y, WORLD.waterLevel + FEEL.waterPlaneBias);
    }
    player.headUnderwater = eyeUnderwater;

    camera.position.copy(eye);
    camera.rotation.set(
      pitch + bobPitch + breathPitch + landY * FEEL.landPitchPerMeter,
      yaw,
      lean + bobRoll + breathRoll
    );
  }

  composeCamera(0, true);

  return Object.assign(player, { update });
}
