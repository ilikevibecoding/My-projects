// ---------------------------------------------------------------------------
// effects.js — stern wake ribbon, bow spray, contact "blob" shadow on the
// water (custom water shader can't receive shadow maps), and ambient birds.
// All effects ride the real wave surface via waves.sampleAt.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { heightAt } from './waves.js';

// --- wake ribbon -------------------------------------------------------------

const WAKE_MAX = 72;
const WAKE_LIFE = 7.0;

const WAKE_FRAG = /* glsl */ `
varying float vAlpha;
varying vec2 vUv;
uniform float uTime;
void main() {
  // soft edges + streaky procedural breakup
  float edge = smoothstep(0.0, 0.32, vUv.x) * smoothstep(1.0, 0.68, vUv.x);
  float streak = 0.72 + 0.28 * sin(vUv.y * 40.0 + vUv.x * 6.0);
  float a = vAlpha * edge * streak;
  gl_FragColor = vec4(0.92, 0.97, 1.0, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const WAKE_VERT = /* glsl */ `
attribute float aAlpha;
varying float vAlpha;
varying vec2 vUv;
void main() {
  vAlpha = aAlpha;
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

class WakeRibbon {
  constructor(scene) {
    this.points = []; // { x, z, birth, dirX, dirZ, w }
    const geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(new Float32Array(WAKE_MAX * 2 * 3), 3);
    this.alphaAttr = new THREE.BufferAttribute(new Float32Array(WAKE_MAX * 2), 1);
    this.uvAttr = new THREE.BufferAttribute(new Float32Array(WAKE_MAX * 2 * 2), 2);
    geo.setAttribute('position', this.posAttr);
    geo.setAttribute('aAlpha', this.alphaAttr);
    geo.setAttribute('uv', this.uvAttr);
    const idx = [];
    for (let i = 0; i < WAKE_MAX - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    geo.setIndex(idx);
    geo.setDrawRange(0, 0);
    this.geo = geo;
    this.mesh = new THREE.Mesh(
      geo,
      new THREE.ShaderMaterial({
        vertexShader: WAKE_VERT,
        fragmentShader: WAKE_FRAG,
        uniforms: { uTime: { value: 0 } },
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    scene.add(this.mesh);
  }

  update(body, t) {
    const speed = Math.abs(body.speed);
    // stern position in world space
    const sx = body.pos.x - body._fwd.x * 14.5;
    const sz = body.pos.z - body._fwd.z * 14.5;
    const last = this.points[this.points.length - 1];
    if (speed > 1.2 && (!last || Math.hypot(sx - last.x, sz - last.z) > 2.2)) {
      this.points.push({
        x: sx,
        z: sz,
        birth: t,
        dirX: body._right.x,
        dirZ: body._right.z,
        str: Math.min(speed / 9, 1),
      });
      if (this.points.length > WAKE_MAX) this.points.shift();
    }
    // drop expired
    while (this.points.length && t - this.points[0].birth > WAKE_LIFE) this.points.shift();

    const n = this.points.length;
    for (let i = 0; i < n; i++) {
      const p = this.points[i];
      const age = (t - p.birth) / WAKE_LIFE;
      const w = (1.6 + age * 7.5) * 0.5;
      const y = heightAt(p.x, p.z, t) + 0.1;
      this.posAttr.setXYZ(i * 2, p.x - p.dirX * w, y, p.z - p.dirZ * w);
      this.posAttr.setXYZ(i * 2 + 1, p.x + p.dirX * w, y, p.z + p.dirZ * w);
      const a = (1 - age) * 0.55 * p.str;
      this.alphaAttr.setX(i * 2, a);
      this.alphaAttr.setX(i * 2 + 1, a);
      this.uvAttr.setXY(i * 2, 0, i * 0.35);
      this.uvAttr.setXY(i * 2 + 1, 1, i * 0.35);
    }
    this.posAttr.needsUpdate = true;
    this.alphaAttr.needsUpdate = true;
    this.uvAttr.needsUpdate = true;
    this.geo.setDrawRange(0, Math.max(0, (n - 1) * 6));
  }
}

// --- bow spray ----------------------------------------------------------------

const SPRAY_N = 220;

class BowSpray {
  constructor(scene) {
    this.parts = [];
    for (let i = 0; i < SPRAY_N; i++) {
      this.parts.push({ x: 0, y: -50, z: 0, vx: 0, vy: 0, vz: 0, life: 0, age: 1 });
    }
    this.cursor = 0;
    const geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(new Float32Array(SPRAY_N * 3), 3);
    geo.setAttribute('position', this.posAttr);
    this.mesh = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        color: 0xeef7fb,
        size: 0.55,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
        sizeAttenuation: true,
      })
    );
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    scene.add(this.mesh);
  }

  update(body, t, dt) {
    const speed = Math.abs(body.speed);
    // spawn at the bow shoulders proportional to speed
    if (speed > 4) {
      const count = Math.min(4, Math.floor(speed * 0.45));
      for (let k = 0; k < count; k++) {
        const p = this.parts[this.cursor];
        this.cursor = (this.cursor + 1) % SPRAY_N;
        const side = Math.random() > 0.5 ? 1 : -1;
        const bx = body.pos.x + body._fwd.x * 13.2 + body._right.x * side * 1.6;
        const bz = body.pos.z + body._fwd.z * 13.2 + body._right.z * side * 1.6;
        p.x = bx;
        p.z = bz;
        p.y = heightAt(bx, bz, t) + 0.3;
        p.vx = body.vel.x * 0.55 + body._right.x * side * (1.2 + Math.random() * 1.6);
        p.vz = body.vel.z * 0.55 + body._right.z * side * (1.2 + Math.random() * 1.6);
        p.vy = 1.8 + Math.random() * 2.4 * Math.min(speed / 9, 1.2);
        p.life = 0.7 + Math.random() * 0.7;
        p.age = 0;
      }
    }
    for (let i = 0; i < SPRAY_N; i++) {
      const p = this.parts[i];
      if (p.age >= p.life) {
        this.posAttr.setXYZ(i, 0, -50, 0);
        continue;
      }
      p.age += dt;
      p.vy -= 9.81 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      this.posAttr.setXYZ(i, p.x, p.y, p.z);
    }
    this.posAttr.needsUpdate = true;
  }
}

// --- blob shadow under the ship -----------------------------------------------

class BlobShadow {
  constructor(scene) {
    const NX = 10;
    const NZ = 5;
    this.NX = NX;
    this.NZ = NZ;
    const geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(new Float32Array((NX + 1) * (NZ + 1) * 3), 3);
    const alpha = new Float32Array((NX + 1) * (NZ + 1));
    const idx = [];
    for (let j = 0; j <= NZ; j++) {
      for (let i = 0; i <= NX; i++) {
        const u = i / NX - 0.5;
        const v = j / NZ - 0.5;
        const d = Math.hypot(u * 2, v * 2);
        alpha[j * (NX + 1) + i] = Math.max(0, 1 - d) * 0.34;
      }
    }
    for (let j = 0; j < NZ; j++) {
      for (let i = 0; i < NX; i++) {
        const a = j * (NX + 1) + i;
        const b = a + 1;
        const c = a + NX + 1;
        const d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    geo.setAttribute('position', this.posAttr);
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
    geo.setIndex(idx);
    this.mesh = new THREE.Mesh(
      geo,
      new THREE.ShaderMaterial({
        vertexShader: /* glsl */ `
          attribute float aAlpha;
          varying float vA;
          void main() {
            vA = aAlpha;
            gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          varying float vA;
          void main() { gl_FragColor = vec4(0.0, 0.05, 0.09, vA); }`,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    scene.add(this.mesh);
  }

  update(body, t) {
    const fx = body._fwd.x;
    const fz = body._fwd.z;
    const rx = body._right.x;
    const rz = body._right.z;
    const L = 33;
    const W = 12;
    for (let j = 0; j <= this.NZ; j++) {
      for (let i = 0; i <= this.NX; i++) {
        const u = (i / this.NX - 0.5) * L;
        const v = (j / this.NZ - 0.5) * W;
        const x = body.pos.x + fx * u + rx * v;
        const z = body.pos.z + fz * u + rz * v;
        const y = heightAt(x, z, t) + 0.14;
        this.posAttr.setXYZ(j * (this.NX + 1) + i, x, y, z);
      }
    }
    this.posAttr.needsUpdate = true;
  }
}

// --- birds ---------------------------------------------------------------------

const BIRD_N = 10;

class Birds {
  constructor(scene, timeUniform) {
    // simple gull: two wing triangles
    const verts = new Float32Array([
      0, 0, 0.55, 0, 0, -0.4, -1.6, 0.18, 0, // left wing
      0, 0, 0.55, 1.6, 0.18, 0, 0, 0, -0.4, // right wing
    ]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    const mat = new THREE.MeshBasicMaterial({ color: 0x303a42, side: THREE.DoubleSide });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = timeUniform;
      shader.vertexShader =
        'uniform float uTime;\n' +
        shader.vertexShader.replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          {
            float phase = instanceMatrix[3][0] * 0.5 + instanceMatrix[3][2];
            transformed.y += sin(uTime * 7.0 + phase) * abs(transformed.x) * 0.55;
          }`
        );
    };
    this.mesh = new THREE.InstancedMesh(geo, mat, BIRD_N);
    this.mesh.frustumCulled = false;
    this.birds = [];
    for (let i = 0; i < BIRD_N; i++) {
      const home = i < 5 ? { x: -250, z: 395 } : { x: 470, z: -290 };
      this.birds.push({
        home,
        r: 60 + Math.random() * 120,
        h: 30 + Math.random() * 35,
        a: Math.random() * Math.PI * 2,
        speed: 0.25 + Math.random() * 0.2,
        scale: 1.6 + Math.random() * 1.2,
      });
    }
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3();
    scene.add(this.mesh);
  }

  update(dt) {
    for (let i = 0; i < BIRD_N; i++) {
      const b = this.birds[i];
      b.a += b.speed * dt;
      const x = b.home.x + Math.cos(b.a) * b.r;
      const z = b.home.z + Math.sin(b.a) * b.r;
      this._e.set(0, -b.a, 0);
      this._q.setFromEuler(this._e);
      this._p.set(x, b.h + Math.sin(b.a * 3) * 4, z);
      this._s.setScalar(b.scale);
      this._m.compose(this._p, this._q, this._s);
      this.mesh.setMatrixAt(i, this._m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

export class Effects {
  constructor(scene, timeUniform) {
    this.wake = new WakeRibbon(scene);
    this.spray = new BowSpray(scene);
    this.blob = new BlobShadow(scene);
    this.birds = new Birds(scene, timeUniform);
  }

  update(body, t, dt) {
    this.wake.update(body, t);
    this.spray.update(body, t, dt);
    this.blob.update(body, t);
    this.birds.update(dt);
  }
}
