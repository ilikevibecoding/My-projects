// ---------------------------------------------------------------------------
// waves.js — single source of truth for the ocean wave model.
//
// A sum of Gerstner (trochoidal) waves. The SAME wave list drives:
//   * the GPU ocean shader (vertex displacement + analytic normals), and
//   * the CPU physics sampler used for ship buoyancy.
// so the ship floats on exactly the surface you see.
//
// Pure JS module (no three.js import) so it can be unit-tested in Node.
// ---------------------------------------------------------------------------

const G = 9.81;
const TAU = Math.PI * 2;

export const WIND = {
  // Unit direction the wind blows TOWARD (XZ plane), plus speed in m/s.
  dirX: Math.SQRT1_2,
  dirZ: Math.SQRT1_2,
  speed: 9,
};

function makeWave(angleDeg, wavelength, amplitude, steepness, speedMult = 1) {
  const a = (angleDeg * Math.PI) / 180;
  const k = TAU / wavelength;
  return {
    dirX: Math.cos(a),
    dirZ: Math.sin(a),
    k,
    // Deep-water dispersion relation: omega = sqrt(g * k)
    omega: Math.sqrt(G * k) * speedMult,
    amp: amplitude,
    steep: steepness, // per-wave Q in [0,1]; sum of Q*k*A must stay < 1
    phase: (angleDeg * 7.3) % TAU, // deterministic de-correlated phase
  };
}

// Wind blows toward +X+Z (45deg). Wave directions are spread around it.
// GEO waves displace geometry AND drive physics. DETAIL waves are tiny
// ripples evaluated per-pixel in the fragment shader only (sparkle), so the
// physics surface still matches the rendered geometry.
export const GEO_WAVES = [
  makeWave(43, 95, 1.05, 0.62), // primary swell
  makeWave(61, 64, 0.62, 0.65), // secondary swell
  makeWave(27, 38, 0.34, 0.7),
  makeWave(74, 23, 0.21, 0.72),
  makeWave(8, 15, 0.13, 0.78),
  makeWave(66, 9.5, 0.062, 0.8),
  makeWave(30, 6.3, 0.03, 0.85),
];

export const DETAIL_WAVES = [
  makeWave(49, 3.7, 0.022, 0.9),
  makeWave(18, 2.5, 0.014, 0.9),
  makeWave(78, 1.7, 0.009, 0.9),
];

// Safety check (dev aid): total steepness must stay below 1 or crests loop.
export function totalSteepness(waves = GEO_WAVES) {
  return waves.reduce((s, w) => s + w.steep * w.k * w.amp, 0);
}

// --- CPU evaluation ---------------------------------------------------------

/**
 * Evaluate the Gerstner sum at undisplaced position (x0, z0).
 * Writes displaced position, normal and surface velocity into `out`.
 */
export function evaluateAt(x0, z0, t, out) {
  let dx = 0;
  let dy = 0;
  let dz = 0;
  let vx = 0;
  let vy = 0;
  let vz = 0;
  let nx = 0;
  let nz = 0;
  let ny = 1;
  for (let i = 0; i < GEO_WAVES.length; i++) {
    const w = GEO_WAVES[i];
    const f = w.k * (w.dirX * x0 + w.dirZ * z0) - w.omega * t + w.phase;
    const c = Math.cos(f);
    const s = Math.sin(f);
    const qa = w.steep * w.amp;
    dx += qa * w.dirX * c;
    dz += qa * w.dirZ * c;
    dy += w.amp * s;
    // d/dt of the displacement (surface velocity at this material point)
    vx += qa * w.dirX * s * w.omega;
    vz += qa * w.dirZ * s * w.omega;
    vy += -w.amp * c * w.omega;
    // Analytic normal accumulation
    const wka = w.k * w.amp;
    nx -= w.dirX * wka * c;
    nz -= w.dirZ * wka * c;
    ny -= w.steep * wka * s;
  }
  out.x = x0 + dx;
  out.y = dy;
  out.z = z0 + dz;
  out.vx = vx;
  out.vy = vy;
  out.vz = vz;
  const invLen = 1 / Math.hypot(nx, ny, nz);
  out.nx = nx * invLen;
  out.ny = ny * invLen;
  out.nz = nz * invLen;
  return out;
}

