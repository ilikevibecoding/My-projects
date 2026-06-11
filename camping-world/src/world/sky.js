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
    sunIntensity: 18,
    envIntensity: 1.15,
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
    // warm late-afternoon sun, true-HDR disc, clear gold light — primary.
    // sun:env ≈ 5:1 for real sunny-day shadow contrast
    azimuthDeg: 53.8,
    elevationDeg: 29.1,
    sunColor: 0xffe0b0,
    sunIntensity: 16,
    envIntensity: 0.72, // opens shadow detail (R1) while sun still dominates
    backgroundIntensity: 1.0,
    fogColor: 0xd8c8a8,
    fogDensity: 0.0042,
  },
};

export const DEFAULT_HDRI = 'autumn_field_puresky';
export const SUN_AZIMUTH_DEG = 53.8; // used by vegetation to keep a light corridor

export async function buildSky(scene, renderer, hdriName = DEFAULT_HDRI) {
  const preset = { ...(HDRI_PRESETS[hdriName] ?? HDRI_PRESETS[DEFAULT_HDRI]) };

  // URL overrides for fast self-play tuning: ?sunel=35&sunaz=54&sunint=40&env=1.2&fog=0.004
  const q = new URLSearchParams(location.search);
  if (q.get('sunel')) preset.elevationDeg = parseFloat(q.get('sunel'));
  if (q.get('sunaz')) preset.azimuthDeg = parseFloat(q.get('sunaz'));
  if (q.get('sunint')) preset.sunIntensity = parseFloat(q.get('sunint'));
  if (q.get('env')) preset.envIntensity = parseFloat(q.get('env'));
  if (q.get('fog')) preset.fogDensity = parseFloat(q.get('fog'));

  const hdr = await new HDRLoader().loadAsync(`./assets/env/${hdriName}_4k.hdr`);
  hdr.mapping = THREE.EquirectangularReflectionMapping;

  // Soft-clamp HDR hot pixels (sun disc ≈ 65k) and enable mipmaps: without
  // mips the 4k equirect aliases into white "star" speckles at 1080p, and an
  // unclamped sun blooms entire mip levels white.
  {
    // 32: low enough that the PMREM environment carries almost no baked-sun
    // energy (the manual DirectionalLight owns ALL direct light + shadows),
    // high enough that the background sun disc still tone-maps to white.
    const data = hdr.image.data;
    if (data instanceof Uint16Array) {
      const MAX_HALF = 0x5000; // = 32.0 in half precision
      for (let i = 0; i < data.length; i++) {
        if ((data[i] & 0x7fff) > MAX_HALF && (data[i] & 0x8000) === 0) data[i] = MAX_HALF;
      }
    } else {
      for (let i = 0; i < data.length; i++) if (data[i] > 32) data[i] = 32;
    }
    hdr.generateMipmaps = true;
    hdr.minFilter = THREE.LinearMipmapLinearFilter;
    hdr.magFilter = THREE.LinearFilter;
    hdr.needsUpdate = true;
  }

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
  // CRITICAL: ortho frustum changes don't apply until this is called —
  // without it shadows only exist in the default ±5m box.
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.0002;
  sun.shadow.normalBias = 0.15;
  sun.shadow.radius = 1.5;
  scene.add(sun);
  scene.add(sun.target);

  // --- aerial perspective ---
  scene.fog = new THREE.FogExp2(preset.fogColor, preset.fogDensity);

  return { sun, sunDir, preset };
}
