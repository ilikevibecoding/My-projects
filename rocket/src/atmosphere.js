// atmosphere.js — altitude-driven sky gradient dome, fading stars, the planet's
// glowing limb band seen from altitude, and a budgeted billboard cloud layer.

import * as THREE from 'three';
import { CONST } from './physics.js';
import { mulberry32, makeCumulusTexture } from './effects.js';

const rng = mulberry32(98765);

// --------------------------------------------------------------------------
// Sky dome: warm blue at the pad -> indigo -> black space, sun disc + halo.
// --------------------------------------------------------------------------
const SKY_VERT = /* glsl */`
  varying vec3 vWorldPos;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;
const SKY_FRAG = /* glsl */`
  uniform vec3 uSunDir;
  uniform vec3 uUp;
  uniform float uAlt;       // camera altitude in m
  uniform float uSpaceAlt;  // the space line
  varying vec3 vWorldPos;

  void main() {
    vec3 dir = normalize(vWorldPos - cameraPosition);
    float elev = dot(dir, uUp);
    float t = clamp(uAlt / uSpaceAlt, 0.0, 1.0);
    float tMid = smoothstep(0.16, 0.62, t);   // low -> indigo (stay blue down low)
    float tHigh = smoothstep(0.55, 0.97, t);  // indigo -> space black

    // altitude-dependent palette
    vec3 zenith = mix(vec3(0.11, 0.35, 0.76), vec3(0.045, 0.055, 0.22), tMid);
    zenith = mix(zenith, vec3(0.003, 0.004, 0.010), tHigh);
    vec3 horizon = mix(vec3(0.47, 0.72, 0.94), vec3(0.14, 0.19, 0.46), tMid);
    horizon = mix(horizon, vec3(0.015, 0.022, 0.06), tHigh);

    float h = pow(1.0 - clamp(elev, 0.0, 1.0), 2.8);
    vec3 sky = mix(zenith, horizon, h);

    // below-horizon: darker ground haze (mostly hidden by the planet)
    if (elev < 0.0) {
      sky = mix(sky, sky * 0.55, clamp(-elev * 3.0, 0.0, 1.0));
    }

    // warm scatter around the sun, only while in atmosphere
    float sunAmt = pow(max(dot(dir, uSunDir), 0.0), 6.0);
    sky += vec3(1.0, 0.55, 0.22) * sunAmt * 0.22 * (1.0 - tHigh);

    // sun disc + tight halo (bloom finishes the job)
    float disc = pow(max(dot(dir, uSunDir), 0.0), 4000.0) * 4.0;
    float halo = pow(max(dot(dir, uSunDir), 0.0), 160.0) * 0.5;
    sky += vec3(1.0, 0.92, 0.78) * (disc + halo);

    gl_FragColor = vec4(sky, 1.0);
  }
