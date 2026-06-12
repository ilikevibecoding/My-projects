// dist_smoke.mjs — one-off: verify the production build boots from a subpath
// (mimics CDN layout), no console errors, and renders a real frame.
import { chromium } from 'playwright';

const URL = process.argv[2] || 'http://127.0.0.1:8901/rocket/dist/index.html';
const OUT = process.argv[3] || '/tmp/cdn_test/dist_smoke.png';

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1024, height: 576 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(4000); // let the builder scene render a few frames

const api = await page.evaluate(() => typeof window.debugAPI);
console.log('debugAPI:', api);
console.log('console errors:', errors.length ? errors : 'none');
await page.screenshot({ path: OUT });
console.log('screenshot ->', OUT);
await browser.close();
process.exit(errors.length ? 1 : 0);
