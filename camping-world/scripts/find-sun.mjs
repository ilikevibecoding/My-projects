/**
 * Locates the sun in each HDRI candidate (argmax luminance region) and prints
 * the azimuth/elevation in the same convention used by src/world/sky.js:
 *   dir = ( cos(el)·sin(az), sin(el), cos(el)·cos(az) )
 */
import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';
import { HDRIS as DEFAULT_HDRIS } from './asset-manifest.mjs';

// extra names can be passed as CLI args
const HDRIS = process.argv.length > 2 ? process.argv.slice(2) : DEFAULT_HDRIS;

const browser = await chromium.launch({
  executablePath: ['/usr/bin/google-chrome-stable', '/usr/local/bin/google-chrome'].find((p) => existsSync(p)),
  args: ['--no-sandbox', '--headless=new', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage();
await page.goto('http://127.0.0.1:5174/inspect.html?model=rock_07', { waitUntil: 'domcontentloaded' });

for (const name of HDRIS) {
  const result = await page.evaluate(async (hdriName) => {
    const { HDRLoader } = await import('/node_modules/three/examples/jsm/loaders/HDRLoader.js');
    const tex = await new HDRLoader().loadAsync(`/assets/env/${hdriName}_4k.hdr`);
    const { data, width, height } = tex.image;
    // data: RGBA (could be HalfFloat or Float depending on loader defaults)
    const isHalf = data.constructor.name === 'Uint16Array';
    const halfToFloat = (h) => {
      const s = (h & 0x8000) >> 15, e = (h & 0x7c00) >> 10, f = h & 0x03ff;
      if (e === 0) return (s ? -1 : 1) * Math.pow(2, -14) * (f / 1024);
      if (e === 0x1f) return f ? NaN : (s ? -1 : 1) * Infinity;
      return (s ? -1 : 1) * Math.pow(2, e - 15) * (1 + f / 1024);
    };
    let best = -1;
    let sx = 0, sy = 0, sw = 0;
    // pass 1: find max luminance
    const lumAt = (i) => {
      const r = isHalf ? halfToFloat(data[i * 4]) : data[i * 4];
      const g = isHalf ? halfToFloat(data[i * 4 + 1]) : data[i * 4 + 1];
      const b = isHalf ? halfToFloat(data[i * 4 + 2]) : data[i * 4 + 2];
      return r * 0.2126 + g * 0.7152 + b * 0.0722;
    };
    const n = width * height;
    for (let i = 0; i < n; i++) {
      const l = lumAt(i);
      if (l > best) best = l;
    }
    // pass 2: luminance-weighted centroid of texels within 50% of max
    for (let i = 0; i < n; i++) {
      const l = lumAt(i);
      if (l > best * 0.5) {
        sx += (i % width) * l;
        sy += Math.floor(i / width) * l;
        sw += l;
      }
    }
    const u = sx / sw / width;
    const v = 1 - sy / sw / height; // v=1 at top (data row 0 = v=1? flipY…)
    // three HDRLoader: flipY=true → data row 0 is BOTTOM (v=0)
    const vv = sy / sw / height; // row from top
    const vFromBottom = tex.flipY ? 1 - vv : vv;
    const el = (vFromBottom - 0.5) * 180; // degrees
    const az = 90 - (u - 0.5) * 360; // degrees, see sky.js convention
    return { maxLum: best, azimuthDeg: az, elevationDeg: el, flipY: tex.flipY };
  }, name);
  console.log(name, JSON.stringify(result));
}
await browser.close();
