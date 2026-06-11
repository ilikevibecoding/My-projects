import * as THREE from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';

/**
 * Golden-hour sky: HDRI environment (IBL + background) plus a matched warm
 * directional sun for crisp long shadows, and exp2 haze for aerial depth.
 *
 * HDRI candidate is switchable for A/B testing: ?hdri=belfast_sunset_puresky
 * Sun azimuth/elevation are matched per-HDRI below.
 */

// Sun angles measured from the actual HDR pixels via scripts/find-sun.mjs —
// the manual DirectionalLight lines up with the visible sun disc.
const HDRI_PRESETS = {
  kloppenheim_02_puresky: {
    // bright true-HDR sun at golden-hour elevation — primary choice
    azimuthDeg: 54.4,
    elevationDeg: 17.1,
    sunColor: 0xffd9a8,
    sunIntensity: 11,
    envIntensity: 0.9,
    backgroundIntensity: 1.0,
    fogColor: 0xd8c3a0,
    fogDensity: 0.0045,
  },
  belfast_sunset_puresky: {
    // beautiful sky but the baked sun is dim (maxLum ~30) — needs a strong manual sun
    azimuthDeg: 45.1,
    elevationDeg: 6.5, // measured 3.6°, nudged up so light clears the treeline
    sunColor: 0xffb877,
    sunIntensity: 16,
    envIntensity: 1.0,
    backgroundIntensity: 1.0,
    fogColor: 0xc8a983,
    fogDensity: 0.005,
  },
  autumn_field_puresky: {
    azimuthDeg: 53.8,
    elevationDeg: 29.1,
    sunColor: 0xffe2b8,
    sunIntensity: 10,
    envIntensity: 0.9,
    backgroundIntensity: 1.0,
    fogColor: 0xd6c2a2,
    fogDensity: 0.0045,
  },
};

export const DEFAULT_HDRI = 'kloppenheim_02_puresky';
export const SUN_AZIMUTH_DEG = 54.4; // used by vegetation to keep a light corridor

export async function buildSky(scene, renderer, hdriName = DEFAULT_HDRI) {
  const preset = HDRI_PRESETS[hdriName] ?? HDRI_PRESETS[DEFAULT_HDRI];

  const hdr = await new HDRLoader().loadAsync(`./assets/env/${hdriName}_4k.hdr`);
  hdr.mapping = THREE.EquirectangularReflectionMapping;

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envMap = pmrem.fromEquirectangular(hdr).texture;
  scene.environment = envMap;
  scene.environmentIntensity = preset.envIntensity;
  scene.background = hdr;
  scene.backgroundIntensity = preset.backgroundIntensity;
  pmrem.dispose();

  // --- matched sun ---
  const az = THREE.MathUtils.degToRad(preset.azimuthDeg);
  const el = THREE.MathUtils.degToRad(preset.elevationDeg);
  const dist = 220;
  const sunDir = new THREE.Vector3(
    Math.cos(el) * Math.sin(az),
    Math.sin(el),
    Math.cos(el) * Math.cos(az)
  );

  const sun = new THREE.DirectionalLight(preset.sunColor, preset.sunIntensity);
  sun.position.copy(sunDir).multiplyScalar(dist);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  const ext = 55; // shadowed play area half-extent
  sun.shadow.camera.left = -ext;
  sun.shadow.camera.right = ext;
  sun.shadow.camera.top = ext;
  sun.shadow.camera.bottom = -ext;
  sun.shadow.camera.near = 60;
  sun.shadow.camera.far = 420;
  sun.shadow.bias = -0.00035;
  sun.shadow.normalBias = 0.4;
  sun.shadow.radius = 2.0;
  scene.add(sun);
  scene.add(sun.target);

  // --- aerial perspective ---
  scene.fog = new THREE.FogExp2(preset.fogColor, preset.fogDensity);

  return { sun, sunDir, preset };
}
