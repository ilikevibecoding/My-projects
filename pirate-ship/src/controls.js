// ---------------------------------------------------------------------------
// controls.js — keyboard sailing controls + third-person chase camera with
// mouse orbit and wheel zoom. The camera auto-settles behind the ship.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { heightAt } from './waves.js';
import { terrainHeightAt } from './islandField.js';

export class Controls {
  constructor(body, camera, dom, hud) {
    this.body = body;
    this.camera = camera;
    this.hud = hud;

    this.yaw = body.heading + Math.PI; // camera behind the ship
    this.pitch = 0.30;
    this.dist = 34;
    this.lastDragTime = -10;
    this.keys = new Set();

    this._camTarget = new THREE.Vector3();
    this._desired = new THREE.Vector3();

    window.addEventListener('keydown', (e) => {
      if (e.repeat) {
        this.keys.add(e.code);
        return;
      }
      switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
          body.changeSail(+1);
          hud?.flashSail();
          break;
        case 'KeyS':
        case 'ArrowDown':
          body.changeSail(-1);
          hud?.flashSail();
          break;
        case 'Space':
          body.toggleAnchor();
          e.preventDefault();
          break;
        case 'KeyR':
          body.reset();
          break;
        case 'KeyH':
          hud?.toggleHelp();
          break;
      }
      this.keys.add(e.code);
      hud?.dismissIntro();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    // mouse orbit
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    dom.addEventListener('pointerdown', (e) => {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      hud?.dismissIntro();
    });
    window.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      this.yaw -= (e.clientX - lastX) * 0.0052;
      this.pitch = THREE.MathUtils.clamp(this.pitch + (e.clientY - lastY) * 0.0042, 0.04, 1.25);
      lastX = e.clientX;
      lastY = e.clientY;
      this.lastDragTime = performance.now() / 1000;
    });
    window.addEventListener('pointerup', () => (dragging = false));
    dom.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.dist = THREE.MathUtils.clamp(this.dist * (e.deltaY > 0 ? 1.09 : 0.92), 12, 80);
      },
      { passive: false }
    );
  }

  /** held-key rudder input -> physics */
  applyInput() {
    const left = this.keys.has('KeyA') || this.keys.has('ArrowLeft');
    const right = this.keys.has('KeyD') || this.keys.has('ArrowRight');
    this.body.rudderInput = (right ? 1 : 0) - (left ? 1 : 0);
  }

  updateCamera(dt, t) {
    const body = this.body;
    const now = performance.now() / 1000;

    // settle behind the ship when the mouse has been idle
    if (now - this.lastDragTime > 2.4) {
      const targetYaw = body.heading + Math.PI;
      let d = targetYaw - this.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.yaw += d * Math.min(1, dt * 1.4);
    }

    const cp = Math.cos(this.pitch);
    this._camTarget.set(body.pos.x, body.pos.y + 3.4, body.pos.z);
    this._desired.set(
      this._camTarget.x + Math.sin(this.yaw) * cp * this.dist,
      this._camTarget.y + Math.sin(this.pitch) * this.dist,
      this._camTarget.z + Math.cos(this.yaw) * cp * this.dist
    );

    // keep the camera above the waves and island terrain
    const waterY = heightAt(this._desired.x, this._desired.z, t);
    const groundY = terrainHeightAt(this._desired.x, this._desired.z);
    this._desired.y = Math.max(this._desired.y, waterY + 1.6, groundY + 2.5);

    // critically-damped style smoothing
    const k = 1 - Math.exp(-dt * 7.5);
    this.camera.position.lerp(this._desired, k);
    this.camera.lookAt(this._camTarget);

    // subtle speed kick
    const speed = Math.abs(body.speed);
    const targetFov = 55 + Math.min(speed, 14) * 0.5;
    this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 2);
    this.camera.updateProjectionMatrix();
  }
}
