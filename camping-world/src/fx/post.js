import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { N8AOPass } from 'n8ao';

/**
 * Photographic post stack:
 *   RenderPass (MSAA HDR target, keeps grass alpha-to-coverage)
 *   → N8AO   (subtle ground-contact occlusion)
 *   → OutputPass (ACES tone map + sRGB)
 *   → Grade  (warm white balance, gentle saturation, vignette, fine grain)
 *   → SMAA
 */

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uSaturation: { value: 1.06 },
    uWarmth: { value: 0.035 },
    uContrast: { value: 1.04 },
    uLift: { value: 0.0 },
    uVignette: { value: 0.32 },
    uGrain: { value: 0.012 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uSaturation;
    uniform float uWarmth;
    uniform float uContrast;
    uniform float uLift;
    uniform float uVignette;
    uniform float uGrain;
    varying vec2 vUv;

    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

    void main() {
      vec4 c = texture2D(tDiffuse, vUv);

      // warm/cool white balance
      c.r += uWarmth * 0.6;
      c.b -= uWarmth;

      // contrast around mid-gray + tiny lift so blacks stay filmic
      c.rgb = (c.rgb - 0.5) * uContrast + 0.5 + uLift;

      // saturation
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb = mix(vec3(l), c.rgb, uSaturation);

      // vignette
      vec2 d = vUv - 0.5;
      float vig = 1.0 - uVignette * smoothstep(0.35, 0.95, length(d) * 1.35);
      c.rgb *= vig;

      // fine static-ish grain (time-jittered)
      float g = (hash(vUv * vec2(1920.0, 1080.0) + fract(uTime) * 7.13) - 0.5) * 2.0;
      c.rgb += g * uGrain * (0.4 + 0.6 * (1.0 - l));

      gl_FragColor = clamp(c, 0.0, 1.0);
    }`,
};

export function initPost(renderer, scene, camera) {
  const size = renderer.getSize(new THREE.Vector2());
  const pr = renderer.getPixelRatio();
  const w = Math.floor(size.x * pr);
  const h = Math.floor(size.y * pr);

  // MSAA HDR target so grass alpha-to-coverage keeps working under the composer
  const target = new THREE.WebGLRenderTarget(w, h, {
    type: THREE.HalfFloatType,
    samples: 4,
  });

  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));

  const n8ao = new N8AOPass(scene, camera, w, h);
  n8ao.configuration.aoRadius = 1.6;
  n8ao.configuration.distanceFalloff = 4.0;
  n8ao.configuration.intensity = 2.2;
  n8ao.configuration.halfRes = true;
  n8ao.configuration.depthAwareUpsampling = true;
  composer.addPass(n8ao);

  composer.addPass(new OutputPass());

  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);

  const smaa = new SMAAPass();
  composer.addPass(smaa);

  return {
    composer,
    grade,
    n8ao,
    setSize(width, height) {
      composer.setSize(width, height);
    },
    render(elapsed) {
      grade.uniforms.uTime.value = elapsed;
      composer.render();
    },
  };
}
