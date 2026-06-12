// Procedural gradient sky dome: sun disk + halo, moon, hash stars, FBM clouds.
import * as THREE from 'three';
import { GLSL_NOISE } from './noise.js';

export function createSky() {
  const uniforms = {
    uTopColor: { value: new THREE.Color(0x3a76c4) },
    uHorizonColor: { value: new THREE.Color(0xcfe0ea) },
    uBottomColor: { value: new THREE.Color(0x8aa3b8) },
    uSunDir: { value: new THREE.Vector3(0.5, 0.6, 0.3).normalize() },
    uSunColor: { value: new THREE.Color(0xfff2d8) },
    uSunIntensity: { value: 1.0 },
    uMoonDir: { value: new THREE.Vector3(-0.4, 0.5, -0.5).normalize() },
    uMoonIntensity: { value: 0.0 },
    uStarIntensity: { value: 0.0 },
    uCloudAmount: { value: 0.4 },
    uCloudColor: { value: new THREE.Color(0xffffff) },
    uCloudShadow: { value: new THREE.Color(0x8898b0) },
    uTime: { value: 0 },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_Position.z = gl_Position.w; // push to far plane
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vDir;
      uniform vec3 uTopColor, uHorizonColor, uBottomColor, uSunColor;
      uniform vec3 uSunDir, uMoonDir;
      uniform vec3 uCloudColor, uCloudShadow;
      uniform float uSunIntensity, uMoonIntensity, uStarIntensity, uCloudAmount, uTime;
      ${GLSL_NOISE}

      float hash13(vec3 p3) {
        p3 = fract(p3 * 0.1031);
        p3 += dot(p3, p3.zyx + 31.32);
        return fract((p3.x + p3.y) * p3.z);
      }

      void main() {
        vec3 dir = normalize(vDir);
        float h = dir.y;

        // base gradient
        vec3 sky = mix(uHorizonColor, uTopColor, pow(clamp(h, 0.0, 1.0), 0.5));
        sky = mix(uBottomColor, sky, smoothstep(-0.12, 0.02, h));

        // sun disk + halo (HDR for bloom)
        float sd = dot(dir, uSunDir);
        float disk = smoothstep(0.99985, 0.99995, sd);
        float halo = pow(clamp(sd, 0.0, 1.0), 90.0) * 0.5
                   + pow(clamp(sd, 0.0, 1.0), 8.0) * 0.12;
        sky += uSunColor * (disk * 5.0 + halo) * uSunIntensity;

        // moon: crisp disk with subtle dark maria
        float md = dot(dir, uMoonDir);
        float mdisk = smoothstep(0.99955, 0.99985, md);
        if (mdisk > 0.0 && uMoonIntensity > 0.0) {
          float maria = fbm(dir.xy * 160.0 + 31.0);
          vec3 moonCol = mix(vec3(0.95, 0.97, 1.0), vec3(0.62, 0.68, 0.8), smoothstep(0.45, 0.7, maria));
          sky += moonCol * mdisk * 2.4 * uMoonIntensity;
        }
        float mhalo = pow(clamp(md, 0.0, 1.0), 220.0);
        sky += vec3(0.55, 0.65, 0.9) * mhalo * 0.5 * uMoonIntensity;

        // stars (hash cells on the direction sphere)
        if (uStarIntensity > 0.001 && h > -0.05) {
          vec3 sp = dir * 80.0;
          vec3 cell = floor(sp);
          vec3 f = fract(sp);
          float hsh = hash13(cell);
          if (hsh > 0.82) {
            vec3 starPos = vec3(hash13(cell + 1.7), hash13(cell + 9.2), hash13(cell + 4.4));
            float d = length(f - starPos);
            float star = smoothstep(0.18, 0.0, d);
            float tw = 0.7 + 0.3 * sin(uTime * (1.5 + hsh * 4.0) + hsh * 40.0);
            float mag = pow((hsh - 0.82) / 0.18, 1.6);
            sky += vec3(0.9, 0.93, 1.0) * star * tw * mag * 2.2 * uStarIntensity * smoothstep(-0.02, 0.12, h);
          }
        }

        // clouds: drifting FBM band projected on a virtual plane
        if (h > 0.02) {
          vec2 cp = dir.xz / (dir.y + 0.18) * 1.6 + vec2(uTime * 0.004, uTime * 0.0013);
          float cl = fbm(cp * 1.6) * 0.65 + fbm(cp * 5.0 + 7.7) * 0.35;
          float cov = smoothstep(0.62 - uCloudAmount * 0.25, 0.78, cl);
          cov *= smoothstep(0.02, 0.14, h);          // fade at horizon
          float lit = fbm(cp * 1.6 + uSunDir.xz * 0.6);
          vec3 cloudCol = mix(uCloudShadow, uCloudColor, clamp(0.4 + (cl - lit) * 2.0, 0.0, 1.0));
          sky = mix(sky, cloudCol, cov * 0.85);
        }

        gl_FragColor = vec4(sky, 1.0);
      }
    `,
  });

  const geo = new THREE.SphereGeometry(1600, 48, 24);
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'sky';
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;

  return { mesh, uniforms };
}
