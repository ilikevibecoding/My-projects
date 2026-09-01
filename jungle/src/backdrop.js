// Distant backdrop beyond the playable map: layered jungle-clad mountain
// ridges that fade into the haze, so the horizon never shows a world edge.
// Three cheap ring meshes (one draw call each) with noise-carved ridgelines
// and a per-vertex "distant canopy" bumpiness along the crest.

import * as THREE from 'three/webgpu';
import { positionWorld, float, vec3, mix, smoothstep, texture, uniform } from 'three/tsl';
import { WORLD } from './config.js';
import { createFbm2D } from './noise.js';

const RINGS = [
  { radius: 300, baseHeight: 22, ridgeHeight: 42, tint: 0x2f5e3a, hazeMix: 0.35, segments: 320 },
  { radius: 470, baseHeight: 36, ridgeHeight: 88, tint: 0x3b6a6b, hazeMix: 0.58, segments: 260 },
  { radius: 700, baseHeight: 60, ridgeHeight: 150, tint: 0x5a7f8c, hazeMix: 0.76, segments: 200 },
];

export function createBackdrop(ctx) {
  const { scene, textures } = ctx;
  const group = new THREE.Group();
  group.name = 'backdrop';
  const fogColor = new THREE.Color(WORLD.fogColor);

  RINGS.forEach((ring, ringIndex) => {
    const ridge = createFbm2D(WORLD.seed + 500 + ringIndex * 13, { octaves: 4 });
    const bumps = createFbm2D(WORLD.seed + 600 + ringIndex * 7, { octaves: 2 });
    const rows = 6;
    const cols = ring.segments;
    const positions = new Float32Array((rows + 1) * (cols + 1) * 3);
    const uvs = new Float32Array((rows + 1) * (cols + 1) * 2);
    const indices = [];

    for (let c = 0; c <= cols; c += 1) {
      const angle = (c / cols) * Math.PI * 2;
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);
      // ridgeline: broad peaks + finer "canopy" crenellation along the crest
      const broad = ridge(cosA * 2.4 + ringIndex, sinA * 2.4) * 0.5 + 0.5;
      const fine = bumps(cosA * 22, sinA * 22) * 0.5 + 0.5;
      const crest = ring.baseHeight + ring.ridgeHeight * (0.35 + broad * 0.65) + fine * ring.ridgeHeight * 0.12;
      // radius wobble so the ring isn't a perfect circle
      const r = ring.radius * (1 + (ridge(cosA * 1.3 + 9, sinA * 1.3) * 0.08));
      for (let rIdx = 0; rIdx <= rows; rIdx += 1) {
        const t = rIdx / rows;
        // vertical profile: steep near the crest, flaring toward the base
        const y = -40 + (crest + 40) * Math.pow(t, 0.82);
        const spread = 1 + (1 - t) * 0.06;
        const i = rIdx * (cols + 1) + c;
        positions[i * 3] = cosA * r * spread;
        positions[i * 3 + 1] = y;
        positions[i * 3 + 2] = sinA * r * spread;
        uvs[i * 2] = c / cols;
        uvs[i * 2 + 1] = t;
      }
    }
    for (let rIdx = 0; rIdx < rows; rIdx += 1) {
      for (let c = 0; c < cols; c += 1) {
        const a = rIdx * (cols + 1) + c;
        const b = a + 1;
        const d = a + (cols + 1);
        const e = d + 1;
        // wind the faces to point inward (toward the player)
        indices.push(a, d, b, b, d, e);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    const material = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
    material.fog = false;
    const tint = uniform(new THREE.Color(ring.tint));
    const haze = uniform(fogColor.clone());
    // texture breakup: distant canopy clumps + a lighter rim-lit crest
    const clumps = texture(textures.noise, positionWorld.xz.mul(0.02)).r;
    const clumpsFine = texture(textures.noise, positionWorld.xz.mul(0.09).add(0.3)).r;
    const shade = mix(float(0.72), float(1.18), clumps).mul(mix(float(0.9), float(1.08), clumpsFine));
    const heightFade = smoothstep(-40, 60, positionWorld.y);
    const crestLight = smoothstep(0.55, 1.0, heightFade).mul(0.18);
    let ringColor = vec3(tint).mul(shade).add(crestLight);
    // more haze low down and with distance (ring order)
    const hazeAmount = float(ring.hazeMix).add(heightFade.oneMinus().mul(0.25));
    ringColor = mix(ringColor, vec3(haze), clamp01(hazeAmount));
    material.colorNode = ringColor;

    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.renderOrder = -10 + ringIndex;
    mesh.name = `backdrop-ring-${ringIndex}`;
    group.add(mesh);
  });

  scene.add(group);
  return { group, update() {} };
}

function clamp01(node) {
  return node.clamp(0, 1);
}
