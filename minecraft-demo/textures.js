// Procedural block textures for the hyper-realistic Minecraft demo.
// Each entry draws one seamless, fully-detailed SxS texture into a 2D canvas.
window.MC_TEXTURES = window.MC_TEXTURES || {};

MC_TEXTURES["sand"] = function (ctx, S) {
  function hash2(ix, iy, seed) {
    let h = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1274126177);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function vnoise(x, y, per, seed) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const g = (ix, iy) => hash2(((ix % per) + per) % per, ((iy % per) + per) % per, seed);
    const a = g(xi, yi), b = g(xi + 1, yi), c = g(xi, yi + 1), dd = g(xi + 1, yi + 1);
    return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + dd * u * v;
  }
  function fbm(x, y, per, seed) {
    let amp = 0.5, sum = 0, p = per, f = 1, norm = 0;
    for (let o = 0; o < 4; o++) { sum += amp * vnoise(x * f, y * f, p, seed + o * 101); norm += amp; amp *= 0.5; f *= 2; p *= 2; }
    return sum / norm;
  }
  const clamp = (v) => v < 0 ? 0 : v > 255 ? 255 : v;
  const per = 8;
  const img = ctx.createImageData(S, S);
  const d = img.data;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const nx = x / S * per, ny = y / S * per;
      const n = fbm(nx, ny, per, 11);
      const ripple = Math.sin((x / S) * Math.PI * 2 * 6 + n * 6.0 + (y / S) * Math.PI * 2 * 1) * 0.5 + 0.5;
      const grain = hash2(x, y, 7) - 0.5;
      const shade = (n * 22 - 11) + (ripple - 0.5) * 9 + grain * 14;
      let r = 218 + shade * 0.9;
      let g = 206 + shade * 0.95;
      let b = 160 + shade * 1.1;
      if (hash2(x, y, 99) > 0.972) { r -= 34; g -= 32; b -= 27; }
      const edge = Math.min(Math.min(x, S - 1 - x), Math.min(y, S - 1 - y)) / (S * 0.12);
      const ao = edge < 1 ? 0.93 + 0.07 * edge : 1;
      const i = (y * S + x) * 4;
      d[i] = clamp(r * ao); d[i + 1] = clamp(g * ao); d[i + 2] = clamp(b * ao); d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
};

MC_TEXTURES["snow"] = function (ctx, S) {
  function hash2(ix, iy, seed) {
    let h = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1274126177);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function vnoise(x, y, per, seed) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const g = (ix, iy) => hash2(((ix % per) + per) % per, ((iy % per) + per) % per, seed);
    const a = g(xi, yi), b = g(xi + 1, yi), c = g(xi, yi + 1), dd = g(xi + 1, yi + 1);
    return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + dd * u * v;
  }
  function fbm(x, y, per, seed) {
    let amp = 0.5, sum = 0, p = per, f = 1, norm = 0;
    for (let o = 0; o < 4; o++) { sum += amp * vnoise(x * f, y * f, p, seed + o * 71); norm += amp; amp *= 0.5; f *= 2; p *= 2; }
    return sum / norm;
  }
  const clamp = (v) => v < 0 ? 0 : v > 255 ? 255 : v;
  const per = 6;
  const img = ctx.createImageData(S, S);
  const d = img.data;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const nx = x / S * per, ny = y / S * per;
      const dim = fbm(nx, ny, per, 23) - 0.5;
      const micro = (hash2(x, y, 5) - 0.5) * 3;
      let r = 238 + dim * 7 + micro;
      let g = 242 + dim * 7 + micro;
      let b = 248 + dim * 5 + micro;
      if (dim < 0) { r += dim * 7; g += dim * 4; }
      if (hash2(x, y, 77) > 0.994) { r = 255; g = 255; b = 255; }
      const edge = Math.min(Math.min(x, S - 1 - x), Math.min(y, S - 1 - y)) / (S * 0.12);
      const ao = edge < 1 ? 0.95 + 0.05 * edge : 1;
      const i = (y * S + x) * 4;
      d[i] = clamp(r * ao); d[i + 1] = clamp(g * ao); d[i + 2] = clamp(b * ao); d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
};

MC_TEXTURES["water"] = function (ctx, S) {
  function hash2(ix, iy, seed) {
    let h = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1274126177);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function vnoise(x, y, per, seed) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const g = (ix, iy) => hash2(((ix % per) + per) % per, ((iy % per) + per) % per, seed);
    const a = g(xi, yi), b = g(xi + 1, yi), c = g(xi, yi + 1), dd = g(xi + 1, yi + 1);
    return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + dd * u * v;
  }
  function fbm(x, y, per, seed) {
    let amp = 0.5, sum = 0, p = per, f = 1, norm = 0;
    for (let o = 0; o < 4; o++) { sum += amp * vnoise(x * f, y * f, p, seed + o * 131); norm += amp; amp *= 0.5; f *= 2; p *= 2; }
    return sum / norm;
  }
  const clamp = (v) => v < 0 ? 0 : v > 255 ? 255 : v;
  const per = 6;
  const img = ctx.createImageData(S, S);
  const d = img.data;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const nx = x / S * per, ny = y / S * per;
      const n = fbm(nx, ny, per, 17);
      const wave = Math.sin((y / S) * Math.PI * 2 * 3 + (x / S) * Math.PI * 2 * 2 + n * 7.5) * 0.5 + 0.5;
      const t = Math.max(0, Math.min(1, 0.45 * n + 0.55 * wave));
      let r = 40 + t * 30;
      let g = 90 + t * 50;
      let b = 170 + t * 40;
      if (wave > 0.82 && hash2(x, y, 55) > 0.978) { r += 90; g += 80; b += 55; }
      const edge = Math.min(Math.min(x, S - 1 - x), Math.min(y, S - 1 - y)) / (S * 0.12);
      const ao = edge < 1 ? 0.92 + 0.08 * edge : 1;
      const i = (y * S + x) * 4;
      d[i] = clamp(r * ao); d[i + 1] = clamp(g * ao); d[i + 2] = clamp(b * ao); d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
};

