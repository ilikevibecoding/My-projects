// Post-processing with the node-based RenderPipeline:
//   scene pass (color + depth; AO normals reconstructed from depth)
//   → GTAO (+ denoise)                       [High / Ultra]
//   → half-res depth-masked god rays          [Medium+]
//   → bloom (sky masked out via depth)        [preset.bloom]
//   → exposure + composite (HDR)
//   → tone mapping + filmic grade (contrast, split-tone, saturation)
//   → FXAA
//   → finish: sharpen, edge chromatic aberration, film grain, vignette.

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
  min,
  exp,
  hash,
  floor,
  length,
  normalize,
  Fn,
  Loop,
  renderOutput,
  convertToTexture,
  rtt,
  screenSize,
} from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { fxaa } from 'three/addons/tsl/display/FXAANode.js';
import { ao } from 'three/addons/tsl/display/GTAONode.js';
import { denoise } from 'three/addons/tsl/display/DenoiseNode.js';

export function createPost(ctx) {
  const { renderer, scene, camera } = ctx;

  const postProcessing = new THREE.RenderPipeline(renderer);
  // We tone-map mid-chain ourselves (before FXAA), not at the very end.
  postProcessing.outputColorTransform = false;

  // ---------- scene pass ----------
  // Color + depth only. AO normals are reconstructed from depth: an MRT normal
  // attachment is written with NoBlending, so every transparent sprite/leaf card
  // stamped its quad normal into the G-buffer and GTAO darkened a square around
  // it. Depth-derived normals cannot be corrupted that way (and we save the
  // extra attachment write in every material).
  const scenePass = pass(scene, camera);
  const sceneColor = scenePass.getTextureNode('output');
  const sceneNormal = null;
  const sceneDepth = scenePass.getTextureNode('depth');

  // The sky dome writes depth == 1 (z forced to w); everything else, even the
  // far terrain rim, lands measurably below that.
  const skyMask = smoothstep(0.99996, 0.999995, sceneDepth);
  const notSky = skyMask.oneMinus();

  // ---------- look / grade uniforms ----------
  // renderOutput() multiplies renderer.toneMappingExposure (0.95) on top of this
  const uExposure = uniform(0.95);
  const uContrast = uniform(0.2); // 0 = none, 1 = full S-curve
  const uSaturation = uniform(1.02);
  const uLift = uniform(0.02); // tiny black lift so deep shade keeps texture
  const uShadowTint = uniform(new THREE.Color(0.9, 1.0, 1.06));
  const uHighlightTint = uniform(new THREE.Color(1.04, 1.0, 0.93));
  const uVignette = uniform(0.32);
  const uGrain = uniform(0.028);
  const uSharpen = uniform(0.22);
  const uAberration = uniform(0.0016);
  const uAoStrength = uniform(0.7);
  const uFrame = uniform(0);

  // ---------- ambient occlusion ----------
  const aoPass = ao(sceneDepth, sceneNormal, camera);
  aoPass.resolutionScale = 0.5;
  aoPass.radius.value = 0.7;
  aoPass.thickness.value = 0.8;
  aoPass.distanceExponent.value = 1.3;
  aoPass.distanceFallOff.value = 1.0;
  aoPass.scale.value = 1.0;
  aoPass.samples.value = 16;
  const aoDenoised = denoise(aoPass.getTextureNode(), sceneDepth, sceneNormal, camera);
  aoDenoised.lumaPhi.value = 6;
  aoDenoised.depthPhi.value = 2.5;
  aoDenoised.normalPhi.value = 4;
  aoDenoised.radius.value = 4;
  // contact AO is a near-field effect: fade it out with distance so the
  // distant canopy does not collapse into black (linear depth is 0..1 over
  // camera near..far)
  const aoDistanceFade = smoothstep(0.03, 0.1, scenePass.getLinearDepthNode()).oneMinus();

  // ---------- god rays ----------
  // Screen-space radial gathering of the sky visible around the sun: the
  // canopy occludes it, so the streaks read as shafts through the leaves.
  // Rendered at half resolution (40 taps of depth) and upsampled bilinearly.
  const sunScreen = uniform(new THREE.Vector2(0.5, 0.8));
  const sunVisibility = uniform(0); // 1 when the sun is on/near screen, fades out
  const godRayStrength = uniform(0.0);
  const rayFlicker = uniform(1.0);

  const godRaysSource = Fn(() => {
    const NUM_TAPS = 40;
    const density = 0.95;
    const decayBase = 0.955;

    const startUV = uv();
    const delta = sunScreen.sub(startUV).mul(density / NUM_TAPS);
    const accum = float(0).toVar();
    const decay = float(1).toVar();
    const sampleUV = startUV.toVar();

    Loop({ start: 0, end: NUM_TAPS, type: 'int' }, () => {
      sampleUV.addAssign(delta);
      const clamped = clamp(sampleUV, vec2(0.001), vec2(0.999));
      const sky = smoothstep(0.99996, 0.999995, sceneDepth.sample(clamped).r);
      // radiance: brightest right at the sun, fading over ~half the screen
      const toSun = clamped.sub(sunScreen);
      const radial = smoothstep(0.0, 0.62, length(toSun)).oneMinus();
      const disc = exp(toSun.lengthSq().mul(-180));
      accum.addAssign(sky.mul(radial.mul(radial).add(disc.mul(1.6))).mul(decay));
      decay.mulAssign(decayBase);
    });

    const rays = accum.div(NUM_TAPS);
    return vec4(rays, rays, rays, 1);
  })();
  const godRaysRTT = rtt(godRaysSource, 640, 360);
  godRaysRTT.value.minFilter = THREE.LinearFilter;
  godRaysRTT.value.magFilter = THREE.LinearFilter;

  // ---------- bloom ----------
  // The HDR sky dome is brighter than any threshold — mask it out via scene
  // depth so only real highlights bloom: water glints, waterfall whites, sunlit
  // flowers, hot patches of ground. Fed exposure-scaled so the threshold is in
  // display-relative units.
  const bloomInput = sceneColor.rgb.mul(uExposure).mul(notSky);
  // bloom(input, strength, radius, threshold) — strength is set per preset
  const bloomPass = bloom(bloomInput, 0.45, 0.55, 1.4);

  // ---------- chain builder ----------
  const chains = new Map();
  // ACES keeps the punch and rolls highlights off with a little desaturation;
  // the exposure below is what stops the grass from going neon.
  let toneMappingMode = THREE.ACESFilmicToneMapping;

  function buildChain({ useAO, useRays, useFxaa, useBloom }) {
    const composed = Fn(() => {
      let color = sceneColor.rgb;

      if (useAO) {
        // occlusion mostly eats ambient light: let it bite in the shade and
        // release its grip on directly sunlit (bright) pixels
        const sunlit = smoothstep(0.25, 1.4, luminance(color.mul(uExposure)));
        const weight = uAoStrength.mul(notSky).mul(aoDistanceFade).mul(sunlit.mul(-0.65).add(1.0));
        const occlusion = mix(float(1), aoDenoised.r, weight);
        color = color.mul(occlusion);
      }

      color = color.mul(uExposure);
      if (useBloom) {
        // gentle warm chromatic bloom (a preset without bloom skips the whole
        // mip chain rather than rendering it at strength 0)
        color = color.add(bloomPass.rgb.mul(vec3(1.0, 0.94, 0.84)));
      }

      if (useRays) {
        // shafts read against occluders (canopy, ground); on open sky the
        // gather is just a halo that would push the HDR sky to white, so it
        // only gets a third of the strength there
        const onto = mix(float(0.35), float(1), notSky);
        const rays = godRaysRTT.r.mul(godRayStrength).mul(sunVisibility).mul(rayFlicker).mul(onto);
        color = color.add(vec3(1.0, 0.86, 0.6).mul(rays));
      }

      return vec4(color, 1);
    })();

    // tone mapping + sRGB
    const ldr = renderOutput(composed, toneMappingMode, THREE.SRGBColorSpace);

    const graded = Fn(() => {
      let color = ldr.rgb;

      // filmic contrast: blend toward an S-curve around mid gray, then a
      // tiny lift so the deepest shade never turns to solid black
      const curve = smoothstep(0.0, 1.0, color);
      color = mix(color, curve, uContrast);
      color = color.mul(float(1).sub(uLift)).add(uLift);

      // split toning: cool green-blue shade, warm sunlit highlights
      const luma = luminance(color);
      const tone = mix(uShadowTint, uHighlightTint, smoothstep(0.18, 0.82, luma));
      color = color.mul(tone);

      // saturation
      color = mix(vec3(luminance(color)), color, uSaturation);

      return vec4(clamp(color, 0.0, 1.0), 1);
    })();

    const aaNode = useFxaa ? fxaa(graded) : graded;
    const aaTex = convertToTexture(aaNode);

    // finishing pass: sharpen, edge chromatic aberration, grain, vignette
    const finish = Fn(() => {
      const screenUV = uv();
      const texel = vec2(1).div(screenSize);

      const center = aaTex.sample(screenUV).rgb;
      const n = aaTex.sample(screenUV.add(vec2(0, texel.y))).rgb;
      const s = aaTex.sample(screenUV.sub(vec2(0, texel.y))).rgb;
      const e = aaTex.sample(screenUV.add(vec2(texel.x, 0))).rgb;
      const w = aaTex.sample(screenUV.sub(vec2(texel.x, 0))).rgb;

      // unsharp mask, clamped to the neighbourhood to avoid ringing
      const blur = n.add(s).add(e).add(w).mul(0.25);
      const sharpened = center.add(center.sub(blur).mul(uSharpen));
      const lo = min(min(min(n, s), min(e, w)), center);
      const hi = max(max(max(n, s), max(e, w)), center);
      let color = clamp(sharpened, lo, hi);

      // chromatic aberration only at the extreme frame edges
      const offset = screenUV.sub(0.5);
      const radius = length(offset).mul(1.41421);
      const edge = smoothstep(0.68, 1.0, radius);
      const shift = normalize(offset.add(vec2(1e-5))).mul(uAberration.mul(edge));
      const red = aaTex.sample(screenUV.add(shift)).r;
      const blue = aaTex.sample(screenUV.sub(shift)).b;
      color = mix(color, vec3(red, color.g, blue), edge);

      // animated fine film grain, weaker in the highlights
      const px = floor(screenUV.mul(screenSize));
      const seed = px.x.add(px.y.mul(4099.0)).add(uFrame.mul(7919.0));
      const grain = hash(seed).sub(0.5);
      const grainAmount = uGrain.mul(luminance(color).mul(-0.6).add(1.0));
      color = color.add(grain.mul(grainAmount));

      // vignette
      const vig = smoothstep(0.3, 0.98, radius).oneMinus();
      color = color.mul(mix(float(1).sub(uVignette), float(1), vig));

      return vec4(clamp(color, 0.0, 1.0), 1);
    })();

    return finish;
  }

  const chainKey = (flags) =>
    `${flags.useAO ? 'ao' : ''}-${flags.useRays ? 'rays' : ''}-${flags.useFxaa ? 'fxaa' : ''}-${flags.useBloom ? 'bloom' : ''}`;

  function getChain(flags) {
    const key = chainKey(flags);
    let chain = chains.get(key);
    if (!chain) {
      chain = buildChain(flags);
      chains.set(key, chain);
    }
    return chain;
  }

  let currentKey = null;
  let currentFlags = { useAO: true, useRays: true, useFxaa: true, useBloom: true };
  function setChain(flags) {
    flags = { useBloom: true, ...flags };
    const chain = getChain(flags);
    const key = `${chainKey(flags)}${toneMappingMode}`;
    currentFlags = flags;
    if (key !== currentKey) {
      currentKey = key;
      postProcessing.outputNode = chain;
      postProcessing.needsUpdate = true;
    }
  }
  setChain(currentFlags);

  // debug: swap the tone mapping curve at runtime (rebuilds the chain)
  function setToneMapping(mode) {
    toneMappingMode = mode;
    chains.clear();
    currentKey = null;
    setChain(currentFlags);
  }

  // debug: visualize an intermediate buffer ('ao' | 'aoRaw' | 'rays' | 'normal' | 'depth'), or 'off'
  function debugView(name) {
    let node = null;
    if (name === 'ao') node = vec4(vec3(aoDenoised.r), 1);
    else if (name === 'aoRaw') node = vec4(vec3(aoPass.getTextureNode().r), 1);
    else if (name === 'rays') node = vec4(vec3(godRaysRTT.r.mul(sunVisibility)), 1);
    else if (name === 'normal' && sceneNormal) node = vec4(sceneNormal.rgb.mul(0.5).add(0.5), 1);
    else if (name === 'depth') node = vec4(vec3(skyMask), 1);
    if (node) {
      postProcessing.outputNode = node;
    } else {
      postProcessing.outputNode = getChain(currentFlags);
    }
    postProcessing.needsUpdate = true;
  }

  // ---------- per-frame ----------
  const sunWorld = new THREE.Vector3();
  const projected = new THREE.Vector3();
  const cameraForward = new THREE.Vector3();
  const drawSize = new THREE.Vector2();
  let frame = 0;

  function update(dt, time = 0) {
    frame += 1;
    uFrame.value = frame % 1024;

    // slow, deterministic flicker so the shafts feel alive
    rayFlicker.value =
      0.86 +
      0.14 * (0.5 * Math.sin(time * 1.31) + 0.3 * Math.sin(time * 2.71 + 1.0) + 0.2 * Math.sin(time * 0.61 + 2.3));

    // keep the god-ray target at half the drawing buffer resolution
    renderer.getDrawingBufferSize(drawSize);
    const halfW = Math.max(1, Math.floor(drawSize.x * 0.5));
    const halfH = Math.max(1, Math.floor(drawSize.y * 0.5));
    if (godRaysRTT.width !== halfW || godRaysRTT.height !== halfH) {
      godRaysRTT.setSize(halfW, halfH);
    }

    // is the camera even looking toward the sun? (projected.z lies behind camera)
    camera.getWorldDirection(cameraForward);
    const facing = cameraForward.dot(ctx.sky.sunDirection);
    if (facing <= 0.05) {
      sunVisibility.value = 0;
      return;
    }

    sunWorld.copy(ctx.sky.sunDirection).multiplyScalar(600).add(camera.position);
    projected.copy(sunWorld).project(camera);
    // full strength while the sun is on screen, fading over the next ~1.1 NDC
    // units so an off-screen sun still throws shafts into the frame edge
    const onScreenX = 1 - THREE.MathUtils.clamp(Math.abs(projected.x) - 0.9, 0, 1.3) / 1.3;
    const onScreenY = 1 - THREE.MathUtils.clamp(Math.abs(projected.y) - 0.9, 0, 1.3) / 1.3;
    sunVisibility.value = onScreenX * onScreenY * THREE.MathUtils.smoothstep(facing, 0.05, 0.3);
    sunScreen.value.set(projected.x * 0.5 + 0.5, projected.y * 0.5 + 0.5);
  }

  function render() {
    postProcessing.render();
  }

  function applyQuality(preset) {
    const name = ctx.qualityName || preset.label?.toLowerCase() || 'high';
    const highTier = name === 'high' || name === 'ultra';

    const useAO = preset.ao !== undefined ? Boolean(preset.ao) : highTier;
    aoPass.resolutionScale = preset.aoScale ?? (name === 'ultra' ? 1 : 0.5);
    aoPass.samples.value = name === 'ultra' ? 24 : 16;

    godRayStrength.value = preset.godRays ? 0.9 : 0;
    const useBloom = Boolean(preset.bloom);
    bloomPass.strength.value = useBloom ? (preset.bloomStrength ?? 0.6) * 0.8 : 0;

    setChain({ useAO, useRays: Boolean(preset.godRays), useFxaa: Boolean(preset.fxaa), useBloom });
  }

  return {
    update,
    render,
    applyQuality,
    // debug / tuning hooks
    _bloom: bloomPass,
    _ao: aoPass,
    _aoDenoise: aoDenoised,
    _godRayStrength: godRayStrength,
    _sunVisibility: sunVisibility,
    _look: {
      exposure: uExposure,
      contrast: uContrast,
      saturation: uSaturation,
      lift: uLift,
      shadowTint: uShadowTint,
      highlightTint: uHighlightTint,
      vignette: uVignette,
      grain: uGrain,
      sharpen: uSharpen,
      aberration: uAberration,
      aoStrength: uAoStrength,
    },
    _setChain: setChain,
    _setToneMapping: setToneMapping,
    _debugView: debugView,
  };
}
