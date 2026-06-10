// Tiny seeded 2D value-noise + fBm. Dependency-free, deterministic.
// Used for island terrain detail and vegetation scatter.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createNoise2D(seed = 1337) {
  const rand = mulberry32(seed);
  const SIZE = 256;
  const perm = new Uint8Array(SIZE * 2);
  const grads = new Float32Array(SIZE * 2);
  const p = new Uint8Array(SIZE);
  for (let i = 0; i < SIZE; i++) p[i] = i;
  for (let i = SIZE - 1; i > 0; i--) {
    const j = (rand() * (i + 1)) | 0;
    const tmp = p[i];
    p[i] = p[j];
    p[j] = tmp;
  }
  for (let i = 0; i < SIZE * 2; i++) perm[i] = p[i & 255];
  for (let i = 0; i < SIZE; i++) {
    const a = rand() * Math.PI * 2;
    grads[i * 2] = Math.cos(a);
    grads[i * 2 + 1] = Math.sin(a);
  }

  function dotGrad(ix, iz, fx, fz) {
    const g = perm[(ix & 255) + perm[iz & 255]];
    return grads[g * 2] * fx + grads[g * 2 + 1] * fz;
  }

  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);

  // Perlin-style gradient noise, output roughly in [-1, 1]
  return function noise2D(x, z) {
    const ix = Math.floor(x);
    const iz = Math.floor(z);
    const fx = x - ix;
    const fz = z - iz;
    const u = fade(fx);
    const v = fade(fz);
    const n00 = dotGrad(ix, iz, fx, fz);
    const n10 = dotGrad(ix + 1, iz, fx - 1, fz);
    const n01 = dotGrad(ix, iz + 1, fx, fz - 1);
    const n11 = dotGrad(ix + 1, iz + 1, fx - 1, fz - 1);
    const nx0 = n00 + (n10 - n00) * u;
    const nx1 = n01 + (n11 - n01) * u;
    return (nx0 + (nx1 - nx0) * v) * 1.9;
  };
}

export function createFbm2D(seed = 1337, octaves = 4, lacunarity = 2.0, gain = 0.5) {
  const noise = createNoise2D(seed);
  return function fbm(x, z) {
    let amp = 1;
    let freq = 1;
    let sum = 0;
    let norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += noise(x * freq, z * freq) * amp;
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  };
}
