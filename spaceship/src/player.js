// First-person controller: pointer lock, WASD, head bob, capsule-vs-AABB collision.
import * as THREE from 'three';

const EYE = 1.7;
const RADIUS = 0.32;
const WALK_SPEED = 2.6;
const ACCEL = 26;

export class Player {
  constructor(camera, dom, colliders) {
    this.camera = camera;
    this.dom = dom;
    this.colliders = colliders;

    this.position = new THREE.Vector3(0, 0, 6.0); // feet
    this.velocity = new THREE.Vector3();
    this.yaw = Math.PI;       // facing -Z (toward cockpit)... yaw=0 faces -Z here
    this.pitch = 0;
    this.keys = new Set();
    this.locked = false;
    this.bobPhase = 0;
    this.bobAmount = 0;
    this.time = 0;
    this.frozen = false; // debug camera mode
    this.eyeOverride = null;

    this.onLockChange = null;

    dom.ownerDocument.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
    });
    dom.ownerDocument.addEventListener('keyup', (e) => this.keys.delete(e.code));

    dom.ownerDocument.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === dom;
      if (this.onLockChange) this.onLockChange(this.locked);
    });
    dom.ownerDocument.addEventListener('mousemove', (e) => {
      if (!this.locked || this.frozen) return;
      this.yaw -= e.movementX * 0.0023;
      this.pitch -= e.movementY * 0.0023;
      this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch));
    });
  }

  lock() { this.dom.requestPointerLock(); }

  setPose(pos, yaw, pitch) {
    this.position.set(pos.x, 0, pos.z);
    this.yaw = yaw;
    this.pitch = pitch;
    this.velocity.set(0, 0, 0);
  }

  update(dt) {
    this.time += dt;
    if (this.frozen) {
      this.applyCamera(0);
      return;
    }

    // input direction in local space
    let fx = 0, fz = 0;
    if (this.keys.has('KeyW')) fz -= 1;
    if (this.keys.has('KeyS')) fz += 1;
    if (this.keys.has('KeyA')) fx -= 1;
    if (this.keys.has('KeyD')) fx += 1;
    const moving = (fx !== 0 || fz !== 0) && this.locked;

    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    // yaw=0 faces -Z
    const wishX = (fx * cos - fz * sin);
    const wishZ = (fz * cos + fx * sin);
    const wish = new THREE.Vector2(wishX, wishZ);
    if (wish.lengthSq() > 0) wish.normalize().multiplyScalar(WALK_SPEED);

    // accelerate toward wish velocity
    const v = this.velocity;
    v.x += (wish.x - v.x) * Math.min(1, ACCEL * dt * 0.4);
    v.z += (wish.y - v.z) * Math.min(1, ACCEL * dt * 0.4);
    if (!moving) {
      v.x *= Math.pow(0.0001, dt);
      v.z *= Math.pow(0.0001, dt);
    }

    this.position.x += v.x * dt;
    this.position.z += v.z * dt;
    this.resolveCollisions();

    // head bob
    const speed = Math.hypot(v.x, v.z);
    const target = Math.min(1, speed / WALK_SPEED);
    this.bobAmount += (target - this.bobAmount) * Math.min(1, 8 * dt);
    this.bobPhase += dt * (6.5 + speed * 1.6) * (this.bobAmount > 0.02 ? 1 : 0);

    this.applyCamera(dt);
  }

  applyCamera(dt) {
    const bobY = Math.sin(this.bobPhase * 2) * 0.028 * this.bobAmount;
    const bobX = Math.sin(this.bobPhase) * 0.016 * this.bobAmount;
    // idle breathing + engine rumble
    const breathe = Math.sin(this.time * 1.7) * 0.004;
    const rumble = this.frozen ? 0 : (Math.sin(this.time * 31.7) + Math.sin(this.time * 47.3)) * 0.0009;

    const eye = this.frozen && this.eyeOverride !== null ? this.eyeOverride : EYE;
    this.camera.position.set(
      this.position.x + bobX * Math.cos(this.yaw),
      eye + (this.frozen ? 0 : bobY + breathe + rumble),
      this.position.z - bobX * Math.sin(this.yaw)
    );
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.set(this.pitch, this.yaw, Math.sin(this.bobPhase) * 0.0035 * this.bobAmount);
  }

  resolveCollisions() {
    const p = this.position;
    for (let pass = 0; pass < 3; pass++) {
      let pushed = false;
      for (const b of this.colliders) {
        // vertical overlap with player capsule (feet 0 .. head 1.8)
        if (b.max.y < 0.25 || b.min.y > 1.75) continue;
        const ex0 = b.min.x - RADIUS, ex1 = b.max.x + RADIUS;
        const ez0 = b.min.z - RADIUS, ez1 = b.max.z + RADIUS;
        if (p.x <= ex0 || p.x >= ex1 || p.z <= ez0 || p.z >= ez1) continue;
        // push out along smallest penetration
        const dxl = p.x - ex0, dxr = ex1 - p.x;
        const dzl = p.z - ez0, dzr = ez1 - p.z;
        const m = Math.min(dxl, dxr, dzl, dzr);
        if (m === dxl) p.x = ex0;
        else if (m === dxr) p.x = ex1;
        else if (m === dzl) p.z = ez0;
        else p.z = ez1;
        pushed = true;
      }
      if (!pushed) break;
    }
  }
}
