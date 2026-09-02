// Jungle biome — a Three.js WebGPURenderer + TSL graphics stress test.

import * as THREE from 'three/webgpu';
import { QUALITY_PRESETS, detectQualityName, isWebGLForced, WORLD } from './config.js';
import { createHud } from './hud.js';
import { createAllTexturesWithNormals } from './textures.js';
import { createTerrain } from './terrain.js';
import { createBackdrop } from './backdrop.js';
import { createSky } from './sky.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createVegetation } from './vegetation.js';
import { createLandmarks } from './landmarks.js';
import { createWater } from './water.js';
import { createParticles } from './particles.js';
import { createPost } from './post.js';
import { createAudio } from './audio.js';

const ctx = {
  renderer: null,
  scene: null,
  camera: null,
  canvas: document.getElementById('scene'),
  hud: null,
  textures: null,
  terrain: null,
  sky: null,
  input: null,
  player: null,
  water: null,
  vegetation: null,
  particles: null,
  post: null,
  audio: null,
  qualityName: detectQualityName(),
  quality: null,
  updatables: [],
  time: 0,
};

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

async function loadStep(fraction, label, build) {
  ctx.hud.setLoading(fraction, label);
  await nextFrame();
  const result = build ? build() : null;
  await nextFrame();
  return result;
}

function applyQuality(name) {
  ctx.qualityName = name;
  ctx.quality = QUALITY_PRESETS[name];
  const preset = ctx.quality;

  ctx.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, preset.pixelRatioCap));
  ctx.renderer.setSize(window.innerWidth, window.innerHeight);
  ctx.sky?.applyQuality(preset);
  ctx.vegetation?.applyQuality(preset);
  ctx.landmarks?.applyQuality(preset);
  ctx.water?.applyQuality(preset);
  ctx.particles?.applyQuality(preset);
  ctx.audio?.applyQuality?.(preset);
  ctx.post?.applyQuality(preset);
  ctx.hud.setActiveQuality(name);
}

