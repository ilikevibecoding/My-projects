// effects.js — seeded RNG, canvas sprite factory, instanced billboard particle
// systems, layered engine exhaust (cone shaders + sprites), pad smoke/dust,
// cartoony crash poof. All procedural, all budgeted, all deterministic.

import * as THREE from 'three';

// --------------------------------------------------------------------------
// Deterministic RNG
// --------------------------------------------------------------------------
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --------------------------------------------------------------------------
// Canvas sprite textures
// --------------------------------------------------------------------------
function spriteCanvas(size, draw) {
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function makePuffTexture(rngSeed = 7) {
  const rng = mulberry32(rngSeed);
  return spriteCanvas(128, (ctx, s) => {
    ctx.clearRect(0, 0, s, s);
    // lumpy smoke puff: several offset radial blobs, shaded top-light
    for (let i = 0; i < 9; i++) {
      const a = rng() * Math.PI * 2;
      const d = rng() * s * 0.18;
      const x = s / 2 + Math.cos(a) * d;
      const y = s / 2 + Math.sin(a) * d;
      const r = s * (0.16 + rng() * 0.14);
      const g = ctx.createRadialGradient(x, y - r * 0.25, r * 0.1, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,0.34)');
      g.addColorStop(0.55, 'rgba(225,225,228,0.22)');
      g.addColorStop(1, 'rgba(200,200,205,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, s, s);
    }
  });
}

// dense puffy cumulus sprite: wide coverage, flat-ish base, bright core
export function makeCumulusTexture(rngSeed = 19) {
  const rng = mulberry32(rngSeed);
  return spriteCanvas(256, (ctx, s) => {
    ctx.clearRect(0, 0, s, s);
    const baseY = s * 0.64;
    // body blobs along a horizontal band
    for (let i = 0; i < 22; i++) {
      const x = s * (0.16 + 0.68 * rng());
      const lift = Math.sin((x / s) * Math.PI); // taller in the middle
      const y = baseY - rng() * s * 0.26 * lift;
      const r = s * (0.10 + rng() * 0.13) * (0.7 + 0.5 * lift);
      const g = ctx.createRadialGradient(x, y - r * 0.3, r * 0.12, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,0.85)');
      g.addColorStop(0.5, 'rgba(244,246,250,0.55)');
      g.addColorStop(1, 'rgba(228,232,240,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, s, s);
    }
    // soft flat base shadow
    const sh = ctx.createLinearGradient(0, baseY - s * 0.08, 0, baseY + s * 0.16);
    sh.addColorStop(0, 'rgba(0,0,0,0)');
    sh.addColorStop(1, 'rgba(150,160,185,0.18)');
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = sh;
    ctx.fillRect(0, baseY - s * 0.08, s, s * 0.3);
    ctx.globalCompositeOperation = 'source-over';
  });
}

export function makeFlameTexture() {
  return spriteCanvas(64, (ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 1, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,235,180,0.9)');
    g.addColorStop(0.55, 'rgba(255,150,60,0.55)');
    g.addColorStop(1, 'rgba(255,80,20,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  });
}

export function makeStarTexture() {
  return spriteCanvas(64, (ctx, s) => {
    ctx.translate(s / 2, s / 2);
    ctx.fillStyle = '#fff2c8';
    ctx.beginPath();
    const R = s * 0.46, r = s * 0.16;
    for (let i = 0; i < 8; i++) {
      const a1 = (i / 4) * Math.PI;
      const rad = i % 2 === 0 ? R : r;
      ctx.lineTo(Math.cos(a1) * rad, Math.sin(a1) * rad);
    }
    ctx.closePath(); ctx.fill();
  });
}

// --------------------------------------------------------------------------
// Instanced billboard system — one draw call per system.
// --------------------------------------------------------------------------
const BB_VERT = /* glsl */`
  attribute vec3 iPos;
  attribute float iScale;
  attribute float iRot;
  attribute vec3 iColor;
  attribute float iOpacity;
  uniform vec3 uCamRight;
  uniform vec3 uCamUp;
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vOpacity;
  void main() {
    vUv = uv;
    vColor = iColor;
    // fade puffs that get close to the camera: avoids full-screen billboards
    // (a fill-rate spike that can stall mid GPUs at ignition) and the ugly
    // pop when a puff crosses the near plane
    float camDist = distance(iPos, cameraPosition);
    vOpacity = iOpacity * smoothstep(1.2, 7.0, camDist);
    float c = cos(iRot), s = sin(iRot);
    vec2 p = position.xy;
    vec2 rp = vec2(p.x * c - p.y * s, p.x * s + p.y * c);
    vec3 world = iPos + uCamRight * (rp.x * iScale) + uCamUp * (rp.y * iScale);
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;
const BB_FRAG = /* glsl */`
  uniform sampler2D map;
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vOpacity;
  void main() {
    vec4 tex = texture2D(map, vUv);
    gl_FragColor = vec4(vColor * tex.rgb, tex.a * vOpacity);
    if (gl_FragColor.a < 0.003) discard;
  }
`;

export class BillboardSystem {
  constructor({ texture, capacity, blending = THREE.NormalBlending, renderOrder = 10 }) {
    this.capacity = capacity;
    const base = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.attributes.position = base.attributes.position;
    geo.attributes.uv = base.attributes.uv;
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    this.aScale = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
    this.aRot = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
    this.aColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    this.aOpacity = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
    for (const a of [this.aPos, this.aScale, this.aRot, this.aColor, this.aOpacity]) {
      a.setUsage(THREE.DynamicDrawUsage);
    }
    geo.setAttribute('iPos', this.aPos);
    geo.setAttribute('iScale', this.aScale);
    geo.setAttribute('iRot', this.aRot);
    geo.setAttribute('iColor', this.aColor);
    geo.setAttribute('iOpacity', this.aOpacity);
    geo.instanceCount = 0;
    this.geometry = geo;
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: texture },
        uCamRight: { value: new THREE.Vector3(1, 0, 0) },
        uCamUp: { value: new THREE.Vector3(0, 1, 0) },
      },
      vertexShader: BB_VERT,
      fragmentShader: BB_FRAG,
      transparent: true,
      depthWrite: false,
      blending,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
    this.particles = [];
  }

  spawn(p) {
    if (this.particles.length >= this.capacity) this.particles.shift();
    this.particles.push({
      pos: p.pos.clone(),
      vel: p.vel ? p.vel.clone() : new THREE.Vector3(),
      acc: p.acc ? p.acc.clone() : null,
      drag: p.drag ?? 0,
      age: 0,
      life: p.life ?? 1,
      size0: p.size0 ?? 1,
      size1: p.size1 ?? 2,
      rot: p.rot ?? 0,
      rotVel: p.rotVel ?? 0,
      color0: p.color0 ?? new THREE.Color(1, 1, 1),
      color1: p.color1 ?? p.color0 ?? new THREE.Color(1, 1, 1),
      opacity0: p.opacity0 ?? 1,
      fadeIn: p.fadeIn ?? 0.06,
    });
  }

  advance(dt) {
    const arr = this.particles;
    for (let i = arr.length - 1; i >= 0; i--) {
      const pt = arr[i];
      pt.age += dt;
      if (pt.age >= pt.life) { arr.splice(i, 1); continue; }
      if (pt.acc) pt.vel.addScaledVector(pt.acc, dt);
      if (pt.drag) pt.vel.multiplyScalar(Math.max(0, 1 - pt.drag * dt));
      pt.pos.addScaledVector(pt.vel, dt);
      pt.rot += pt.rotVel * dt;
    }
  }

  // write GPU attributes + face the camera
  sync(camera) {
    const e = camera.matrixWorld.elements;
    this.material.uniforms.uCamRight.value.set(e[0], e[1], e[2]);
    this.material.uniforms.uCamUp.value.set(e[4], e[5], e[6]);
    const n = this.particles.length;
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const pt = this.particles[i];
      const k = pt.age / pt.life;
      this.aPos.setXYZ(i, pt.pos.x, pt.pos.y, pt.pos.z);
      this.aScale.setX(i, pt.size0 + (pt.size1 - pt.size0) * k);
      this.aRot.setX(i, pt.rot);
      c.copy(pt.color0).lerp(pt.color1, k);
      this.aColor.setXYZ(i, c.r, c.g, c.b);
      const fadeIn = pt.fadeIn > 0 ? Math.min(1, pt.age / pt.fadeIn) : 1;
      const fadeOut = 1 - k;
      this.aOpacity.setX(i, pt.opacity0 * fadeIn * fadeOut * fadeOut);
    }
    this.geometry.instanceCount = n;
    for (const a of [this.aPos, this.aScale, this.aRot, this.aColor, this.aOpacity]) {
      a.needsUpdate = true;
    }
  }

  clear() { this.particles.length = 0; this.geometry.instanceCount = 0; }
  get count() { return this.particles.length; }
}

// --------------------------------------------------------------------------
// Flame cone shader (the hot core of the plume)
// --------------------------------------------------------------------------
const CONE_VERT = /* glsl */`
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  varying vec3 vAxis;
  void main() {
    vUv = uv;
    vNormal = normalize(mat3(modelMatrix) * normal);
    vAxis = normalize(mat3(modelMatrix) * vec3(0.0, 1.0, 0.0));
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;
const CONE_FRAG = /* glsl */`
  uniform float uTime;
  uniform float uIntensity;
  uniform float uVac;       // 0 at sea level -> 1 in vacuum
  uniform vec3 uColorCore;
  uniform vec3 uColorEdge;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  varying vec3 vAxis;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x),
               mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }
  void main() {
    // clamp: interpolation can nudge uv epsilon out of [0,1]; pow(negative, x)
    // is NaN on real GPUs and NaN feeds black through the bloom chain
    float along = clamp(1.0 - vUv.y, 0.0, 1.0); // 0 at nozzle -> 1 at tip
    float n = noise(vec2(vUv.x * 7.0, along * 4.5 - uTime * 7.0));
    float n2 = noise(vec2(vUv.x * 13.0 + 5.0, along * 9.0 - uTime * 11.0));
    float flicker = 0.74 + 0.26 * n;
    // vacuum: expansion cools the tail fast -> shorter bright body
    float body = pow(1.0 - along, 1.3 + uVac * 1.6);
    float diamonds = 0.82 + 0.18 * sin(along * 26.0 - uTime * 3.0) * (1.0 - uVac * 0.7);
    // volumetric read: dense looking through the middle, soft at silhouette
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float facing = abs(dot(normalize(vNormal), viewDir));
    float radial = smoothstep(0.0, 0.62, facing);
    // looking straight up/down the plume (e.g. orbiting underneath the
    // rocket): silhouette normals go edge-on and the cone would vanish, so
    // blend toward a solid glowing disc instead
    float endOn = smoothstep(0.72, 0.94, abs(dot(normalize(vAxis), viewDir)));
    radial = mix(radial, 0.8, endOn);
    // hot white throat -> orange body early -> reddish tail; vacuum shifts violet
    vec3 col = mix(uColorCore, uColorEdge, smoothstep(0.02, 0.4, along + 0.18 * (n2 - 0.5)));
    col = mix(col, vec3(0.5, 0.45, 1.0), uVac * smoothstep(0.1, 0.8, along) * 0.6);
    float a = body * flicker * diamonds * radial * uIntensity;
    gl_FragColor = vec4(col * (1.25 - along * 0.45) * (1.0 + uVac * 0.4), a);
  }
`;

export function createPlume(exitRadius) {
  const group = new THREE.Group();
  group.name = 'plume';
  const mkCone = (rTopMul, rBotMul, len, core, edge, opacityBoost) => {
    const geo = new THREE.CylinderGeometry(exitRadius * rTopMul, exitRadius * rBotMul, 1, 20, 10, true);
    geo.translate(0, -0.5, 0); // top at origin, extends down
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uIntensity: { value: 0 },
        uVac: { value: 0 },
        uColorCore: { value: new THREE.Color(core) },
        uColorEdge: { value: new THREE.Color(edge) },
      },
      vertexShader: CONE_VERT,
      fragmentShader: CONE_FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.scale.y = len;
    mesh.renderOrder = 12;
    mesh.frustumCulled = false;
    mesh.userData.baseLen = len;
    mesh.userData.opacityBoost = opacityBoost;
    group.add(mesh);
    return mesh;
  };
  const outer = mkCone(0.95, 2.1, 7.5, '#ffc97e', '#ff4d0e', 0.5);
  const inner = mkCone(0.62, 0.95, 2.7, '#ffffff', '#ff9a2e', 0.8);
  group.userData = { outer, inner, exitRadius };
  return group;
}

export function updatePlume(group, { time, throttle, rho, rho0 }) {
  const vac = Math.pow(1 - Math.min(1, rho / rho0), 1.6);
  const widen = 1 + 2.8 * vac;          // vacuum: plume balloons out
  const lengthen = 1 + 1.7 * vac;
  for (const mesh of [group.userData.outer, group.userData.inner]) {
    const m = mesh.material;
    m.uniforms.uTime.value = time;
    m.uniforms.uIntensity.value = throttle * mesh.userData.opacityBoost;
    m.uniforms.uVac.value = vac;
    mesh.visible = throttle > 0.01;
  }
  group.userData.outer.scale.set(widen, group.userData.outer.userData.baseLen * lengthen, widen);
  group.userData.inner.scale.set(1 + 1.2 * vac, group.userData.inner.userData.baseLen * (1 + 0.9 * vac), 1 + 1.2 * vac);
}

// --------------------------------------------------------------------------
// ExhaustSystem — flame sprites + smoke + pad dust + crash poof, one place.
// --------------------------------------------------------------------------
export class ExhaustSystem {
  constructor(scene, seed = 1337) {
    this.scene = scene;
    this.seed = seed;
    this.rng = mulberry32(seed);
    this.puffTex = makePuffTexture(11);
    this.flameTex = makeFlameTexture();
    this.starTex = makeStarTexture();

    this.flames = new BillboardSystem({ texture: this.flameTex, capacity: 80, blending: THREE.AdditiveBlending, renderOrder: 13 });
    this.smoke = new BillboardSystem({ texture: this.puffTex, capacity: 300, renderOrder: 10 });
    this.dust = new BillboardSystem({ texture: this.puffTex, capacity: 150, renderOrder: 9 });
    this.poofs = new BillboardSystem({ texture: this.puffTex, capacity: 90, renderOrder: 14 });
    this.stars = new BillboardSystem({ texture: this.starTex, capacity: 110, blending: THREE.AdditiveBlending, renderOrder: 15 });
    scene.add(this.flames.mesh, this.smoke.mesh, this.dust.mesh, this.poofs.mesh, this.stars.mesh);

    this.flameAcc = 0;
    this.smokeAcc = 0;
    this.time = 0;
  }

  reset(seed = this.seed) {
    this.rng = mulberry32(seed);
    this.flames.clear(); this.smoke.clear(); this.dust.clear();
    this.poofs.clear(); this.stars.clear();
    this.flameAcc = 0; this.smokeAcc = 0; this.time = 0;
  }

  // ctx: { nozzles: [{ pos:V3 world, dir:V3 world (exhaust dir, normalized), exitRadius }],
  //        throttle, rho, rho0, rocketVel:V3, groundAlt (m above terrain), padCenter:V3 }
  advance(dt, ctx) {
    this.time += dt;
    const rng = this.rng;
    if (ctx && ctx.throttle > 0.01) {
      const vac = 1 - Math.min(1, ctx.rho / ctx.rho0);
      for (const nz of ctx.nozzles) {
        // ---- flame sprites: short-lived hot puffs streaming down the plume
        this.flameAcc += dt * 90;
        while (this.flameAcc >= 1) {
          this.flameAcc -= 1;
          const spread = nz.exitRadius * (0.35 + 1.3 * vac);
          const jx = (rng() - 0.5) * spread, jz = (rng() - 0.5) * spread;
          const speed = 26 + rng() * 10;
          this.flames.spawn({
            pos: nz.pos.clone().addScaledVector(nz.dir, 0.3 + rng() * 0.4)
              .add(new THREE.Vector3(jx, 0, jz)),
            vel: nz.dir.clone().multiplyScalar(speed * (1 + 0.6 * vac))
              .add(new THREE.Vector3(jx * 6 * (1 + 2 * vac), 0, jz * 6 * (1 + 2 * vac)))
              .add(ctx.rocketVel),
            life: 0.12 + rng() * 0.12,
            size0: nz.exitRadius * (1.1 + rng() * 0.7) * (1 + 1.6 * vac),
            size1: nz.exitRadius * (0.4 + 0.4 * rng()),
            color0: new THREE.Color(1.0, 0.95, 0.8),
            color1: new THREE.Color(1.0, 0.45, 0.12),
            opacity0: 0.5,
            rot: rng() * 6.28, rotVel: (rng() - 0.5) * 6,
            fadeIn: 0,
          });
        }

        // ---- smoke: only meaningful inside atmosphere
        const smokeRate = ctx.rho < ctx.rho0 * 0.06 ? 0
          : 34 * Math.min(1, ctx.rho / (ctx.rho0 * 0.25));
        this.smokeAcc += dt * smokeRate;
        const nearGround = ctx.groundAlt < 14;
        while (this.smokeAcc >= 1) {
          this.smokeAcc -= 1;
          if (nearGround) {
            // deflected pad billow: spawn at ground, push radially out
            const a = rng() * Math.PI * 2;
            const radial = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
            const groundPos = new THREE.Vector3(nz.pos.x, ctx.padY ?? 0.9, nz.pos.z)
              .addScaledVector(radial, 1.5 + rng() * 2.5);
            this.smoke.spawn({
              pos: groundPos,
              vel: radial.multiplyScalar(9 + rng() * 9).add(new THREE.Vector3(0, 2.2 + rng() * 2.8, 0)),
              drag: 0.85,
              life: 2.6 + rng() * 2.2,
              size0: 2.5 + rng() * 2.0,
              size1: 11 + rng() * 9,
              color0: new THREE.Color(0.94, 0.92, 0.9),
              color1: new THREE.Color(0.72, 0.71, 0.72),
              opacity0: 0.8,
              rot: rng() * 6.28, rotVel: (rng() - 0.5) * 1.4,
            });
          } else {
            // in-flight trail
            const j = new THREE.Vector3((rng() - 0.5) * 1.6, 0, (rng() - 0.5) * 1.6);
            this.smoke.spawn({
              pos: nz.pos.clone().addScaledVector(nz.dir, 3.5 + rng() * 2).add(j),
              vel: nz.dir.clone().multiplyScalar(6 + rng() * 5).add(j.multiplyScalar(2)).add(ctx.rocketVel.clone().multiplyScalar(0.12)),
              drag: 0.6,
              life: 1.6 + rng() * 1.6,
              size0: 1.6 + rng() * 1.4,
              size1: 7 + rng() * 6,
              color0: new THREE.Color(0.96, 0.94, 0.92),
              color1: new THREE.Color(0.78, 0.77, 0.79),
              opacity0: 0.38 * Math.min(1, ctx.rho / (ctx.rho0 * 0.3)),
              rot: rng() * 6.28, rotVel: (rng() - 0.5) * 1.2,
            });
          }
        }
      }
    }
    this.flames.advance(dt);
    this.smoke.advance(dt);
    this.dust.advance(dt);
    this.poofs.advance(dt);
    this.stars.advance(dt);
  }

  // one-shot ground dust ring at ignition
  igniteDust(center, padY = 0.9) {
    const rng = this.rng;
    for (let i = 0; i < 130; i++) {
      const a = rng() * Math.PI * 2;
      const radial = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      const speed = 10 + rng() * 17;
      this.dust.spawn({
        pos: new THREE.Vector3(center.x, padY + 0.4 + rng() * 1.2, center.z)
          .addScaledVector(radial, 2.5 + rng() * 5),
        vel: radial.clone().multiplyScalar(speed).add(new THREE.Vector3(0, 1.4 + rng() * 2.4, 0)),
        drag: 0.9,
        life: 3.6 + rng() * 2.6,
        size0: 2.2 + rng() * 2.2,
        size1: 9 + rng() * 8,
        color0: new THREE.Color(0.82, 0.74, 0.6),
        color1: new THREE.Color(0.65, 0.6, 0.52),
        opacity0: 0.75,
        rot: rng() * 6.28, rotVel: (rng() - 0.5) * 1.8,
      });
    }
  }

  // cartoony crash poof: expanding gray puffs + a few cartoon stars
  crashPoof(center) {
    const rng = this.rng;
    for (let i = 0; i < 55; i++) {
      const dir = new THREE.Vector3(rng() - 0.5, rng() * 0.7, rng() - 0.5).normalize();
      this.poofs.spawn({
        pos: center.clone().addScaledVector(dir, rng() * 1.5),
        vel: dir.multiplyScalar(7 + rng() * 16),
        drag: 1.4,
        life: 1.6 + rng() * 1.4,
        size0: 2.2 + rng() * 2,
        size1: 8 + rng() * 7,
        color0: new THREE.Color(0.97, 0.95, 0.9),
        color1: new THREE.Color(0.62, 0.6, 0.62),
        opacity0: 0.95,
        rot: rng() * 6.28, rotVel: (rng() - 0.5) * 3,
      });
    }
    for (let i = 0; i < 9; i++) {
      const dir = new THREE.Vector3(rng() - 0.5, 0.3 + rng() * 0.7, rng() - 0.5).normalize();
      this.stars.spawn({
        pos: center.clone(),
        vel: dir.multiplyScalar(10 + rng() * 14),
        acc: new THREE.Vector3(0, -12, 0),
        life: 1.0 + rng() * 0.6,
        size0: 1.6, size1: 0.6,
        color0: new THREE.Color('#ffd24d'),
        color1: new THREE.Color('#ff7b2e'),
        opacity0: 1,
        rotVel: 4,
      });
    }
  }

  // celebration fireworks (space reached!): colored star bursts around `center`
  fireworks(center, up = new THREE.Vector3(0, 1, 0)) {
    const rng = this.rng;
    const colors = ['#ff5a4d', '#ffd24d', '#5ad1ff', '#7dff6e', '#ff8ef0'];
    for (let b = 0; b < 5; b++) {
      const c0 = new THREE.Color(colors[b]);
      const origin = center.clone()
        .add(new THREE.Vector3((rng() - 0.5) * 26, 0, (rng() - 0.5) * 26))
        .addScaledVector(up, 4 + rng() * 14);
      for (let i = 0; i < 16; i++) {
        const dir = new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5).normalize();
        this.stars.spawn({
          pos: origin.clone().addScaledVector(dir, 0.4),
          vel: dir.multiplyScalar(7 + rng() * 13),
          drag: 0.9,
          life: 1.2 + rng() * 0.9,
          size0: 1.7, size1: 0.4,
          color0: c0,
          color1: new THREE.Color('#ffffff'),
          opacity0: 1,
          rotVel: (rng() - 0.5) * 6,
        });
      }
    }
  }

  sync(camera) {
    this.flames.sync(camera);
    this.smoke.sync(camera);
    this.dust.sync(camera);
    this.poofs.sync(camera);
    this.stars.sync(camera);
  }

  counts() {
    return {
      flames: this.flames.count, smoke: this.smoke.count,
      dust: this.dust.count, poofs: this.poofs.count, stars: this.stars.count,
    };
  }
}
