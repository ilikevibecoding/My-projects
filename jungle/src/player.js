// First-person controller: walking, gravity, jumping, wading and swimming.

import * as THREE from 'three/webgpu';
import { WORLD } from './config.js';
import { clamp, lerp } from './noise.js';

export function createPlayer(ctx) {
  const { camera, input, terrain } = ctx;

  const spawnGround = terrain.sampleHeight(WORLD.spawn.x, WORLD.spawn.z);
  const position = new THREE.Vector3(WORLD.spawn.x, spawnGround, WORLD.spawn.z); // feet
  const velocity = new THREE.Vector3();

  let yaw = WORLD.spawnYaw; // face the lagoon + waterfall
  let pitch = -0.06;
  let grounded = true;
  let bobPhase = 0;
  let bobAmp = 0;
  let lastStepPhase = 0;

  const stepListeners = [];
  const player = {
    position,
    velocity,
    eye: new THREE.Vector3(),
    isSwimming: false,
    isWading: false,
    headUnderwater: false,
    waterDepth: 0,
    speed2D: 0,
    yawObject: { get yaw() { return yaw; } },
    onStep(listener) {
      stepListeners.push(listener);
    },
    // debug/testing helper
    teleport(x, z, newYaw = yaw, newPitch = pitch) {
      position.set(x, terrain.sampleHeight(x, z), z);
      velocity.set(0, 0, 0);
      yaw = newYaw;
      pitch = newPitch;
    },
  };

  camera.rotation.order = 'YXZ';

  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const wishDir = new THREE.Vector3();

  function update(dt) {
    // ---------- look ----------
    const look = input.consumeLook();
    const sensitivity = 0.0023;
    yaw -= look.dx * sensitivity;
    pitch -= look.dy * sensitivity;
    pitch = clamp(pitch, -Math.PI / 2 + 0.04, Math.PI / 2 - 0.04);

    // ---------- water state ----------
    const groundY = terrain.sampleHeight(position.x, position.z);
    const waterDepthHere = WORLD.waterLevel - groundY; // how deep the water column is here
    const submersion = WORLD.waterLevel - position.y; // how deep the player's feet are
    player.waterDepth = Math.max(0, submersion);
    const inWater = waterDepthHere > 0.04 && submersion > 0.04;
    const swimming = inWater && waterDepthHere > 1.25 && submersion > 1.05;
    player.isSwimming = swimming;
    player.isWading = inWater && !swimming;

    // ---------- movement intent ----------
    const moveX = clamp(input.state.moveX, -1, 1);
    const moveZ = clamp(input.state.moveZ, -1, 1);
    forward.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    right.set(forward.z, 0, -forward.x);
    wishDir.set(0, 0, 0).addScaledVector(forward, moveZ).addScaledVector(right, moveX);
    if (wishDir.lengthSq() > 1) {
      wishDir.normalize();
    }

    let targetSpeed = WORLD.walkSpeed;
    if (input.state.sprint && moveZ > 0.2) {
      targetSpeed *= WORLD.sprintMultiplier;
    }
    if (swimming) {
      targetSpeed = WORLD.swimSpeed;
    } else if (player.isWading) {
      // deeper wading = slower
      targetSpeed *= lerp(1, 0.42, clamp(submersion / 1.1, 0, 1));
    }

    // ---------- horizontal velocity (smooth accel) ----------
    const accel = grounded || swimming ? 11 : 3.4;
    velocity.x = lerp(velocity.x, wishDir.x * targetSpeed, 1 - Math.exp(-accel * dt));
    velocity.z = lerp(velocity.z, wishDir.z * targetSpeed, 1 - Math.exp(-accel * dt));

    // ---------- vertical ----------
    if (swimming) {
      // buoyancy spring keeps the eyes a touch above the surface — but relax it
      // while the player is actively diving (looking down and moving forward)
      const diving = pitch < -0.3 && moveZ > 0.15;
      const targetFeetY = WORLD.waterLevel - WORLD.eyeHeight + 0.46;
      const buoyancy = (targetFeetY - position.y) * (diving ? 0.7 : 6.5);
      velocity.y = lerp(velocity.y, buoyancy, 1 - Math.exp(-5 * dt));
      // swim along the look pitch while moving
      if (wishDir.lengthSq() > 0.01) {
        velocity.y += Math.sin(pitch) * moveZ * WORLD.swimSpeed * 6.6 * dt;
      }
      if (input.state.jumpHeld) {
        velocity.y += 7.5 * dt;
      }
      grounded = false;
    } else {
      velocity.y -= WORLD.gravity * dt;
      if (grounded && input.consumeJump()) {
        velocity.y = WORLD.jumpSpeed;
        grounded = false;
      }
    }

    // ---------- integrate ----------
    position.x += velocity.x * dt;
    position.z += velocity.z * dt;
    position.y += velocity.y * dt;

    // keep inside the world
    const limit = WORLD.size / 2 - 6;
    position.x = clamp(position.x, -limit, limit);
    position.z = clamp(position.z, -limit, limit);

    // ---------- ground collision ----------
    const floorY = terrain.sampleHeight(position.x, position.z);
    if (!swimming) {
      if (position.y <= floorY) {
        position.y = floorY;
        velocity.y = Math.max(0, velocity.y);
        grounded = true;
      } else if (position.y - floorY < 0.08) {
        grounded = true;
      } else {
        grounded = false;
      }
    } else if (position.y < floorY + 0.35) {
      position.y = floorY + 0.35;
      velocity.y = Math.max(0, velocity.y);
    }

    // gentle slope resistance: walking up steep rock slows you
    if (grounded && !inWater) {
      const normal = terrain.sampleNormal(position.x, position.z);
      if (normal.y < 0.62) {
        const downhillX = normal.x;
        const downhillZ = normal.z;
        position.x += downhillX * (0.62 - normal.y) * 14 * dt;
        position.z += downhillZ * (0.62 - normal.y) * 14 * dt;
      }
    }

    // ---------- head bob + footsteps ----------
    player.speed2D = Math.hypot(velocity.x, velocity.z);
    const moving = player.speed2D > 0.6;
    if (grounded && moving) {
      bobPhase += dt * (4.4 + player.speed2D * 0.85);
      bobAmp = lerp(bobAmp, 1, 1 - Math.exp(-8 * dt));
    } else {
      bobAmp = lerp(bobAmp, 0, 1 - Math.exp(-6 * dt));
    }

    // footstep event once per bob cycle (used for water ripples/splashes + audio)
    const stepCycle = Math.floor(bobPhase / Math.PI);
    if (stepCycle !== lastStepPhase && grounded && moving) {
      lastStepPhase = stepCycle;
      for (const listener of stepListeners) {
        listener(player);
      }
    }

    // swimming also stirs the water continuously
    if ((swimming || player.isWading) && moving) {
      player.stirring = true;
    } else {
      player.stirring = false;
    }

    // ---------- camera ----------
    const bobY = Math.sin(bobPhase * 2) * 0.045 * bobAmp;
    const bobX = Math.cos(bobPhase) * 0.025 * bobAmp;
    player.eye.set(
      position.x + right.x * bobX,
      position.y + WORLD.eyeHeight + bobY,
      position.z + right.z * bobX
    );
    camera.position.copy(player.eye);
    camera.rotation.set(pitch, yaw, 0);

    player.headUnderwater = player.eye.y < WORLD.waterLevel - 0.12;
  }

  return Object.assign(player, { update });
}
