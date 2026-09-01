// Jungle biome — a Three.js WebGPURenderer + TSL graphics stress test.

import * as THREE from 'three/webgpu';
import { QUALITY_PRESETS, detectQualityName, isWebGLForced, WORLD } from './config.js';
import { createHud } from './hud.js';
import { createAllTextures } from './textures.js';
import { createTerrain } from './terrain.js';
import { createSky } from './sky.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createVegetation } from './vegetation.js';
import { createWater } from './water.js';

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
  ctx.water?.applyQuality(preset);
  ctx.particles?.applyQuality(preset);
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
  ctx.camera = new THREE.PerspectiveCamera(66, window.innerWidth / window.innerHeight, 0.1, 900);
  ctx.camera.position.set(WORLD.spawn.x, 4, WORLD.spawn.z);
  ctx.scene.add(ctx.camera);

  // ---------- build the world ----------
  ctx.textures = await loadStep(0.1, 'painting textures', () => createAllTextures());

  await loadStep(0.3, 'raising terrain', () => {
    ctx.terrain = createTerrain(ctx);
    ctx.scene.add(ctx.terrain.mesh);
  });

  await loadStep(0.4, 'lighting the sun', () => {
    ctx.sky = createSky(ctx);
  });

  await loadStep(0.55, 'growing the jungle', () => {
    ctx.vegetation = createVegetation(ctx);
    ctx.updatables.push(ctx.vegetation);
  });

  await loadStep(0.7, 'waking the player', () => {
    ctx.input = createInput(ctx);
    ctx.player = createPlayer(ctx);
  });

  await loadStep(0.85, 'filling the lagoon', () => {
    ctx.water = createWater(ctx);
    ctx.updatables.push(ctx.water);
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
      ? 'left thumb to walk — right thumb to look — double-tap right side to jump'
      : 'click to look around — WASD to walk — shift to sprint — space to jump',
    9000
  );

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
