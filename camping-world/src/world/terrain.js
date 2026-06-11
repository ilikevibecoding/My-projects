import * as THREE from 'three';
import { makeFbm2D, makeNoise2D } from './noise.js';

/**
 * Heightfield terrain with a splat-blended PBR ground material.
 *
 * - Gentle rolling meadow with a flattened campsite pad at the origin.
 * - Three photoscanned ground sets blended by noise + radius masks:
 *     A: grassy meadow (aerial_grass_rock)
 *     B: leafy forest litter (forest_leaves_03) — under the treeline & camp
 *     C: packed mud + leaves (brown_mud_leaves_01) — patchy variation
 * - Two-scale "de-tiling" sampling + macro tint noise to defeat repetition.
 */

export const TERRAIN_SIZE = 360;
const SEGMENTS = 300;
const CAMP_FLAT_RADIUS = 7;
const CAMP_BLEND_RADIUS = 18;

const fbmHeight = makeFbm2D(101, 4);
const fbmMicro = makeNoise2D(202);

export function terrainHeight(x, z) {
  const r = Math.hypot(x, z);
  // base rolling hills — longer wavelengths, modest amplitude
  let h = fbmHeight(x * 0.008, z * 0.008) * 5.2;
  h += fbmHeight(x * 0.028 + 13.7, z * 0.028 - 4.2) * 1.15;
  // micro relief
  h += fbmMicro(x * 0.16, z * 0.16) * 0.18;
  // bowl: keep the clearing slightly cupped so the horizon reads as terrain
  h += Math.min(1, (r / 160) ** 2) * 3.0;
  // flat campsite pad
  const campH = 0.35; // fixed pad height
  const t = THREE.MathUtils.smoothstep(r, CAMP_FLAT_RADIUS, CAMP_BLEND_RADIUS);
  return campH * (1 - t) + h * t;
}

function loadGroundSet(loader, id) {
  const tex = (suffix, srgb = false) => {
    const t = loader.load(`./assets/textures/${id}/${id}_${suffix}_2k.jpg`);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  };
  return { diff: tex('diff', true), nor: tex('nor_gl'), arm: tex('arm') };
}

