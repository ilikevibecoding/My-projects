// Player: movement, gravity, AABB voxel collision, sprint, fly.
import * as THREE from 'three';
import {
  GRAVITY,
  JUMP_SPEED,
  WALK_SPEED,
  SPRINT_SPEED,
  FLY_SPEED,
  FLY_SPRINT_SPEED,
  PLAYER_WIDTH,
  PLAYER_HEIGHT,
  PLAYER_EYE,
  WORLD_HEIGHT,
} from './config.js';

const HALF_W = PLAYER_WIDTH / 2;

export class Player {
  constructor(world, camera) {
    this.world = world;
    this.camera = camera;
    // position is the player's feet (bottom-center of AABB)
    this.pos = new THREE.Vector3(0, 0, 0);
    this.vel = new THREE.Vector3(0, 0, 0);
    this.yaw = 0; // radians, around Y
    this.pitch = 0; // radians
    this.onGround = false;
    this.flying = false;
  }

  setSpawn(x, z) {
    const surfaceY = this.world.surfaceHeight(Math.floor(x), Math.floor(z));
    this.pos.set(x + 0.5, surfaceY + 2, z + 0.5);
    this.vel.set(0, 0, 0);
  }

  // AABB occupies [pos.x-HALF_W, pos.x+HALF_W] x [pos.y, pos.y+HEIGHT] x [pos.z-HALF_W, pos.z+HALF_W]
  collides(px, py, pz) {
    const minX = Math.floor(px - HALF_W);
    const maxX = Math.floor(px + HALF_W);
    const minY = Math.floor(py);
    const maxY = Math.floor(py + PLAYER_HEIGHT - 0.0001);
    const minZ = Math.floor(pz - HALF_W);
    const maxZ = Math.floor(pz + HALF_W);
    for (let y = minY; y <= maxY; y++) {
      if (y < 0 || y >= WORLD_HEIGHT) {
        if (y < 0) return true;
        continue;
      }
      for (let z = minZ; z <= maxZ; z++) {
        for (let x = minX; x <= maxX; x++) {
          if (this.world.isSolidAt(x, y, z)) return true;
        }
      }
    }
    return false;
  }

  update(dt, input) {
    // clamp dt to avoid tunneling on hitches
    dt = Math.min(dt, 0.05);

    // --- desired horizontal movement from input ---
    const forward = (input.keys.has('KeyW') ? 1 : 0) - (input.keys.has('KeyS') ? 1 : 0);
    const strafe = (input.keys.has('KeyD') ? 1 : 0) - (input.keys.has('KeyA') ? 1 : 0);
    const sprint = input.keys.has('ShiftLeft') || input.keys.has('ShiftRight');

    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    // forward vector (camera looks down -Z at yaw 0)
    let dx = 0;
    let dz = 0;
    if (forward !== 0 || strafe !== 0) {
      const fx = -sin * forward;
      const fz = -cos * forward;
      const sx = cos * strafe;
      const sz = -sin * strafe;
      dx = fx + sx;
      dz = fz + sz;
      const len = Math.hypot(dx, dz) || 1;
      dx /= len;
      dz /= len;
    }

    if (this.flying) {
      const speed = sprint ? FLY_SPRINT_SPEED : FLY_SPEED;
      this.vel.x = dx * speed;
      this.vel.z = dz * speed;
      let vy = 0;
      if (input.keys.has('Space')) vy += 1;
      if (input.keys.has('ControlLeft') || input.keys.has('KeyC')) vy -= 1;
      this.vel.y = vy * speed;
    } else {
      const speed = sprint ? SPRINT_SPEED : WALK_SPEED;
      this.vel.x = dx * speed;
      this.vel.z = dz * speed;
      this.vel.y -= GRAVITY * dt;
      if (input.keys.has('Space') && this.onGround) {
        this.vel.y = JUMP_SPEED;
        this.onGround = false;
      }
    }

    // --- integrate with axis-separated collision ---
    // X
    let nx = this.pos.x + this.vel.x * dt;
    if (!this.collides(nx, this.pos.y, this.pos.z)) {
      this.pos.x = nx;
    } else {
      this.vel.x = 0;
    }
    // Z
    let nz = this.pos.z + this.vel.z * dt;
    if (!this.collides(this.pos.x, this.pos.y, nz)) {
      this.pos.z = nz;
    } else {
      this.vel.z = 0;
    }
    // Y
    let ny = this.pos.y + this.vel.y * dt;
    if (!this.collides(this.pos.x, ny, this.pos.z)) {
      this.pos.y = ny;
      this.onGround = false;
    } else {
      if (this.vel.y < 0) {
        this.onGround = true;
      }
      this.vel.y = 0;
    }

    // keep above the void
    if (this.pos.y < -10) {
      this.setSpawn(Math.floor(this.pos.x), Math.floor(this.pos.z));
    }

    // --- sync camera ---
    this.camera.position.set(this.pos.x, this.pos.y + PLAYER_EYE, this.pos.z);
    const euler = new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ');
    this.camera.quaternion.setFromEuler(euler);
  }

  toggleFly() {
    this.flying = !this.flying;
    this.vel.set(0, 0, 0);
  }
}
