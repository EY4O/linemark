#!/usr/bin/env node
// Renders the homepage's hover pictures into docs/images/home/: one per row of the Save and Find lists, shown beside
// the list when that row is pointed at (docs/index.html, [data-shot]). Real captures of Linemark where there is
// something to capture, on the store's demo library (store/demo-seed.html); drawings (tools/home-shots/illus.html)
// for the keyboard, the right-click menu and the address bar.
//   Save pictures: 380x390, light, the popup's frame.   Find pictures: 665x500, dark, the search screenshot's frame.
//   All at 2x, as WebP.
//
//   node tools/home-shots.mjs        (needs Google Chrome; set CHROME_PATH if it isn't found)

import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'docs', 'images', 'home');
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json', '.svg': 'image/svg+xml' };

// The app as a page: a chrome.* stub with tab groups, and Chrome's built-in AI answering with a fixed suggestion.
// Favicons fall back to the letter tiles.
const STUB = `window.chrome = { runtime: { id: 'home', getURL: () => '', getManifest: () => ({}), sendMessage: async () => ({}) },
  permissions: { request: async () => true, contains: async () => false, remove: async () => true },
  tabs: { create: () => {}, group: async () => 1, query: async () => [] }, tabGroups: { update: async () => {}, query: async () => [] } };
window.LanguageModel = { availability: async () => 'available', create: async () => ({ destroy() {}, prompt: async () => JSON.stringify({
  line: 'Reading list', tags: ['news', 'tech'], summary: 'Links and discussion about technology and start-ups, voted up by readers.' }) }) };`;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const send = (code, body, type = 'text/plain') => { res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' }); res.end(body); };
  if (url.pathname === '/__store/stub.js') return send(200, STUB, 'text/javascript');
  if (url.pathname === '/__store/app.html') {
    const html = fs.readFileSync(path.join(ROOT, 'app.html'), 'utf8').replace(/(href|src)="(css|js|fonts|icons)\//g, '$1="/$2/')
      .replace('<script type="module" src="/js/app.js">', '<script src="/__store/stub.js"></script><script type="module" src="/js/app.js">');
    return send(200, html, 'text/html');
  }
  if (url.pathname === '/__home/popup.html') {
    // the real popup for a pretend tab (?url=, ?title=; ?sel= is text selected on it), on the test suite's stub
    const html = fs.readFileSync(path.join(ROOT, 'popup.html'), 'utf8').replace(/(href|src)="(css|js|fonts|icons)\//g, '$1="/$2/');
    const extra = `<script src="/tests/fixtures/stub-chrome.js"></script><script>
      const q = new URLSearchParams(location.search);
      chrome.runtime.getURL = () => '';
      chrome.tabs.query = async () => [{ id: 1, windowId: 1, url: q.get('url'), title: q.get('title') || '' }];
      chrome.tabs.captureVisibleTab = async () => { throw new Error('no capture'); };
      chrome.scripting = { executeScript: async ({ func }) => { if (func.name === 'pageMetaExtractor' && q.get('sel')) return [{ result: { selection: q.get('sel') } }]; throw new Error('no page access'); } };
    </script>`;
    return send(200, html.replace('<script type="module"', extra + '<script type="module"'), 'text/html');
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
const PROFILE = fs.mkdtempSync(path.join(os.tmpdir(), 'lm-home-'));
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
  await cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: false }, S);
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }, { name: 'prefers-reduced-motion', value: 'reduce' }] }, S);
  const ev = async (code) => (await cdp('Runtime.evaluate', { expression: `(async () => { ${code} })()`, awaitPromise: true, returnByValue: true }, S)).result?.result?.value;
  const p = {
    go: async (url) => { await cdp('Page.navigate', { url: BASE + url }, S); },
    ev,
    until: async (code, ms = 10000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(code).catch(() => false)) return; await sleep(150); } throw new Error('timeout: ' + code); },
    // a w x h region (CSS pixels) centred on an element, nudged by dx/dy, or set from its left/top edge; kept inside
    // the viewport (and right of minX, to leave the band out)
    around: async (sel, cw, ch, { dx = 0, dy = 0, left = null, top = null, minX = 0 } = {}) => ev(`const el = ${sel}; if (!el) return null; const r = el.getBoundingClientRect();
      const x = Math.round(${left === null ? `r.left + r.width / 2 - ${cw} / 2 + ${dx}` : `r.left + ${left}`}), y = Math.round(${top === null ? `r.top + r.height / 2 - ${ch} / 2 + ${dy}` : `r.top + ${top}`});
      return { x: Math.max(${minX}, Math.min(innerWidth - ${cw}, x)), y: Math.max(0, Math.min(innerHeight - ${ch}, y)), width: ${cw}, height: ${ch} };`),
    shot: async (name, clip) => {
      await sleep(500);
      const r = await cdp('Page.captureScreenshot', { format: 'webp', quality: 88, clip: { scale: 1, ...clip } }, S);
      fs.writeFileSync(path.join(OUT, name), Buffer.from(r.result.data, 'base64'));
      console.log(`  wrote docs/images/home/${name}`);
    },
    close: () => cdp('Target.disposeBrowserContext', { browserContextId: ctx.browserContextId }),
  };
  return p;
}

