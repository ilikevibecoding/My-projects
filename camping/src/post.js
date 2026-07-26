// Post stack: MSAA target -> render -> GTAO -> bloom -> ACES output -> vignette/grain.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';

const GrainVignetteShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uVignette: { value: 0.32 },
    uGrain: { value: 0.035 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    varying vec2 vUv;
    uniform sampler2D tDiffuse;
    uniform float uTime, uVignette, uGrain;
    float hash(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }
    void main() {
      vec4 col = texture2D(tDiffuse, vUv);
      vec2 d = vUv - 0.5;
      float vig = 1.0 - dot(d, d) * uVignette * 2.0;
      col.rgb *= vig;
      float g = (hash(vUv * vec2(1920.0, 1080.0) + fract(uTime) * 13.7) - 0.5) * uGrain;
      col.rgb += g;
      gl_FragColor = col;
    }
  `,
};

export function createPost(renderer, scene, camera) {
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  const size = renderer.getSize(new THREE.Vector2());
  const target = new THREE.WebGLRenderTarget(size.x, size.y, {
    type: THREE.HalfFloatType,
    samples: 4,
  });
  const composer = new EffectComposer(renderer, target);

  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  const gtao = new GTAOPass(scene, camera, size.x, size.y);
  gtao.output = GTAOPass.OUTPUT.Default;
  // AO is confined to the campsite.
  //
  // Screen-space AO and alpha-tested foliage do not mix: the cutout edges are
  // hard depth discontinuities, so GTAO draws a dark halo around every needle
  // sprig and every impostor quad. That is what produced the black outlines
  // around the trees — measured, not guessed: with AO enabled the treeline view
  // had 180 near-black pixels hugging the sky boundary, and with AO disabled it
  // had exactly 0. Tuning radius/scale/thickness could not fix it (the best
  // config still left 25), because the artefact is inherent to running SSAO
  // over cutouts.
  //
  // Clipping AO to a box around camp keeps the part that actually earns its
  // keep — contact darkening under the tent, logs, firepit and rocks, still
  // two thirds of its original effect there — while every tree in the scene
  // sits outside the box and renders clean. Verified: 0 fringe pixels in both
  // the camp and treeline views. See tools/fringe.mjs.
  gtao.setSceneClipBox(new THREE.Box3(new THREE.Vector3(-20, -8, -20), new THREE.Vector3(20, 10, 20)));
  composer.addPass(gtao);

  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.25, 0.55, 1.0);
  composer.addPass(bloom);

  const output = new OutputPass();
  composer.addPass(output);

  const grain = new ShaderPass(GrainVignetteShader);
  composer.addPass(grain);

  function setSize(w, h) {
    composer.setSize(w, h);
    gtao.setSize(w, h);
  }

  return {
    composer,
    gtao,
    setAO(enabled) { gtao.enabled = !!enabled; },
    setAOBox(halfXZ, minY, maxY) {
      gtao.setSceneClipBox(new THREE.Box3(
        new THREE.Vector3(-halfXZ, minY, -halfXZ),
        new THREE.Vector3(halfXZ, maxY, halfXZ)));
    },
    setAOParams({ radius, scale, distanceExponent, thickness } = {}) {
      if (radius !== undefined) gtao.updateGtaoMaterial({ radius });
      if (scale !== undefined) gtao.updateGtaoMaterial({ scale });
      if (distanceExponent !== undefined) gtao.updateGtaoMaterial({ distanceExponent });
      if (thickness !== undefined) gtao.updateGtaoMaterial({ thickness });
    },
    setExposure(v) { renderer.toneMappingExposure = v; },
    setBloom(strength, threshold) {
      bloom.strength = strength;
      if (threshold !== undefined) bloom.threshold = threshold;
    },
    update(time) { grain.uniforms.uTime.value = time; },
    setSize,
  };
}
