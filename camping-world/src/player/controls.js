import * as THREE from 'three';

const EYE_HEIGHT = 1.7;
const WALK_SPEED = 2.2; // m/s — human walk
const SPRINT_SPEED = 4.8; // m/s — jog/run
const ACCEL = 14.0; // ground acceleration
const DAMPING = 10.0; // velocity damping when no input
const PLAYER_RADIUS = 0.35;
const WORLD_RADIUS = 120; // soft bounds clamp

/**
 * Pointer-lock first-person walking controller.
 * - Terrain-following (smoothed) at human eye height
 * - Walk / sprint speeds, acceleration + damping for weighty feel
 * - Capsule-vs-cylinder collision against registered obstacles
 * - Subtle head bob driven by horizontal speed
 */
export class FirstPersonControls {
  constructor(camera, domElement) {
    this.camera = camera;
    this.domElement = domElement;
    this.enabled = true;
    this.locked = false;

    this.yaw = 0;
    this.pitch = 0;

    this.velocity = new THREE.Vector3();
    this.position = new THREE.Vector3(0, EYE_HEIGHT, 0);

    this.keys = { forward: false, back: false, left: false, right: false, sprint: false };

    this.getTerrainHeight = () => 0;
    this.colliders = []; // { x, z, radius }

    this.bobPhase = 0;
    this.bobAmount = 0;
    this.smoothedGroundY = 0;
    this.firstGroundSnap = true;

    this._onMouseMove = (e) => {
      if (!this.locked || !this.enabled) return;
      const sens = 0.0021;
      this.yaw -= e.movementX * sens;
      this.pitch -= e.movementY * sens;
      const maxPitch = Math.PI / 2 - 0.02;
      this.pitch = Math.max(-maxPitch, Math.min(maxPitch, this.pitch));
    };

    this._onKey = (e, down) => {
      if (!this.enabled) return;
      switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
          this.keys.forward = down;
          break;
        case 'KeyS':
        case 'ArrowDown':
          this.keys.back = down;
          break;
        case 'KeyA':
        case 'ArrowLeft':
          this.keys.left = down;
          break;
        case 'KeyD':
        case 'ArrowRight':
          this.keys.right = down;
          break;
        case 'ShiftLeft':
        case 'ShiftRight':
          this.keys.sprint = down;
          break;
      }
    };

    document.addEventListener('mousemove', this._onMouseMove);
    document.addEventListener('keydown', (e) => this._onKey(e, true));
    document.addEventListener('keyup', (e) => this._onKey(e, false));
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.domElement;
      if (this.onLockChange) this.onLockChange(this.locked);
    });
  }

  lock() {
    this.domElement.requestPointerLock();
  }

  setPose(x, z, yaw = 0, pitch = 0) {
    this.position.set(x, this.getTerrainHeight(x, z) + EYE_HEIGHT, z);
    this.smoothedGroundY = this.getTerrainHeight(x, z);
    this.firstGroundSnap = false;
    this.yaw = yaw;
    this.pitch = pitch;
    this.velocity.set(0, 0, 0);
    this.updateCamera(0);
  }

  update(dt) {
    if (!this.enabled) return;

    // --- input direction in world space (yaw-relative) ---
    const input = new THREE.Vector2(
      (this.keys.right ? 1 : 0) - (this.keys.left ? 1 : 0),
      (this.keys.back ? 1 : 0) - (this.keys.forward ? 1 : 0)
    );
    const hasInput = input.lengthSq() > 0;
    if (hasInput) input.normalize();

    // Build world-space wish direction from camera yaw basis vectors.
    // input.x: strafe (+right), input.y: +back / -forward (lz)
    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const wishDir = new THREE.Vector3()
      .addScaledVector(forward, -input.y)
      .addScaledVector(right, input.x);
    if (hasInput) wishDir.normalize();

    const targetSpeed = this.keys.sprint ? SPRINT_SPEED : WALK_SPEED;

    // --- acceleration / damping ---
    if (hasInput) {
      this.velocity.x += wishDir.x * ACCEL * dt;
      this.velocity.z += wishDir.z * ACCEL * dt;
      const hSpeed = Math.hypot(this.velocity.x, this.velocity.z);
      if (hSpeed > targetSpeed) {
        const s = targetSpeed / hSpeed;
        this.velocity.x *= s;
        this.velocity.z *= s;
      }
    } else {
      const damp = Math.max(0, 1 - DAMPING * dt);
      this.velocity.x *= damp;
      this.velocity.z *= damp;
    }

    // --- integrate ---
    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;

    // --- collide with cylinders ---
    for (const c of this.colliders) {
      const dx = this.position.x - c.x;
      const dz = this.position.z - c.z;
      const minDist = c.radius + PLAYER_RADIUS;
      const d2 = dx * dx + dz * dz;
      if (d2 < minDist * minDist && d2 > 1e-8) {
        const d = Math.sqrt(d2);
        const push = (minDist - d) / d;
        this.position.x += dx * push;
        this.position.z += dz * push;
      }
    }

    // --- world bounds ---
    const r = Math.hypot(this.position.x, this.position.z);
    if (r > WORLD_RADIUS) {
      const s = WORLD_RADIUS / r;
      this.position.x *= s;
      this.position.z *= s;
    }

    // --- terrain follow (smoothed so steps don't pop) ---
    const groundY = this.getTerrainHeight(this.position.x, this.position.z);
    if (this.firstGroundSnap) {
      this.smoothedGroundY = groundY;
      this.firstGroundSnap = false;
    } else {
      const k = 1 - Math.exp(-12 * dt);
      this.smoothedGroundY += (groundY - this.smoothedGroundY) * k;
    }

    // --- head bob ---
    const hSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    const speedRatio = Math.min(1, hSpeed / SPRINT_SPEED);
    if (hSpeed > 0.3) {
      this.bobPhase += dt * (5.4 + 3.6 * speedRatio);
      this.bobAmount = Math.min(1, this.bobAmount + dt * 4);
    } else {
      this.bobAmount = Math.max(0, this.bobAmount - dt * 6);
    }
    const bobY = Math.sin(this.bobPhase * 2) * 0.022 * this.bobAmount * (0.5 + 0.5 * speedRatio);
    const bobX = Math.cos(this.bobPhase) * 0.012 * this.bobAmount * (0.5 + 0.5 * speedRatio);

    this.position.y = this.smoothedGroundY + EYE_HEIGHT + bobY;
    this._bobX = bobX;

    this.updateCamera(dt);
  }

  updateCamera() {
    const euler = new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ');
    this.camera.quaternion.setFromEuler(euler);
    this.camera.position.copy(this.position);
    if (this._bobX) {
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
      this.camera.position.addScaledVector(right, this._bobX);
    }
  }
}

export { EYE_HEIGHT };