MC_TEXTURES["coal_ore"] = function (ctx, S) {
  function hash2(ix, iy, seed) {
    let h = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1274126177);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function vnoise(x, y, per, seed) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const g = (ix, iy) => hash2(((ix % per) + per) % per, ((iy % per) + per) % per, seed);
    const a = g(xi, yi), b = g(xi + 1, yi), c = g(xi, yi + 1), dd = g(xi + 1, yi + 1);
    return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + dd * u * v;
  }
  function fbm(x, y, per, seed) {
    let amp = 0.5, sum = 0, p = per, f = 1, norm = 0;
    for (let o = 0; o < 4; o++) { sum += amp * vnoise(x * f, y * f, p, seed + o * 53); norm += amp; amp *= 0.5; f *= 2; p *= 2; }
    return sum / norm;
  }
  const clamp = (v) => v < 0 ? 0 : v > 255 ? 255 : v;
  const per = 8;
  const img = ctx.createImageData(S, S);
  const d = img.data;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const nx = x / S * per, ny = y / S * per;
      const v = fbm(nx, ny, per, 5);
      const sp = hash2(x, y, 9) - 0.5;
      let base = 124 + (v - 0.5) * 46 + sp * 16;
      let r = base, g = base, b = base + (v - 0.5) * 4;
      const edge = Math.min(Math.min(x, S - 1 - x), Math.min(y, S - 1 - y)) / (S * 0.12);
      const ao = edge < 1 ? 0.82 + 0.18 * edge : 1;
      const i = (y * S + x) * 4;
      d[i] = clamp(r * ao); d[i + 1] = clamp(g * ao); d[i + 2] = clamp(b * ao); d[i + 3] = 255;
    }
  }
  const setpx = (X, Y, r, g, b, a) => {
    X = ((X % S) + S) % S; Y = ((Y % S) + S) % S;
    const i = (Y * S + X) * 4, ia = 1 - a;
    d[i] = d[i] * ia + r * a; d[i + 1] = d[i + 1] * ia + g * a; d[i + 2] = d[i + 2] * ia + b * a; d[i + 3] = 255;
  };
  const rnd = mulberry32(404);
  const clusters = 4;
  for (let c = 0; c < clusters; c++) {
    const cx = rnd() * S, cy = rnd() * S;
    const count = 4 + Math.floor(rnd() * 4);
    for (let k = 0; k < count; k++) {
      const ang = rnd() * Math.PI * 2, dist = rnd() * S * 0.07;
      const bx = cx + Math.cos(ang) * dist, by = cy + Math.sin(ang) * dist;
      const rad = S * (0.018 + rnd() * 0.024), bs = (rnd() * 1000) | 0;
      const R = Math.ceil(rad) + 1;
      for (let oy = -R; oy <= R; oy++) {
        for (let ox = -R; ox <= R; ox++) {
          const wob = (hash2((bx + ox) | 0, (by + oy) | 0, bs) - 0.5) * rad * 0.4;
          const dd = Math.sqrt(ox * ox + oy * oy) + wob;
          if (dd > rad) continue;
          const t = dd / rad;
          const lit = (-ox - oy) / (rad * 1.6);
          let cval = 32 + lit * 11 - t * 8;
          cval = clamp(Math.max(18, Math.min(46, cval)));
          const a = t < 0.72 ? 1 : Math.max(0, 1 - (t - 0.72) / 0.28);
          setpx(bx + ox, by + oy, cval, cval, cval, a);
        }
      }
    }
  }
  ctx.putImageData(img, 0, 0);
};

MC_TEXTURES["diamond_ore"] = function (ctx, S) {
  function hash2(ix, iy, seed) {
    let h = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1274126177);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function vnoise(x, y, per, seed) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const g = (ix, iy) => hash2(((ix % per) + per) % per, ((iy % per) + per) % per, seed);
    const a = g(xi, yi), b = g(xi + 1, yi), c = g(xi, yi + 1), dd = g(xi + 1, yi + 1);
    return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + dd * u * v;
  }
  function fbm(x, y, per, seed) {
    let amp = 0.5, sum = 0, p = per, f = 1, norm = 0;
    for (let o = 0; o < 4; o++) { sum += amp * vnoise(x * f, y * f, p, seed + o * 89); norm += amp; amp *= 0.5; f *= 2; p *= 2; }
    return sum / norm;
  }
  const clamp = (v) => v < 0 ? 0 : v > 255 ? 255 : v;
  const per = 8;
  const img = ctx.createImageData(S, S);
  const d = img.data;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const nx = x / S * per, ny = y / S * per;
      const v = fbm(nx, ny, per, 5);
      const sp = hash2(x, y, 9) - 0.5;
      let base = 124 + (v - 0.5) * 46 + sp * 16;
      let r = base, g = base, b = base + (v - 0.5) * 4;
      const edge = Math.min(Math.min(x, S - 1 - x), Math.min(y, S - 1 - y)) / (S * 0.12);
      const ao = edge < 1 ? 0.82 + 0.18 * edge : 1;
      const i = (y * S + x) * 4;
      d[i] = clamp(r * ao); d[i + 1] = clamp(g * ao); d[i + 2] = clamp(b * ao); d[i + 3] = 255;
    }
  }
  const setpx = (X, Y, r, g, b, a) => {
    X = ((X % S) + S) % S; Y = ((Y % S) + S) % S;
    const i = (Y * S + X) * 4, ia = 1 - a;
    d[i] = d[i] * ia + r * a; d[i + 1] = d[i + 1] * ia + g * a; d[i + 2] = d[i + 2] * ia + b * a; d[i + 3] = 255;
  };
  const rnd = mulberry32(7777);
  const clusters = 4;
  for (let c = 0; c < clusters; c++) {
    const cx = rnd() * S, cy = rnd() * S;
    const count = 3 + Math.floor(rnd() * 3);
    for (let k = 0; k < count; k++) {
      const ang = rnd() * Math.PI * 2, dist = rnd() * S * 0.065;
      const bx = cx + Math.cos(ang) * dist, by = cy + Math.sin(ang) * dist;
      const rad = S * (0.016 + rnd() * 0.02), bs = (rnd() * 1000) | 0;
      const R = Math.ceil(rad) + 1;
      for (let oy = -R; oy <= R; oy++) {
        for (let ox = -R; ox <= R; ox++) {
          const dd = Math.sqrt(ox * ox + oy * oy);
          if (dd > rad) continue;
          const t = dd / rad;
          const lit = (-ox - oy) / (rad * 1.5);
          const facet = Math.floor(((Math.atan2(oy, ox) + Math.PI) / (Math.PI * 2)) * 5);
          const fv = (hash2(facet, bs, 1) - 0.5) * 36;
          let r = 110 + lit * 28 - t * 38 + fv;
          let g = 232 + lit * 10 - t * 28 + fv * 0.4;
          let b = 245 + lit * 5 - t * 22 + fv * 0.2;
          r = Math.max(90, Math.min(150, r));
          g = Math.max(220, Math.min(245, g));
          b = Math.max(235, Math.min(250, b));
          if (t < 0.3 && lit > 0.45) { r += 70; g += 18; b += 12; }
          const a = t < 0.7 ? 1 : Math.max(0, 1 - (t - 0.7) / 0.3);
          setpx(bx + ox, by + oy, clamp(r), clamp(g), clamp(b), a);
        }
      }
    }
  }
  ctx.putImageData(img, 0, 0);
};