const _scratch = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, nx: 0, ny: 1, nz: 0 };

/**
 * True water sample at a given WORLD (x, z): because Gerstner waves displace
 * horizontally, we invert the horizontal displacement with a fixed-point
 * iteration (converges fast while total steepness < 1).
 * Writes { height, nx, ny, nz, vx, vy, vz } into `out` and returns it.
 */
export function sampleAt(x, z, t, out) {
  let px = x;
  let pz = z;
  for (let iter = 0; iter < 3; iter++) {
    evaluateAt(px, pz, t, _scratch);
    px += x - _scratch.x;
    pz += z - _scratch.z;
  }
  evaluateAt(px, pz, t, _scratch);
  out.height = _scratch.y;
  out.nx = _scratch.nx;
  out.ny = _scratch.ny;
  out.nz = _scratch.nz;
  out.vx = _scratch.vx;
  out.vy = _scratch.vy;
  out.vz = _scratch.vz;
  return out;
}

const _h = { height: 0, nx: 0, ny: 1, nz: 0, vx: 0, vy: 0, vz: 0 };

/** Convenience: just the height at world (x, z). */
export function heightAt(x, z, t) {
  return sampleAt(x, z, t, _h).height;
}

// --- GPU data ---------------------------------------------------------------

/**
 * Pack a wave list into flat arrays for shader uniforms.
 * waveA[i] = (dirX, dirZ, k, omega); waveB[i] = (amp, steep, phase, 0)
 */
export function packWaves(waves) {
  const a = new Float32Array(waves.length * 4);
  const b = new Float32Array(waves.length * 4);
  waves.forEach((w, i) => {
    a[i * 4 + 0] = w.dirX;
    a[i * 4 + 1] = w.dirZ;
    a[i * 4 + 2] = w.k;
    a[i * 4 + 3] = w.omega;
    b[i * 4 + 0] = w.amp;
    b[i * 4 + 1] = w.steep;
    b[i * 4 + 2] = w.phase;
    b[i * 4 + 3] = 0;
  });
  return { a, b, count: waves.length };
}

/**
 * GLSL snippet implementing the same Gerstner sum (geometry waves).
 * Each wave fades out with camera distance proportionally to its wavelength,
 * so short chop never aliases on the coarse distant mesh; the physics
 * (sampled near the ship, well inside every fade range) stays exact.
 */
export const GERSTNER_GLSL = /* glsl */ `
struct WaveOut { vec3 disp; vec3 normal; float crest; };

WaveOut gerstner(vec2 p0, float t, vec4 waveA[NUM_GEO_WAVES], vec4 waveB[NUM_GEO_WAVES], float dist) {
  vec3 disp = vec3(0.0);
  vec3 n = vec3(0.0, 1.0, 0.0);
  float crest = 0.0;
  for (int i = 0; i < NUM_GEO_WAVES; i++) {
    vec2 D = waveA[i].xy;
    float k = waveA[i].z;
    float om = waveA[i].w;
    float L = 6.2831853 / k;
    float fade = 1.0 - smoothstep(L * 30.0, L * 95.0, dist);
    float amp = waveB[i].x * fade;
    float q = waveB[i].y;
    float f = k * dot(D, p0) - om * t + waveB[i].z;
    float c = cos(f);
    float s = sin(f);
    float qa = q * amp;
    disp.xz += qa * D * c;
    disp.y += amp * s;
    float wka = k * amp;
    n.xz -= D * wka * c;
    n.y -= q * wka * s;
    crest += q * wka * s;
  }
  WaveOut o;
  o.disp = disp;
  o.normal = normalize(n);
  o.crest = crest;
  return o;
}
`;
