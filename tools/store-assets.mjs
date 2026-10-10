#!/usr/bin/env node
// Renders the Chrome Web Store images into store/images/:
//   screenshot-1..5.png   1280x800 composed slides (store/promo/slides.html): a station-sign headline over the real
//                         app, with a station-ring lens on one detail. The app is captured at 2x into
//                         store/images/raw/ (demo library: store/demo-seed.html), with each lens target in meta.json.
//   promo-small.png       440x280 small promo tile   (store/promo/promo.html)
//   promo-marquee.png     1400x560 marquee tile
//   icon-128.png          the store icon (same file as icons/icon128.png)
//
//   node tools/store-assets.mjs        (needs Google Chrome; set CHROME_PATH if it isn't found)

import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'store', 'images');
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json' };

// The app runs as a page with a small chrome.* stub; favicons fall back to the letter tiles.
const STUB = `window.chrome = { runtime: { id: 'store', getURL: () => '', getManifest: () => ({}), sendMessage: async () => ({}) },
  permissions: { request: async () => true, contains: async () => false, remove: async () => true }, tabs: { create: () => {} } };`;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const send = (code, body, type = 'text/plain') => { res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' }); res.end(body); };
  if (url.pathname === '/__store/stub.js') return send(200, STUB, 'text/javascript');
  if (url.pathname === '/__store/app.html') {
    let html = fs.readFileSync(path.join(ROOT, 'app.html'), 'utf8');
    html = html.replace(/(href|src)="(css|js|fonts|icons)\//g, '$1="/$2/').replace('<script type="module" src="/js/app.js">', '<script src="/__store/stub.js"></script><script type="module" src="/js/app.js">');
    return send(200, html, 'text/html');
  }
  const rel = url.pathname.startsWith('/__store/') ? path.join('store', url.pathname.slice(9)) : decodeURIComponent(url.pathname.slice(1));
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return send(404, 'Not found');
  send(200, fs.readFileSync(file), MIME[path.extname(file)] || 'application/octet-stream');
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

const CHROME = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome'].find((p) => p && fs.existsSync(p));
if (!CHROME) { console.error('Chrome not found. Set CHROME_PATH.'); process.exit(2); }
const PROFILE = fs.mkdtempSync(path.join(os.tmpdir(), 'lm-store-'));
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-pipe', `--user-data-dir=${PROFILE}`, '--hide-scrollbars', '--disable-gpu', 'about:blank'], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
let id = 0; const pending = new Map(); let buf = '';
chrome.stdio[4].on('data', (d) => { buf += d.toString(); for (let i; (i = buf.indexOf('\0')) >= 0;) { const m = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } } });
const cdp = (method, params = {}, sessionId) => new Promise((r) => { const i = ++id; pending.set(i, r); chrome.stdio[3].write(JSON.stringify({ id: i, method, params, ...(sessionId ? { sessionId } : {}) }) + '\0'); });
await sleep(800);

async function page(w, h, { dark = false, dsf = 1 } = {}) {
  const { result: ctx } = await cdp('Target.createBrowserContext');
  const { result: t } = await cdp('Target.createTarget', { url: 'about:blank', browserContextId: ctx.browserContextId });
  const { result: a } = await cdp('Target.attachToTarget', { targetId: t.targetId, flatten: true });
  const S = a.sessionId;
  await cdp('Page.enable', {}, S); await cdp('Runtime.enable', {}, S);
  await cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dsf, mobile: false }, S);
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }, { name: 'prefers-reduced-motion', value: 'reduce' }] }, S);
  const ev = async (code) => (await cdp('Runtime.evaluate', { expression: `(async () => { ${code} })()`, awaitPromise: true, returnByValue: true }, S)).result?.result?.value;
  return {
    go: async (url) => { await cdp('Page.navigate', { url: BASE + url }, S); },
    ev,
    until: async (code, ms = 10000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(code).catch(() => false)) return; await sleep(150); } throw new Error('timeout: ' + code); },
    shot: async (name, dir = OUT) => { await sleep(600); const r = await cdp('Page.captureScreenshot', { format: 'png' }, S); fs.writeFileSync(path.join(dir, name), Buffer.from(r.result.data, 'base64')); console.log('  wrote ' + path.relative(ROOT, path.join(dir, name)).split(path.sep).join('/')); },
    close: () => cdp('Target.disposeBrowserContext', { browserContextId: ctx.browserContextId }),
  };
}