MC_TEXTURES["oak_log_side"] = function (ctx, S) {
  function hash2(ix, iy, seed) {
    let h = Math.imul(ix | 0, 374761393) + Math.imul(iy | 0, 668265263) + Math.imul(seed | 0, 1442695041);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  function vnoise(x, y, Px, Py, seed) {
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const fx = x - x0, fy = y - y0;
    const X0 = ((x0 % Px) + Px) % Px, X1 = (((x0 + 1) % Px) + Px) % Px;
    const Y0 = ((y0 % Py) + Py) % Py, Y1 = (((y0 + 1) % Py) + Py) % Py;
    const v00 = hash2(X0, Y0, seed), v10 = hash2(X1, Y0, seed);
    const v01 = hash2(X0, Y1, seed), v11 = hash2(X1, Y1, seed);
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = v00 + (v10 - v00) * sx, b = v01 + (v11 - v01) * sx;
    return a + (b - a) * sy;
  }
  function fbm(px, py, S, Px, Py, oct, seed) {
    let sum = 0, amp = 1, norm = 0, pX = Px, pY = Py;
    for (let o = 0; o < oct; o++) {
      sum += amp * vnoise((px / S) * pX, (py / S) * pY, pX, pY, seed + o * 131);
      norm += amp; amp *= 0.5; pX *= 2; pY *= 2;
    }
    return sum / norm;
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const cl = (v, a, b) => (v < a ? a : v > b ? b : v);
  const seed = 1337;

  const img = ctx.createImageData(S, S);
  const d = img.data;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const warp = (fbm(x, y, S, 3, 2, 3, seed + 7) - 0.5) * 0.09 * S;
      const gx = x + warp;
      const grain = fbm(gx, y, S, 26, 3, 4, seed + 11);
      const phase = (gx / S) * (Math.PI * 2 * 7) + (fbm(x, y, S, 4, 2, 2, seed + 200) - 0.5) * 3.0;
      const furrow = Math.abs(Math.sin(phase));
      const recess = Math.pow(furrow, 0.6);
      const t = grain * 0.55 + recess * 0.45;
      let R = 90 + t * 60;
      let G = 60 + t * 40;
      let B = 36 + t * 22;
      const sp = (fbm(x, y, S, 90, 18, 2, seed + 303) - 0.5) * 16;
      R += sp; G += sp * 0.7; B += sp * 0.4;
      const eX = Math.min(x, S - 1 - x) / (S * 0.5);
      const eY = Math.min(y, S - 1 - y) / (S * 0.5);
      const ao = 0.80 + 0.20 * cl(Math.min(eX, eY) / 0.12, 0, 1);
      R *= ao; G *= ao; B *= ao;
      const i = (y * S + x) * 4;
      d[i] = cl(R, 0, 255); d[i + 1] = cl(G, 0, 255); d[i + 2] = cl(B, 0, 255); d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  const rng = mulberry32(seed + 99);
  const knots = 3;
  for (let k = 0; k < knots; k++) {
    const kx = rng() * S, ky = rng() * S, kr = S * (0.045 + rng() * 0.04);
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        const KX = kx + ox * S, KY = ky + oy * S;
        if (KX < -kr || KX > S + kr || KY < -kr || KY > S + kr) continue;
        const g = ctx.createRadialGradient(KX, KY, 0, KX, KY, kr);
        g.addColorStop(0.0, "rgba(60,40,22,0.45)");
        g.addColorStop(0.45, "rgba(46,30,17,0.55)");
        g.addColorStop(0.78, "rgba(38,24,14,0.40)");
        g.addColorStop(1.0, "rgba(120,90,55,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(KX, KY, kr, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
};

MC_TEXTURES["oak_log_top"] = function (ctx, S) {
  function hash2(ix, iy, seed) {
    let h = Math.imul(ix | 0, 374761393) + Math.imul(iy | 0, 668265263) + Math.imul(seed | 0, 1442695041);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  function vnoise(x, y, Px, Py, seed) {
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const fx = x - x0, fy = y - y0;
    const X0 = ((x0 % Px) + Px) % Px, X1 = (((x0 + 1) % Px) + Px) % Px;
    const Y0 = ((y0 % Py) + Py) % Py, Y1 = (((y0 + 1) % Py) + Py) % Py;
    const v00 = hash2(X0, Y0, seed), v10 = hash2(X1, Y0, seed);
    const v01 = hash2(X0, Y1, seed), v11 = hash2(X1, Y1, seed);
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = v00 + (v10 - v00) * sx, b = v01 + (v11 - v01) * sx;
    return a + (b - a) * sy;
  }
  function fbm(px, py, S, Px, Py, oct, seed) {
    let sum = 0, amp = 1, norm = 0, pX = Px, pY = Py;
    for (let o = 0; o < oct; o++) {
      sum += amp * vnoise((px / S) * pX, (py / S) * pY, pX, pY, seed + o * 131);
      norm += amp; amp *= 0.5; pX *= 2; pY *= 2;
    }
    return sum / norm;
  }
  const cl = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const seed = 4242;

  const cx = S / 2, cy = S / 2;
  const img = ctx.createImageData(S, S);
  const d = img.data;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = x - cx, dy = y - cy;
      let r = Math.sqrt(dx * dx + dy * dy);
      const ang = Math.atan2(dy, dx);
      const rn = r / (S * 0.5);
      const wob = (fbm(x, y, S, 6, 6, 3, seed) - 0.5) * 0.10 * S;
      const rr = r + wob + (S * 0.012) * Math.sin(ang * 5);
      const rings = 0.5 + 0.5 * Math.sin((rr / (S * 0.5)) * Math.PI * 2 * 9.0);
      let t = Math.pow(rings, 0.8);
      let R = 118 + t * 44;
      let G = 84 + t * 34;
      let B = 46 + t * 20;
      const pith = cl(1 - r / (S * 0.10), 0, 1);
      R = lerp(R, 96, pith * 0.5); G = lerp(G, 64, pith * 0.5); B = lerp(B, 38, pith * 0.5);
      const sp = (fbm(x, y, S, 60, 60, 2, seed + 5) - 0.5) * 14;
      R += sp; G += sp * 0.7; B += sp * 0.4;
      if (rn > 0.86) {
        const bt = cl((rn - 0.86) / 0.28, 0, 1);
        const bn = fbm(x, y, S, 10, 10, 3, seed + 60);
        const bR = 70 + bn * 28, bG = 48 + bn * 20, bB = 30 + bn * 14;
        R = lerp(R, bR, bt); G = lerp(G, bG, bt); B = lerp(B, bB, bt);
      }
      const i = (y * S + x) * 4;
      d[i] = cl(R, 0, 255); d[i + 1] = cl(G, 0, 255); d[i + 2] = cl(B, 0, 255); d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
};

MC_TEXTURES["oak_planks"] = function (ctx, S) {
  function hash2(ix, iy, seed) {
    let h = Math.imul(ix | 0, 374761393) + Math.imul(iy | 0, 668265263) + Math.imul(seed | 0, 1442695041);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  function vnoise(x, y, Px, Py, seed) {
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const fx = x - x0, fy = y - y0;
    const X0 = ((x0 % Px) + Px) % Px, X1 = (((x0 + 1) % Px) + Px) % Px;
    const Y0 = ((y0 % Py) + Py) % Py, Y1 = (((y0 + 1) % Py) + Py) % Py;
    const v00 = hash2(X0, Y0, seed), v10 = hash2(X1, Y0, seed);
    const v01 = hash2(X0, Y1, seed), v11 = hash2(X1, Y1, seed);
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = v00 + (v10 - v00) * sx, b = v01 + (v11 - v01) * sx;
    return a + (b - a) * sy;
  }
  function fbm(px, py, S, Px, Py, oct, seed) {
    let sum = 0, amp = 1, norm = 0, pX = Px, pY = Py;
    for (let o = 0; o < oct; o++) {
      sum += amp * vnoise((px / S) * pX, (py / S) * pY, pX, pY, seed + o * 131);
      norm += amp; amp *= 0.5; pX *= 2; pY *= 2;
    }
    return sum / norm;
  }
  const cl = (v, a, b) => (v < a ? a : v > b ? b : v);
  const seed = 909;

  const nP = 4;
  const plankH = S / nP;
  const gapW = Math.max(2, S * 0.018);
  const segW = S / 2;

  const img = ctx.createImageData(S, S);
  const d = img.data;
  for (let y = 0; y < S; y++) {
    const plankIndex = Math.floor(y / plankH) % nP;
    const yb = ((y % plankH) + plankH) % plankH;
    const gapEdgeY = Math.min(yb, plankH - yb);
    const inHGap = gapEdgeY < gapW * 0.5;
    const offset = (plankIndex % 2) * segW * 0.5;
    const tone = plankIndex % 2 === 0 ? 1.0 : 0.92;
    const seedRow = seed + plankIndex * 37;
    for (let x = 0; x < S; x++) {
      const xb = (((x + offset) % segW) + segW) % segW;
      const gapEdgeX = Math.min(xb, segW - xb);
      const inVGap = !inHGap && gapEdgeX < gapW * 0.5;

      const warp = (fbm(x, y, S, 2, 2, 2, seed + 9) - 0.5) * 0.05 * S;
      const grain = fbm(x + warp, y, S, 4, 28, 4, seedRow);

      let R = (118 + grain * 46) * tone;
      let G = (82 + grain * 38) * tone;
      let B = (45 + grain * 22) * tone;

      const depth = cl(Math.min(gapEdgeY, gapEdgeX) / (gapW * 2.0), 0, 1);
      const dShade = 0.82 + 0.18 * depth;
      R *= dShade; G *= dShade; B *= dShade;

      if (inHGap || inVGap) { R *= 0.30; G *= 0.28; B *= 0.25; }

      const i = (y * S + x) * 4;
      d[i] = cl(R, 0, 255); d[i + 1] = cl(G, 0, 255); d[i + 2] = cl(B, 0, 255); d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  const nr = Math.max(1.2, S * 0.012);
  for (let p = 0; p < nP; p++) {
    const ny = p * plankH + plankH * 0.5;
    const xs = [S * 0.12, S * 0.88];
    for (let n = 0; n < xs.length; n++) {
      const nx = xs[n];
      ctx.fillStyle = "rgba(35,25,15,0.7)";
      ctx.beginPath(); ctx.arc(nx, ny, nr, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgba(210,190,150,0.35)";
      ctx.beginPath(); ctx.arc(nx - nr * 0.3, ny - nr * 0.3, nr * 0.5, 0, Math.PI * 2); ctx.fill();
    }
  }
};

MC_TEXTURES["leaves"] = function (ctx, S) {
  function hash2(ix, iy, seed) {
    let h = Math.imul(ix | 0, 374761393) + Math.imul(iy | 0, 668265263) + Math.imul(seed | 0, 1442695041);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  function vnoise(x, y, Px, Py, seed) {
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const fx = x - x0, fy = y - y0;
    const X0 = ((x0 % Px) + Px) % Px, X1 = (((x0 + 1) % Px) + Px) % Px;
    const Y0 = ((y0 % Py) + Py) % Py, Y1 = (((y0 + 1) % Py) + Py) % Py;
    const v00 = hash2(X0, Y0, seed), v10 = hash2(X1, Y0, seed);
    const v01 = hash2(X0, Y1, seed), v11 = hash2(X1, Y1, seed);
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = v00 + (v10 - v00) * sx, b = v01 + (v11 - v01) * sx;
    return a + (b - a) * sy;
  }
  function fbm(px, py, S, Px, Py, oct, seed) {
    let sum = 0, amp = 1, norm = 0, pX = Px, pY = Py;
    for (let o = 0; o < oct; o++) {
      sum += amp * vnoise((px / S) * pX, (py / S) * pY, pX, pY, seed + o * 131);
      norm += amp; amp *= 0.5; pX *= 2; pY *= 2;
    }
    return sum / norm;
  }
  function leafCell(px, py, S, grid, seed) {
    const gx = (px / S) * grid, gy = (py / S) * grid;
    const xi = Math.floor(gx), yi = Math.floor(gy);
    let f1 = 1e9, f2 = 1e9;
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        const cx = xi + ox, cy = yi + oy;
        const wx = ((cx % grid) + grid) % grid, wy = ((cy % grid) + grid) % grid;
        const fpx = cx + hash2(wx, wy, seed);
        const fpy = cy + hash2(wx, wy, seed + 91);
        const dx = gx - fpx, dy = gy - fpy;
        const dd = Math.sqrt(dx * dx + dy * dy);
        if (dd < f1) { f2 = f1; f1 = dd; } else if (dd < f2) { f2 = dd; }
      }
    }
    return [f1, f2];
  }
  function holeDist(px, py, S, grid, seed) {
    const gx = (px / S) * grid, gy = (py / S) * grid;
    const xi = Math.floor(gx), yi = Math.floor(gy);
    let best = 1e9;
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        const cx = xi + ox, cy = yi + oy;
        const wx = ((cx % grid) + grid) % grid, wy = ((cy % grid) + grid) % grid;
        if (hash2(wx, wy, seed + 555) < 0.55) {
          const fpx = cx + 0.2 + 0.6 * hash2(wx, wy, seed + 1);
          const fpy = cy + 0.2 + 0.6 * hash2(wx, wy, seed + 2);
          const dx = gx - fpx, dy = gy - fpy;
          const dd = Math.sqrt(dx * dx + dy * dy);
          if (dd < best) best = dd;
        }
      }
    }
    return best;
  }
  const cl = (v, a, b) => (v < a ? a : v > b ? b : v);
  const seed = 2024;
  const holeRadius = 0.30;

  const img = ctx.createImageData(S, S);
  const d = img.data;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const fc = leafCell(x, y, S, 7, seed + 30);
      const f1 = fc[0], f2 = fc[1];
      const f1n = cl(f1 / 0.85, 0, 1);
      const bord = cl((f2 - f1) / 0.45, 0, 1);
      const micro = fbm(x, y, S, 50, 50, 2, seed + 9);
      let bright = 0.40 + 0.55 * (1 - f1n) + 0.20 * (micro - 0.5) - 0.35 * (1 - bord);
      bright = cl(bright, 0.05, 1);

      const typ = fbm(x, y, S, 4, 4, 3, seed + 13);
      let R, G, B;
      if (typ > 0.82) {
        R = 120 + 60 * bright; G = 120 + 55 * bright; B = 40 + 25 * bright;
      } else if (typ < 0.10) {
        R = 80 + 50 * bright; G = 58 + 36 * bright; B = 28 + 20 * bright;
      } else {
        R = 26 + 80 * bright; G = 50 + 108 * bright; B = 18 + 52 * bright;
      }
      const sp = (fbm(x, y, S, 95, 95, 2, seed + 71) - 0.5) * 22;
      R += sp; G += sp * 1.1; B += sp * 0.5;

      const i = (y * S + x) * 4;
      if (holeDist(x, y, S, 13, seed + 700) < holeRadius) {
        d[i] = 0; d[i + 1] = 0; d[i + 2] = 0; d[i + 3] = 0;
      } else {
        d[i] = cl(R, 0, 255); d[i + 1] = cl(G, 0, 255); d[i + 2] = cl(B, 0, 255); d[i + 3] = 255;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
};

MC_TEXTURES["stone"] = function (ctx, S) {
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash2(ix, iy, seed) {
    let h = (seed ^ Math.imul(ix | 0, 374761393) ^ Math.imul(iy | 0, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  function vnoise(nx, ny, freq, seed) {
    const fx = nx * freq, fy = ny * freq;
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    let tx = fx - x0, ty = fy - y0;
    tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
    const x0m = ((x0 % freq) + freq) % freq, x1m = ((x0 + 1) % freq + freq) % freq;
    const y0m = ((y0 % freq) + freq) % freq, y1m = ((y0 + 1) % freq + freq) % freq;
    const n00 = hash2(x0m, y0m, seed), n10 = hash2(x1m, y0m, seed);
    const n01 = hash2(x0m, y1m, seed), n11 = hash2(x1m, y1m, seed);
    const a = n00 + (n10 - n00) * tx;
    const b = n01 + (n11 - n01) * tx;
    return a + (b - a) * ty;
  }
  function fbm(nx, ny, seed) {
    let sum = 0, amp = 0.5, f = 4, norm = 0;
    for (let o = 0; o < 4; o++) {
      sum += amp * vnoise(nx, ny, f, seed + o * 131);
      norm += amp; amp *= 0.5; f *= 2;
    }
    return sum / norm;
  }
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const seed = 0x5713;
  const img = ctx.createImageData(S, S);
  const d = img.data;
  for (let y = 0; y < S; y++) {
    const ny = y / S;
    for (let x = 0; x < S; x++) {
      const nx = x / S;
      const n = fbm(nx, ny, seed);
      let v = 128 + (n - 0.5) * 44;
      const blotch = vnoise(nx, ny, 3, seed + 911);
      v += (blotch - 0.5) * 30;
      const blotch2 = vnoise(nx, ny, 6, seed + 1733);
      v += (blotch2 - 0.5) * 16;
      v += (hash2(x, y, seed + 7) - 0.5) * 9;
      v = clamp(v, 70, 190);
      const i = (y * S + x) * 4;
      d[i] = v; d[i + 1] = v; d[i + 2] = v * 0.995; d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  const rnd = mulberry32(seed + 4242);
  const cracks = 4;
  ctx.lineCap = "round";
  for (let c = 0; c < cracks; c++) {
    let px = rnd() * S, py = rnd() * S;
    let ang = rnd() * Math.PI * 2;
    const segs = 6 + ((rnd() * 5) | 0);
    const pts = [[px, py]];
    for (let s = 0; s < segs; s++) {
      ang += (rnd() - 0.5) * 1.1;
      const step = S * (0.04 + rnd() * 0.05);
      px += Math.cos(ang) * step; py += Math.sin(ang) * step;
      pts.push([px, py]);
    }
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        ctx.beginPath();
        ctx.moveTo(pts[0][0] + ox * S, pts[0][1] + oy * S);
        for (let p = 1; p < pts.length; p++) ctx.lineTo(pts[p][0] + ox * S, pts[p][1] + oy * S);
        ctx.lineWidth = Math.max(0.6, S / 320);
        ctx.strokeStyle = "rgba(70,70,72,0.5)";
        ctx.stroke();
        ctx.lineWidth = Math.max(0.4, S / 600);
        ctx.strokeStyle = "rgba(150,150,150,0.25)";
        ctx.stroke();
      }
    }
  }
};

MC_TEXTURES["cobblestone"] = function (ctx, S) {
  function hash2(ix, iy, seed) {
    let h = (seed ^ Math.imul(ix | 0, 374761393) ^ Math.imul(iy | 0, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  function vnoise(nx, ny, freq, seed) {
    const fx = nx * freq, fy = ny * freq;
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    let tx = fx - x0, ty = fy - y0;
    tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
    const x0m = ((x0 % freq) + freq) % freq, x1m = ((x0 + 1) % freq + freq) % freq;
    const y0m = ((y0 % freq) + freq) % freq, y1m = ((y0 + 1) % freq + freq) % freq;
    const n00 = hash2(x0m, y0m, seed), n10 = hash2(x1m, y0m, seed);
    const n01 = hash2(x0m, y1m, seed), n11 = hash2(x1m, y1m, seed);
    const a = n00 + (n10 - n00) * tx;
    const b = n01 + (n11 - n01) * tx;
    return a + (b - a) * ty;
  }
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
  const seed = 0x10b3;
  const G = Math.max(4, Math.round(S / 42));
  const cs = S / G;
  const img = ctx.createImageData(S, S);
  const d = img.data;

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const gx = Math.floor(x / cs), gy = Math.floor(y / cs);
      let f1 = 1e9, f2 = 1e9;
      let bcx = 0, bcy = 0, bidx = 0, bidy = 0;
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          const cx = gx + ox, cy = gy + oy;
          const ix = ((cx % G) + G) % G, iy = ((cy % G) + G) % G;
          const jx = 0.5 + (hash2(ix, iy, seed) - 0.5) * 0.85;
          const jy = 0.5 + (hash2(ix, iy, seed + 57) - 0.5) * 0.85;
          const px = (cx + jx) * cs, py = (cy + jy) * cs;
          const dx = x - px, dy = y - py;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < f1) { f2 = f1; f1 = dist; bcx = px; bcy = py; bidx = ix; bidy = iy; }
          else if (dist < f2) { f2 = dist; }
        }
      }
      let col = 104 + hash2(bidx, bidy, seed + 13) * 64;
      const ox2 = (x - bcx) / cs, oy2 = (y - bcy) / cs;
      const dir = -(ox2 + oy2);
      col += dir * 34;
      const r = Math.sqrt(ox2 * ox2 + oy2 * oy2);
      col -= smooth(clamp((r - 0.18) / 0.45, 0, 1)) * 26;
      col += (vnoise(x / S, y / S, G * 4, seed + 99) - 0.5) * 14;
      col += (hash2(x, y, seed + 5) - 0.5) * 8;
      const border = f2 - f1;
      const mortarW = cs * 0.20;
      const m = smooth(clamp(border / mortarW, 0, 1));
      let mortar = 40 + (vnoise(x / S, y / S, G * 3, seed + 321) - 0.5) * 16;
      let v = mortar + (clamp(col, 60, 210) - mortar) * m;
      v = clamp(v, 24, 215);
      const i = (y * S + x) * 4;
      d[i] = v; d[i + 1] = v; d[i + 2] = v * 0.985; d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
};

MC_TEXTURES["bedrock"] = function (ctx, S) {
  function hash2(ix, iy, seed) {
    let h = (seed ^ Math.imul(ix | 0, 374761393) ^ Math.imul(iy | 0, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  function vnoise(nx, ny, freq, seed) {
    const fx = nx * freq, fy = ny * freq;
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    let tx = fx - x0, ty = fy - y0;
    tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
    const x0m = ((x0 % freq) + freq) % freq, x1m = ((x0 + 1) % freq + freq) % freq;
    const y0m = ((y0 % freq) + freq) % freq, y1m = ((y0 + 1) % freq + freq) % freq;
    const n00 = hash2(x0m, y0m, seed), n10 = hash2(x1m, y0m, seed);
    const n01 = hash2(x0m, y1m, seed), n11 = hash2(x1m, y1m, seed);
    const a = n00 + (n10 - n00) * tx;
    const b = n01 + (n11 - n01) * tx;
    return a + (b - a) * ty;
  }
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
  const seed = 0x7a3f;
  const G = Math.max(4, Math.round(S / 32));
  const cs = S / G;
  const img = ctx.createImageData(S, S);
  const d = img.data;

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const wx = x + (vnoise(x / S, y / S, G, seed + 5) - 0.5) * cs * 1.1;
      const wy = y + (vnoise(x / S, y / S, G, seed + 9) - 0.5) * cs * 1.1;
      const gx = Math.floor(wx / cs), gy = Math.floor(wy / cs);
      let f1 = 1e9, f2 = 1e9, bidx = 0, bidy = 0;
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          const cx = gx + ox, cy = gy + oy;
          const ix = ((cx % G) + G) % G, iy = ((cy % G) + G) % G;
          const jx = 0.5 + (hash2(ix, iy, seed) - 0.5) * 0.9;
          const jy = 0.5 + (hash2(ix, iy, seed + 71) - 0.5) * 0.9;
          const px = (cx + jx) * cs, py = (cy + jy) * cs;
          const dx = wx - px, dy = wy - py;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < f1) { f2 = f1; f1 = dist; bidx = ix; bidy = iy; }
          else if (dist < f2) { f2 = dist; }
        }
      }
      let v = 30 + hash2(bidx, bidy, seed + 17) * 60;
      v += (vnoise(x / S, y / S, G * 5, seed + 200) - 0.5) * 34;
      v += (hash2(x, y, seed + 3) - 0.5) * 18;
      const border = f2 - f1;
      const crease = smooth(clamp(border / (cs * 0.16), 0, 1));
      v = 12 + (v - 12) * (0.35 + 0.65 * crease);
      v = clamp(v, 8, 96);
      const i = (y * S + x) * 4;
      d[i] = v; d[i + 1] = v * 0.99; d[i + 2] = v * 1.02; d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
};

MC_TEXTURES["gravel"] = function (ctx, S) {
  function hash2(ix, iy, seed) {
    let h = (seed ^ Math.imul(ix | 0, 374761393) ^ Math.imul(iy | 0, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  function vnoise(nx, ny, freq, seed) {
    const fx = nx * freq, fy = ny * freq;
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    let tx = fx - x0, ty = fy - y0;
    tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
    const x0m = ((x0 % freq) + freq) % freq, x1m = ((x0 + 1) % freq + freq) % freq;
    const y0m = ((y0 % freq) + freq) % freq, y1m = ((y0 + 1) % freq + freq) % freq;
    const n00 = hash2(x0m, y0m, seed), n10 = hash2(x1m, y0m, seed);
    const n01 = hash2(x0m, y1m, seed), n11 = hash2(x1m, y1m, seed);
    const a = n00 + (n10 - n00) * tx;
    const b = n01 + (n11 - n01) * tx;
    return a + (b - a) * ty;
  }
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
  const seed = 0x33c1;
  const G = Math.max(6, Math.round(S / 18));
  const cs = S / G;
  const img = ctx.createImageData(S, S);
  const d = img.data;

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const gx = Math.floor(x / cs), gy = Math.floor(y / cs);
      let f1 = 1e9, f2 = 1e9, bcx = 0, bcy = 0, bidx = 0, bidy = 0;
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          const cx = gx + ox, cy = gy + oy;
          const ix = ((cx % G) + G) % G, iy = ((cy % G) + G) % G;
          const jx = 0.5 + (hash2(ix, iy, seed) - 0.5) * 0.95;
          const jy = 0.5 + (hash2(ix, iy, seed + 41) - 0.5) * 0.95;
          const sizeW = 0.7 + hash2(ix, iy, seed + 88) * 0.7;
          const px = (cx + jx) * cs, py = (cy + jy) * cs;
          const dx = x - px, dy = y - py;
          const dist = Math.sqrt(dx * dx + dy * dy) / sizeW;
          if (dist < f1) { f2 = f1; f1 = dist; bcx = px; bcy = py; bidx = ix; bidy = iy; }
          else if (dist < f2) { f2 = dist; }
        }
      }
      const sel = hash2(bidx, bidy, seed + 7);
      const tone = hash2(bidx, bidy, seed + 23);
      let r, g, b;
      if (sel < 0.55) {
        const base = 95 + tone * 80;
        r = base; g = base; b = base * 0.98;
      } else {
        const base = 100 + tone * 70;
        r = base * 1.05; g = base * 0.86; b = base * 0.62;
      }
      const ox2 = (x - bcx) / cs, oy2 = (y - bcy) / cs;
      const dir = -(ox2 + oy2) * 28;
      const rr = Math.sqrt(ox2 * ox2 + oy2 * oy2);
      const rim = smooth(clamp((rr - 0.12) / 0.5, 0, 1)) * 30;
      const sh = dir - rim;
      r += sh; g += sh; b += sh;
      const grain = (vnoise(x / S, y / S, G * 5, seed + 300) - 0.5) * 16 + (hash2(x, y, seed + 2) - 0.5) * 10;
      r += grain; g += grain; b += grain;
      const border = f2 - f1;
      const m = smooth(clamp(border / (cs * 0.22), 0, 1));
      const gap = 34;
      r = gap + (r - gap) * m; g = gap + (g - gap) * m; b = gap + (b - gap) * m;
      const i = (y * S + x) * 4;
      d[i] = clamp(r, 18, 220); d[i + 1] = clamp(g, 18, 215); d[i + 2] = clamp(b, 16, 205); d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
};

MC_TEXTURES["dirt"] = function (ctx, S) {
  function hash2(ix, iy, seed) {
    let h = Math.imul(ix | 0, 374761393) ^ Math.imul(iy | 0, 668265263) ^ Math.imul(seed | 0, 1274126177);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  function vnoise(x, y, freq, seed) {
    let fx = x * freq, fy = y * freq;
    let x0 = Math.floor(fx), y0 = Math.floor(fy);
    let tx = fx - x0, ty = fy - y0;
    let X0 = ((x0 % freq) + freq) % freq, Y0 = ((y0 % freq) + freq) % freq;
    let X1 = (X0 + 1) % freq, Y1 = (Y0 + 1) % freq;
    let v00 = hash2(X0, Y0, seed), v10 = hash2(X1, Y0, seed);
    let v01 = hash2(X0, Y1, seed), v11 = hash2(X1, Y1, seed);
    let sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    let a = v00 + (v10 - v00) * sx, b = v01 + (v11 - v01) * sx;
    return a + (b - a) * sy;
  }
  function fbm(x, y, seed) {
    let v = 0, amp = 0.5, freq = 4, tot = 0;
    for (let o = 0; o < 5; o++) { v += amp * vnoise(x, y, freq, seed + o * 101); tot += amp; amp *= 0.5; freq *= 2; }
    return v / tot;
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function cl(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }

  let pr = mulberry32(0xD1B7);
  let np = Math.floor(S / 30) + 5;
  let pebbles = [];
  for (let i = 0; i < np; i++) {
    pebbles.push({ x: pr() * S, y: pr() * S, r: (1.6 + pr() * 3.4) * (S / 128), c: 96 + pr() * 64 });
  }

  let img = ctx.createImageData(S, S);
  let d = img.data;
  let aoW = 0.16 * S;

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let nx = x / S, ny = y / S;
      let n = fbm(nx, ny, 7);
      let n2 = fbm(nx + 0.33, ny + 0.17, 31);
      let speck = hash2(x * 131 + 1, y * 131 + 7, 99);
      let shade = (n - 0.5) * 1.0 + (n2 - 0.5) * 0.5;

      let r = 110 + shade * 46 + (speck - 0.5) * 30;
      let g = 78 + shade * 34 + (speck - 0.5) * 26;
      let b = 52 + shade * 24 + (speck - 0.5) * 20;

      if (speck > 0.93) { r -= 42; g -= 32; b -= 24; }
      else if (speck < 0.06) { r += 26; g += 22; b += 16; }
      if (n < 0.32) { let m = (0.32 - n) / 0.32; r -= m * 26; g -= m * 22; b -= m * 16; }

      for (let p = 0; p < pebbles.length; p++) {
        let pe = pebbles[p];
        let ddx = x - pe.x; if (ddx > S / 2) ddx -= S; if (ddx < -S / 2) ddx += S;
        let ddy = y - pe.y; if (ddy > S / 2) ddy -= S; if (ddy < -S / 2) ddy += S;
        let dist = Math.sqrt(ddx * ddx + ddy * ddy);
        if (dist < pe.r) {
          let t = dist / pe.r;
          let lightDir = (-ddx - ddy) / (pe.r * 1.4);
          let pcol = pe.c + lightDir * 20 + (speck - 0.5) * 18;
          r = pcol * 0.96; g = pcol * 0.88; b = pcol * 0.80;
          if (t > 0.84) { let s = 0.55 + 0.45 * (1 - (t - 0.84) / 0.16); r *= s; g *= s; b *= s; }
        }
      }

      let ed = Math.min(x, S - 1 - x, y, S - 1 - y);
      if (ed < aoW) { let ao = 0.78 + 0.22 * (ed / aoW); r *= ao; g *= ao; b *= ao; }

      let i = (y * S + x) * 4;
      d[i] = cl(r); d[i + 1] = cl(g); d[i + 2] = cl(b); d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
};

MC_TEXTURES["grass_top"] = function (ctx, S) {
  function hash2(ix, iy, seed) {
    let h = Math.imul(ix | 0, 374761393) ^ Math.imul(iy | 0, 668265263) ^ Math.imul(seed | 0, 1274126177);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  function vnoise(x, y, freq, seed) {
    let fx = x * freq, fy = y * freq;
    let x0 = Math.floor(fx), y0 = Math.floor(fy);
    let tx = fx - x0, ty = fy - y0;
    let X0 = ((x0 % freq) + freq) % freq, Y0 = ((y0 % freq) + freq) % freq;
    let X1 = (X0 + 1) % freq, Y1 = (Y0 + 1) % freq;
    let v00 = hash2(X0, Y0, seed), v10 = hash2(X1, Y0, seed);
    let v01 = hash2(X0, Y1, seed), v11 = hash2(X1, Y1, seed);
    let sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    let a = v00 + (v10 - v00) * sx, b = v01 + (v11 - v01) * sx;
    return a + (b - a) * sy;
  }
  function fbm(x, y, seed) {
    let v = 0, amp = 0.5, freq = 4, tot = 0;
    for (let o = 0; o < 5; o++) { v += amp * vnoise(x, y, freq, seed + o * 101); tot += amp; amp *= 0.5; freq *= 2; }
    return v / tot;
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function cl(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }

  let img = ctx.createImageData(S, S);
  let d = img.data;
  let aoW = 0.16 * S;

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let nx = x / S, ny = y / S;
      let n = fbm(nx, ny, 5);
      let n2 = fbm(nx * 2 + 0.2, ny * 2 + 0.5, 19);
      let hue = fbm(nx + 0.5, ny + 0.9, 41);
      let speck = hash2(x * 149 + 3, y * 149 + 11, 77);
      let shade = (n - 0.5) * 1.2 + (n2 - 0.5) * 0.6;

      let r = 96 + shade * 30 + (speck - 0.5) * 22;
      let g = 150 + shade * 46 + (speck - 0.5) * 26;
      let b = 60 + shade * 18 + (speck - 0.5) * 14;

      if (hue > 0.72) { let m = (hue - 0.72) / 0.28; r += m * 46; g += m * 26; b -= m * 14; }
      if (hue < 0.16) { let m = (0.16 - hue) / 0.16; r += m * 22; g -= m * 36; b -= m * 18; }
      if (n < 0.30) { let m = (0.30 - n) / 0.30; r -= m * 40; g -= m * 52; b -= m * 26; }

      let ed = Math.min(x, S - 1 - x, y, S - 1 - y);
      if (ed < aoW) { let ao = 0.80 + 0.20 * (ed / aoW); r *= ao; g *= ao; b *= ao; }

      let i = (y * S + x) * 4;
      d[i] = cl(r); d[i + 1] = cl(g); d[i + 2] = cl(b); d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  let SEED = 20240131;
  let blades = Math.floor((S * S) / 90);
  ctx.lineCap = "round";
  for (let oy = -1; oy <= 1; oy++) {
    for (let ox = -1; ox <= 1; ox++) {
      let r2 = mulberry32(SEED);
      ctx.save();
      ctx.translate(ox * S, oy * S);
      for (let i = 0; i < blades; i++) {
        let bx = r2() * S, by = r2() * S;
        let len = (0.02 + r2() * 0.05) * S;
        let ang = -Math.PI / 2 + (r2() - 0.5) * 1.0;
        let ex = bx + Math.cos(ang) * len, ey = by + Math.sin(ang) * len;
        let sh = r2();
        let rr = 40 + sh * 70, gg = 130 + sh * 90, bb = 40 + sh * 40;
        let pick = r2();
        if (pick < 0.08) { rr = 150 + sh * 60; gg = 160 + sh * 50; bb = 50 + sh * 20; }
        else if (pick < 0.13) { rr = 110; gg = 80; bb = 45; }
        ctx.strokeStyle = "rgba(" + (rr | 0) + "," + (gg | 0) + "," + (bb | 0) + "," + (0.30 + sh * 0.4).toFixed(3) + ")";
        ctx.lineWidth = (0.4 + r2() * 0.8) * (S / 128);
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(ex, ey);
        ctx.stroke();
      }
      ctx.restore();
    }
  }
};

MC_TEXTURES["grass_side"] = function (ctx, S) {
  function hash2(ix, iy, seed) {
    let h = Math.imul(ix | 0, 374761393) ^ Math.imul(iy | 0, 668265263) ^ Math.imul(seed | 0, 1274126177);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  function vnoise(x, y, freq, seed) {
    let fx = x * freq, fy = y * freq;
    let x0 = Math.floor(fx), y0 = Math.floor(fy);
    let tx = fx - x0, ty = fy - y0;
    let X0 = ((x0 % freq) + freq) % freq, Y0 = ((y0 % freq) + freq) % freq;
    let X1 = (X0 + 1) % freq, Y1 = (Y0 + 1) % freq;
    let v00 = hash2(X0, Y0, seed), v10 = hash2(X1, Y0, seed);
    let v01 = hash2(X0, Y1, seed), v11 = hash2(X1, Y1, seed);
    let sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    let a = v00 + (v10 - v00) * sx, b = v01 + (v11 - v01) * sx;
    return a + (b - a) * sy;
  }
  function fbm(x, y, seed) {
    let v = 0, amp = 0.5, freq = 4, tot = 0;
    for (let o = 0; o < 5; o++) { v += amp * vnoise(x, y, freq, seed + o * 101); tot += amp; amp *= 0.5; freq *= 2; }
    return v / tot;
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function cl(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }

  function border(xn) {
    let b = 0.24 * S;
    b += (vnoise(xn, 0.13, 6, 3001) - 0.5) * 0.12 * S;
    b += (vnoise(xn, 0.71, 13, 3007) - 0.5) * 0.07 * S;
    let drip = vnoise(xn, 0.40, 20, 3019);
    b += Math.pow(drip, 4) * 0.16 * S;
    return b;
  }

  let pr = mulberry32(0xD1B7);
  let np = Math.floor(S / 30) + 5;
  let pebbles = [];
  for (let i = 0; i < np; i++) {
    pebbles.push({ x: pr() * S, y: pr() * S, r: (1.6 + pr() * 3.4) * (S / 128), c: 96 + pr() * 64 });
  }

  let img = ctx.createImageData(S, S);
  let d = img.data;
  let edgeAOx = 0.16 * S;

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let nx = x / S, ny = y / S;
      let bY = border(nx);
      let r, g, b;

      if (y < bY) {
        let n = fbm(nx, ny, 5);
        let streak = vnoise(nx, ny * 0.25, 48, 61);
        let hue = fbm(nx + 0.5, ny + 0.9, 41);
        let speck = hash2(x * 149 + 3, y * 149 + 11, 77);
        let shade = (n - 0.5) * 1.0 + (streak - 0.5) * 0.7;
        r = 96 + shade * 30 + (speck - 0.5) * 22;
        g = 150 + shade * 48 + (speck - 0.5) * 26;
        b = 60 + shade * 18 + (speck - 0.5) * 14;
        if (hue > 0.72) { let m = (hue - 0.72) / 0.28; r += m * 44; g += m * 24; b -= m * 14; }
        if (hue < 0.16) { let m = (0.16 - hue) / 0.16; r += m * 20; g -= m * 34; b -= m * 18; }
        let topd = 1 - 0.10 * (1 - ny);
        r *= topd; g *= topd; b *= topd;
      } else {
        let n = fbm(nx, ny, 7);
        let n2 = fbm(nx + 0.33, ny + 0.17, 31);
        let speck = hash2(x * 131 + 1, y * 131 + 7, 99);
        let shade = (n - 0.5) * 1.0 + (n2 - 0.5) * 0.5;
        r = 110 + shade * 46 + (speck - 0.5) * 30;
        g = 78 + shade * 34 + (speck - 0.5) * 26;
        b = 52 + shade * 24 + (speck - 0.5) * 20;
        if (speck > 0.93) { r -= 42; g -= 32; b -= 24; }
        else if (speck < 0.06) { r += 26; g += 22; b += 16; }
        if (n < 0.32) { let m = (0.32 - n) / 0.32; r -= m * 26; g -= m * 22; b -= m * 16; }

        let dband = y - bY;
        if (dband < 0.08 * S) { let m = 1 - dband / (0.08 * S); let s = 1 - 0.30 * m; r *= s; g *= s; b *= s; }

        for (let p = 0; p < pebbles.length; p++) {
          let pe = pebbles[p];
          let ddx = x - pe.x; if (ddx > S / 2) ddx -= S; if (ddx < -S / 2) ddx += S;
          let ddy = y - pe.y; if (ddy > S / 2) ddy -= S; if (ddy < -S / 2) ddy += S;
          let dist = Math.sqrt(ddx * ddx + ddy * ddy);
          if (dist < pe.r) {
            let t = dist / pe.r;
            let lightDir = (-ddx - ddy) / (pe.r * 1.4);
            let pcol = pe.c + lightDir * 20 + (speck - 0.5) * 18;
            r = pcol * 0.96; g = pcol * 0.88; b = pcol * 0.80;
            if (t > 0.84) { let s = 0.55 + 0.45 * (1 - (t - 0.84) / 0.16); r *= s; g *= s; b *= s; }
          }
        }
      }

      let edx = Math.min(x, S - 1 - x);
      if (edx < edgeAOx) { let ao = 0.82 + 0.18 * (edx / edgeAOx); r *= ao; g *= ao; b *= ao; }

      let i = (y * S + x) * 4;
      d[i] = cl(r); d[i + 1] = cl(g); d[i + 2] = cl(b); d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  let SEED = 7777;
  let nb = Math.floor(S * 1.2);
  ctx.lineCap = "round";
  for (let ox = -1; ox <= 1; ox++) {
    let r2 = mulberry32(SEED);
    ctx.save();
    ctx.translate(ox * S, 0);
    for (let i = 0; i < nb; i++) {
      let bx = r2() * S;
      let topb = border(bx / S);
      let len = (0.04 + r2() * 0.11) * S;
      let ang = Math.PI / 2 + (r2() - 0.5) * 0.5;
      let sy = topb - 2 * (S / 128);
      let ex = bx + Math.cos(ang) * len, ey = sy + Math.sin(ang) * len;
      let sh = r2();
      let rr = 45 + sh * 60, gg = 120 + sh * 90, bb = 40 + sh * 40;
      if (r2() < 0.10) { rr = 140 + sh * 50; gg = 150 + sh * 50; bb = 55; }
      ctx.strokeStyle = "rgba(" + (rr | 0) + "," + (gg | 0) + "," + (bb | 0) + "," + (0.35 + sh * 0.4).toFixed(3) + ")";
      ctx.lineWidth = (0.5 + r2() * 0.9) * (S / 128);
      ctx.beginPath();
      ctx.moveTo(bx, sy);
      ctx.lineTo(ex, ey);
      ctx.stroke();
    }
    ctx.restore();
  }
};
