// camera.js — third-person chase rig + builder orbit + fixed debug views.

import * as THREE from 'three';
import { PLANET_CENTER, altitudeOf } from './physics.js';

const _up = new THREE.Vector3();
const _horiz = new THREE.Vector3();
const _desired = new THREE.Vector3();
const _look = new THREE.Vector3();
const _tmp = new THREE.Vector3();

// a fixed world heading so the camera always sits on the sun-lit side
const HEADING = new THREE.Vector3(0.62, 0, 0.78).normalize();

export class CameraRig {
  constructor(width, height) {
    this.camera = new THREE.PerspectiveCamera(55, width / height, 0.5, 80000);
    this.camera.position.set(26, 8, 20);
    this.smoothPos = this.camera.position.clone();
    this.smoothLook = new THREE.Vector3(0, 6, 0);
    this.mode = 'orbit';          // orbit | chase | fixed
    this.fixedPos = new THREE.Vector3();
    this.fixedLook = new THREE.Vector3();
    // manual control (right-drag orbit + wheel zoom), applied on top of
    // the auto orbit/chase framing
    this.userYaw = 0;             // radians around local up
    this.userPitch = 0;           // radians toward/away from local up
    this.userZoom = 1;            // distance multiplier
    this.dragging = false;
  }

  // right-button drag orbits around the rocket; wheel zooms in/out
  attachControls(dom) {
    let lastX = 0, lastY = 0;
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
    dom.addEventListener('pointerdown', (e) => {
      if (e.button !== 2) return;
      this.dragging = true;
      lastX = e.clientX; lastY = e.clientY;
      dom.setPointerCapture?.(e.pointerId);
      e.preventDefault();
    });
    const endDrag = (e) => {
      if (e.type !== 'pointercancel' && e.button !== 2) return;
      this.dragging = false;
    };
    dom.addEventListener('pointerup', endDrag);
    dom.addEventListener('pointercancel', endDrag);
    dom.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
      this.userYaw -= dx * 0.006;
      // near-full vertical range: you can dive below the rocket and look up
      // at the engines from underneath (great once you're in space)
      this.userPitch = THREE.MathUtils.clamp(this.userPitch + dy * 0.005, -1.45, 1.45);
    });
    dom.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.userZoom = THREE.MathUtils.clamp(this.userZoom * Math.exp(e.deltaY * 0.0011), 0.45, 2.6);
    }, { passive: false });
  }

  resetManual() { this.userYaw = 0; this.userPitch = 0; this.userZoom = 1; }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // hard cut to the current orbit framing (used when entering the builder —
  // gliding down from wherever the flight ended looks broken)
  snapOrbit(time, stackHeight) {
    this.updateOrbit(1e6, time, stackHeight); // k -> 1: converges instantly
  }

  // ---- builder: slow orbit around the stack (right-drag steers it)
  updateOrbit(dt, time, stackHeight) {
    const h = Math.max(6, stackHeight);
    const r = Math.max(11, h * 1.75) * this.userZoom;
    const a = time * 0.12 + 0.7 + this.userYaw;
    const liftK = THREE.MathUtils.clamp(0.62 + this.userPitch * 0.85, -0.1, 2.0);
    _desired.set(Math.cos(a) * r, 2.2 + h * liftK, Math.sin(a) * r);
    _look.set(0, 2.0 + h * 0.46, 0);
    this._smooth(dt, this.dragging ? 12 : 2.2);
  }

  // ---- flight: chase from the sun-lit side, look slightly ahead
  updateChase(dt, target) {
    // target: { pos (rocket center, world), vel, up }
    _up.copy(target.up);
    // heading projected onto the local horizontal plane
    _horiz.copy(HEADING).addScaledVector(_up, -HEADING.dot(_up)).normalize();
    // manual orbit: rotate the heading around local up, then pitch it
    if (this.userYaw !== 0) _horiz.applyAxisAngle(_up, this.userYaw);
    const speed = target.vel.length();
    const manual = this.userYaw !== 0 || this.userPitch !== 0;
    const dist = THREE.MathUtils.clamp(15 + speed * 0.045, 15, 34) * this.userZoom;
    const autoLift = manual ? 0 : 3.2 + speed * 0.012;
    const lift = autoLift + dist * Math.sin(this.userPitch);
    const horizDist = dist * Math.cos(this.userPitch);
    _desired.copy(target.pos).addScaledVector(_horiz, horizDist).addScaledVector(_up, lift);
    // never clip into the terrain near the pad
    const alt = altitudeOf(_desired);
    if (alt < 2.6) _desired.addScaledVector(_up, 2.6 - alt);
    // manual orbit: keep the rocket dead-center (velocity look-ahead would
    // shove it off-frame when inspecting from below at high speed)
    if (manual) _look.copy(target.pos);
    else _look.copy(target.pos).addScaledVector(target.vel, 0.22).addScaledVector(_up, 0.6);
    this._smooth(dt, this.dragging ? 14 : 3.4);
  }

  updateFixed(dt) {
    _desired.copy(this.fixedPos);
    _look.copy(this.fixedLook);
    this._smooth(dt, 50);
  }

  _smooth(dt, rate) {
    const k = 1 - Math.exp(-rate * dt);
    this.smoothPos.lerp(_desired, k);
    this.smoothLook.lerp(_look, k);
    // exponential smoothing can be left kilometres behind after a long
    // rAF stall (tab switch) or a debug time-warp — and would then pan
    // across empty sky for many seconds. Clamp the trailing distance.
    const posErr = this.smoothPos.distanceTo(_desired);
    if (posErr > 40) this.smoothPos.lerp(_desired, 1 - 40 / posErr);
    const lookErr = this.smoothLook.distanceTo(_look);
    if (lookErr > 55) this.smoothLook.lerp(_look, 1 - 55 / lookErr);
    this.camera.position.copy(this.smoothPos);
    // keep "up" aligned with local up so the horizon stays level
    _tmp.copy(this.smoothPos).sub(PLANET_CENTER).normalize();
    this.camera.up.copy(_tmp);
    this.camera.lookAt(this.smoothLook);
  }

  snapTo(pos, look) {
    this.smoothPos.copy(pos);
    this.smoothLook.copy(look);
    this.camera.position.copy(pos);
    _tmp.copy(pos).sub(PLANET_CENTER).normalize();
    this.camera.up.copy(_tmp);
    this.camera.lookAt(look);
  }

  // ---- named debug views; ctx = { rocketCenter, rocketBase, up, height }
  applyDebugView(name, ctx) {
    const { rocketCenter, rocketBase, up, height } = ctx;
    _horiz.copy(HEADING).addScaledVector(up, -HEADING.dot(up)).normalize();
    const side = _tmp.copy(up).cross(_horiz).normalize().clone();
    let pos, look;
    switch (name) {
      case 'pad':
        pos = rocketBase.clone().addScaledVector(_horiz, 24).addScaledVector(side, 12).addScaledVector(up, 7.5);
        look = rocketBase.clone().addScaledVector(up, height * 0.42);
        break;
      case 'liftoff': {
        // hero angle from ground level: pad, dust, plume AND rocket in frame
        const altBase = altitudeOf(rocketBase);
        const ground = rocketBase.clone().addScaledVector(up, -altBase + 1.0);
        pos = ground.clone().addScaledVector(_horiz, 27).addScaledVector(side, -9).addScaledVector(up, 5.0);
        look = ground.clone().addScaledVector(up, 2.0 + altBase * 0.55);
        break;
      }
      case 'midair':
        pos = rocketCenter.clone().addScaledVector(_horiz, 20).addScaledVector(side, 5).addScaledVector(up, 2.5);
        look = rocketCenter.clone().addScaledVector(up, 1.0);
        break;
      case 'high_altitude':
        // well above the rocket, pitched steeply down: at ~3.8 km on a 4 km
        // planet the limb sits ~59° below horizontal, so the camera must dive
        pos = rocketCenter.clone().addScaledVector(_horiz, 16).addScaledVector(side, 4).addScaledVector(up, 20);
        look = rocketCenter.clone();
        break;
      case 'space':
        // side-ish view: vacuum-wide plume readable, limb still in lower frame
        pos = rocketCenter.clone().addScaledVector(_horiz, 22).addScaledVector(side, -7).addScaledVector(up, 14);
        look = rocketCenter.clone().addScaledVector(up, -4);
        break;
      case 'staging':
        // high three-quarter view: tumbling spent stage against the planet below
        pos = rocketCenter.clone().addScaledVector(_horiz, 11).addScaledVector(side, 7).addScaledVector(up, 24);
        look = rocketCenter.clone().addScaledVector(up, -2);
        break;
      default:
        return false;
    }
    this.mode = 'fixed';
    this.fixedPos.copy(pos);
    this.fixedLook.copy(look);
    this.snapTo(pos, look);
    return true;
  }
}
