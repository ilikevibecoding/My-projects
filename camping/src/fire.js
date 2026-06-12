// Campfire: layered billboard flame sprites, rising embers, soft smoke,
// spark bursts, flickering warm point light. All GPU-animated billboards.
import * as THREE from 'three';
import { mulberry32, SimplexNoise } from './noise.js';
import { makeFlameSprite, makeSmokeSprite, makeEmberSprite } from './textures.js';

const flickerNoise = new SimplexNoise(13371337);

// Billboard-cloud geometry: each particle is a quad billboarded in the vertex
// shader; per-particle attributes drive a procedural life cycle from uTime.
function makeParticleGeometry(count, rand) {
  const corners = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
  const positions = new Float32Array(count * 4 * 3); // particle spawn center
  const corner = new Float32Array(count * 4 * 2);
  const seeds = new Float32Array(count * 4 * 4);     // seed, phase, size, angVel
  const idx = new Uint32Array(count * 6);
  for (let i = 0; i < count; i++) {
    const seed = rand();
    const phase = rand();
    const size = 0.5 + rand();
    const av = (rand() - 0.5) * 4;
    const sx = (rand() - 0.5), sy = rand(), sz = (rand() - 0.5);
    for (let cI = 0; cI < 4; cI++) {
      const v = i * 4 + cI;
      positions[v * 3] = sx; positions[v * 3 + 1] = sy; positions[v * 3 + 2] = sz;
      corner[v * 2] = corners[cI][0];
      corner[v * 2 + 1] = corners[cI][1];
      seeds[v * 4] = seed; seeds[v * 4 + 1] = phase; seeds[v * 4 + 2] = size; seeds[v * 4 + 3] = av;
    }
    idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aCorner', new THREE.BufferAttribute(corner, 2));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  return geo;
}

const BILLBOARD_VS = /* glsl */ `
attribute vec2 aCorner;
attribute vec4 aSeed;
uniform float uTime;
uniform float uIntensity;
uniform float uLife;
uniform float uRise;
uniform float uSpread;
uniform float uBaseSize;
uniform float uGrow;
varying vec2 vUv;
varying float vFade;
varying float vSeed;

void main() {
  float seed = aSeed.x;
  float phase = aSeed.y;
  float size = aSeed.z * uBaseSize;
  float t = fract(uTime / uLife + phase);
  vFade = sin(t * 3.14159); // in-out
  vSeed = seed;

  vec3 base = position * uSpread;
  float wob = sin(uTime * (2.0 + seed * 3.0) + seed * 40.0);
  base.x += wob * 0.12 * t;
  base.z += cos(uTime * (1.7 + seed * 2.0) + seed * 31.0) * 0.12 * t;
  base.y += t * uRise;

  float s = size * (1.0 + t * uGrow) * uIntensity;
  float ang = aSeed.w * t * 3.0 + seed * 6.28;
  vec2 c = aCorner;
  vec2 rc = vec2(c.x * cos(ang) - c.y * sin(ang), c.x * sin(ang) + c.y * cos(ang));

  vec4 mv = modelViewMatrix * vec4(base, 1.0);
  mv.xy += rc * s;
  gl_Position = projectionMatrix * mv;
  vUv = aCorner + 0.5;
}
`;

export class Fire {
  constructor(position) {
    this.group = new THREE.Group();
    this.group.position.copy(position);
    this.group.name = 'fire';
    this.lit = false;
    this.boost = 0;        // "add wood" surge
    this._time = 0;
    const rand = mulberry32(99);

    // --- flames ---
    this.flameUniforms = {
      uTime: { value: 0 }, uIntensity: { value: 0 }, uLife: { value: 0.9 },
      uRise: { value: 1.15 }, uSpread: { value: 0.5 }, uBaseSize: { value: 0.75 }, uGrow: { value: -0.6 },
      uMap: { value: makeFlameSprite() },
    };
    const flameMat = new THREE.ShaderMaterial({
      uniforms: this.flameUniforms,
      vertexShader: BILLBOARD_VS,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap;
        varying vec2 vUv;
        varying float vFade;
        varying float vSeed;
        void main() {
          vec4 tex = texture2D(uMap, vUv);
          float a = tex.a * vFade;
          // hotter core, redder tips by life
          vec3 col = tex.rgb * mix(vec3(1.5, 1.25, 0.9), vec3(1.6, 0.65, 0.25), vSeed * 0.5 + 0.25);
          gl_FragColor = vec4(col * 2.6, a);
        }
      `,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.flames = new THREE.Mesh(makeParticleGeometry(18, rand), flameMat);
    this.flames.position.y = 0.25;
    this.flames.frustumCulled = false;
    this.group.add(this.flames);

    // --- embers ---
    this.emberUniforms = {
      uTime: { value: 0 }, uIntensity: { value: 0 }, uLife: { value: 2.4 },
      uRise: { value: 2.6 }, uSpread: { value: 0.55 }, uBaseSize: { value: 0.05 }, uGrow: { value: -0.4 },
      uMap: { value: makeEmberSprite() },
    };
    const emberMat = new THREE.ShaderMaterial({
      uniforms: this.emberUniforms,
      vertexShader: BILLBOARD_VS,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap;
        varying vec2 vUv;
        varying float vFade;
        varying float vSeed;
        void main() {
          vec4 tex = texture2D(uMap, vUv);
          gl_FragColor = vec4(tex.rgb * 3.0, tex.a * vFade);
        }
      `,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.embers = new THREE.Mesh(makeParticleGeometry(36, rand), emberMat);
    this.embers.position.y = 0.4;
    this.embers.frustumCulled = false;
    this.group.add(this.embers);

    // --- smoke ---
    this.smokeUniforms = {
      uTime: { value: 0 }, uIntensity: { value: 0 }, uLife: { value: 5.0 },
      uRise: { value: 3.6 }, uSpread: { value: 0.5 }, uBaseSize: { value: 0.8 }, uGrow: { value: 2.6 },
      uMap: { value: makeSmokeSprite() },
    };
    const smokeMat = new THREE.ShaderMaterial({
      uniforms: this.smokeUniforms,
      vertexShader: BILLBOARD_VS.replace('base.x += wob * 0.12 * t;', 'base.x += wob * 0.3 * t + t * t * 0.55;'),
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap;
        varying vec2 vUv;
        varying float vFade;
        void main() {
          vec4 tex = texture2D(uMap, vUv);
          gl_FragColor = vec4(vec3(0.32, 0.32, 0.34), tex.a * vFade * 0.55);
        }
      `,
      transparent: true, depthWrite: false, blending: THREE.NormalBlending,
    });
    this.smoke = new THREE.Mesh(makeParticleGeometry(14, rand), smokeMat);
    this.smoke.position.y = 0.9;
    this.smoke.frustumCulled = false;
    this.smoke.renderOrder = 3;
    this.group.add(this.smoke);

    // --- spark burst (one-shot on add wood) ---
    this.sparkUniforms = {
      uTime: { value: 10 }, uIntensity: { value: 1 }, uLife: { value: 0.8 },
      uRise: { value: 3.2 }, uSpread: { value: 0.9 }, uBaseSize: { value: 0.05 }, uGrow: { value: 0.0 },
      uMap: { value: makeEmberSprite() },
      uBurstT: { value: 10 },
    };
    const sparkMat = new THREE.ShaderMaterial({
      uniforms: this.sparkUniforms,
      vertexShader: BILLBOARD_VS
        .replace('float t = fract(uTime / uLife + phase);', 'float t = clamp((uTime) / uLife + phase * 0.2, 0.0, 1.0);')
        .replace('base.y += t * uRise;', 'base.y += t * uRise - t * t * 2.2;'),
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap;
        varying vec2 vUv;
        varying float vFade;
        void main() {
          vec4 tex = texture2D(uMap, vUv);
          gl_FragColor = vec4(tex.rgb * 4.0, tex.a * vFade);
        }
      `,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.sparks = new THREE.Mesh(makeParticleGeometry(30, rand), sparkMat);
    this.sparks.position.y = 0.5;
    this.sparks.frustumCulled = false;
    this.sparks.visible = false;
    this.group.add(this.sparks);

    // --- light ---
    this.light = new THREE.PointLight(0xff8e3c, 0, 26, 2);
    this.light.position.set(0, 1.1, 0);
    this.light.castShadow = false;
    this.group.add(this.light);

    // glowing coal bed
    const coalGeo = new THREE.CircleGeometry(0.55, 16);
    coalGeo.rotateX(-Math.PI / 2);
    this.coalMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const coals = new THREE.Mesh(coalGeo, this.coalMat);
    coals.position.y = 0.16;
    this.group.add(coals);
  }

  setLit(on) {
    this.lit = on;
  }

  addWood() {
    this.boost = 1;
    this.sparkUniforms.uTime.value = 0;
    this.sparks.visible = true;
  }

  update(dt, time) {
    this._time = time;
    const target = this.lit ? 1 + this.boost * 0.55 : 0;
    const cur = this.flameUniforms.uIntensity.value;
    const next = cur + (target - cur) * Math.min(1, dt * 3.5);
    this.boost = Math.max(0, this.boost - dt / 9);

    for (const u of [this.flameUniforms, this.emberUniforms, this.smokeUniforms]) {
      u.uTime.value = time;
      u.uIntensity.value = next;
    }
    this.sparkUniforms.uTime.value += dt;
    if (this.sparkUniforms.uTime.value > 1.4) this.sparks.visible = false;

    this.flames.visible = next > 0.02;
    this.embers.visible = next > 0.02;
    this.smoke.visible = next > 0.02;

    // flicker
    const fl = flickerNoise.noise2D(time * 6.5, 0.5) * 0.5 + flickerNoise.noise2D(time * 17, 9.3) * 0.22;
    this.light.intensity = next * (34 + fl * 16);
    this.light.position.x = fl * 0.07;
    this.light.position.z = flickerNoise.noise2D(time * 5.1, 23.7) * 0.07;
    this.coalMat.color.setRGB(1.4 * next * (0.8 + fl * 0.25), 0.35 * next, 0.06 * next);
  }
}
