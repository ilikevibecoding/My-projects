// controls.js — pointer-lock third-person controls: WASD movement relative to
// the camera, jumping, terrace step-up and simple cylinder collisions.

import * as THREE from 'three';

const GRAVITY = 38;
const JUMP_V = 13.5;
const WALK = 8.2;
const SPRINT = 12.2;
const STEP_UP = 1.35; // can climb a little over one brick per step
const PLAYER_R = 0.95;

export class PlayerControls {
  constructor(canvas, world) {
    this.canvas = canvas;
    this.world = world;

    this.position = new THREE.Vector3(0.5, 0, 8.5);
    this.velocity = new THREE.Vector3();
    this.yaw = 0; // camera sits at +Z of the player, looking toward world center
    this.pitch = 0.32;
    this.heading = Math.PI; // hero faces -Z (toward the diorama)
    this.grounded = true;
    this.enabled = false;
    this.moveSpeed01 = 0;

    this.keys = new Set();
    this.justPressed = new Set();
    this.mouseDelta = { x: 0, y: 0 };

    this._bind();
  }

  _bind() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.justPressed.add(e.code);
      if (['Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    document.addEventListener('mousemove', (e) => {
      if (!this.enabled || document.pointerLockElement !== this.canvas) return;
      this.mouseDelta.x += e.movementX;
      this.mouseDelta.y += e.movementY;
    });
  }

  requestLock() {
    this.canvas.requestPointerLock?.();
  }

  consumePressed(code) {
    const had = this.justPressed.has(code);
    this.justPressed.delete(code);
    return had;
  }

  update(dt) {
    // look
    this.yaw -= this.mouseDelta.x * 0.0026;
    this.pitch = THREE.MathUtils.clamp(this.pitch + this.mouseDelta.y * 0.0022, -0.5, 1.05);
    this.mouseDelta.x = 0;
    this.mouseDelta.y = 0;

    // move input in camera space
    let ix = 0;
    let iz = 0;
    if (this.keys.has('KeyW')) iz -= 1;
    if (this.keys.has('KeyS')) iz += 1;
    if (this.keys.has('KeyA')) ix -= 1;
    if (this.keys.has('KeyD')) ix += 1;
    const moving = ix !== 0 || iz !== 0;

    const speed = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') ? SPRINT : WALK;
    let vx = 0;
    let vz = 0;
    if (moving) {
      const len = Math.hypot(ix, iz);
      ix /= len;
      iz /= len;
      const sin = Math.sin(this.yaw);
      const cos = Math.cos(this.yaw);
      // camera forward on the ground plane is (-sin(yaw), -cos(yaw)),
      // camera right is (cos(yaw), -sin(yaw)); iz is -1 when pressing W.
      vx = (iz * sin + ix * cos) * speed;
      vz = (iz * cos - ix * sin) * speed;
      this.heading = Math.atan2(vx, vz);
    }
    this.moveSpeed01 = THREE.MathUtils.damp(this.moveSpeed01, moving ? speed / SPRINT : 0, 12, dt);

    // vertical
    if (this.grounded && this.consumePressed('Space')) {
      this.velocity.y = JUMP_V;
      this.grounded = false;
    }
    this.velocity.y -= GRAVITY * dt;

    // integrate horizontally with step-up / wall behavior per axis
    const ground = (x, z) => this.world.groundHeight(x, z);
    const tryAxis = (dx, dz) => {
      const nx = this.position.x + dx;
      const nz = this.position.z + dz;
      const g = ground(nx, nz);
      if (g - this.position.y <= STEP_UP || this.position.y + 0.01 >= g) {
        this.position.x = nx;
        this.position.z = nz;
      }
    };
    tryAxis(vx * dt, 0);
    tryAxis(0, vz * dt);

    // cylinder colliders (huts, towers, rocks…)
    for (const c of this.world.colliders) {
      const dx = this.position.x - c.x;
      const dz = this.position.z - c.z;
      const d = Math.hypot(dx, dz);
      const minD = c.r + PLAYER_R;
      if (d < minD && d > 1e-4) {
        if (c.topY !== undefined && this.position.y >= c.topY - 0.01) continue; // standing on it
        const push = (minD - d) / d;
        this.position.x += dx * push;
        this.position.z += dz * push;
      }
    }

    // world bounds
    const b = this.world.bounds;
    this.position.x = THREE.MathUtils.clamp(this.position.x, -b, b);
    this.position.z = THREE.MathUtils.clamp(this.position.z, -b, b);

    // vertical resolve
    this.position.y += this.velocity.y * dt;
    const g = ground(this.position.x, this.position.z);
    if (this.position.y <= g) {
      // when walking up terraces, snap smoothly instead of popping
      this.position.y = this.grounded ? THREE.MathUtils.damp(this.position.y, g, 30, dt) : g;
      if (this.position.y > g - 0.02) this.position.y = g;
      this.velocity.y = 0;
      this.grounded = true;
    } else if (this.position.y - g > 0.05) {
      this.grounded = false;
    }
  }

  /** Places the camera on its orbit and returns the look target. */
  applyCamera(camera, dt, firstFrame = false) {
    const dist = 10.5;
    const target = _target.set(this.position.x, this.position.y + 3.4, this.position.z);
    const offY = Math.sin(this.pitch) * dist + 1.4;
    const offH = Math.cos(this.pitch) * dist;
    _desired.set(
      target.x + Math.sin(this.yaw) * offH,
      target.y + offY,
      target.z + Math.cos(this.yaw) * offH
    );
    // keep camera above terrain
    const camGround = this.world.groundHeight(_desired.x, _desired.z) + 1.2;
    if (_desired.y < camGround) _desired.y = camGround;

    if (firstFrame) {
      camera.position.copy(_desired);
    } else {
      camera.position.x = THREE.MathUtils.damp(camera.position.x, _desired.x, 22, dt);
      camera.position.y = THREE.MathUtils.damp(camera.position.y, _desired.y, 22, dt);
      camera.position.z = THREE.MathUtils.damp(camera.position.z, _desired.z, 22, dt);
    }
    camera.lookAt(target);
    return target;
  }
}

const _target = new THREE.Vector3();
const _desired = new THREE.Vector3();