export function buildTerrain(scene) {
  const texLoader = new THREE.TextureLoader();
  const setA = loadGroundSet(texLoader, 'aerial_grass_rock');
  const setB = loadGroundSet(texLoader, 'forest_leaves_03');
  const setC = loadGroundSet(texLoader, 'brown_mud_leaves_01');

  // --- geometry ---
  const geo = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, SEGMENTS, SEGMENTS);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, terrainHeight(pos.getX(i), pos.getZ(i)));
  }
  geo.computeVertexNormals();

  // --- material with splat shader ---
  const mat = new THREE.MeshStandardMaterial({
    map: setA.diff,
    normalMap: setA.nor,
    aoMap: setA.arm,
    roughnessMap: setA.arm,
    metalnessMap: setA.arm,
    roughness: 1.0,
    metalness: 0.0,
  });

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uDiffB = { value: setB.diff };
    shader.uniforms.uNorB = { value: setB.nor };
    shader.uniforms.uArmB = { value: setB.arm };
    shader.uniforms.uDiffC = { value: setC.diff };
    shader.uniforms.uNorC = { value: setC.nor };
    shader.uniforms.uArmC = { value: setC.arm };

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
         varying vec3 vWorldPos;`
      )
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
         vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         varying vec3 vWorldPos;
         uniform sampler2D uDiffB; uniform sampler2D uNorB; uniform sampler2D uArmB;
         uniform sampler2D uDiffC; uniform sampler2D uNorC; uniform sampler2D uArmC;

         // cheap hash noise for masks (matches CPU layout loosely; only looks matter)
         float thash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
         float tnoise(vec2 p){
           vec2 i = floor(p); vec2 f = fract(p);
           vec2 u = f * f * (3.0 - 2.0 * f);
           return mix(mix(thash(i), thash(i + vec2(1,0)), u.x),
                      mix(thash(i + vec2(0,1)), thash(i + vec2(1,1)), u.x), u.y);
         }
         float tfbm(vec2 p){
           float s = 0.0; float a = 0.5;
           for (int i = 0; i < 4; i++){ s += tnoise(p) * a; p *= 2.03; a *= 0.5; }
           return s;
         }
         // two-scale anti-tiling sample
         vec4 detile(sampler2D t, vec2 uv){
           vec4 a = texture2D(t, uv);
           vec4 b = texture2D(t, uv * 0.27 + vec2(0.13, 0.71));
           float m = tnoise(uv * 0.35);
           return mix(a, b, smoothstep(0.35, 0.65, m));
         }`
      )
      .replace(
        '#include <map_fragment>',
        `{
          vec2 wuv = vWorldPos.xz * 0.22;          // ~4.5m repeat
          float r = length(vWorldPos.xz);

          // masks
          float nBig = tfbm(vWorldPos.xz * 0.012);
          float nMid = tfbm(vWorldPos.xz * 0.05 + 31.7);
          float underTrees = smoothstep(38.0, 60.0, r + nBig * 22.0 - 11.0);
          float campLitter = 1.0 - smoothstep(7.5, 16.0, r + nMid * 5.0 - 2.5);
          float wB = clamp(max(underTrees, campLitter) + smoothstep(0.62, 0.8, nMid) * 0.5, 0.0, 1.0);
          float wC = smoothstep(0.56, 0.78, tfbm(vWorldPos.xz * 0.03 + 77.3)) * (1.0 - wB);

          vec4 dA = detile(map, wuv);
          vec4 dB = detile(uDiffB, wuv);
          vec4 dC = detile(uDiffC, wuv * 1.18);
          vec4 blended = mix(mix(dA, dB, wB), dC, wC);

          // macro tint: break up color over large distances (dry/lush patches)
          float macro = tfbm(vWorldPos.xz * 0.008 + 5.1);
          vec3 dryTint = vec3(1.06, 0.98, 0.82);
          vec3 lushTint = vec3(0.88, 1.0, 0.86);
          blended.rgb *= mix(dryTint, lushTint, smoothstep(0.3, 0.7, macro)) * (0.86 + 0.28 * tnoise(vWorldPos.xz * 0.09));

          diffuseColor *= blended;
          // stash masks for normal/arm stages
          vSplat = vec3(wB, wC, 0.0);
        }`
      )
      .replace(
        '#include <normal_fragment_maps>',
        `{
          vec2 wuv = vWorldPos.xz * 0.22;
          vec3 nA = detile(normalMap, wuv).xyz * 2.0 - 1.0;
          vec3 nB = detile(uNorB, wuv).xyz * 2.0 - 1.0;
          vec3 nC = detile(uNorC, wuv * 1.18).xyz * 2.0 - 1.0;
          vec3 mapN = normalize(mix(mix(nA, nB, vSplat.x), nC, vSplat.y));
          mapN.xy *= normalScale;
          normal = normalize( tbn * mapN );
        }`
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `float roughnessFactor = roughness;
        {
          vec2 wuv = vWorldPos.xz * 0.22;
          vec4 aA = detile(roughnessMap, wuv);
          vec4 aB = detile(uArmB, wuv);
          vec4 aC = detile(uArmC, wuv * 1.18);
          vec4 armBlend = mix(mix(aA, aB, vSplat.x), aC, vSplat.y);
          roughnessFactor *= armBlend.g;
          vArmCache = armBlend;
        }`
      )
      .replace(
        '#include <aomap_fragment>',
        `{
          float ambientOcclusion = mix(1.0, vArmCache.r, 0.85);
          reflectedLight.indirectDiffuse *= ambientOcclusion;
          #if defined( USE_ENVMAP ) && defined( STANDARD )
            float dotNV = saturate( dot( geometryNormal, geometryViewDir ) );
            reflectedLight.indirectSpecular *= computeSpecularOcclusion( dotNV, ambientOcclusion, material.roughness );
          #endif
        }`
      )
      .replace(
        '#include <metalnessmap_fragment>',
        `float metalnessFactor = 0.0;`
      );

    // declare the inter-stage cache vars at the top of the fragment shader
    shader.fragmentShader = shader.fragmentShader.replace(
      'varying vec3 vWorldPos;',
      `varying vec3 vWorldPos;
       vec3 vSplat;
       vec4 vArmCache;`
    );
  };

  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  scene.add(mesh);

  return { mesh, getHeight: terrainHeight };
}
