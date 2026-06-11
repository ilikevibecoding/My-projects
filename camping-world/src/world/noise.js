/**
 * Small seeded 2D value-noise with fBm — deterministic across runs so the
 * world layout, scatter, and harness screenshots are reproducible.
 */
export function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const PERM_SIZE = 256;

export function makeNoise2D(seed = 1337) {
  const rng = makeRng(seed);
  const perm = new Uint8Array(PERM_SIZE * 2);
  const base = Array.from({ length: PERM_SIZE }, (_, i) => i);
  for (let i = PERM_SIZE - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [base[i], base[j]] = [base[j], base[i]];
  }
  for (let i = 0; i < PERM_SIZE * 2; i++) perm[i] = base[i & (PERM_SIZE - 1)];

  const grads = new Float32Array(PERM_SIZE * 2);
  for (let i = 0; i < PERM_SIZE; i++) {
    const a = (i / PERM_SIZE) * Math.PI * 2 * 7.13; // scrambled directions
    grads[i * 2] = Math.cos(a);
    grads[i * 2 + 1] = Math.sin(a);
  }

  function dotGrad(ix, iz, fx, fz) {
    const h = perm[(perm[ix & 255] + iz) & 255];
    return grads[h * 2] * fx + grads[h * 2 + 1] * fz;
  }

  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);

  // Perlin-style gradient noise, output ≈ [-1, 1]
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

export function makeFbm2D(seed, octaves = 4, lacunarity = 2.0, gain = 0.5) {
  const noise = makeNoise2D(seed);
  return (x, z) => {
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