const ready = `return !!document.querySelector('#grid .card') || !!document.querySelector('.settings') || !!document.querySelector('.wrapped, .netmap')`;
const day = 86400000;
// What the demo library needs beyond the store screenshots: a link on three lines, two links due back today,
// a smart line, and (for the popup) a Cooking line to branch from.
const EXTRA = `const db = await import('/js/db.js'); const M = await import('/js/model.js');
  const put = async (id, f) => { const b = await db.get('bookmarks', id); Object.assign(b, f); await db.put('bookmarks', b); };
  await put('s5', { alsoOn: ['eng', 'design'] });
  await put('s12', { revisitAt: Date.now() - 3600000 }); await put('s2', { revisitAt: Date.now() - 7200000 });
  await db.put('collections', { id: 'talks', name: 'Talks and films', code: 'TF', color: '#7048e8', icon: 'lucide:clapperboard', parentId: null, order: 6, smart: true, query: 'type:video', createdAt: Date.now() - ${90 * day}, updatedAt: Date.now() });`;

async function app({ dark = false, to = '/all', w = 1440, h = 900 } = {}) {
  const p = await page(w, h, { dark });
  await p.go(`/__store/demo-seed.html?view=cards${dark ? '&theme=dark' : ''}&to=${to}`); await p.until(ready);
  await p.ev(EXTRA); await p.ev('location.reload()'); await sleep(400); await p.until(ready);
  return p;
}
const illus = async (n, name, w, h) => {
  const p = await page(w, h, { dark: n === 'omnibox' });
  await p.go(`/tools/home-shots/illus.html?n=${n}`); await p.until(`return document.title === 'ready'`);
  await p.shot(name, { x: 0, y: 0, width: w, height: h }); await p.close();
};
const S_W = 380, S_H = 390, F_W = 665, F_H = 500;

// ---------- Save: the popup's frame, light ----------
await illus('keyboard', 'save-keyboard.webp', S_W, S_H);
await illus('rightclick', 'save-rightclick.webp', S_W, S_H);

// the popup: a neutral letter tile for the site's icon, as Chrome would show the site's own
const TILE = (ch) => `'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" rx="4" fill="#686b73"/><text x="8" y="12" text-anchor="middle" font-family="Segoe UI, sans-serif" font-size="10" font-weight="700" fill="#fff">${ch}</text></svg>')`;
async function popup(name, { url, title, sel = '', then = '', ch }) {
  const p = await page(S_W, 600);
  await p.go('/__store/demo-seed.html?view=cards&to=/all'); await p.until(ready);
  await p.ev(EXTRA + `await db.put('collections', { id: 'cooking', name: 'Cooking', code: 'CO', color: '#2f9e44', icon: 'lucide:cooking-pot', parentId: null, order: 7, createdAt: Date.now(), updatedAt: Date.now() });`);
  await p.go(`/__home/popup.html?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}${sel ? '&sel=' + encodeURIComponent(sel) : ''}`);
  await p.until(`return !!document.querySelector('.pop-line')`); await sleep(900);
  await p.ev(`const h = document.querySelector('.pop-host'); if (h && !h.querySelector('img')) h.insertAdjacentHTML('afterbegin', '<img alt="" src="' + ${TILE(ch)} + '">'); document.activeElement?.blur();`);
  if (then) { await p.ev(then); await sleep(500); }
  await p.shot(name, { x: 0, y: 0, width: S_W, height: S_H }); await p.close();
}
await popup('save-branches.webp', { url: 'https://www.kingarthurbaking.com/recipes/sourdough-bread', title: 'Sourdough bread', ch: 'K',
  then: `document.querySelector('.pop-line').click(); await new Promise((r) => setTimeout(r, 300)); const i = document.querySelector('.menu .menu-search'); i.value = 'Cooking/Baking'; i.dispatchEvent(new Event('input')); await new Promise((r) => setTimeout(r, 300));` });
await popup('save-highlights.webp', { url: 'https://practicaltypography.com/line-length.html', title: 'Line length | Butterick’s Practical Typography', ch: 'P',
  sel: 'Line length is the distance between the left and right edges of a text block.' });

