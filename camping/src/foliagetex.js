// ---------------------------------------------------------------------------
// Foliage texture pipeline.
//
// Every cutout texture in the game goes through this, because black outlines
// around needles can be introduced at any stage, not just at extraction:
//
//   * averaging RGBA straight pulls the colour of transparent texels (often
//     black) into partially covered texels,
//   * a render target that was never dilated has transparent BLACK outside the
//     silhouette, so the moment it is bilinearly sampled or mipmapped, black
//     bleeds inwards — this is what put dark rims on the distant trees even
//     though the source atlas was verified clean,
//   * plain alpha averaging also shrinks coverage every level, so alpha-tested
//     foliage dissolves with distance.
//
// The fix in all cases is the same: filter in premultiplied space and
// un-premultiply, dilate colour outwards so no sample can ever reach an
// undefined texel, and rescale alpha per level to hold coverage constant.
// ---------------------------------------------------------------------------
import * as THREE from 'three';

/**
 * Push colour outwards into transparent texels. Alpha is untouched; only the
 * colour channel is filled, so nothing about the silhouette changes — but any
 * filter that reaches past the edge now finds foliage colour instead of black.
 */
export function dilateRGBA(data, w, h, passes = 16) {
  let known = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) known[i] = data[i * 4 + 3] > 0 ? 1 : 0;

  for (let p = 0; p < passes; p++) {
    const next = known.slice();
    let filled = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (known[i]) continue;
        let r = 0, g = 0, b = 0, n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            const j = ny * w + nx;
            if (!known[j]) continue;
            r += data[j * 4]; g += data[j * 4 + 1]; b += data[j * 4 + 2]; n++;
          }
        }
        if (n) {
          data[i * 4] = (r / n) | 0;
          data[i * 4 + 1] = (g / n) | 0;
          data[i * 4 + 2] = (b / n) | 0;
          next[i] = 1;
          filled++;
        }
      }
    }
    known = next;
    if (!filled) break;
  }
  return data;
}

/** Fraction of texels that survive the alpha test, with alpha scaled by `s`. */
function coverage(data, alphaTest, s = 1) {
  let n = 0;
  const total = data.length / 4;
  for (let i = 3; i < data.length; i += 4) {
    if (Math.min(1, (data[i] / 255) * s) >= alphaTest) n++;
  }
  return n / total;
}

/**
 * Halve an RGBA image, averaging in premultiplied space so transparent texels
 * contribute no colour, then un-premultiplying.
 */
function halve(src, w, h) {
  const dw = Math.max(1, w >> 1);
  const dh = Math.max(1, h >> 1);
  const out = new Uint8Array(dw * dh * 4);
  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) {
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const sx = Math.min(w - 1, x * 2 + dx);
          const sy = Math.min(h - 1, y * 2 + dy);
          const i = (sy * w + sx) * 4;
          const al = src[i + 3] / 255;
          r += src[i] * al; g += src[i + 1] * al; b += src[i + 2] * al;
          a += al; n++;
        }
      }
      const o = (y * dw + x) * 4;
      out[o + 3] = Math.round((a / n) * 255);
      if (a > 0.0001) {
        out[o] = Math.min(255, Math.round(r / a));
        out[o + 1] = Math.min(255, Math.round(g / a));
        out[o + 2] = Math.min(255, Math.round(b / a));
      }
    }
  }
  return { data: out, width: dw, height: dh };
}

/**
 * Full mip chain with constant alpha-test coverage and dilated colour at every
 * level. Returns three.js-compatible mipmap descriptors.
 */
export function buildMipChain(baseData, w, h, alphaTest, {
  maxAlphaScale = 1.7, minCoverageLevel = 16,
} = {}) {
  const base = new Uint8Array(baseData);
  dilateRGBA(base, w, h, 20);
  const target = coverage(base, alphaTest);
  const mips = [{ data: base, width: w, height: h }];
  const scales = [];

  let cur = { data: base, width: w, height: h };
  while (cur.width > 1 || cur.height > 1) {
    cur = halve(cur.data, cur.width, cur.height);

    // Hold the alpha-tested silhouette area roughly constant, but only GENTLY.
    //
    // Unbounded coverage preservation is a trap: by the smallest levels the
    // required scale is enormous, every texel passes the alpha test, and the
    // card stops being a cutout at all — it renders as a solid rectangle filled
    // with the averaged tree colour. That is exactly how a distant impostor
    // turns into a black slab floating next to the tree. So the boost is capped,
    // and abandoned entirely once the level is too small to hold a silhouette.
    const smallest = Math.min(cur.width, cur.height);
    let s = 1;
    if (smallest >= minCoverageLevel) {
      let lo = 1, hi = maxAlphaScale;
      for (let it = 0; it < 14; it++) {
        s = (lo + hi) / 2;
        if (coverage(cur.data, alphaTest, s) < target) lo = s; else hi = s;
      }
      s = Math.min(maxAlphaScale, (lo + hi) / 2);
      for (let i = 3; i < cur.data.length; i += 4) {
        cur.data[i] = Math.min(255, Math.round(cur.data[i] * s));
      }
    }
    scales.push(+s.toFixed(2));
    // newly revealed transparent texels need colour too
    dilateRGBA(cur.data, cur.width, cur.height, 6);
    mips.push({ data: cur.data, width: cur.width, height: cur.height });
  }
  mips.alphaScales = scales;
  return mips;
}

/** Read an <img> into raw RGBA. */
export function imageToRGBA(img) {
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, c.width, c.height);
  return { data: new Uint8Array(d.data.buffer.slice(0)), width: c.width, height: c.height };
}

/**
 * Build a mipmapped, halo-free cutout texture from raw RGBA.
 * `colorSpace` must match how the data was produced: sRGB for an authored PNG,
 * linear for a render-target readback.
 */
export function makeFoliageTexture({ data, width, height, alphaTest, colorSpace, anisotropy = 1 }) {
  const mips = buildMipChain(data, width, height, alphaTest);
  const tex = new THREE.DataTexture(mips[0].data, width, height, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.mipmaps = mips;
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.colorSpace = colorSpace ?? THREE.SRGBColorSpace;
  tex.anisotropy = anisotropy;
  tex.flipY = false; // DataTexture convention
  tex.needsUpdate = true;
  return tex;
}

/**
 * Diagnostic: how much darker are partially covered texels than fully covered
 * ones? A value well below 1 means the colour channel is contaminated by the
 * transparent background and the texture will show dark rims.
 */
export function edgeDarkeningRatio(data, w, h) {
  let fullSum = 0, fullN = 0, edgeSum = 0, edgeN = 0;
  for (let i = 0; i < w * h; i++) {
    const a = data[i * 4 + 3];
    const l = 0.2126 * data[i * 4] + 0.7152 * data[i * 4 + 1] + 0.0722 * data[i * 4 + 2];
    if (a > 250) { fullSum += l; fullN++; } else if (a > 20) { edgeSum += l; edgeN++; }
  }
  if (!fullN || !edgeN) return null;
  return +((edgeSum / edgeN) / (fullSum / fullN)).toFixed(3);
}
