// First-person controller: pointer lock, WASD, head bob, terrain following,
// slope limiting and soft world bounds. No falling through, no escaping.
import * as THREE from 'three';
import { getTerrainHeight, getTerrainNormal, WORLD_RADIUS } from './terrain.js';
import { clamp } from './noise.js';

const EYE = 1.7;
const SPEED = 4.6;
const MAX_SLOPE_TAN = Math.tan(THREE.MathUtils.degToRad(38));

export class Player {
  constructor(camera, domElement) {
    this.camera = camera;
    this.dom = domElement;
    this.position = new THREE.Vector3(7, 0, 7);
    this.yaw = Math.PI * 0.78;
    this.pitch = -0.06;
    this.velocity = new THREE.Vector3();
    this.keys = { f: false, b: false, l: false, r: false };
    this.debugMove = { f: false, b: false, l: false, r: false };
    this.enabled = true;       // movement allowed (false while seated)
    this.controlMode = 'player'; // 'player' | 'debug' (debug = posed camera)
    this.bobPhase = 0;
    this.bobAmp = 0;
    this._n = new THREE.Vector3();

    this.position.y = getTerrainHeight(this.position.x, this.position.z) + EYE;

    document.addEventListener('keydown', (e) => this.onKey(e, true));
    document.addEventListener('keyup', (e) => this.onKey(e, false));
    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === this.dom) {
        this.controlMode = 'player';
        this.yaw -= e.movementX * 0.0023;
        this.pitch = clamp(this.pitch - e.movementY * 0.0023, -1.45, 1.45);
      }
    });
    this.dom.addEventListener('click', () => {
      if (document.pointerLockElement !== this.dom) {
        this.dom.requestPointerLock?.();
      }
    });
  }

  onKey(e, down) {
    switch (e.code) {
      case 'KeyW': case 'ArrowUp': this.keys.f = down; break;
      case 'KeyS': case 'ArrowDown': this.keys.b = down; break;
      case 'KeyA': case 'ArrowLeft': this.keys.l = down; break;
      case 'KeyD': case 'ArrowRight': this.keys.r = down; break;
      default: return;
    }
    if (down) this.controlMode = 'player';
  }

  update(dt) {
    if (this.controlMode !== 'player') return;

    const f = (this.keys.f || this.debugMove.f) ? 1 : 0;
    const b = (this.keys.b || this.debugMove.b) ? 1 : 0;
    const l = (this.keys.l || this.debugMove.l) ? 1 : 0;
    const r = (this.keys.r || this.debugMove.r) ? 1 : 0;

    const wish = new THREE.Vector3();
    if (this.enabled) {
      const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
      // forward is -Z rotated by yaw
      wish.x += (f - b) * -sin + (r - l) * cos;
      wish.z += (f - b) * -cos + (r - l) * -sin;
      if (wish.lengthSq() > 0) wish.normalize().multiplyScalar(SPEED);
    }
    this.velocity.lerp(wish, Math.min(1, dt * 10));

    if (this.velocity.lengthSq() > 0.0001) {
      const step = this.velocity.clone().multiplyScalar(dt);
      this.tryMove(step.x, 0) || this.tryMove(step.x * 0.4, 0);
      this.tryMove(0, step.z) || this.tryMove(0, step.z * 0.4);
    }

    // soft world bound: gently push back inside
    const rad = Math.hypot(this.position.x, this.position.z);
    if (rad > WORLD_RADIUS) {
      const k = (rad - WORLD_RADIUS) / rad;
      this.position.x -= this.position.x * k * Math.min(1, dt * 5);
      this.position.z -= this.position.z * k * Math.min(1, dt * 5);
    }

    // terrain follow (never below ground)
    const ground = getTerrainHeight(this.position.x, this.position.z);
    this.position.y = ground + EYE;

    // head bob
    const speed = this.velocity.length();
    const target = speed > 0.5 ? 1 : 0;
    this.bobAmp += (target - this.bobAmp) * Math.min(1, dt * 6);
    this.bobPhase += dt * speed * 1.9;

    const bobY = Math.sin(this.bobPhase * 2) * 0.035 * this.bobAmp;
    const bobX = Math.cos(this.bobPhase) * 0.02 * this.bobAmp;
    const roll = Math.cos(this.bobPhase) * 0.006 * this.bobAmp;

    this.camera.position.set(
      this.position.x + bobX * Math.cos(this.yaw),
      this.position.y + bobY,
      this.position.z - bobX * Math.sin(this.yaw),
    );
    this.camera.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, roll, 'YXZ'));
  }

  tryMove(dx, dz) {
    if (dx === 0 && dz === 0) return true;
    const nx = this.position.x + dx;
    const nz = this.position.z + dz;
    const h0 = getTerrainHeight(this.position.x, this.position.z);
    const h1 = getTerrainHeight(nx, nz);
    const dist = Math.hypot(dx, dz);
    const rise = h1 - h0;
    if (rise > 0 && rise / dist > MAX_SLOPE_TAN) return false; // too steep uphill
    this.position.x = nx;
    this.position.z = nz;
    return true;
  }

  // teleport for debug views / sitting
  setPose(pos, yaw, pitch) {
    this.position.copy(pos);
    this.yaw = yaw;
    this.pitch = pitch;
    this.camera.position.copy(pos);
    this.camera.quaternion.setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
  }

  getState() {
    const ground = getTerrainHeight(this.position.x, this.position.z);
    return {
      x: this.position.x, y: this.position.y, z: this.position.z,
      ground, eyeAboveGround: this.position.y - ground,
      radius: Math.hypot(this.position.x, this.position.z),
      yaw: this.yaw, pitch: this.pitch,
    };
  }
}
