import * as THREE from 'three';
import {
  GRAVITY,
  JUMP_SPEED,
  WALK_SPEED,
  SPRINT_SPEED,
  FLY_SPEED,
  SWIM_SPEED,
  PLAYER_HALF_WIDTH,
  PLAYER_HEIGHT,
  PLAYER_EYE_HEIGHT,
  WORLD_HEIGHT,
} from './constants.js';
import { Blocks, isSolid } from './blocks.js';

const EPS = 0.001;

export class Player {
  constructor(world) {
    this.world = world;
    this.position = new THREE.Vector3(0.5, 50, 0.5); // feet position
    this.velocity = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.onGround = false;
    this.flying = false;
    this.inWater = false;
    this.headInWater = false;
  }

  get eyePosition() {
    return new THREE.Vector3(
      this.position.x,
      this.position.y + PLAYER_EYE_HEIGHT,
      this.position.z
    );
  }

  lookDirection() {
    const cp = Math.cos(this.pitch);
    return new THREE.Vector3(
      -Math.sin(this.yaw) * cp,
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * cp
    );
  }

  applyCamera(camera) {
    camera.position.copy(this.eyePosition);
    camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }

  rotate(dx, dy, sensitivity) {
    this.yaw -= dx * sensitivity;
    this.pitch -= dy * sensitivity;
    const limit = Math.PI / 2 - 0.01;
    this.pitch = Math.max(-limit, Math.min(limit, this.pitch));
  }

  teleportToSurface(x, z) {
    const h = this.world.gen.heightAt(Math.floor(x), Math.floor(z));
    this.position.set(x, Math.max(h, 30) + 2.2, z);
    this.velocity.set(0, 0, 0);
  }

  update(dt, input) {
    const world = this.world;
    const pos = this.position;
    const vel = this.velocity;

    const feetBlock = world.getBlock(
      Math.floor(pos.x),
      Math.floor(pos.y + 0.4),
      Math.floor(pos.z)
    );
    const headBlock = world.getBlock(
      Math.floor(pos.x),
      Math.floor(pos.y + PLAYER_EYE_HEIGHT),
      Math.floor(pos.z)
    );
    this.inWater = feetBlock === Blocks.WATER || headBlock === Blocks.WATER;
    this.headInWater = headBlock === Blocks.WATER;

    // Wish direction in world space from input axes.
    const sinY = Math.sin(this.yaw);
    const cosY = Math.cos(this.yaw);
    const fwd = input.forward;
    const strafe = input.strafe;
    let wishX = -fwd * sinY + strafe * cosY;
    let wishZ = -fwd * cosY - strafe * sinY;
    const wishLen = Math.hypot(wishX, wishZ);
    if (wishLen > 1) {
      wishX /= wishLen;
      wishZ /= wishLen;
    }

    if (this.flying) {
      const speed = input.sprint ? FLY_SPEED * 1.8 : FLY_SPEED;
      const targetX = wishX * speed;
      const targetZ = wishZ * speed;
      let targetY = 0;
      if (input.jump) targetY += speed;
      if (input.down) targetY -= speed;
      const k = 1 - Math.exp(-12 * dt);
      vel.x += (targetX - vel.x) * k;
      vel.y += (targetY - vel.y) * k;
      vel.z += (targetZ - vel.z) * k;
    } else if (this.inWater) {
      const speed = input.sprint ? SWIM_SPEED * 1.4 : SWIM_SPEED;
      const k = 1 - Math.exp(-7 * dt);
      vel.x += (wishX * speed - vel.x) * k;
      vel.z += (wishZ * speed - vel.z) * k;
      vel.y -= GRAVITY * 0.16 * dt;
      if (input.jump) vel.y += GRAVITY * 0.42 * dt + 9 * dt;
      vel.y = Math.max(-4.5, Math.min(4.5, vel.y));
    } else {
      const speed = input.sprint ? SPRINT_SPEED : WALK_SPEED;
      const control = this.onGround ? 14 : 3.2;
      const k = 1 - Math.exp(-control * dt);
      vel.x += (wishX * speed - vel.x) * k;
      vel.z += (wishZ * speed - vel.z) * k;
      vel.y -= GRAVITY * dt;
      vel.y = Math.max(-50, vel.y);
      if (input.jump && this.onGround) {
        vel.y = JUMP_SPEED;
        this.onGround = false;
      }
    }

    this.onGround = false;
    this.moveAxis(0, vel.x * dt);
    this.moveAxis(1, vel.y * dt);
    this.moveAxis(2, vel.z * dt);

    if (pos.y < -16) this.teleportToSurface(pos.x, pos.z);
    if (pos.y > WORLD_HEIGHT + 40) {
      pos.y = WORLD_HEIGHT + 40;
      vel.y = Math.min(vel.y, 0);
    }
  }

  collides(minX, minY, minZ, maxX, maxY, maxZ) {
    const world = this.world;
    const x0 = Math.floor(minX);
    const x1 = Math.floor(maxX);
    const y0 = Math.floor(minY);
    const y1 = Math.floor(maxY);
    const z0 = Math.floor(minZ);
    const z1 = Math.floor(maxZ);
    for (let y = y0; y <= y1; y++) {
      for (let z = z0; z <= z1; z++) {
        for (let x = x0; x <= x1; x++) {
          if (isSolid(world.getBlock(x, y, z))) return true;
        }
      }
    }
    return false;
  }

  moveAxis(axis, amount) {
    if (amount === 0) return;
    const pos = this.position;
    const vel = this.velocity;
    const hw = PLAYER_HALF_WIDTH;

    if (axis === 0) pos.x += amount;
    else if (axis === 1) pos.y += amount;
    else pos.z += amount;

    const minX = pos.x - hw;
    const maxX = pos.x + hw;
    const minY = pos.y;
    const maxY = pos.y + PLAYER_HEIGHT;
    const minZ = pos.z - hw;
    const maxZ = pos.z + hw;

    if (!this.collides(minX, minY + EPS, minZ, maxX, maxY - EPS, maxZ)) return;

    if (axis === 0) {
      if (amount > 0) pos.x = Math.floor(maxX) - hw - EPS;
      else pos.x = Math.floor(minX) + 1 + hw + EPS;
      vel.x = 0;
    } else if (axis === 1) {
      if (amount > 0) {
        pos.y = Math.floor(maxY - EPS) - PLAYER_HEIGHT - EPS;
        vel.y = 0;
      } else {
        pos.y = Math.floor(minY) + 1 + EPS;
        vel.y = 0;
        this.onGround = true;
      }
    } else {
      if (amount > 0) pos.z = Math.floor(maxZ) - hw - EPS;
      else pos.z = Math.floor(minZ) + 1 + hw + EPS;
      vel.z = 0;
    }
  }

  // True if placing a block at (x, y, z) would overlap the player's AABB.
  overlapsBlock(x, y, z) {
    const hw = PLAYER_HALF_WIDTH;
    const pos = this.position;
    return (
      x + 1 > pos.x - hw &&
      x < pos.x + hw &&
      y + 1 > pos.y &&
      y < pos.y + PLAYER_HEIGHT &&
      z + 1 > pos.z - hw &&
      z < pos.z + hw
    );
  }
}
