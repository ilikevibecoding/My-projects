// Pond: custom planar reflector + scrolling normal maps + fresnel + shore fade.
import * as THREE from 'three';
import { POND, WATER_LEVEL, getTerrainHeight } from './terrain.js';
import { makeWaterNormalTexture } from './textures.js';
import { LAYER_NO_REFLECT } from './vegetation.js';

export function createWater(renderer, scene) {
  const R = POND.r * 1.45;
  const SEG_T = 64, SEG_R = 20;
  const geo = new THREE.RingGeometry(0.05, R, SEG_T, SEG_R);
  geo.rotateX(-Math.PI / 2);
  geo.translate(POND.x, WATER_LEVEL, POND.z);

  // per-vertex water depth (for shoreline fade — no depth texture needed)
  const pos = geo.attributes.position;
  const depth = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    depth[i] = Math.max(0, WATER_LEVEL - getTerrainHeight(x, z));
  }
  geo.setAttribute('aDepth', new THREE.BufferAttribute(depth, 1));

  const normalTex = makeWaterNormalTexture();

  const RT_SIZE = 512;
  const renderTarget = new THREE.WebGLRenderTarget(RT_SIZE, RT_SIZE, {
    type: THREE.HalfFloatType,
  });

  const uniforms = {
    tReflection: { value: renderTarget.texture },
    uTexMatrix: { value: new THREE.Matrix4() },
    uNormalMap: { value: normalTex },
    uTime: { value: 0 },
    uShallowColor: { value: new THREE.Color(0x4d7f70) },
    uDeepColor: { value: new THREE.Color(0x1d3f52) },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunColor: { value: new THREE.Color(0xffffff) },
    fogColor: { value: new THREE.Color(0xffffff) },
    fogDensity: { value: 0.0013 },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    fog: false, // we do fog manually (FogExp2-compatible)
    vertexShader: /* glsl */ `
      varying vec4 vRefUV;
      varying vec3 vWPos;
      varying float vDepth;
      uniform mat4 uTexMatrix;
      attribute float aDepth;
      void main() {
        vWPos = position;
        vDepth = aDepth;
        vRefUV = uTexMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec4 vRefUV;
      varying vec3 vWPos;
      varying float vDepth;
      uniform sampler2D tReflection;
      uniform sampler2D uNormalMap;
      uniform float uTime;
      uniform vec3 uShallowColor, uDeepColor, uSunDir, uSunColor;
      uniform vec3 fogColor;
      uniform float fogDensity;

      void main() {
        vec2 uv1 = vWPos.xz * 0.085 + vec2(uTime * 0.013, uTime * 0.021);
        vec2 uv2 = vWPos.xz * 0.16 + vec2(-uTime * 0.027, uTime * 0.011);
        vec3 n1 = texture2D(uNormalMap, uv1).xyz * 2.0 - 1.0;
        vec3 n2 = texture2D(uNormalMap, uv2).xyz * 2.0 - 1.0;
        vec3 nrm = normalize(vec3(n1.x + n2.x, 11.0, n1.y + n2.y));

        vec3 viewDir = normalize(cameraPosition - vWPos);
        float fres = pow(1.0 - max(dot(viewDir, vec3(0.0, 1.0, 0.0)), 0.0), 3.0);
        fres = mix(0.26, 1.0, fres);

        vec4 refUV = vRefUV;
        refUV.xy += nrm.xz * 0.22 * refUV.w;
        vec3 refl = texture2DProj(tReflection, refUV).rgb;

        float depthT = clamp(vDepth / 1.6, 0.0, 1.0);
        vec3 waterCol = mix(uShallowColor, uDeepColor, depthT);
        vec3 col = mix(waterCol, refl, clamp(fres + 0.25, 0.0, 1.0));

        // sun glints
        vec3 hv = normalize(viewDir + uSunDir);
        float spec = pow(max(dot(nrm, hv), 0.0), 120.0);
        col += uSunColor * spec * 1.1;

        // shoreline: fade alpha + slight foam lightening
        float edge = smoothstep(0.0, 0.5, vDepth);
        float foam = (1.0 - smoothstep(0.0, 0.35, vDepth)) * 0.4;
        col += vec3(0.7, 0.8, 0.8) * foam * 0.35;

        // manual exp2 fog so the pond matches terrain haze
        float dist = length(cameraPosition - vWPos);
        float fogF = 1.0 - exp(-fogDensity * fogDensity * dist * dist);
        col = mix(col, fogColor, clamp(fogF, 0.0, 1.0));

        gl_FragColor = vec4(col, edge * 0.96);
      }
    `,
  });

  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'pond';
  mesh.renderOrder = 2;

  // ----- planar reflection -----
  const reflectorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -WATER_LEVEL);
  const mirrorCamera = new THREE.PerspectiveCamera();
  const textureMatrix = uniforms.uTexMatrix.value;

  const normal = new THREE.Vector3();
  const view = new THREE.Vector3();
  const lookAtPosition = new THREE.Vector3();
  const target = new THREE.Vector3();
  const q = new THREE.Vector4();
  const clipPlane = new THREE.Vector4();

  mesh.onBeforeRender = (rdr, scn, camera) => {
    if (camera === mirrorCamera) return;

    normal.set(0, 1, 0);
    const camPos = camera.getWorldPosition(new THREE.Vector3());
    if (camPos.y < WATER_LEVEL) return; // below plane: skip

    view.copy(camPos);
    view.y = 2 * WATER_LEVEL - view.y; // mirror

    mirrorCamera.position.copy(view);
    camera.getWorldDirection(lookAtPosition);
    lookAtPosition.y *= -1;
    target.copy(view).add(lookAtPosition);
    mirrorCamera.up.set(0, -1, 0);
    mirrorCamera.lookAt(target);
    mirrorCamera.far = camera.far;
    mirrorCamera.fov = camera.fov;
    mirrorCamera.aspect = camera.aspect;
    mirrorCamera.near = camera.near;
    mirrorCamera.updateProjectionMatrix();
    mirrorCamera.updateMatrixWorld();

    textureMatrix.set(
      0.5, 0.0, 0.0, 0.5,
      0.0, 0.5, 0.0, 0.5,
      0.0, 0.0, 0.5, 0.5,
      0.0, 0.0, 0.0, 1.0,
    );
    textureMatrix.multiply(mirrorCamera.projectionMatrix);
    textureMatrix.multiply(mirrorCamera.matrixWorldInverse);

    // oblique near-plane clipping at the water plane
    reflectorPlane.set(new THREE.Vector3(0, 1, 0), -WATER_LEVEL);
    reflectorPlane.applyMatrix4(mirrorCamera.matrixWorldInverse);
    clipPlane.set(reflectorPlane.normal.x, reflectorPlane.normal.y, reflectorPlane.normal.z, reflectorPlane.constant);
    const projectionMatrix = mirrorCamera.projectionMatrix;
    q.x = (Math.sign(clipPlane.x) + projectionMatrix.elements[8]) / projectionMatrix.elements[0];
    q.y = (Math.sign(clipPlane.y) + projectionMatrix.elements[9]) / projectionMatrix.elements[5];
    q.z = -1.0;
    q.w = (1.0 + projectionMatrix.elements[10]) / projectionMatrix.elements[14];
    clipPlane.multiplyScalar(2.0 / clipPlane.dot(q));
    projectionMatrix.elements[2] = clipPlane.x;
    projectionMatrix.elements[6] = clipPlane.y;
    projectionMatrix.elements[10] = clipPlane.z + 1.0;
    projectionMatrix.elements[14] = clipPlane.w;

    // exclude grass + the pond itself from the reflection
    mirrorCamera.layers.enableAll();
    mirrorCamera.layers.disable(LAYER_NO_REFLECT);
    mesh.visible = false;
    const currentRT = rdr.getRenderTarget();
    const currentXr = rdr.xr.enabled;
    const currentShadow = rdr.shadowMap.autoUpdate;
    rdr.xr.enabled = false;
    rdr.shadowMap.autoUpdate = false;
    rdr.setRenderTarget(renderTarget);
    rdr.state.buffers.depth.setMask(true);
    if (rdr.autoClear === false) rdr.clear();
    rdr.render(scn, mirrorCamera);
    rdr.xr.enabled = currentXr;
    rdr.shadowMap.autoUpdate = currentShadow;
    rdr.setRenderTarget(currentRT);
    mesh.visible = true;
  };

  function update(time, fog, sunDir, sunColor) {
    uniforms.uTime.value = time;
    uniforms.fogColor.value.copy(fog.color);
    uniforms.fogDensity.value = fog.density;
    uniforms.uSunDir.value.copy(sunDir);
    uniforms.uSunColor.value.copy(sunColor);
  }

  return { mesh, update };
}
