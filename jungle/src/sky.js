// Sky dome, sun, fill lighting and fog — bright tropical late morning.

import * as THREE from 'three/webgpu';
import { SkyMesh } from 'three/addons/objects/SkyMesh.js';
import { WORLD } from './config.js';

export function createSky(ctx) {
  const { scene } = ctx;

  // ---------- sky dome ----------
  const sky = new SkyMesh();
  sky.scale.setScalar(800); // must stay inside the camera far plane
  sky.material.fog = false; // never fog the sky dome itself
  sky.turbidity.value = 2.0;
  sky.rayleigh.value = 1.0;
  sky.mieCoefficient.value = 0.001;
  sky.mieDirectionalG.value = 0.7;
  // The dome is scaled to 800 (not the 450k of the three.js example), so the
  // cloud uv scale must compensate or the whole dome reads as one white cloud.
  sky.cloudScale.value = 0.11;
  sky.cloudCoverage.value = 0.3;
  sky.cloudDensity.value = 0.42;
  sky.cloudSpeed.value = 0.02;
  scene.add(sky);

  const sunDirection = new THREE.Vector3();
  const phi = THREE.MathUtils.degToRad(90 - WORLD.sunElevation);
  const theta = THREE.MathUtils.degToRad(WORLD.sunAzimuth);
  sunDirection.setFromSphericalCoords(1, phi, theta);
  sky.sunPosition.value.copy(sunDirection);

  // ---------- sun light ----------
  const sun = new THREE.DirectionalLight(0xfff3d8, 5.0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 260;
  sun.shadow.camera.left = -85;
  sun.shadow.camera.right = 85;
  sun.shadow.camera.top = 85;
  sun.shadow.camera.bottom = -85;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.06;
  scene.add(sun);
  scene.add(sun.target);

  // ---------- ambient fill ----------
  const hemi = new THREE.HemisphereLight(0xbfe3ff, 0x3c5a2c, 1.3);
  scene.add(hemi);

  // ---------- fog ----------
  scene.fog = new THREE.Fog(new THREE.Color(WORLD.fogColor), 60, 420);

  // Keep the shadow frustum and sky dome centered on the player.
  const sunOffset = sunDirection.clone().multiplyScalar(130);

  function update() {
    const target = ctx.player ? ctx.player.position : ctx.camera.position;
    sun.position.set(target.x + sunOffset.x, target.y + sunOffset.y, target.z + sunOffset.z);
    sun.target.position.set(target.x, 0, target.z);
    sky.position.set(target.x, 0, target.z);
  }

  function applyQuality(preset) {
    sun.shadow.mapSize.set(preset.shadowMapSize, preset.shadowMapSize);
    if (sun.shadow.map) {
      sun.shadow.map.dispose();
      sun.shadow.map = null;
    }
    sun.castShadow = preset.shadowsEnabled;
  }

  return { sky, sun, hemi, sunDirection, update, applyQuality };
}