async function init() {
  ctx.hud = createHud();
  ctx.hud.setLoading(0.02, 'starting renderer');

  let renderer;
  try {
    renderer = new THREE.WebGPURenderer({
      canvas: ctx.canvas,
      antialias: true,
      forceWebGL: isWebGLForced(),
    });
    await renderer.init();
  } catch (error) {
    console.error('renderer init failed', error);
    ctx.hud.fatal(`${error.message || error}`);
    return;
  }

  ctx.renderer = renderer;

  // If the WebGPU device dies (some headless/software environments destroy it),
  // transparently retry on the WebGL 2 fallback instead of showing a dead canvas.
  window.addEventListener('pagehide', () => {
    ctx.intentionalTeardown = true;
  });
  const device = renderer.backend?.device;
  if (device?.lost && !isWebGLForced()) {
    device.lost.then((info) => {
      if (info.reason !== 'destroyed' || ctx.intentionalTeardown) {
        return;
      }
      console.warn('WebGPU device lost — falling back to WebGL2', info.message);
      const url = new URL(window.location.href);
      url.searchParams.set('webgl', '');
      window.location.replace(url.toString());
    });
  }

  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const isWebGPU = Boolean(renderer.backend?.isWebGPUBackend);
  ctx.hud.setBackend(isWebGPU);
  ctx.isWebGPU = isWebGPU;

  ctx.scene = new THREE.Scene();
  // far plane covers the sky dome + backdrop rings from anywhere on the map
  ctx.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1600);
  ctx.camera.position.set(WORLD.spawn.x, 4, WORLD.spawn.z);
  ctx.scene.add(ctx.camera);

  // ---------- build the world ----------
  ctx.textures = await loadStep(0.1, 'painting textures', () => createAllTexturesWithNormals());

  await loadStep(0.3, 'raising terrain', () => {
    ctx.terrain = createTerrain(ctx);
    ctx.scene.add(ctx.terrain.mesh);
    ctx.backdrop = createBackdrop(ctx);
  });

  await loadStep(0.4, 'lighting the sun', () => {
    ctx.sky = createSky(ctx);
  });

  // landmarks first: vegetation keeps its trunks clear of their footprints
  await loadStep(0.5, 'raising the ruins', () => {
    ctx.landmarks = createLandmarks(ctx);
    ctx.updatables.push(ctx.landmarks);
  });

  await loadStep(0.58, 'growing the jungle', () => {
    ctx.vegetation = createVegetation(ctx);
    ctx.updatables.push(ctx.vegetation);
  });

  await loadStep(0.7, 'waking the player', () => {
    ctx.input = createInput(ctx);
    ctx.player = createPlayer(ctx);
  });

  await loadStep(0.8, 'filling the lagoon', () => {
    ctx.water = createWater(ctx);
    ctx.updatables.push(ctx.water);
    // shore boulders are placed by the water module, after planting
    ctx.vegetation?.cullNear?.((ctx.water.rockSpots ?? []).filter((r) => r.s >= 0.45).map((r) => ({ x: r.x, z: r.z, r: r.s * 1.05 })));
  });

  await loadStep(0.9, 'releasing the butterflies', () => {
    ctx.particles = createParticles(ctx);
    ctx.updatables.push(ctx.particles);
    ctx.audio = createAudio(ctx);
    ctx.updatables.push(ctx.audio);
  });

  await loadStep(0.96, 'polishing the light', () => {
    ctx.post = createPost(ctx);
    ctx.updatables.push(ctx.post);
  });

  applyQuality(ctx.qualityName);

  ctx.hud.onQualityChange((name) => applyQuality(name));
  ctx.hud.setMuted(true);
  ctx.hud.onMuteToggle(() => {
    if (ctx.audio) {
      ctx.hud.setMuted(ctx.audio.toggle());
    }
  });

  window.addEventListener('resize', () => {
    ctx.camera.aspect = window.innerWidth / window.innerHeight;
    ctx.camera.updateProjectionMatrix();
    ctx.renderer.setSize(window.innerWidth, window.innerHeight);
  });

  ctx.hud.finishLoading();
  ctx.hud.showHint(
    ctx.input.state.isTouch
      ? 'left thumb to walk (push to the rim to sprint) — right thumb to look — double-tap right side to jump'
      : 'click to look around — WASD to walk — shift to sprint — space to jump',
    9000
  );
  ctx.input.onGamepadConnected?.(() => {
    ctx.hud.showHint('gamepad: left stick walk — right stick look — A jump — click left stick / right trigger sprint', 7000);
  });

  // ---------- place discovery (authored zones get a name when first entered) ----------
  const PLACES = [
    { key: 'overlook', name: 'The Overlook', threshold: 0.55 },
    { key: 'ravine', name: 'Root Ravine', threshold: 0.6 },
    { key: 'terrace', name: 'The Terraces', threshold: 0.6 },
    { key: 'clearing', name: 'Sunlit Clearing', threshold: 0.6 },
    { key: 'ruins', name: 'The Forgotten Shrine', threshold: 0.6 },
  ];
  const discovered = new Set();
  let placeTimer = 0;
  function pollPlaces(dt) {
    placeTimer -= dt;
    if (placeTimer > 0 || ctx.hud.placeVisible) {
      return;
    }
    placeTimer = 0.5;
    const p = ctx.player.position;
    const zones = ctx.terrain.zonesAt(p.x, p.z);
    for (const place of PLACES) {
      if (!discovered.has(place.key) && zones[place.key] > place.threshold) {
        discovered.add(place.key);
        ctx.hud.showPlace(place.name);
        return;
      }
    }
    // point landmarks
    const POINTS = [
      ['lagoon', 'Emerald Lagoon', WORLD.lagoonCenter.x, WORLD.lagoonCenter.z, WORLD.lagoonRadius + 4],
      ['falls', 'The Falls', WORLD.waterfallX, -78, 14],
      ['giant', 'The Elder Kapok', WORLD.giantTree.x, WORLD.giantTree.z, 16],
      ['snag', 'The Sentinel', WORLD.sentinelSnag.x, WORLD.sentinelSnag.z, 12],
      ['bridge', 'Fallen Log Crossing', 7, 36, 9],
    ];
    for (const [key, name, x, z, radius] of POINTS) {
      if (!discovered.has(key) && Math.hypot(p.x - x, p.z - z) < radius) {
        discovered.add(key);
        ctx.hud.showPlace(name);
        return;
      }
    }
  }

  // ---------- frame loop ----------
  const timer = new THREE.Timer();
  let fpsAccum = 0;
  let fpsFrames = 0;
  let fpsTimer = 0;

  renderer.setAnimationLoop(() => {
    timer.update();
    const dt = Math.min(timer.getDelta(), 0.05);
    ctx.time += dt;

    ctx.player.update(dt);
    ctx.sky.update(dt);
    for (const updatable of ctx.updatables) {
      updatable.update(dt, ctx.time);
    }
    document.body.classList.toggle('is-underwater', ctx.player.headUnderwater);
    pollPlaces(dt);

    if (ctx.post) {
      ctx.post.render();
    } else {
      renderer.render(ctx.scene, ctx.camera);
    }

    // fps meter
    fpsAccum += dt;
    fpsFrames += 1;
    fpsTimer += dt;
    if (fpsTimer > 0.5) {
      ctx.hud.setFps(fpsFrames / fpsAccum);
      fpsAccum = 0;
      fpsFrames = 0;
      fpsTimer = 0;
    }
  });
}

init();

// expose for headless testing + console debugging
window.__jungle = ctx;
window.__THREE = THREE;
import('three/tsl').then((tsl) => {
  window.__TSL = tsl;
});
