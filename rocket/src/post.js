// post.js — the full post stack: MSAA render target, GTAO, bloom,
// ACES tone mapping via OutputPass, then vignette + film grain.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

const FinalShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uVignette: { value: 0.28 },
    uGrain: { value: 0.013 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uVignette;
    uniform float uGrain;
    varying vec2 vUv;
    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(12.9898, 78.233)) + uTime * 5.3) * 43758.5453);
    }
    void main() {
      vec4 col = texture2D(tDiffuse, vUv);
      // subtle saturation lift
      float lum = dot(col.rgb, vec3(0.299, 0.587, 0.114));
      col.rgb = mix(vec3(lum), col.rgb, 1.12);
      // vignette
      float d = distance(vUv, vec2(0.5));
      col.rgb *= 1.0 - uVignette * smoothstep(0.38, 0.92, d);
      // animated grain — fine + slow + luminance-weighted so it reads as
      // texture, not as the whole image shaking
      float g = (hash(vUv * vec2(1737.0, 1051.0)) - 0.5) * uGrain;
      col.rgb += g * (0.35 + 0.65 * lum);
      gl_FragColor = col;
    }
  `,
};

export function createPost(renderer, scene, camera, width, height) {
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.06;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const rt = new THREE.WebGLRenderTarget(width, height, {
    samples: 4,
    type: THREE.HalfFloatType,
  });
  const composer = new EffectComposer(renderer, rt);

  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  let gtaoPass = null;
  try {
    gtaoPass = new GTAOPass(scene, camera, width, height);
    gtaoPass.output = GTAOPass.OUTPUT.Default;
    gtaoPass.blendIntensity = 0.9;
    try {
      gtaoPass.updateGtaoMaterial({
        radius: 1.4,
        distanceExponent: 1.6,
        thickness: 1.0,
        scale: 1.3,
        samples: 12,
        distanceFallOff: 1.0,
        screenSpaceRadius: false,
      });
    } catch (e) { /* keep library defaults if params shift between versions */ }
    composer.addPass(gtaoPass);
  } catch (e) {
    console.warn('GTAO unavailable:', e);
  }

  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(Math.floor(width / 2), Math.floor(height / 2)),
    0.52,   // strength ("more of the blur": richer glow on plume/sun)
    0.62,   // radius (wider, softer falloff)
    0.85    // threshold (linear HDR space: plume/sun/emissives, not paint)
  );
  composer.addPass(bloomPass);

  const outputPass = new OutputPass();
  composer.addPass(outputPass);

  const finalPass = new ShaderPass(FinalShader);
  composer.addPass(finalPass);

  return {
    composer,
    bloomPass,
    gtaoPass,
    finalPass,
    render(dt) {
      finalPass.uniforms.uTime.value = (finalPass.uniforms.uTime.value + dt) % 64;
      composer.render(dt);
    },
    setSize(w, h) {
      composer.setSize(w, h);
      if (gtaoPass) gtaoPass.setSize(w, h);
      bloomPass.setSize(Math.floor(w / 2), Math.floor(h / 2));
    },
  };
}
