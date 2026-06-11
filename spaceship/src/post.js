// Post-processing: N8AO, bloom, ACES output, vignette + film grain.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { N8AOPass } from 'n8ao';

const GrainVignetteShader = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    grain: { value: 0.045 },
    vignette: { value: 0.42 },
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
    uniform float time;
    uniform float grain;
    uniform float vignette;
    varying vec2 vUv;
    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7)) + time * 17.0) * 43758.5453);
    }
    void main() {
      vec4 col = texture2D(tDiffuse, vUv);
      // vignette
      vec2 d = vUv - 0.5;
      float v = 1.0 - dot(d, d) * vignette * 2.2;
      col.rgb *= clamp(v, 0.0, 1.0);
      // film grain (luminance-weighted, subtle)
      float g = (hash(vUv * vec2(1920.0, 1080.0)) - 0.5) * grain;
      col.rgb += g * (0.4 + 0.6 * (1.0 - clamp(dot(col.rgb, vec3(0.333)), 0.0, 1.0)));
      gl_FragColor = col;
    }
  `,
};

export function createPost(renderer, scene, camera) {
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const size = renderer.getSize(new THREE.Vector2());
  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(renderer.getPixelRatio());

  composer.addPass(new RenderPass(scene, camera));

  const n8ao = new N8AOPass(scene, camera, size.x, size.y);
  n8ao.configuration.aoRadius = 0.9;
  n8ao.configuration.distanceFalloff = 2.5;
  n8ao.configuration.intensity = 3.2;
  n8ao.configuration.halfRes = true;
  // OutputPass handles sRGB conversion; without this the frame gets gamma'd twice
  n8ao.configuration.gammaCorrection = false;
  n8ao.setQualityMode('Medium');
  if (!location.hash.includes('noao')) composer.addPass(n8ao);

  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.30, 0.5, 0.9);
  if (!location.hash.includes('nobloom')) composer.addPass(bloom);

  composer.addPass(new OutputPass());

  const grainPass = new ShaderPass(GrainVignetteShader);
  composer.addPass(grainPass);

  function resize(w, h) {
    composer.setSize(w, h);
    n8ao.setSize(w, h);
    bloom.setSize(w, h);
  }

  function update(t) {
    grainPass.uniforms.time.value = t % 100;
  }

  return { composer, resize, update, n8ao, bloom, grainPass };
}