`;

// --------------------------------------------------------------------------
// Limb band: thin glowing atmosphere rim, visible from high altitude/space.
// --------------------------------------------------------------------------
const LIMB_VERT = /* glsl */`
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  void main() {
    vNormal = normalize(mat3(modelMatrix) * normal);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;
const LIMB_FRAG = /* glsl */`
  uniform float uOpacity;
  uniform vec3 uSunDir;
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float rim = pow(1.0 - abs(dot(vNormal, viewDir)), 6.0);
    float sunlit = clamp(dot(vNormal, uSunDir) * 0.5 + 0.55, 0.05, 1.0);
    vec3 col = mix(vec3(0.16, 0.40, 0.95), vec3(0.6, 0.85, 1.0), rim);
    gl_FragColor = vec4(col * rim * sunlit * 1.35, rim * uOpacity);
  }
`;

// --------------------------------------------------------------------------
export function createAtmosphere(scene, sunDir) {
  const group = new THREE.Group();
  group.name = 'atmosphere';

  // sky dome (follows the camera)
  const skyMat = new THREE.ShaderMaterial({
    uniforms: {
      uSunDir: { value: sunDir.clone() },
      uUp: { value: new THREE.Vector3(0, 1, 0) },
      uAlt: { value: 0 },
      uSpaceAlt: { value: CONST.SPACE_ALT },
    },
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: THREE.BackSide,
    depthWrite: false,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(30000, 48, 32), skyMat);
  dome.renderOrder = -100;
  dome.frustumCulled = false;
  group.add(dome);

  // stars (fade in with altitude)
  const starCount = 2200;
  const starGeo = new THREE.BufferGeometry();
  const pos = new Float32Array(starCount * 3);
  const col = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    // uniform sphere distribution
    const z = rng() * 2 - 1;
    const a = rng() * Math.PI * 2;
    const r = Math.sqrt(1 - z * z);
    const R = 28000;
    pos[i * 3] = Math.cos(a) * r * R;
    pos[i * 3 + 1] = z * R;
    pos[i * 3 + 2] = Math.sin(a) * r * R;
    const b = 0.45 + rng() * 0.55;
    const warm = rng();
    col[i * 3] = b * (warm > 0.8 ? 1.0 : 0.85);
    col[i * 3 + 1] = b * 0.9;
    col[i * 3 + 2] = b * (warm < 0.2 ? 1.05 : 0.95);
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  starGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const starMat = new THREE.PointsMaterial({
    size: 2.2, sizeAttenuation: false, vertexColors: true,
    transparent: true, opacity: 0, depthWrite: false,
  });
  const stars = new THREE.Points(starGeo, starMat);
  stars.renderOrder = -99;
  stars.frustumCulled = false;
  group.add(stars);

  // limb glow shell
  const limbMat = new THREE.ShaderMaterial({
    uniforms: { uOpacity: { value: 0 }, uSunDir: { value: sunDir.clone() } },
    vertexShader: LIMB_VERT,
    fragmentShader: LIMB_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const limb = new THREE.Mesh(new THREE.SphereGeometry(CONST.R + 360, 96, 64), limbMat);
  limb.position.set(0, -CONST.R, 0);
  limb.renderOrder = -5;
  group.add(limb);

  // ---- cloud layer: clustered cumulus billboards around the launch site
  const cloudTex = makeCumulusTexture(31);
  const CLOUD_N = 108;
  const base = new THREE.PlaneGeometry(1, 1);
  const cgeo = new THREE.InstancedBufferGeometry();
  cgeo.index = base.index;
  cgeo.attributes.position = base.attributes.position;
  cgeo.attributes.uv = base.attributes.uv;
  const cPos = new Float32Array(CLOUD_N * 3);
  const cScale = new Float32Array(CLOUD_N);
  const cCol = new Float32Array(CLOUD_N * 3);
  const cRot = new Float32Array(CLOUD_N);
  const cOp = new Float32Array(CLOUD_N);
  const sun2 = new THREE.Vector2(sunDir.x, sunDir.z).normalize();
  // 16 clusters of 5-8 puffs each — reads as cumulus, not confetti.
  // First clusters sit near the launch vertical so the rocket punches through.
  let ci = 0;
  const clusters = [];
  while (clusters.length < 16) {
    let cd, ca;
    if (clusters.length < 3) { cd = 160 + rng() * 360; ca = rng() * Math.PI * 2; }
    else { cd = 420 + Math.pow(rng(), 0.8) * 1500; ca = rng() * Math.PI * 2; }
    clusters.push({ x: Math.cos(ca) * cd, z: Math.sin(ca) * cd, alt: 880 + rng() * 340, d: cd });
  }
  for (const cl of clusters) {
    const n = 5 + Math.floor(rng() * 4);
    for (let k = 0; k < n && ci < CLOUD_N; k++, ci++) {
      const ox = (rng() - 0.5) * 320;
      const oz = (rng() - 0.5) * 320;
      const x = cl.x + ox, zz = cl.z + oz;
      const d = Math.sqrt(x * x + zz * zz);
      cPos[ci * 3] = x;
      cPos[ci * 3 + 1] = cl.alt + (rng() - 0.5) * 60 - (d * d) / (2 * CONST.R);
      cPos[ci * 3 + 2] = zz;
      cScale[ci] = 150 + rng() * 230;
      // sun-side clouds get a warm lit tint, far side cooler
      const sunness = 0.5 + 0.5 * ((x * sun2.x + zz * sun2.y) / Math.max(1, d));
      const lit = 0.84 + 0.2 * sunness;
      cCol[ci * 3] = lit * 1.03;
      cCol[ci * 3 + 1] = lit * 1.0;
      cCol[ci * 3 + 2] = lit * (0.96 + 0.09 * (1 - sunness));
      cRot[ci] = (rng() - 0.5) * 0.22; // cumulus stays mostly upright
      cOp[ci] = 0.72 + rng() * 0.26;
    }
  }
  // fill any leftovers far out
  for (; ci < CLOUD_N; ci++) {
    const a = rng() * Math.PI * 2;
    const d = 1200 + rng() * 800;
    cPos[ci * 3] = Math.cos(a) * d;
    cPos[ci * 3 + 1] = 900 + rng() * 300 - (d * d) / (2 * CONST.R);
    cPos[ci * 3 + 2] = Math.sin(a) * d;
    cScale[ci] = 170 + rng() * 180;
    cCol[ci * 3] = cCol[ci * 3 + 1] = cCol[ci * 3 + 2] = 0.95;
    cRot[ci] = 0;
    cOp[ci] = 0.7;
  }
  cgeo.setAttribute('iPos', new THREE.InstancedBufferAttribute(cPos, 3));
  cgeo.setAttribute('iScale', new THREE.InstancedBufferAttribute(cScale, 1));
  cgeo.setAttribute('iColor', new THREE.InstancedBufferAttribute(cCol, 3));
  cgeo.setAttribute('iRot', new THREE.InstancedBufferAttribute(cRot, 1));
  cgeo.setAttribute('iOpacity', new THREE.InstancedBufferAttribute(cOp, 1));
  cgeo.instanceCount = CLOUD_N;
  const cloudMat = new THREE.ShaderMaterial({
    uniforms: {
      map: { value: cloudTex },
      uCamRight: { value: new THREE.Vector3(1, 0, 0) },
      uCamUp: { value: new THREE.Vector3(0, 1, 0) },
      uTime: { value: 0 },
    },
    vertexShader: /* glsl */`
      attribute vec3 iPos;
      attribute float iScale;
      attribute float iRot;
      attribute vec3 iColor;
      attribute float iOpacity;
      uniform vec3 uCamRight;
      uniform vec3 uCamUp;
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vColor;
      varying float vOpacity;
      void main() {
        vUv = uv;
        vColor = iColor;
        vOpacity = iOpacity;
        float c = cos(iRot), s = sin(iRot);
        vec2 p = position.xy;
        vec2 rp = vec2(p.x * c - p.y * s, p.x * s + p.y * c);
        vec3 drift = vec3(uTime * 1.5, 0.0, uTime * 0.6);
        vec3 world = iPos + drift + uCamRight * (rp.x * iScale) + uCamUp * (rp.y * iScale * 0.55);
        gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      uniform sampler2D map;
      varying vec2 vUv;
      varying vec3 vColor;
      varying float vOpacity;
      void main() {
        vec4 t = texture2D(map, vUv);
        gl_FragColor = vec4(vColor * t.rgb * 1.12, t.a * vOpacity);
        if (gl_FragColor.a < 0.004) discard;
      }
    `,
    transparent: true,
    depthWrite: false,
  });
  const clouds = new THREE.Mesh(cgeo, cloudMat);
  clouds.renderOrder = 8;
  clouds.frustumCulled = false;
  group.add(clouds);

  scene.add(group);

  return {
    group, dome, stars, limb, clouds,
    update(camera, altitude, time) {
      dome.position.copy(camera.position);
      stars.position.copy(camera.position);
      skyMat.uniforms.uAlt.value = altitude;
      // stars fade in through the indigo band
      starMat.opacity = THREE.MathUtils.smoothstep(altitude, 2300, 4600);
      // limb appears once you're above the shell
      limbMat.uniforms.uOpacity.value = THREE.MathUtils.smoothstep(altitude, 2000, 3600) * 0.85;
      cloudMat.uniforms.uTime.value = time;
      const e = camera.matrixWorld.elements;
      cloudMat.uniforms.uCamRight.value.set(e[0], e[1], e[2]);
      cloudMat.uniforms.uCamUp.value.set(e[4], e[5], e[6]);
    },
  };
}
