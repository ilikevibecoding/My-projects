// ---------------------------------------------------------------------------
// ocean.js — ocean surface mesh + shader.
//
// Geometry: ONE radial grid centred on the ship — fine cells near the ship,
// geometrically growing rings out to the horizon. No seams, no LOD popping,
// one draw call. The shader displaces vertices with the same Gerstner sum the
// physics samples (waves.js is the single source of truth).
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { GEO_WAVES, DETAIL_WAVES, packWaves, GERSTNER_GLSL } from './waves.js';
import { packIslands, ISLAND_GLSL, SEA_FLOOR_DEPTH, BEACH_SLOPE } from './islandField.js';

const RINGS = 132;
const SEGS = 168;
const INNER_CELL = 1.9; // metres, first ring spacing
const GROWTH = 1.038; // geometric ring growth (reaches ~6.8 km, well past the fog)

function buildRadialGrid() {
  const radii = [0];
  let r = 0;
  let step = INNER_CELL;
  for (let i = 0; i < RINGS; i++) {
    r += step;
    step *= GROWTH;
    radii.push(r);
  }
  const verts = [];
  for (let i = 0; i < radii.length; i++) {
    for (let j = 0; j < SEGS; j++) {
      const a = (j / SEGS) * Math.PI * 2;
      verts.push(Math.cos(a) * radii[i], 0, Math.sin(a) * radii[i]);
    }
  }
  const idx = [];
  for (let i = 0; i < radii.length - 1; i++) {
    for (let j = 0; j < SEGS; j++) {
      const j1 = (j + 1) % SEGS;
      const a = i * SEGS + j;
      const b = i * SEGS + j1;
      const c = (i + 1) * SEGS + j;
      const d = (i + 1) * SEGS + j1;
      idx.push(a, b, c, b, d, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex(idx);
  return geo;
}

const VERT = /* glsl */ `
#define NUM_GEO_WAVES ${GEO_WAVES.length}
uniform float uTime;
uniform vec3 uCamPos;
uniform vec4 uWaveA[NUM_GEO_WAVES];
uniform vec4 uWaveB[NUM_GEO_WAVES];

varying vec3 vWorld;
varying vec3 vNormal;
varying float vCrest;
varying float vFade;
varying float vDist;

${GERSTNER_GLSL}

void main() {
  vec3 wp = (modelMatrix * vec4(position, 1.0)).xyz;
  float dist = distance(wp.xz, uCamPos.xz);
  vDist = dist;
  // overall fade used by foam/detail in the fragment stage
  vFade = 1.0 - smoothstep(380.0, 2300.0, dist);
  WaveOut w = gerstner(wp.xz, uTime, uWaveA, uWaveB, dist);
  vec3 displaced = wp + w.disp;
  vWorld = displaced;
  vNormal = w.normal;
  vCrest = w.crest;
  gl_Position = projectionMatrix * viewMatrix * vec4(displaced, 1.0);
}
`;

const FRAG = /* glsl */ `
precision highp float;
#define NUM_ISLANDS ${packIslands().count}
#define NUM_DETAIL_WAVES ${DETAIL_WAVES.length}
#define SEA_FLOOR_DEPTH ${SEA_FLOOR_DEPTH.toFixed(1)}
#define BEACH_SLOPE ${BEACH_SLOPE}

uniform float uTime;
uniform vec3 uCamPos;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uDeepColor;
uniform vec3 uShallowColor;
uniform vec3 uSssColor;
uniform vec3 uSkyZenith;
uniform vec3 uSkyHorizon;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform vec4 uDetailA[NUM_DETAIL_WAVES];
uniform vec4 uDetailB[NUM_DETAIL_WAVES];
uniform vec4 uIslA[NUM_ISLANDS];
uniform vec4 uIslB[NUM_ISLANDS];
uniform vec4 uIslC[NUM_ISLANDS];

varying vec3 vWorld;
varying vec3 vNormal;
varying float vCrest;
varying float vFade;
varying float vDist;

${ISLAND_GLSL}

void main() {
  // --- normal: geometry normal + tiny per-pixel ripples for sparkle.
  // Detail ripples fade fast with distance (they'd just alias out there).
  vec3 n = vNormal;
  float detailFade = 1.0 - smoothstep(45.0, 220.0, vDist);
  for (int i = 0; i < NUM_DETAIL_WAVES; i++) {
    vec2 D = uDetailA[i].xy;
    float k = uDetailA[i].z;
    float om = uDetailA[i].w;
    float amp = uDetailB[i].x * detailFade;
    float f = k * dot(D, vWorld.xz) - om * uTime + uDetailB[i].z;
    n.xz -= D * k * amp * cos(f) * 0.9;
  }
  n = normalize(n);

  vec3 V = normalize(uCamPos - vWorld);
  vec3 R = reflect(-V, n);
  R.y = abs(R.y); // waves never reflect "below horizon"

  // --- water body colour from depth (terrain field mirrors the islands)
  float terrain = terrainHeight(vWorld.xz, uIslA, uIslB, uIslC);
  float depth = max(vWorld.y - terrain, 0.0);
  float shallow = exp(-depth * 0.14);
  vec3 base = mix(uDeepColor, uShallowColor, clamp(shallow, 0.0, 1.0));

  // subtle subsurface glow on sun-facing wave flanks
  float sss = pow(max(dot(V, vec3(-uSunDir.x, 0.0, -uSunDir.z)), 0.0), 2.0)
            * clamp(vWorld.y * 0.45 + 0.35, 0.0, 1.0) * (1.0 - n.y) * 2.4;
  base += uSssColor * sss * vFade;

  // --- sky reflection (matches the sky dome gradient) + sun
  vec3 sky = mix(uSkyHorizon, uSkyZenith, pow(clamp(R.y, 0.0, 1.0), 0.6));
  float sunSpec = pow(max(dot(R, uSunDir), 0.0), 760.0) * 4.0
                + pow(max(dot(R, uSunDir), 0.0), 64.0) * 0.22;
  sky += uSunColor * sunSpec;

  float fresnel = 0.025 + 0.975 * pow(1.0 - max(dot(n, V), 0.0), 5.0);
  vec3 col = mix(base, sky, fresnel);

  // --- foam
  float breakup = sin(vWorld.x * 1.45 + uTime * 1.9) * sin(vWorld.z * 1.62 - uTime * 1.6);
  breakup = 0.65 + 0.35 * breakup;
  float crestFoam = smoothstep(0.3, 0.72, vCrest / 0.28) * breakup;

  float wob = sin(uTime * 1.25 + vWorld.x * 0.11 + vWorld.z * 0.085) * 0.55;
  float shoreFoam = (1.0 - smoothstep(0.0, 2.3 + wob, depth - 0.25))
                  * (0.6 + 0.4 * sin(depth * 3.1 - uTime * 2.2));
  shoreFoam += smoothstep(0.75, 1.0, sin(depth * 1.9 - uTime * 1.45)) *
               (1.0 - smoothstep(0.0, 6.5, depth)) * 0.5;
  shoreFoam = clamp(shoreFoam, 0.0, 1.0) * step(0.001, depth);

  float foam = clamp(crestFoam * 0.75 + shoreFoam * 0.95, 0.0, 1.0) * vFade;
  col = mix(col, vec3(0.96, 0.99, 1.0), foam * 0.85);

  // --- fog (matches scene FogExp2)
  float fogDist = distance(uCamPos, vWorld);
  float fogF = 1.0 - exp(-fogDist * fogDist * uFogDensity * uFogDensity);
  col = mix(col, uFogColor, fogF);

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export class Ocean {
  constructor(scene, env) {
    const geoPack = packWaves(GEO_WAVES);
    const detPack = packWaves(DETAIL_WAVES);
    const isl = packIslands();

    this.uniforms = {
      uTime: { value: 0 },
      uCamPos: { value: new THREE.Vector3() },
      uWaveA: { value: toVec4Array(geoPack.a) },
      uWaveB: { value: toVec4Array(geoPack.b) },
      uDetailA: { value: toVec4Array(detPack.a) },
      uDetailB: { value: toVec4Array(detPack.b) },
      uIslA: { value: toVec4Array(isl.a) },
      uIslB: { value: toVec4Array(isl.b) },
      uIslC: { value: toVec4Array(isl.c) },
      uSunDir: { value: env.sunDir },
      uSunColor: { value: new THREE.Color(0xffe9c4) },
      uDeepColor: { value: new THREE.Color(0x07335c) },
      uShallowColor: { value: new THREE.Color(0x1ec3b4) },
      uSssColor: { value: new THREE.Color(0x14b89c) },
      uSkyZenith: { value: env.skyZenith },
      uSkyHorizon: { value: env.skyHorizon },
      uFogColor: { value: env.fogColor },
      uFogDensity: { value: env.fogDensity },
    };

    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: this.uniforms,
      side: THREE.FrontSide,
    });

    this.mesh = new THREE.Mesh(buildRadialGrid(), this.material);
    this.mesh.frustumCulled = false; // grid always surrounds the camera
    this.mesh.matrixAutoUpdate = false;
    scene.add(this.mesh);
  }

  update(t, focusX, focusZ, camPos) {
    this.uniforms.uTime.value = t;
    this.uniforms.uCamPos.value.copy(camPos);
    // follow the ship, snapped to the inner cell size to avoid vertex crawl
    const s = INNER_CELL;
    this.mesh.matrix.makeTranslation(Math.round(focusX / s) * s, 0, Math.round(focusZ / s) * s);
  }
}

function toVec4Array(flat) {
  const arr = [];
  for (let i = 0; i < flat.length; i += 4) {
    arr.push(new THREE.Vector4(flat[i], flat[i + 1], flat[i + 2], flat[i + 3]));
  }
  return arr;
}