const ready = `return !!document.querySelector('#grid .card') || !!document.querySelector('.settings')`;
const RAW = path.join(OUT, 'raw');
fs.mkdirSync(RAW, { recursive: true });
const meta = { width: 1440, height: 900, targets: {} };
// where a lens should look: the centre of an element, in CSS pixels of the capture
const centre = (expr) => `const el = ${expr}; if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };`;

// the library, light: the lens on a line with its branches
let p = await page(1440, 900, { dsf: 2 });
await p.go('/__store/demo-seed.html?view=cards&to=/all'); await p.until(ready);
meta.targets.library = await p.ev(centre(`document.querySelector('#band .line-node[data-line="design"]')`));
await p.shot('library.png', RAW);
// the network map: the lens on a station shaped for its kind (a document's pentagon)
await p.ev(`document.querySelector('[data-view=map]').click();`); await p.until(`return document.querySelectorAll('svg.netmap .map-stop').length > 6`);
await p.ev(`document.activeElement.blur();`);
meta.targets.map = await p.ev(centre(`([...document.querySelectorAll('svg.netmap .map-stop path.dot')].find((d) => !/a/.test(d.getAttribute('d'))) || document.querySelector('svg.netmap .map-stop path.dot'))`));
await p.shot('map.png', RAW);
await p.ev(`document.querySelector('[data-view=cards]').click();`); await p.until(ready);
// broken links: the lens on a card's health label
await p.ev(`location.hash = '#/broken';`); await p.until(`return document.querySelector('.legend') && document.querySelector('#grid .health')`);
meta.targets.broken = await p.ev(centre(`document.querySelector('#grid .health')`));
await p.shot('broken.png', RAW);
await p.close();

// full-text search, dark: the lens on the highlighted word in a matched passage
p = await page(1440, 900, { dark: true, dsf: 2 });
await p.go('/__store/demo-seed.html?view=cards&theme=dark&to=/all'); await p.until(ready);
await p.ev(`const s = document.querySelector('#search'); s.value = 'grid'; s.dispatchEvent(new Event('input', { bubbles: true }));`);
await p.until(`return document.querySelectorAll('#grid .card .card-snippet mark').length >= 2`);
await p.ev(`document.querySelector('#search').blur();`);
meta.targets.search = await p.ev(centre(`document.querySelector('#grid .card-snippet mark')`));
await p.shot('search.png', RAW);
await p.close();
fs.writeFileSync(path.join(RAW, 'meta.json'), JSON.stringify(meta, null, 2) + '\n');

// the five store screenshots, composed
for (let n = 1; n <= 5; n++) {
  p = await page(1280, 800);
  await p.go(`/__store/promo/slides.html?n=${n}`); await p.until(`return document.title === 'ready'`);
  await p.shot(`screenshot-${n}.png`);
  await p.close();
}

// promo tiles
for (const [size, w, h] of [['small', 440, 280], ['marquee', 1400, 560]]) {
  p = await page(w, h);
  await p.go(`/__store/promo/promo.html?size=${size}`); await p.until(`return document.title === 'ready'`);
  await p.shot(`promo-${size}.png`);
  await p.close();
}
fs.copyFileSync(path.join(ROOT, 'icons', 'icon128.png'), path.join(OUT, 'icon-128.png'));
console.log('  wrote store/images/icon-128.png');

chrome.kill(); server.close();
try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch {}
