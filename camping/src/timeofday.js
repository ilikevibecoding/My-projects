// Three time-of-day presets driving sun/moon, hemisphere, fog, sky, post.
import * as THREE from 'three';
import { lerp } from './noise.js';

export const PRESETS = {
  day: {
    sunDir: new THREE.Vector3(0.55, 0.72, 0.42).normalize(),
    sunColor: new THREE.Color(0xfff1d6),
    sunIntensity: 3.0,
    moonIntensity: 0.0,
    hemiSky: new THREE.Color(0xa8c8ee),
    hemiGround: new THREE.Color(0x8d8166),
    hemiIntensity: 0.55,
    fogColor: new THREE.Color(0xc4d7e4),
    fogDensity: 0.00135,
    skyTop: new THREE.Color(0x3573c9),
    skyHorizon: new THREE.Color(0xc9dcea),
    skyBottom: new THREE.Color(0x93a8ba),
    cloudColor: new THREE.Color(0xffffff),
    cloudShadow: new THREE.Color(0x9aaac2),
    cloudAmount: 0.42,
    starIntensity: 0.0,
    exposure: 1.0,
    bloomStrength: 0.22,
    bloomThreshold: 1.0,
  },
  golden: {
    sunDir: new THREE.Vector3(-0.82, 0.16, 0.36).normalize(),
    sunColor: new THREE.Color(0xffae52),
    sunIntensity: 2.6,
    moonIntensity: 0.0,
    hemiSky: new THREE.Color(0xeec9a2),
    hemiGround: new THREE.Color(0x6e5743),
    hemiIntensity: 0.42,
    fogColor: new THREE.Color(0xeac291),
    fogDensity: 0.0017,
    skyTop: new THREE.Color(0x4a6c9c),
    skyHorizon: new THREE.Color(0xf5b873),
    skyBottom: new THREE.Color(0xb98a64),
    cloudColor: new THREE.Color(0xffd9a8),
    cloudShadow: new THREE.Color(0x9a7a88),
    cloudAmount: 0.5,
    starIntensity: 0.0,
    exposure: 1.0,
    bloomStrength: 0.32,
    bloomThreshold: 0.95,
  },
  night: {
    sunDir: new THREE.Vector3(0.35, 0.58, -0.55).normalize(), // moon as key
    sunColor: new THREE.Color(0x9db8e8),
    sunIntensity: 0.5,
    moonIntensity: 1.0,
    hemiSky: new THREE.Color(0x27395c),
    hemiGround: new THREE.Color(0x101522),
    hemiIntensity: 0.32,
    fogColor: new THREE.Color(0x0e1726),
    fogDensity: 0.002,
    skyTop: new THREE.Color(0x060b18),
    skyHorizon: new THREE.Color(0x1a2942),
    skyBottom: new THREE.Color(0x0a1020),
    cloudColor: new THREE.Color(0x33415e),
    cloudShadow: new THREE.Color(0x141d30),
    cloudAmount: 0.28,
    starIntensity: 1.0,
    exposure: 1.0,
    bloomStrength: 0.5,
    bloomThreshold: 0.85,
  },
};

export const PRESET_ORDER = ['day', 'golden', 'night'];

export class TimeOfDay {
  constructor({ sun, hemi, skyUniforms, scene, post }) {
    this.sun = sun;
    this.hemi = hemi;
    this.skyUniforms = skyUniforms;
    this.scene = scene;
    this.post = post;
    this.current = 'day';
    this._from = null;
    this._to = null;
    this._t = 1;
    this._dur = 1.6;
    this.apply(PRESETS.day, PRESETS.day, 1);
  }

  set(name, instant = false) {
    if (!PRESETS[name]) return;
    if (instant) {
      this.current = name;
      this._from = this._to = null;
      this._t = 1;
      this.apply(PRESETS[name], PRESETS[name], 1);
      return;
    }
    this._from = PRESETS[this.current];
    this._to = PRESETS[name];
    this.current = name;
    this._t = 0;
  }

  next() {
    const i = PRESET_ORDER.indexOf(this.current);
    const nxt = PRESET_ORDER[(i + 1) % PRESET_ORDER.length];
    this.set(nxt);
    return nxt;
  }

  update(dt) {
    if (this._t < 1 && this._from && this._to) {
      this._t = Math.min(1, this._t + dt / this._dur);
      this.apply(this._from, this._to, this._t);
    }
  }

  apply(a, b, t) {
    const col = (ca, cb) => new THREE.Color().copy(ca).lerp(cb, t);
    const sunDir = a.sunDir.clone().lerp(b.sunDir, t).normalize();

    this.sun.color.copy(col(a.sunColor, b.sunColor));
    this.sun.intensity = lerp(a.sunIntensity, b.sunIntensity, t);
    this._sunDir = sunDir;

    this.hemi.color.copy(col(a.hemiSky, b.hemiSky));
    this.hemi.groundColor.copy(col(a.hemiGround, b.hemiGround));
    this.hemi.intensity = lerp(a.hemiIntensity, b.hemiIntensity, t);

    this.scene.fog.color.copy(col(a.fogColor, b.fogColor));
    this.scene.fog.density = lerp(a.fogDensity, b.fogDensity, t);

    const u = this.skyUniforms;
    u.uTopColor.value.copy(col(a.skyTop, b.skyTop));
    u.uHorizonColor.value.copy(col(a.skyHorizon, b.skyHorizon));
    u.uBottomColor.value.copy(col(a.skyBottom, b.skyBottom));
    u.uSunDir.value.copy(sunDir);
    u.uSunColor.value.copy(col(a.sunColor, b.sunColor));
    u.uSunIntensity.value = lerp(1 - a.moonIntensity, 1 - b.moonIntensity, t); // sun disk hides when moon is up
    u.uMoonIntensity.value = lerp(a.moonIntensity, b.moonIntensity, t);
    // moon sits opposite-ish the sun azimuth, fixed elevation; at night the
    // "sun" light IS the moon, so the visible moon disk follows sunDir.
    u.uMoonDir.value.copy(sunDir);
    u.uStarIntensity.value = lerp(a.starIntensity, b.starIntensity, t);
    u.uCloudAmount.value = lerp(a.cloudAmount, b.cloudAmount, t);
    u.uCloudColor.value.copy(col(a.cloudColor, b.cloudColor));
    u.uCloudShadow.value.copy(col(a.cloudShadow, b.cloudShadow));

    if (this.post) {
      this.post.setExposure(lerp(a.exposure, b.exposure, t));
      this.post.setBloom(lerp(a.bloomStrength, b.bloomStrength, t), lerp(a.bloomThreshold, b.bloomThreshold, t));
    }
  }

  get sunDir() {
    return this._sunDir;
  }

  get isNight() {
    return this.current === 'night';
  }
}
