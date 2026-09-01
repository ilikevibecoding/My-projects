// Post-processing with the new node-based PostProcessing stack:
// scene pass → custom radial god rays → bloom → color grade + vignette → FXAA.

import * as THREE from 'three/webgpu';
import {
  pass,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
  float,
  luminance,
  smoothstep,
  mix,
  clamp,
  pow,
  max,
  Fn,
  Loop,
  renderOutput,
} from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { fxaa } from 'three/addons/tsl/display/FXAANode.js';

export function createPost(ctx) {
  const { renderer, scene, camera } = ctx;

  const postProcessing = new THREE.RenderPipeline(renderer);
  // We tone-map mid-chain ourselves (before FXAA), not at the very end.
  postProcessing.outputColorTransform = false;

  const scenePass = pass(scene, camera);
  const sceneColor = scenePass.getTextureNode('output');
  const sceneDepth = scenePass.getTextureNode('depth');

  // ---------- god rays (screen-space radial scattering from the sun) ----------
  const sunScreen = uniform(new THREE.Vector2(0.5, 0.8));
  const sunVisibility = uniform(0); // 1 when the sun is on/near screen, fades out
  const godRayStrength = uniform(0.5);

  const godRays = Fn(() => {
    const NUM_TAPS = 22;
    const density = 0.92;
    const decayBase = 0.93;

    const delta = sunScreen.sub(uv()).mul(density / NUM_TAPS);
    const accum = float(0).toVar();
    const decay = float(1).toVar();
    const sampleUV = uv().toVar();

    Loop({ start: 0, end: NUM_TAPS, type: 'int' }, () => {
      sampleUV.addAssign(delta);
      const clamped = clamp(sampleUV, vec2(0), vec2(1));
      const c = sceneColor.sample(clamped);
      const bright = smoothstep(0.85, 1.9, luminance(c.rgb));
      // shafts only stream from around the sun itself, not the whole sky
      const nearSun = smoothstep(0.5, 0.12, clamped.sub(sunScreen).length());
      accum.addAssign(bright.mul(nearSun).mul(decay));
      decay.mulAssign(decayBase);
    });

    const rays = accum.div(NUM_TAPS).mul(godRayStrength).mul(sunVisibility);
    // warm sunlight color
    return vec3(1.0, 0.93, 0.72).mul(rays);
  })();

  // ---------- bloom ----------
  // The HDR sky dome is brighter than any threshold — mask it out via scene
  // depth (dome sits at ~800 m) so only real highlights bloom: water glints,
  // waterfall whites, flowers in sunlight.
  const notSky = smoothstep(0.9998, 0.99996, sceneDepth).oneMinus();
  const bloomInput = sceneColor.rgb.mul(notSky);
  const bloomPass = bloom(bloomInput, 0.45, 0.4, 1.1);

  // ---------- compose + grade ----------
  const composed = Fn(() => {
    let color = sceneColor.rgb.add(bloomPass.rgb).add(godRays);

    // gentle saturation lift (keeps the jungle lush after tone mapping)
    const gray = luminance(color);
    color = mix(vec3(gray), color, 1.16);

    // vignette
    const offset = uv().sub(0.5);
    const vig = smoothstep(0.92, 0.32, offset.length());
    color = color.mul(mix(float(0.72), float(1.0), vig));

    return vec4(color, 1);
  })();

  // tone mapping + sRGB conversion, then FXAA on the LDR image
  const graded = renderOutput(composed);
  const withFxaa = fxaa(graded);
  const noFxaa = graded;

  postProcessing.outputNode = withFxaa;
  let usingFxaa = true;

  // ---------- sun screen-position tracking ----------
  const sunWorld = new THREE.Vector3();
  const projected = new THREE.Vector3();
  const cameraForward = new THREE.Vector3();

  function update() {
    // is the camera even looking toward the sun? (projected.z lies behind camera)
    camera.getWorldDirection(cameraForward);
    const facing = cameraForward.dot(ctx.sky.sunDirection);
    if (facing <= 0.05) {
      sunVisibility.value = 0;
      return;
    }

    sunWorld.copy(ctx.sky.sunDirection).multiplyScalar(600).add(camera.position);
    projected.copy(sunWorld).project(camera);
    const onScreenX = 1 - THREE.MathUtils.clamp(Math.abs(projected.x) - 0.85, 0, 1.1) / 1.1;
    const onScreenY = 1 - THREE.MathUtils.clamp(Math.abs(projected.y) - 0.85, 0, 1.1) / 1.1;
    sunVisibility.value = onScreenX * onScreenY * THREE.MathUtils.smoothstep(facing, 0.05, 0.35);
    sunScreen.value.set(projected.x * 0.5 + 0.5, projected.y * 0.5 + 0.5);
  }

  function render() {
    postProcessing.render();
  }

  function applyQuality(preset) {
    godRayStrength.value = preset.godRays ? 0.42 : 0;
    bloomPass.strength.value = preset.bloom ? preset.bloomStrength : 0;
    if (preset.fxaa !== usingFxaa) {
      usingFxaa = preset.fxaa;
      postProcessing.outputNode = usingFxaa ? withFxaa : noFxaa;
      postProcessing.needsUpdate = true;
    }
  }

  return {
    update,
    render,
    applyQuality,
    // debug hooks
    _bloom: bloomPass,
    _godRayStrength: godRayStrength,
    _sunVisibility: sunVisibility,
  };
}
