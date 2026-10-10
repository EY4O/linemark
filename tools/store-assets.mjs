#!/usr/bin/env node
// Renders the Chrome Web Store images into store/images/:
//   screenshot-1..5.png   1280x800 screenshots of the real app (demo library: store/demo-seed.html)
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

async function page(w, h, { dark = false } = {}) {
  const { result: ctx } = await cdp('Target.createBrowserContext');
  const { result: t } = await cdp('Target.createTarget', { url: 'about:blank', browserContextId: ctx.browserContextId });
  const { result: a } = await cdp('Target.attachToTarget', { targetId: t.targetId, flatten: true });
  const S = a.sessionId;
  await cdp('Page.enable', {}, S); await cdp('Runtime.enable', {}, S);
  await cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false }, S);
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }, { name: 'prefers-reduced-motion', value: 'reduce' }] }, S);
  const ev = async (code) => (await cdp('Runtime.evaluate', { expression: `(async () => { ${code} })()`, awaitPromise: true, returnByValue: true }, S)).result?.result?.value;
  return {
    go: async (url) => { await cdp('Page.navigate', { url: BASE + url }, S); },
    ev,
    until: async (code, ms = 10000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(code).catch(() => false)) return; await sleep(150); } throw new Error('timeout: ' + code); },
    shot: async (name) => { await sleep(600); const r = await cdp('Page.captureScreenshot', { format: 'png' }, S); fs.writeFileSync(path.join(OUT, name), Buffer.from(r.result.data, 'base64')); console.log('  wrote store/images/' + name); },
    close: () => cdp('Target.disposeBrowserContext', { browserContextId: ctx.browserContextId }),
  };
}

const ready = `return !!document.querySelector('#grid .card') || !!document.querySelector('.settings')`;

// 1. the library: lines with icons, cover cards
let p = await page(1280, 800);
await p.go('/__store/demo-seed.html?view=cards&to=/all'); await p.until(ready);
await p.shot('screenshot-1.png');
// 2. inside a line, editing a link (notes, tags, line picker)
await p.ev(`location.hash = '#/c/design';`); await p.until(`return document.querySelector('.station-name')?.textContent === 'Design'`);
await p.ev(`document.querySelector('#grid .card [data-act=edit]').click();`); await p.until(`return document.querySelector('#drawer.open')`);
await p.ev(`document.activeElement.blur();`);
await p.shot('screenshot-2.png');
await p.ev(`document.querySelector('[data-act=close-drawer]').click();`);
// 4. giving a line an icon
await p.ev(`location.hash = '#/all';`); await p.until(ready);
await p.ev(`document.querySelector('.line-stop[data-id=japan] .more').click();`); await p.until(`return document.querySelector('.menu [data-mi=icon]')`);
await p.ev(`document.querySelector('.menu [data-mi=icon]').click();`); await p.until(`return document.querySelectorAll('.icon-picker .icon-cell').length > 100`);
await p.ev(`document.querySelector('.icon-picker .icon-cell[data-icon=train-front]')?.scrollIntoView({ block: 'center' }); document.querySelector('.icon-picker .icon-cell[data-icon=train-front]')?.focus();`);
await p.shot('screenshot-4.png');
await p.ev(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));`);
// 5. broken links
await p.ev(`location.hash = '#/broken';`); await p.until(`return document.querySelector('.legend')`);
await p.shot('screenshot-5.png');
await p.close();

// 3. full-text search, in dark mode
p = await page(1280, 800, { dark: true });
await p.go('/__store/demo-seed.html?view=cards&theme=dark&to=/all'); await p.until(ready);
await p.ev(`const s = document.querySelector('#search'); s.value = 'grid'; s.dispatchEvent(new Event('input', { bubbles: true }));`);
await p.until(`return document.querySelectorAll('#grid .card .card-snippet mark').length >= 2`);
await p.ev(`document.querySelector('#search').blur();`);
await p.shot('screenshot-3.png');
await p.close();

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
