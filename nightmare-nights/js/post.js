// Minimal hand-rolled post pass: film grain, vignette, chromatic aberration,
// flicker, and a fear-pulse. Renders the scene to a target, then draws a
// fullscreen quad through the shader below.
import * as THREE from 'three';

const VERT = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const FRAG = /* glsl */`
  uniform sampler2D tDiffuse;
  uniform float uTime;
  uniform float uGrain;
  uniform float uVignette;
  uniform float uAberration;
  uniform float uFlicker;
  uniform float uFear;       // 0..1 — pulsing red edges when things go wrong
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  void main() {
    vec2 uv = vUv;
    vec2 center = uv - 0.5;
    float dist = length(center);

    // chromatic aberration, stronger at edges
    float ab = uAberration * (0.5 + uFear * 2.0) * dist;
    vec2 dir = normalize(center + 1e-6);
    float r = texture2D(tDiffuse, uv - dir * ab).r;
    float g = texture2D(tDiffuse, uv).g;
    float b = texture2D(tDiffuse, uv + dir * ab).b;
    vec3 col = vec3(r, g, b);

    // film grain
    float n = hash(uv * (uTime * 60.0 + 1.0));
    col += (n - 0.5) * uGrain;

    // scanline shimmer (very subtle)
    col *= 1.0 - 0.03 * sin(uv.y * 900.0 + uTime * 9.0);

    // flicker
    col *= 1.0 - uFlicker * (0.4 + 0.6 * hash(vec2(floor(uTime * 24.0), 7.0)));

    // vignette
    float vig = smoothstep(0.95, 0.32, dist * uVignette);
    col *= vig;

    // fear pulse — dark red creeping at edges
    float pulse = uFear * (0.6 + 0.4 * sin(uTime * 7.0));
    col = mix(col, vec3(0.25, 0.0, 0.0), pulse * smoothstep(0.25, 0.75, dist));

    gl_FragColor = vec4(col, 1.0);
  }
`;

export class PostFX {
  constructor(renderer) {
    this.renderer = renderer;
    this.target = new THREE.WebGLRenderTarget(2, 2, {
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    });
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: this.target.texture },
        uTime: { value: 0 },
        uGrain: { value: 0.085 },
        uVignette: { value: 1.25 },
        uAberration: { value: 0.0035 },
        uFlicker: { value: 0 },
        uFear: { value: 0 },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.scene.add(this.quad);
  }

  setSize(w, h, pr) {
    this.target.setSize(Math.floor(w * pr), Math.floor(h * pr));
  }

  render(scene, camera, time) {
    this.material.uniforms.uTime.value = time;
    this.renderer.setRenderTarget(this.target);
    this.renderer.render(scene, camera);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.scene, this.camera);
  }
}