let p = await app();
// several lines: the card of a link on three lines, its extra bullets overlapping the first
await p.shot('save-lines.webp', await p.around(`document.querySelector('#grid .card[data-id=s5]')`, S_W, S_H, { left: -22, dy: 10, minX: 268 }));
// tab groups: a line's menu, with Open as tab group
await p.ev(`document.querySelector('.line-stop[data-id=japan] .more').click();`); await p.until(`return !!document.querySelector('[role=menu]')`);
const TABS_ITEM = `[...document.querySelectorAll('[role=menu] button')].find((i) => /tab group/.test(i.textContent))`;
await p.ev(`${TABS_ITEM}.focus();`);
await p.shot('save-tabs.webp', await p.around(TABS_ITEM, S_W, S_H, { left: -24, dy: 30 }));
await p.ev(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));`); await sleep(300);
// suggestions: the drawer for an unsorted link, after Suggest
await p.ev(`const t = document.querySelector('#grid .card[data-id=s18] .card-title'); t.focus(); t.dispatchEvent(new KeyboardEvent('keydown', { key: 'e', bubbles: true }));`);
await p.until(`return !!document.querySelector('#d-suggest')`); await p.ev(`document.querySelector('#d-suggest').click();`);
await p.until(`return !!document.querySelector('#d-ai .ai-out')`); await p.ev(`document.activeElement?.blur();`);
// the drawer is wider than the popup's frame: take a 440 x 452 region and scale it into 380 x 390
await p.shot('save-suggest.webp', { ...(await p.around(`document.querySelector('#d-ai')`, 440, 452, { left: -20, dy: -30 })), scale: S_W / 440 });
await p.close();
// Chrome bookmarks: the import row in Settings, at a width where it stacks into the popup's frame
p = await app({ to: '/settings', w: 400, h: 900 });
const IMPORT_SEC = `[...document.querySelectorAll('.settings .row')].find((r) => /Chrome bookmarks/.test(r.textContent)).closest('section, .card, .group') || [...document.querySelectorAll('.settings .row')].find((r) => /Chrome bookmarks/.test(r.textContent))`;
await p.ev(`(${IMPORT_SEC}).scrollIntoView({ block: 'start' }); document.querySelector('.settings')?.scrollBy?.(0, -16);`); await sleep(300);
await p.shot('save-import.webp', await p.around(IMPORT_SEC, S_W, S_H, { left: -10, top: -14 }));
await p.close();

// ---------- Find: the search screenshot's frame, dark ----------
await illus('omnibox', 'find-omnibox.webp', F_W, F_H);
const MAIN = { x: 268, y: 0, width: F_W, height: F_H }; // the work area's top-left, beside the band
p = await app({ dark: true });
// filters: a tag's own stop, #japan
await p.ev(`location.hash = '#/tag/japan';`); await p.until(`return document.querySelector('.station-name')?.textContent === '#japan' && document.querySelectorAll('#grid .card').length === 2`);
await p.shot('find-filters.webp', MAIN);
await p.ev(`location.hash = '#/c/talks';`);
await p.until(`return document.querySelector('.station-name')?.textContent.includes('Talks')`);
await p.shot('find-smart.webp', MAIN);
await p.ev(`location.hash = '#/departures';`); await p.until(`return document.querySelector('.station-name')?.textContent.includes('Departures') && document.querySelectorAll('#grid .card').length >= 2`);
await p.shot('find-departures.webp', MAIN);
await p.ev(`location.hash = '#/all'; await new Promise((r) => setTimeout(r, 300)); document.querySelector('[data-view=map]').click();`);
await p.until(`return document.querySelectorAll('svg.netmap .map-stop').length > 6`); await p.ev(`document.activeElement?.blur();`);
await p.shot('find-views.webp', { ...MAIN, y: 60 });
await p.ev(`document.querySelector('[data-view=cards]').click(); location.hash = '#/settings';`); await p.until(`return !!document.querySelector('[data-palette=tokyo]')`);
await p.ev(`document.querySelector('[data-palette=tokyo]').click(); await new Promise((r) => setTimeout(r, 400)); document.querySelector('.palettes').scrollIntoView({ block: 'center' }); document.activeElement?.blur();`);
await sleep(4500); // let the recolour toast go
// the settings rows are wider than the frame: take an 800 x 602 region and scale it into 665 x 500
await p.shot('find-yours.webp', { ...(await p.around(`document.querySelector('.palettes').closest('.row')`, 800, 602, { left: -18, top: -150 })), scale: F_W / 800 });
await p.ev(`location.hash = '#/wrapped';`); await p.until(`return !!document.querySelector('.wrapped')`);
// the year's total, its month line and the first cards: a 990 x 744 region scaled into the frame
await p.shot('find-year.webp', { x: 280, y: 150, width: 990, height: 744, scale: F_W / 990 });
await p.close();

chrome.kill(); server.close();
try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch {}
