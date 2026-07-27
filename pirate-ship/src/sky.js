// ---------------------------------------------------------------------------
// sky.js — sky dome, sun, clouds, lighting rig and fog.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { WIND } from './waves.js';

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const SKY_FRAG = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uMid;
uniform vec3 uHorizon;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float h = clamp(d.y, 0.0, 1.0);
  vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.18, h));
  col = mix(col, uZenith, smoothstep(0.12, 0.65, h));
  float s = max(dot(d, uSunDir), 0.0);
  col += uSunColor * (smoothstep(0.99955, 0.99985, s) * 3.0); // disc
  col += uSunColor * pow(s, 240.0) * 0.55;                    // corona
  col += uSunColor * pow(s, 9.0) * 0.16;                      // haze
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

// Camera-facing instanced cloud billboards (one draw call).
const CLOUD_VERT = /* glsl */ `
attribute vec2 aScale;
varying vec2 vUv;
varying float vAlpha;
void main() {
  vUv = uv;
  vAlpha = aScale.y;
  vec4 center = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  vec4 wc = modelMatrix * center;
  vec3 camRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 camUp = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec3 wp = wc.xyz + (camRight * position.x + camUp * position.y) * aScale.x;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;

const CLOUD_FRAG = /* glsl */ `
uniform sampler2D uMap;
varying vec2 vUv;
varying float vAlpha;
void main() {
  vec4 tex = texture2D(uMap, vUv);
  gl_FragColor = vec4(tex.rgb, tex.a * vAlpha);
  if (gl_FragColor.a < 0.01) discard;
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

function makeCloudTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 256, 256);
  // a few overlapping soft blobs make a puffy cumulus silhouette
  const blobs = [
    [128, 150, 70], [80, 160, 48], [180, 158, 52], [110, 120, 44],
    [155, 118, 40], [60, 175, 30], [200, 178, 28],
  ];
  for (const [x, y, r] of blobs) {
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(255,255,255,0.85)');
    grad.addColorStop(0.65, 'rgba(250,252,255,0.45)');
    grad.addColorStop(1, 'rgba(245,250,255,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class SkyEnv {
  constructor(scene, renderer) {
    this.sunDir = new THREE.Vector3(-0.42, 0.52, -0.74).normalize();
    this.skyZenith = new THREE.Color(0x2570bd);
    this.skyHorizon = new THREE.Color(0xd6ecf2);
    this.skyMid = new THREE.Color(0x7db8e3);
    this.fogColor = new THREE.Color(0xc9e4ee);
    this.fogDensity = 0.0004;

    scene.fog = new THREE.FogExp2(this.fogColor, this.fogDensity);
    renderer.setClearColor(this.fogColor);

    // --- dome
    this.domeUniforms = {
      uZenith: { value: this.skyZenith },
      uMid: { value: this.skyMid },
      uHorizon: { value: this.skyHorizon },
      uSunDir: { value: this.sunDir },
      uSunColor: { value: new THREE.Color(0xfff0cf) },
    };
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(5200, 32, 18),
      new THREE.ShaderMaterial({
        vertexShader: SKY_VERT,
        fragmentShader: SKY_FRAG,
        uniforms: this.domeUniforms,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
      })
    );
    dome.frustumCulled = false;
    dome.renderOrder = -10;
    this.dome = dome;
    scene.add(dome);

    // --- sun light + shadows (shadow box follows the ship in update())
    const sun = new THREE.DirectionalLight(0xfff1d8, 2.7);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 100;
    sun.shadow.camera.far = 1400;
    const ext = 120;
    sun.shadow.camera.left = -ext;
    sun.shadow.camera.right = ext;
    sun.shadow.camera.top = ext;
    sun.shadow.camera.bottom = -ext;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 2.0;
    this.sun = sun;
    scene.add(sun);
    scene.add(sun.target);

    this.hemi = new THREE.HemisphereLight(0xa8d8ff, 0x3f6b50, 0.95);
    scene.add(this.hemi);

    // --- clouds
    const cloudGeo = new THREE.PlaneGeometry(1, 0.55);
    const N_CLOUDS = 18;
    const cloudMat = new THREE.ShaderMaterial({
      vertexShader: CLOUD_VERT,
      fragmentShader: CLOUD_FRAG,
      uniforms: { uMap: { value: makeCloudTexture() } },
      transparent: true,
      depthWrite: false,
      fog: false,
    });
    const clouds = new THREE.InstancedMesh(cloudGeo, cloudMat, N_CLOUDS);
    const scales = new Float32Array(N_CLOUDS * 2);
    const m = new THREE.Matrix4();
    this.cloudData = [];
    for (let i = 0; i < N_CLOUDS; i++) {
      const a = (i / N_CLOUDS) * Math.PI * 2 + (i % 3) * 0.41;
      const r = 900 + ((i * 467) % 2100);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const y = 320 + ((i * 211) % 260);
      m.makeTranslation(x, y, z);
      clouds.setMatrixAt(i, m);
      scales[i * 2] = 380 + ((i * 137) % 420);
      scales[i * 2 + 1] = 0.5 + ((i * 31) % 40) / 100;
      this.cloudData.push({ x, y, z });
    }
    cloudGeo.setAttribute('aScale', new THREE.InstancedBufferAttribute(scales, 2));
    clouds.instanceMatrix.needsUpdate = true;
    clouds.frustumCulled = false;
    this.clouds = clouds;
    this._cloudM = m;
    scene.add(clouds);
  }

  update(dt, focus, camPos) {
    // dome + clouds follow the camera so the horizon never ends
    this.dome.position.set(camPos.x, 0, camPos.z);
    // shadow box follows the ship
    this.sun.position.copy(focus).addScaledVector(this.sunDir, 700);
    this.sun.target.position.copy(focus);
    // clouds drift downwind
    for (let i = 0; i < this.cloudData.length; i++) {
      const c = this.cloudData[i];
      c.x += WIND.dirX * dt * 2.4;
      c.z += WIND.dirZ * dt * 2.4;
      // wrap around the camera
      const dx = c.x - camPos.x;
      const dz = c.z - camPos.z;
      if (dx * dx + dz * dz > 3400 * 3400) {
        c.x = camPos.x - dx * 0.96;
        c.z = camPos.z - dz * 0.96;
      }
      this._cloudM.makeTranslation(c.x, c.y, c.z);
      this.clouds.setMatrixAt(i, this._cloudM);
    }
    this.clouds.instanceMatrix.needsUpdate = true;
  }
}
