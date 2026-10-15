#!/usr/bin/env node
// Linemark test suite. Needs Google Chrome; no npm packages.
//
//   node tests/run.mjs            run everything (headless)
//   node tests/run.mjs --headed   watch it run
//   CHROME_PATH=/path/to/chrome node tests/run.mjs
//
// It starts a small local server, drives Chrome over the DevTools protocol, loads Linemark as a real
// unpacked extension for the extension tests, and never contacts the internet.

import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const FIX = path.join(import.meta.dirname, 'fixtures');
const HEADED = process.argv.includes('--headed');
// --shots <dir> saves screenshots of key states for visual review
const SHOTS = process.argv.includes('--shots') ? path.resolve(process.argv[process.argv.indexOf('--shots') + 1]) : null;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- local server
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2', '.md': 'text/markdown', '.txt': 'text/plain' };
let PORT = 0;

// A minimal stand-in for the Google Drive v3 endpoints Linemark's sync uses.
const drive = new Map(); // id -> { id, name, modifiedTime, data: Buffer }
let driveSeq = 0;
function handleDrive(req, res, url, body) {
  const json = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(obj === undefined ? '' : JSON.stringify(obj)); };
  if (url.pathname === '/__drive/_dump') return json(200, [...drive.values()].map((f) => ({ name: f.name, base64: f.data.toString('base64') })));
  if (req.headers.authorization !== 'Bearer test-token') return json(401, { error: 'unauthorized' });
  const p = url.pathname.replace('/__drive', '');
  const idOf = (prefix) => p.slice(prefix.length);
  if (req.method === 'GET' && p === '/drive/v3/files') return json(200, { files: [...drive.values()].map(({ id, name, modifiedTime }) => ({ id, name, modifiedTime })) });
  if (req.method === 'GET' && p.startsWith('/drive/v3/files/')) { const f = drive.get(idOf('/drive/v3/files/')); if (!f) return json(404, {}); res.writeHead(200, { 'Content-Type': 'application/octet-stream' }); return res.end(f.data); }
  if (req.method === 'DELETE' && p.startsWith('/drive/v3/files/')) { drive.delete(idOf('/drive/v3/files/')); res.writeHead(204); return res.end(); }
  if (req.method === 'PATCH' && p.startsWith('/upload/drive/v3/files/')) { const f = drive.get(idOf('/upload/drive/v3/files/')); if (!f) return json(404, {}); f.data = body; f.modifiedTime = new Date().toISOString(); return json(200, { id: f.id, name: f.name, modifiedTime: f.modifiedTime }); }
  if (req.method === 'POST' && p === '/upload/drive/v3/files') {
    const boundary = '--' + /boundary=([^;]+)/.exec(req.headers['content-type'])[1];
    const parts = []; let at = body.indexOf(boundary);
    while (at >= 0) { const next = body.indexOf(boundary, at + boundary.length); if (next < 0) break; parts.push(body.subarray(at + boundary.length + 2, next - 2)); at = next; }
    const content = (part) => part.subarray(part.indexOf('\r\n\r\n') + 4);
    const meta = JSON.parse(content(parts[0]).toString('utf8'));
    if (!meta.parents?.includes('appDataFolder')) return json(400, { error: 'Linemark must only write to appDataFolder' });
    const f = { id: 'f' + ++driveSeq, name: meta.name, modifiedTime: new Date().toISOString(), data: Buffer.from(content(parts[1])) };
    drive.set(f.id, f);
    return json(200, { id: f.id, name: f.name, modifiedTime: f.modifiedTime });
  }
  return json(404, { error: 'not handled' });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname.startsWith('/__drive')) {
    const chunks = []; for await (const c of req) chunks.push(c);
    return handleDrive(req, res, url, Buffer.concat(chunks));
  }
  const send = (code, body, type = 'text/plain', extra = {}) => { res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*', ...extra }); res.end(body); };
  if (url.pathname === '/__test/moved') return send(302, '', 'text/plain', { Location: `http://localhost:${PORT}/__test/page1.html` });
  if (url.pathname === '/__test/forbidden') return send(403, 'Forbidden');
  // A stand-in for the Internet Archive's availability API.
  if (url.pathname === '/__archive') {
    const has = (url.searchParams.get('url') || '').includes('gone');
    return send(200, JSON.stringify({ archived_snapshots: has ? { closest: { available: true, url: 'http://web.archive.org/web/20240102030405/https://gone.example/', timestamp: '20240102030405' } } : {} }), 'application/json');
  }
  if (url.pathname === '/__test/app.html') {
    // the real app.html, with absolute paths and the chrome.* stub injected ahead of the app module
    let html = fs.readFileSync(path.join(ROOT, 'app.html'), 'utf8');
    html = html.replace(/(href|src)="(css|js|fonts|icons)\//g, '$1="/$2/').replace('<script type="module" src="/js/app.js">', '<script src="/__test/stub-chrome.js"></script><script type="module" src="/js/app.js">');
    return send(200, html, 'text/html');
  }
  if (url.pathname === '/__test/popup.html') {
    // the real popup.html for a pretend tab (?url=, ?title=); ?sel= is text selected on that page
    let html = fs.readFileSync(path.join(ROOT, 'popup.html'), 'utf8');
    html = html.replace(/(href|src)="(css|js|fonts|icons)\//g, '$1="/$2/');
    const extra = `<script src="/__test/stub-chrome.js"></script><script>
      const q = new URLSearchParams(location.search);
      chrome.tabs.query = async () => [{ id: 1, windowId: 1, url: q.get('url'), title: q.get('title') || '' }];
      chrome.tabs.captureVisibleTab = async () => { throw new Error('no capture in tests'); };
      chrome.scripting = { executeScript: async ({ func }) => { if (func.name === 'pageMetaExtractor' && q.get('sel')) return [{ result: { selection: q.get('sel') } }]; throw new Error('no page access in tests'); } };
    </script>`;
    return send(200, html.replace('<script type="module"', extra + '<script type="module"'), 'text/html');
  }
  const file = url.pathname.startsWith('/__test/') ? path.join(FIX, url.pathname.slice(8)) : path.join(ROOT, decodeURIComponent(url.pathname));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return send(404, 'Not found');
  send(200, fs.readFileSync(file), MIME[path.extname(file)] || 'application/octet-stream');
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
PORT = server.address().port;
const BASE = `http://127.0.0.1:${PORT}`;

// ---------------------------------------------------------------- chrome over a DevTools pipe
function findChrome() {
  const candidates = [process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    path.join(os.homedir(), 'AppData/Local/Google/Chrome/Application/chrome.exe'),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'];
  const hit = candidates.find((p) => p && fs.existsSync(p));
  if (!hit) { console.error('Chrome not found. Set CHROME_PATH.'); process.exit(2); }
  return hit;
}
// A short profile path matters on Windows: extension storage paths are long and fail past 260 characters.
const PROFILE = fs.mkdtempSync(path.join(os.tmpdir(), 'emb-'));
const args = ['--remote-debugging-pipe', '--enable-unsafe-extension-debugging', `--user-data-dir=${PROFILE}`, '--no-first-run', '--no-default-browser-check', '--disable-gpu', 'about:blank'];
if (!HEADED) args.unshift('--headless=new');
// CI runners (GitHub's Ubuntu images) don't allow Chrome's sandbox; the suite only loads its own local pages there.
if (process.env.CI) args.unshift('--no-sandbox');
const chrome = spawn(findChrome(), args, { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
let msgId = 0; const pending = new Map(); const listeners = new Set(); let buf = '';
chrome.stdio[4].on('data', (chunk) => {
  buf += chunk.toString('utf8');
  for (let i; (i = buf.indexOf('\0')) >= 0;) {
    const msg = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); } else listeners.forEach((l) => l(msg));
  }
});
const cdp = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
  const id = ++msgId;
  pending.set(id, (m) => (m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result)));
  chrome.stdio[3].write(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }) + '\0');
});
await sleep(800);

// Open a page (optionally in an isolated browser context so storage starts empty).
async function open(url, { isolated = true, width = 1440, height = 900, mobile = false } = {}) {
  const ctx = isolated ? (await cdp('Target.createBrowserContext')).browserContextId : undefined;
  const { targetId } = await cdp('Target.createTarget', { url: 'about:blank', ...(ctx ? { browserContextId: ctx } : {}) });
  const { sessionId } = await cdp('Target.attachToTarget', { targetId, flatten: true });
  const errors = [];
  const onMsg = (m) => { if (m.sessionId === sessionId && m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text); };
  listeners.add(onMsg);
  await cdp('Runtime.enable', {}, sessionId);
  await cdp('Page.enable', {}, sessionId);
  await cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile }, sessionId);
  await cdp('Page.navigate', { url }, sessionId);
  const page = {
    errors, sessionId,
    // evaluate an async function body in the page; `return` gives the result
    ev: async (body) => {
      const r = await cdp('Runtime.evaluate', { expression: `(async () => { ${body} })()`, awaitPromise: true, returnByValue: true }, sessionId);
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    },
    until: async (body, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await page.ev(body).catch(() => false)) return true; await sleep(150); } throw new Error('Timed out waiting for: ' + body); },
    key: async (key, text) => {
      const code = { Enter: 13, Escape: 27, Tab: 9, F2: 113, ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40 }[key] ?? key.toUpperCase().charCodeAt(0);
      await cdp('Input.dispatchKeyEvent', { type: text ? 'keyDown' : 'rawKeyDown', key, windowsVirtualKeyCode: code, text }, sessionId);
      await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key, windowsVirtualKeyCode: code }, sessionId);
      await sleep(150);
    },
    shot: async (name) => { if (!SHOTS) return; const { data } = await cdp('Page.captureScreenshot', { format: 'png' }, sessionId); fs.writeFileSync(path.join(SHOTS, name + '.png'), Buffer.from(data, 'base64')); },
    close: async () => { listeners.delete(onMsg); await cdp('Target.closeTarget', { targetId }).catch(() => {}); if (ctx) await cdp('Target.disposeBrowserContext', { browserContextId: ctx }).catch(() => {}); },
  };
  return page;
}

// ---------------------------------------------------------------- tiny runner
const results = [];
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
async function test(name, fn) {
  const t = Date.now();
  try { await fn(); results.push({ ok: true, name, ms: Date.now() - t }); console.log(`  \u2713 ${name}`); }
  catch (e) { results.push({ ok: false, name, err: e.message }); console.log(`  \u2717 ${name}\n      ${e.message.split('\n')[0]}`); }
}

// Measured accessibility / layout checks, run inside a page.
const A11Y = String.raw`
  const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p[3] ?? 1 }; };
  const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const blend = (t, u) => ({ r: t.r * t.a + u.r * (1 - t.a), g: t.g * t.a + u.g * (1 - t.a), b: t.b * t.a + u.b * (1 - t.a), a: 1 });
  const bgOf = (el) => { const st = []; for (let n = el; n; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.backgroundImage !== 'none' && n.tagName !== 'HTML') return null; const c = parse(cs.backgroundColor); if (c && c.a > 0) { st.push(c); if (c.a >= 1) break; } } let o = { r: 255, g: 255, b: 255, a: 1 }; for (const c of st.reverse()) o = blend(c, o); return o; };
  const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.opacity !== '0' && r.bottom > 0 && r.top < innerHeight; };
  const fails = []; const seen = new Set(); const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (w.nextNode()) { const el = w.currentNode.parentElement; if (!w.currentNode.textContent.trim() || !el || seen.has(el) || !vis(el) || el.closest('[hidden], template, .ph')) continue; seen.add(el);
    const cs = getComputedStyle(el); const fg = parse(cs.color); const bg = bgOf(el); if (!fg || !bg) continue; const f = blend(fg, bg); const a = lum(f), b = lum(bg); const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    const size = parseFloat(cs.fontSize); const large = size >= 24 || (size >= 18.66 && +cs.fontWeight >= 700); if (ratio < (large ? 3 : 4.5)) fails.push((el.className || el.tagName + ' "' + el.textContent.trim().slice(0, 30) + '" in .' + (el.parentElement?.className || '')) + ' ' + ratio.toFixed(2)); }
  const inter = [...document.querySelectorAll('a[href], button, input, select, textarea, [role=button], [tabindex]')].filter(vis);
  const name = (el) => (el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent || el.getAttribute('placeholder') || (el.id && document.querySelector('label[for="' + el.id + '"]')?.textContent) || el.closest('label')?.textContent || '').trim();
  return { contrast: fails, unnamed: inter.filter((e) => !name(e)).map((e) => e.className), nested: document.querySelectorAll('a [role=button], a button, button button').length,
    overflow: document.documentElement.scrollWidth > innerWidth || [...document.querySelectorAll('.work, .content, .station, .subbar')].some((n) => n.scrollWidth > n.clientWidth + 1),
    unnamedCards: [...document.querySelectorAll('article.card')].filter((a) => !a.getAttribute('aria-labelledby')).length };`;
const assertA11y = (r, where) => {
  assert(!r.contrast.length, `${where}: contrast failures ${r.contrast.slice(0, 3).join(', ')}`);
  assert(!r.unnamed.length, `${where}: unnamed controls ${r.unnamed.slice(0, 3).join(', ')}`);
  assert(!r.nested, `${where}: nested interactive elements`);
  assert(!r.overflow, `${where}: horizontal overflow`);
  assert(!r.unnamedCards, `${where}: cards without a name`);
};

// ---------------------------------------------------------------- suites
console.log(`\nLinemark tests (server ${BASE}, Chrome ${HEADED ? 'headed' : 'headless'})\n`);

console.log('Model and import/export');
{
  const p = await open(`${BASE}/__test/page1.html`);
  await sleep(300);
  await test('URLs normalise for duplicate detection', async () => {
    const r = await p.ev(`const M = await import('/js/model.js'); return M.normalizeUrl('https://www.Example.com/a/?utm_source=x&id=2#top') === M.normalizeUrl('http://example.com/a?id=2');`);
    assert(r, 'tracking params, www, scheme, trailing slash and hash should not matter');
  });
  await test('every line colour, in every city palette, keeps bullet text at 4.5:1 or better', async () => {
    const bad = await p.ev(`const M = await import('/js/model.js');
      const L = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }).reduce((a, c, i) => a + c * [0.2126, 0.7152, 0.0722][i], 0); };
      const cr = (a, b) => (Math.max(L(a), L(b)) + 0.05) / (Math.min(L(a), L(b)) + 0.05);
      return M.PALETTES.flatMap((p) => p.colors.map((v) => ({ name: p.name + ' ' + v, value: v }))).filter((c) => cr(c.value, M.bulletInk(c.value)) < 4.5).map((c) => c.name);`);
    assert(!bad.length, 'low contrast: ' + bad.join(', '));
  });
  await test('new lines avoid colours next to ones in use, and never use Linemark orange', async () => {
    const r = await p.ev(`const M = await import('/js/model.js'); const c = M.pickLineColor(['#2f5bd8']); return [c, M.LINE_COLORS.some((x) => x.value === '#ff5a1f')];`);
    assert(!['#2f5bd8', '#1c8fd6', '#7048e8'].includes(r[0]), 'picked a neighbour of cobalt: ' + r[0]);
    assert(!r[1], 'Linemark orange is in the user palette');
  });
  await test('a Line/Branch path creates the line and the branch inside it', async () => {
    const r = await p.ev(`const M = await import('/js/model.js');
      const none = M.planLinePath([], ' Videos / Markiplier/ ');
      const videos = { id: 'v', name: 'Videos', parentId: null, color: '#2f5bd8', expanded: false };
      const have = M.planLinePath([videos], 'videos/Markiplier');
      const both = M.planLinePath([videos, { id: 'm', name: 'Markiplier', parentId: 'v', color: '#c2255c' }], 'VIDEOS/markiplier');
      return {
        none: none.created.map((c) => [c.name, c.parentId === null ? 'top' : none.created.find((x) => x.id === c.parentId)?.name, c.expanded]),
        noneTarget: none.target.name,
        have: have.created.map((c) => [c.name, c.parentId]), opened: have.opened.map((c) => [c.id, c.expanded]),
        both: [both.created.length, both.target.id],
        labels: [M.createLineLabel([], 'Videos/Markiplier'), M.createLineLabel([videos], 'videos/Markiplier'), M.createLineLabel([videos], 'Videos'), M.createLineLabel([], 'Music')],
      };`);
    assert(JSON.stringify(r.none) === JSON.stringify([['Videos', 'top', true], ['Markiplier', 'Videos', false]]) && r.noneTarget === 'Markiplier', 'new path: ' + JSON.stringify(r.none));
    assert(JSON.stringify(r.have) === JSON.stringify([['Markiplier', 'v']]) && JSON.stringify(r.opened) === JSON.stringify([['v', true]]), 'existing line: ' + JSON.stringify(r));
    assert(r.both[0] === 0 && r.both[1] === 'm', 'whole path exists: ' + JSON.stringify(r.both));
    assert(JSON.stringify(r.labels) === JSON.stringify(['Create line “Videos” › “Markiplier”', 'Create branch “Markiplier” in Videos', '', 'Create line “Music”']), 'labels: ' + JSON.stringify(r.labels));
  });
  await test('page metadata is read from HTML', async () => {
    const m = await p.ev(`const M = await import('/js/model.js'); return M.parseMeta(document.documentElement.outerHTML, location.href);`);
    assert(m.title === 'Wayfinding Notes — test page', 'title: ' + m.title);
    assert(m.image === `${BASE}/icons/icon128.png`, 'image: ' + m.image);
  });
  await test('link health classifies responses', async () => {
    const r = await p.ev(`const M = await import('/js/model.js'); const u = 'https://a.test/x';
      return [404, 410, 403, 429, 500, 200].map((s) => M.classify(new Response(null, { status: s }), u).state).join(',');`);
    assert(r === 'dead,dead,warn,warn,warn,ok', r);
  });
  await test('bookmark HTML survives an export/import round trip', async () => {
    const r = await p.ev(`const M = await import('/js/model.js'); const IO = await import('/js/io.js');
      const c = { id: 'c1', name: 'Line', code: 'L', color: '#0b7a75', parentId: null, order: 0, createdAt: 1 };
      const b = M.newBookmark({ url: 'https://example.org/a', title: 'A & <B>', tags: ['x', 'y'], collectionId: 'c1', excerpt: 'Desc' });
      const out = IO.parseNetscape(IO.toNetscape({ bookmarks: [b], collections: [c] }), new Set());
      return [out.bookmarks.length, out.collections.length, out.bookmarks[0].title, out.bookmarks[0].tags.join()];`);
    assert(r[0] === 1 && r[1] === 1 && r[2] === 'A & <B>' && r[3] === 'x,y', JSON.stringify(r));
  });
  await test('restoring a backup drops unsafe and malformed entries', async () => {
    const r = await p.ev(`const IO = await import('/js/io.js'); const db = await import('/js/db.js');
      const backup = { app: 'ember', bookmarks: [
        { id: 'ok1', url: 'https://example.org/', title: 'Fine', tags: ['A', 5, 'b'], cover: 'media:missing' },
        { id: 'bad1', url: 'javascript:alert(1)', title: 'Script' },
        { id: '../x', url: 'https://example.org/2' },
        { url: 'https://example.org/3' },
      ], collections: [{ id: 'c1', name: 'Line', color: 'red; background:url(x)', icon: 'lucide:book' }, { id: 'c2' }, { id: 'c3', name: 'Bad icon', icon: 'emoji:<img src=x onerror=alert(1)>' }] };
      const res = await IO.restoreBackup(JSON.stringify(backup));
      const b = await db.get('bookmarks', 'ok1'); const c = await db.get('collections', 'c1'); const c3 = await db.get('collections', 'c3');
      return { res, tags: b.tags.join(), cover: b.cover, color: c.color, icon: c.icon, badIcon: c3.icon, bad: !!(await db.get('bookmarks', 'bad1')) };`);
    assert(r.icon === 'lucide:book' && r.badIcon === undefined, 'icon field not validated: ' + r.icon + ' / ' + r.badIcon);
    assert(r.res.bookmarks === 1 && r.res.skipped === 3, 'kept/skipped: ' + JSON.stringify(r.res));
    assert(r.tags === 'a,b', 'tags not cleaned: ' + r.tags);
    assert(r.cover === '', 'cover pointing at a missing image should be cleared');
    assert(/^#[0-9a-f]{6}$/i.test(r.color), 'colour not sanitised: ' + r.color);
    assert(!r.bad, 'javascript: URL was restored');
  });
  await test('tab-group colours, revisit labels, and new fields survive a restore', async () => {
    const r = await p.ev(`const M = await import('/js/model.js'); const IO = await import('/js/io.js'); const db = await import('/js/db.js');
      const day = 86400000;
      const backup = { app: 'linemark', version: 2, collections: [{ id: 'sm', name: 'Favourite type', color: '#2f5bd8', smart: true, query: 'is:fav #type' }, { id: 'l1', name: 'One', color: '#c2255c' }, { id: 'l2', name: 'Two', color: '#0b7a75' }],
        bookmarks: [{ id: 'x1', url: 'https://example.com/x', title: 'X', collectionId: 'l1', tags: [], alsoOn: ['l2', 'l1', 'bad id!'], revisitAt: 1900000000000 }], media: [], texts: [] };
      await IO.restoreBackup(JSON.stringify(backup));
      const sm = await db.get('collections', 'sm'); const x = await db.get('bookmarks', 'x1');
      return { colors: [M.tabGroupColor('#2f5bd8'), M.tabGroupColor('#c2255c'), M.tabGroupColor('#5c6773'), M.lineColorForGroup('cyan')],
        labels: [M.revisitLabel(Date.now() - day), M.revisitLabel(M.revisitIn(1)), M.revisitLabel(M.revisitIn(7))],
        smart: [sm.smart, sm.query], also: x.alsoOn, revisit: x.revisitAt };`);
    assert(JSON.stringify(r.colors) === JSON.stringify(['blue', 'pink', 'grey', '#1c8fd6']), 'colours: ' + JSON.stringify(r.colors));
    assert(JSON.stringify(r.labels) === JSON.stringify(['Due', 'Tomorrow', 'In a week']), 'labels: ' + JSON.stringify(r.labels));
    assert(r.smart[0] === true && r.smart[1] === 'is:fav #type', 'smart line lost: ' + JSON.stringify(r.smart));
    assert(JSON.stringify(r.also) === JSON.stringify(['l2']) && r.revisit === 1900000000000, 'link fields: ' + JSON.stringify(r));
  });
  await test('no page errors', async () => assert(!p.errors.length, p.errors.join('\n')));
  await p.close();
}

console.log('Library (plain page with stubbed Chrome APIs)');
{
  const p = await open(`${BASE}/__test/seed.html?view=cards&to=/all`);
  await test('first render shows lines and cards', async () => {
    await p.until(`return document.querySelectorAll('#grid .card').length === 6`).catch(async (e) => { throw new Error(e.message + ' | saw ' + await p.ev(`return document.querySelectorAll('#grid .card').length + ' cards; ' + document.querySelector('.station-count')?.textContent + '; ' + location.href`)); });
    const r = await p.ev(`return [document.querySelectorAll('.band .line-stop').length, document.querySelector('.station-name').textContent];`);
    assert(r[0] >= 3 && r[1] === 'All bookmarks', JSON.stringify(r));
  });
  await test('covers are never loaded from other websites', async () => {
    const remote = await p.ev(`return [...document.images].map((i) => i.currentSrc || i.src).filter((s) => s && !s.startsWith(location.origin) && !s.startsWith('blob:') && !s.startsWith('data:'));`);
    assert(!remote.length, 'remote images: ' + remote.join(', '));
  });
  await test('search with filters', async () => {
    await p.ev(`const s = document.querySelector('#search'); s.value = '#rust'; s.dispatchEvent(new Event('input', { bubbles: true }));`);
    await p.until(`return document.querySelectorAll('#grid .card').length === 1`);
    await p.ev(`document.querySelector('[data-act=clear-search]').click();`);
    await p.until(`return document.querySelectorAll('#grid .card').length === 6`);
  });
  for (const view of ['list', 'headlines', 'moodboard', 'cards']) {
    await test(`${view} view passes accessibility checks`, async () => {
      await p.ev(`document.querySelector('[data-view=${view}]').click();`);
      await sleep(250);
      assertA11y(await p.ev(A11Y), view);
      await p.shot('library-' + view);
    });
  }
  await test('a line can show an icon from the bundled set', async () => {
    await p.ev(`document.querySelector('.line-stop[data-id=c_read] .more').click();`);
    await p.until(`return !!document.querySelector('.menu [data-mi=icon]')`);
    await p.ev(`document.querySelector('.menu [data-mi=icon]').click();`);
    await p.until(`return document.querySelectorAll('.icon-picker .icon-cell').length > 100`);
    await p.ev(`const s = document.querySelector('.icon-picker .menu-search'); s.value = 'book open'; s.dispatchEvent(new Event('input'));`);
    await p.until(`return document.querySelector('.icon-picker .icon-cell')?.dataset.icon === 'book-open'`);
    await p.shot('icon-picker');
    await p.ev(`document.querySelector('.icon-picker .icon-cell').click();`);
    await p.until(`return !!document.querySelector('.line-stop[data-id=c_read] .bullet.has-icon svg')`);
    const r = await p.ev(`const db = await import('/js/db.js'); return (await db.get('collections', 'c_read')).icon;`);
    assert(r === 'lucide:book-open', r);
  });
  await test('…or any emoji, and arrow keys move through the icon grid', async () => {
    await p.ev(`document.querySelector('.line-stop[data-id=c_eng] .more').click();`);
    await p.until(`return !!document.querySelector('.menu [data-mi=icon]')`);
    await p.ev(`document.querySelector('.menu [data-mi=icon]').click();`);
    await p.until(`return !!document.querySelector('.icon-picker .icon-cell')`);
    await p.ev(`document.querySelector('.icon-picker .icon-cell').focus();`);
    await p.key('ArrowRight'); await p.key('ArrowDown');
    const idx = await p.ev(`const cells = [...document.querySelectorAll('.icon-picker .icon-cell')]; return cells.indexOf(document.activeElement);`);
    assert(idx === 9, 'arrow keys landed on cell ' + idx);
    await p.ev(`document.querySelector('#emoji-in').value = '🚆'; document.querySelector('.emoji-row').requestSubmit();`);
    await p.until(`return document.querySelector('.line-stop[data-id=c_eng] .bullet.has-emoji .emo')?.textContent === '🚆'`);
  });
  await test('keyboard: expand a line, open its menu, Escape returns focus', async () => {
    await p.ev(`document.querySelector('.line-stop[data-id=c_design] .twisty').focus();`);
    await p.key('Enter', '\r');
    assert(await p.ev(`return document.querySelector('.line-stop[data-id=c_design] .twisty').getAttribute('aria-expanded') === 'false'`), 'Enter did not collapse the line');
    await p.ev(`document.querySelector('.line-stop[data-id=c_eng] .more').focus();`);
    await p.key('Enter', '\r');
    assert(await p.ev(`return !!document.querySelector('.menu')`), 'menu did not open');
    await p.key('Escape');
    assert(await p.ev(`return document.activeElement.matches('.line-stop[data-id=c_eng] .more')`), 'focus not returned to the menu button');
  });
  await test('keyboard: edit drawer traps focus and returns it to the card', async () => {
    await p.ev(`document.querySelector('#grid .card[data-id=b3] .card-title').focus();`);
    await p.key('e', 'e');
    await p.until(`return document.querySelector('#drawer').contains(document.activeElement)`);
    assert(await p.ev(`return document.querySelector('.app').inert`), 'background is not inert');
    await p.key('Escape');
    assert(await p.ev(`return document.activeElement.closest('.card')?.dataset.id === 'b3'`), 'focus did not return to the card');
  });
  await test('typing a tag letter by letter, with suggestions open, makes one tag', async () => {
    await p.ev(`document.querySelector('#grid .card[data-id=b3] .card-title').focus();`);
    await p.key('e', 'e');
    await p.until(`return !!document.querySelector('#d-tag-input')`);
    await p.ev(`document.querySelector('#d-tag-input').focus();`);
    await p.key('r', 'r');
    assert(await p.ev(`return !!document.querySelector('.menu') && document.activeElement.id === 'd-tag-input'`), 'suggestions took focus from the field');
    for (const ch of 'eading') await p.key(ch, ch);
    await p.key('Enter');
    await p.until(`const db = await import('/js/db.js'); return (await db.get('bookmarks', 'b3')).tags.includes('reading')`);
    const tags = await p.ev(`const db = await import('/js/db.js'); return (await db.get('bookmarks', 'b3')).tags`);
    assert(JSON.stringify(tags) === '["ui","reading"]', 'tags: ' + JSON.stringify(tags));
    await p.key('Escape');
  });
  await test('the line picker creates a branch from Line/Branch', async () => {
    await p.ev(`document.querySelector('#grid .card[data-id=b3] .card-title').focus();`);
    await p.key('e', 'e');
    await p.until(`return !!document.querySelector('#d-line')`);
    await p.ev(`document.querySelector('#d-line').click();`);
    await p.until(`return !!document.querySelector('.menu .menu-search')`);
    await p.ev(`const i = document.querySelector('.menu .menu-search'); i.value = 'Videos/Markiplier'; i.dispatchEvent(new Event('input'));`);
    assert(await p.ev(`return document.querySelector('.menu .picker-list .menu-item')?.textContent.includes('Create line “Videos” › “Markiplier”')`), 'create row missing');
    await p.key('Enter');
    await p.until(`const db = await import('/js/db.js'); const b = await db.get('bookmarks', 'b3'); const c = await db.get('collections', b.collectionId); return c?.name === 'Markiplier';`);
    const r = await p.ev(`const db = await import('/js/db.js'); const b = await db.get('bookmarks', 'b3'); const c = await db.get('collections', b.collectionId); const v = await db.get('collections', c.parentId); return [v?.name, v?.parentId, v?.expanded, !!document.querySelector('.line-stop[data-id="' + c.id + '"]')];`);
    assert(JSON.stringify(r) === JSON.stringify(['Videos', null, true, true]), 'branch: ' + JSON.stringify(r));
    // typing the same path again finds it instead of offering to create it
    await p.ev(`document.querySelector('#d-line').click();`);
    await p.until(`return !!document.querySelector('.menu .menu-search')`);
    await p.ev(`const i = document.querySelector('.menu .menu-search'); i.value = 'videos/markiplier'; i.dispatchEvent(new Event('input'));`);
    const rows = await p.ev(`return [...document.querySelectorAll('.menu .picker-list .menu-item')].map((x) => x.textContent.trim());`);
    assert(rows.length === 1 && rows[0].includes('Videos › Markiplier'), 'rows: ' + JSON.stringify(rows));
    await p.key('Escape');
    await p.key('Escape');
  });
  await test('a search can be kept as a smart line that fills itself', async () => {
    await p.ev(`location.hash = '#/all';`);
    await p.until(`return document.querySelector('.station-name')?.textContent === 'All bookmarks'`);
    await p.ev(`const s = document.querySelector('#search'); s.value = '#type'; s.dispatchEvent(new Event('input', { bubbles: true }));`);
    await p.until(`return !!document.querySelector('[data-act=save-smart]')`);
    await p.ev(`document.querySelector('[data-act=save-smart]').click();`);
    await p.until(`return document.querySelector('.station-name')?.textContent === '#type'`);
    const r = await p.ev(`const db = await import('/js/db.js'); const c = (await db.getAll('collections')).find((x) => x.smart);
      return [c?.query, document.querySelectorAll('#grid .card').length, document.querySelector('.line-stop.smart .count')?.textContent, !!document.querySelector('.smart-q')];`);
    assert(r[0] === '#type' && r[1] === 1 && r[2] === '1' && r[3], 'smart line: ' + JSON.stringify(r));
  });
  await test('a link can also stop on another line (interchange)', async () => {
    await p.ev(`location.hash = '#/all';`);
    await p.until(`return document.querySelectorAll('#grid .card').length === 6`);
    await p.ev(`document.querySelector('#grid .card[data-id=b3] [data-act=card-menu]').click();`);
    await p.until(`return !!document.querySelector('.menu [data-mi=also]')`);
    await p.ev(`document.querySelector('.menu [data-mi=also]').click();`);
    await p.until(`return !!document.querySelector('.menu [data-pick=c_rust]')`);
    await p.ev(`document.querySelector('.menu [data-pick=c_rust]').click();`);
    await p.until(`const db = await import('/js/db.js'); return (await db.get('bookmarks', 'b3')).alsoOn?.includes('c_rust')`);
    const r = await p.ev(`return [document.querySelector('.line-stop[data-id=c_rust] .count').textContent, !!document.querySelector('#grid .card[data-id=b3] .on-line.also')];`);
    assert(r[0] === '2' && r[1], 'interchange: ' + JSON.stringify(r));
    await p.ev(`location.hash = '#/c/c_rust';`);
    await p.until(`return [...document.querySelectorAll('#grid .card')].map((c) => c.dataset.id).sort().join() === 'b3,b4'`);
  });
  await test('revisit puts a link on the Departures board, and Done takes it off', async () => {
    await p.ev(`location.hash = '#/all';`);
    await p.until(`return document.querySelectorAll('#grid .card').length === 6`);
    await p.ev(`document.querySelector('#grid .card[data-id=b2] [data-act=card-menu]').click();`);
    await p.until(`return !!document.querySelector('.menu [data-mi=revisit]')`);
    await p.ev(`document.querySelector('.menu [data-mi=revisit]').click();`);
    await p.until(`return !!document.querySelector('.menu [data-days="1"]')`);
    await p.ev(`document.querySelector('.menu [data-days="1"]').click();`);
    await p.until(`return document.querySelector('#grid .card[data-id=b2] .due')?.textContent.includes('Tomorrow')`);
    assert(!(await p.ev(`return !!document.querySelector('a.stop[href="#/departures"]')`)), 'the board shows before anything is due');
    // make it due today, as it will be tomorrow
    await p.ev(`const db = await import('/js/db.js'); const b = await db.get('bookmarks', 'b2'); b.revisitAt = Date.now() - 1000; await db.put('bookmarks', b); location.reload();`);
    await p.until(`return document.querySelector('a.stop[href="#/departures"] .count')?.textContent === '1'`);
    await p.ev(`location.hash = '#/departures';`);
    await p.until(`return document.querySelector('#grid .card[data-id=b2] [data-act=visited]')`);
    await p.ev(`document.querySelector('#grid .card[data-id=b2] [data-act=visited]').click();`);
    await p.until(`return !document.querySelector('a.stop[href="#/departures"]')`);
    assert(!(await p.ev(`const db = await import('/js/db.js'); return (await db.get('bookmarks', 'b2')).revisitAt`)), 'revisit not cleared');
  });
  await test('a dead link can be pointed at its Internet Archive copy', async () => {
    await p.ev(`const db = await import('/js/db.js'); const b = await db.get('bookmarks', 'b5'); b.url = 'https://gone.example/'; b.health = { state: 'dead', code: 404, checkedAt: Date.now() }; await db.put('bookmarks', b); location.hash = '#/all'; location.reload();`);
    await p.until(`return !!document.querySelector('#grid .card[data-id=b5] [data-act=card-menu]')`);
    await p.ev(`document.querySelector('#grid .card[data-id=b5] [data-act=card-menu]').click();`);
    await p.until(`return !!document.querySelector('.menu [data-mi=archive]')`);
    await p.ev(`document.querySelector('.menu [data-mi=archive]').click();`);
    await p.until(`return !!document.querySelector('.menu [data-mi=use]')`);
    assert(await p.ev(`return document.querySelector('.menu .label').textContent.includes('2024')`), 'archive date missing');
    await p.ev(`document.querySelector('.menu [data-mi=use]').click();`);
    await p.until(`const db = await import('/js/db.js'); return (await db.get('bookmarks', 'b5')).url.startsWith('https://web.archive.org/')`);
    const r = await p.ev(`const db = await import('/js/db.js'); const b = await db.get('bookmarks', 'b5'); return [b.health.state, b.note.includes('Original address: https://gone.example/')];`);
    assert(r[0] === 'ok' && r[1], 'archive: ' + JSON.stringify(r));
  });
  await test('a line opens as a Chrome tab group, and tab groups save as lines', async () => {
    await p.ev(`location.hash = '#/all';`);
    await p.until(`return !!document.querySelector('.line-stop[data-id=c_rust] .more')`);
    await p.ev(`document.querySelector('.line-stop[data-id=c_rust] .more').click();`);
    await p.until(`return !!document.querySelector('.menu [data-mi=tab-group]')`);
    await p.ev(`document.querySelector('.menu [data-mi=tab-group]').click();`);
    await p.until(`return window.__tabCalls.groups.length === 1 && window.__tabCalls.groups[0].title`);
    const g = await p.ev(`return window.__tabCalls.groups[0];`);
    // Rust holds its own link and the interchange added above; clay maps to Chrome's orange group
    assert(g.title === 'Rust' && g.color === 'orange' && g.tabIds.length === 2, 'group: ' + JSON.stringify(g));
    await p.ev(`location.hash = '#/settings';`);
    await p.until(`return !!document.querySelector('[data-act=save-tab-groups]')`);
    await p.ev(`document.querySelector('[data-act=save-tab-groups]').click();`);
    await p.until(`const db = await import('/js/db.js'); return (await db.getAll('collections')).some((c) => c.name === 'Research trip')`);
    const r = await p.ev(`const db = await import('/js/db.js'); const c = (await db.getAll('collections')).find((x) => x.name === 'Research trip'); return [c.color, (await db.getAll('bookmarks')).filter((b) => b.collectionId === c.id).map((b) => b.title).sort()];`);
    assert(r[0] === '#1c8fd6' && JSON.stringify(r[1]) === JSON.stringify(['Tab A', 'Tab B']), 'saved group: ' + JSON.stringify(r));
  });
  await test('on-device AI suggests a line, tags and a summary, applied one at a time', async () => {
    await p.ev(`location.hash = '#/all';`);
    await p.until(`return !!document.querySelector('#grid .card[data-id=b1] .card-title')`);
    await p.ev(`document.querySelector('#grid .card[data-id=b1] .card-title').focus();`);
    await p.key('e', 'e');
    await p.until(`return !!document.querySelector('#d-suggest')`);
    await p.ev(`document.querySelector('#d-suggest').click();`);
    await p.until(`return !!document.querySelector('.ai-out [data-ai=line]')`);
    assert(await p.ev(`return document.querySelector('.ai-out [data-ai=line]').textContent.includes('New line: Design › Interfaces')`), 'line suggestion');
    await p.ev(`document.querySelector('.ai-out [data-ai=line]').click();`);
    await p.until(`const db = await import('/js/db.js'); const b = await db.get('bookmarks', 'b1'); const c = await db.get('collections', b.collectionId); return c?.name === 'Interfaces' && c.parentId === 'c_design';`);
    await p.until(`return !!document.querySelector('.ai-out [data-t=layout]')`);
    await p.ev(`document.querySelector('.ai-out [data-t=layout]').click();`);
    await p.until(`return !!document.querySelector('.ai-out [data-ai=summary]')`);
    await p.ev(`document.querySelector('.ai-out [data-ai=summary]').click();`);
    await p.until(`const db = await import('/js/db.js'); const b = await db.get('bookmarks', 'b1'); return b.tags.includes('layout') && b.excerpt === 'A practical guide to designing interfaces.';`);
    await p.key('Escape');
  });
  await test('the network map draws lines, branches, stations and interchanges', async () => {
    await p.ev(`location.hash = '#/all';`);
    await p.until(`return !!document.querySelector('[data-view=map]')`);
    await p.ev(`document.querySelector('[data-view=map]').click();`);
    await p.until(`return !!document.querySelector('svg.netmap')`);
    const r = await p.ev(`const live = document.querySelectorAll('svg.netmap .map-stop').length;
      return [live, document.querySelectorAll('svg.netmap .map-stop.inter').length, document.querySelectorAll('svg.netmap .stem').length, [...document.querySelectorAll('svg.netmap .lb-name')].map((t) => t.textContent)];`);
    // b3 stops on Design and (as an interchange) on Rust, so it is drawn twice
    assert(r[0] >= 6 && r[1] >= 2 && r[2] >= 2, 'map: ' + JSON.stringify(r));
    assert(r[3].includes('Design') && r[3].includes('Rust') && r[3].includes('Unsorted'), 'rows: ' + JSON.stringify(r[3]));
    await p.ev(`document.querySelector('[data-view=cards]').click();`);
    await p.until(`return !!document.querySelector('#grid .card')`);
  });
  await test('moving down the band brings cards in from below, and back up from above', async () => {
    await p.ev(`location.hash = '#/all';`);
    await p.until(`return document.querySelector('.station-name')?.textContent === 'All bookmarks'`);
    await p.ev(`document.querySelector('.line-stop[data-id=c_read] .stop-link').click();`);
    await p.until(`return document.querySelector('#grid')?.classList.contains('enter-down')`);
    await p.ev(`document.querySelector('a.stop[href="#/all"]').click();`);
    await p.until(`return document.querySelector('#grid')?.classList.contains('enter-up')`);
  });
  await test('Wrapped shows the year on the lines and saves it as an image', async () => {
    await p.ev(`location.hash = '#/settings';`);
    await p.until(`return !!document.querySelector('a[href="#/wrapped"]')`);
    await p.ev(`document.querySelector('a[href="#/wrapped"]').click();`);
    await p.until(`return !!document.querySelector('.wrapped .year-line')`);
    const r = await p.ev(`return [document.querySelector('.wrap-big').textContent.trim(), document.querySelectorAll('.year-line .month').length, document.querySelector('.station-name').getAttribute('aria-label') || document.querySelector('.station-name').textContent, !!document.querySelector('.wrap-lines li')];`);
    assert(+r[0] >= 6 && r[1] === 12 && r[2] === 'Your year on the lines' && r[3], 'wrapped: ' + JSON.stringify(r));
    await p.ev(`window.__downloads = []; const orig = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { if (this.download) window.__downloads.push(this.download); else orig.call(this); }; document.querySelector('[data-act=wrap-export]').click();`);
    await p.until(`return window.__downloads.some((d) => /^linemark-wrapped-[0-9]{4}[.]png$/.test(d))`);
  });
  await test('the Journey rides the year: a stop per saved page, and the dot fills the line as it scrolls', async () => {
    await p.ev(`document.querySelector('[data-act=wrap-view][data-v=journey]').click();`);
    await p.until(`return document.querySelectorAll('.jr-fill').length > 0`);
    const n = await p.ev(`return [document.querySelectorAll('.jr-stop').length, document.querySelectorAll('.jr-stop.passed').length];`);
    assert(n[0] >= 6 && n[1] === 0, 'stops before riding: ' + JSON.stringify(n));
    await p.ev(`const j = document.querySelector('.journey'); j.scrollLeft = j.scrollWidth;`);
    await p.until(`return document.querySelectorAll('.jr-stop.passed').length === document.querySelectorAll('.jr-stop').length`);
    const end = await p.ev(`return [Math.round(parseFloat(document.querySelector('.jr-fill:last-of-type').style.strokeDashoffset)), document.querySelector('.jr-hud-n').textContent];`);
    assert(end[0] === 0 && end[1] === `${n[0]} of ${n[0]}`, 'line filled at the end: ' + JSON.stringify(end));
    await p.until(`const db = await import('/js/db.js'); return (await db.getMeta('ui', {})).wrapView === 'journey'`);
    await p.ev(`document.querySelector('[data-act=wrap-view][data-v=summary]').click();`);
    await p.until(`return !!document.querySelector('.wrapped .year-line')`);
  });
  await test('a city palette recolours every line in kind, and Undo puts them back', async () => {
    await p.ev(`location.hash = '#/settings';`);
    await p.until(`return !!document.querySelector('[data-palette=tokyo]')`);
    await p.ev(`document.querySelector('[data-palette=tokyo]').click();`);
    await p.until(`const db = await import('/js/db.js'); return (await db.get('collections', 'c_design'))?.color === '#9a9a92'`);
    await p.until(`const db = await import('/js/db.js'); return (await db.getMeta('ui', {})).palette === 'tokyo'`);
    const r = await p.ev(`const db = await import('/js/db.js'); return [(await db.get('collections', 'c_eng')).color, (await db.getMeta('ui', {})).palette, document.querySelector('[data-palette=tokyo]').getAttribute('aria-pressed')];`);
    assert(r[0] === '#0079c2' && r[1] === 'tokyo' && r[2] === 'true', 'tokyo: ' + JSON.stringify(r));
    await p.ev(`[...document.querySelectorAll('#toasts .toast button')].find((b) => b.textContent === 'Undo').click();`);
    await p.until(`const db = await import('/js/db.js'); return (await db.get('collections', 'c_design'))?.color === '#5c6773' && (await db.get('collections', 'c_eng')).color === '#2f5bd8'`);
  });
  await test('link types are shapes, the map draws carriages, and Unsorted fills like a platform', async () => {
    await p.ev(`location.hash = '#/all';`);
    await p.until(`return !!document.querySelector('.type-filter .shape') && !!document.querySelector('#grid .meta .kind .shape')`);
    const crowd = await p.ev(`const b = document.querySelector('#band a.stop[href="#/unsorted"] .bullet'); return [b.classList.contains('crowd'), +b.style.getPropertyValue('--crowd') > 0];`);
    assert(crowd[0] && crowd[1], 'crowding ring: ' + JSON.stringify(crowd));
    await p.ev(`document.querySelector('[data-view=map]').click();`);
    await p.until(`return document.querySelectorAll('svg.netmap .map-stop path.dot').length > 0 && document.querySelectorAll('svg.netmap .cap').length > 0`);
    await p.ev(`document.querySelector('[data-view=cards]').click();`);
  });
  await test('highlights file with their page: kept once, found by search, listed and removed in the drawer', async () => {
    const h = await open(`${BASE}/__test/seed.html?view=cards&to=/all`);
    await h.until(`return !!document.querySelector('#grid .card[data-id=b3]')`);
    await h.ev(`const M = await import('/js/model.js'); const db = await import('/js/db.js'); const b = await db.get('bookmarks', 'b3');
      M.addHighlight(b, 'Start with too much white space, then remove it.'); M.addHighlight(b, '  Start with too much   white space, then remove it. ');
      await M.saveBookmark(b); location.reload();`);
    await h.until(`return !!document.querySelector('#grid .card[data-id=b3] .hl-n')`);
    assert(await h.ev(`const db = await import('/js/db.js'); return (await db.get('bookmarks', 'b3')).highlights.length === 1`), 'the same passage twice is kept once');
    await h.ev(`const s = document.querySelector('#search'); s.value = 'white space'; s.dispatchEvent(new Event('input', { bubbles: true }));`);
    await h.until(`const c = document.querySelector('#grid .card[data-id=b3]'); return c?.querySelector('.snip-label')?.textContent === 'Highlight' && /white/i.test(c.querySelector('.card-snippet mark')?.textContent || '')`);
    await h.ev(`const s = document.querySelector('#search'); s.value = 'has:highlights'; s.dispatchEvent(new Event('input', { bubbles: true }));`);
    await h.until(`return document.querySelectorAll('#grid .card').length === 1 && !!document.querySelector('#grid .card[data-id=b3]')`);
    await h.ev(`document.querySelector('#grid .card[data-id=b3] [data-act=edit]').click();`);
    await h.until(`return document.querySelectorAll('#drawer .highlights li').length === 1`);
    await h.ev(`document.querySelector('#drawer [data-act=rm-highlight]').click();`);
    await h.until(`const db = await import('/js/db.js'); return (await db.get('bookmarks', 'b3')).highlights.length === 0 && !document.querySelector('#drawer .highlights')`);
    assert(!h.errors.length, h.errors.join('\n'));
    await h.close();
  });
  await test('a saved image is stored on this computer, typed as an image, and remembers its page', async () => {
    const h = await open(`${BASE}/__test/seed.html?view=cards&to=/all`);
    await h.until(`return !!document.querySelector('#grid .card')`);
    const r = await h.ev(`const M = await import('/js/model.js'); const src = location.origin + '/icons/icon128.png';
      const a = await M.saveImage({ src, pageUrl: location.origin + '/__test/page1.html', pageTitle: 'Page one' });
      const again = await M.saveImage({ src, pageUrl: location.origin + '/elsewhere' });
      const none = await M.saveImage({ src: 'data:image/png;base64,AAAA', pageUrl: location.origin });
      return [a.created, a.b.type, a.b.cover.startsWith('media:'), a.b.fromUrl.endsWith('/__test/page1.html'), a.b.fromTitle, again.created, none, a.b.id];`);
    assert(r[0] === true && r[1] === 'image' && r[2] && r[3] && r[4] === 'Page one' && r[5] === false && r[6] === null, 'image: ' + JSON.stringify(r));
    await h.ev(`location.reload();`);
    await h.until(`return !!document.querySelector('#grid .card[data-id="${r[7]}"]')`);
    await h.ev(`document.querySelector('#grid .card[data-id="${r[7]}"] [data-act=edit]').click();`);
    await h.until(`return document.querySelector('#drawer .drawer-meta a')?.textContent === 'Page one'`);
    // a saved image belongs to the page it came from: its card names that site, and site: finds it there
    await h.ev(`document.querySelector('[data-act=close-drawer]').click(); const M = await import('/js/model.js'); const db = await import('/js/db.js');
      const b = await db.get('bookmarks', '${r[7]}'); b.fromUrl = 'https://en.wikipedia.org/wiki/Shinkansen'; await M.saveBookmark(b); location.reload();`);
    await h.until(`return document.querySelector('#grid .card[data-id="${r[7]}"] .meta .host')?.textContent === 'en.wikipedia.org'`);
    await h.ev(`const s = document.querySelector('#search'); s.value = 'site:wikipedia.org'; s.dispatchEvent(new Event('input', { bubbles: true }));`);
    await h.until(`return document.querySelectorAll('#grid .card').length === 1 && !!document.querySelector('#grid .card[data-id="${r[7]}"]')`);
    assert(!h.errors.length, h.errors.join('\n'));
    await h.close();
  });
  await test('the popup keeps text selected on the page as a highlight, and can take it back', async () => {
    const pp = await open(`${BASE}/__test/popup.html?url=${encodeURIComponent('https://example.org/essay')}&title=An%20essay&sel=${encodeURIComponent('The quick brown fox jumps over the lazy dog.')}`);
    await pp.until(`return document.querySelector('#pop-hl:not([hidden]) .pop-hl-label')?.textContent.includes('Saved as a highlight')`);
    const saved = `const db = await import('/js/db.js'); const b = (await db.getAll('bookmarks')).find((x) => x.url === 'https://example.org/essay');`;
    assert(await pp.ev(`${saved} return b.highlights.length === 1 && b.note === ''`), 'the selection is a highlight, not the note');
    await pp.ev(`document.querySelector('#hl-remove').click();`);
    await pp.until(`${saved} return b.highlights.length === 0 && !!document.querySelector('#hl-save')`);
    await pp.ev(`document.querySelector('#hl-save').click();`);
    await pp.until(`${saved} return b.highlights.length === 1 && !!document.querySelector('#hl-remove')`);
    assert(!pp.errors.length, pp.errors.join('\n'));
    await pp.close();
  });
  await test('the station chime switch is saved, and arriving at a station flips its name in', async () => {
    await p.ev(`location.hash = '#/settings';`);
    await p.until(`return !!document.querySelector('[data-act=chime]')`);
    await p.ev(`document.querySelector('[data-act=chime]').click();`);
    await p.until(`const db = await import('/js/db.js'); return (await db.getMeta('ui', {})).chime === true`);
    assert(await p.ev(`return document.querySelector('[data-act=chime]').getAttribute('aria-checked') === 'true'`), 'switch state');
    await p.ev(`document.querySelector('[data-act=chime]').click();`);
    await p.ev(`location.hash = '#/favorites';`);
    await p.until(`const h = document.querySelector('.station-name'); return h?.classList.contains('flap') && h.getAttribute('aria-label') === 'Favorites' && h.textContent === 'Favorites'`);
  });
  await test('trains run the network map', async () => {
    await p.ev(`location.hash = '#/all';`);
    await p.until(`return document.querySelector('.station-name')?.textContent === 'All bookmarks' && !!document.querySelector('[data-view=map]')`);
    await p.ev(`document.querySelector('[data-view=map]').click();`);
    await p.until(`return document.querySelectorAll('svg.netmap .train animateMotion').length >= 1`);
    await p.ev(`document.querySelector('[data-view=cards]').click();`);
    await p.until(`return !!document.querySelector('#grid .card')`);
  });
  await test("a sub-line's current row leaves its parent's stem unbroken", async () => {
    await p.ev(`document.querySelector('.line-stop[data-id=c_rust] .stop-link').click();`);
    await p.until(`return !!document.querySelector('.line-stop[data-id=c_rust][data-current]')`);
    const gap = await p.ev(`const row = document.querySelector('.line-stop[data-id=c_rust]'); const kids = row.closest('.line-children'); return row.getBoundingClientRect().left - kids.getBoundingClientRect().left;`);
    assert(gap >= 5, 'current row starts ' + gap + 'px from the stem; it covers it');
    await p.shot('sidebar-sub-line-current');
  });
  await test('narrow window (320px) has no overflow', async () => {
    await cdp('Emulation.setDeviceMetricsOverride', { width: 320, height: 700, deviceScaleFactor: 1, mobile: true }, p.sessionId);
    await sleep(300);
    assertA11y(await p.ev(A11Y), '320px');
  });
  await test('no page errors', async () => assert(!p.errors.length, p.errors.join('\n')));
  await p.close();
}

console.log('Link health, full-text search and local covers');
{
  const p = await open(`${BASE}/__test/seed.html?set=scan&to=/settings`);
  await test('checking links sorts dead, moved and unverified', async () => {
    await p.until(`return !!document.querySelector('[data-act=scan][data-kind=links]')`);
    await p.ev(`document.querySelector('[data-act=scan][data-kind=links]').click();`);
    await p.until(`return !document.querySelector('[data-act=scan-cancel]') && /last full check/.test(document.querySelector('#row-links .what span').textContent)`, 20000);
    const h = await p.ev(`const db = await import('/js/db.js'); return Object.fromEntries((await db.getAll('bookmarks')).map((b) => [b.id, b.health?.state]));`);
    assert(h.t1 === 'ok' && h.t2 === 'ok' && h.t3 === 'dead' && h.t4 === 'dead' && h.t5 === 'warn' && h.t6 === 'moved', JSON.stringify(h));
  });
  await p.shot('settings-after-check');
  await test('the page cover is stored locally, not linked', async () => {
    const c = await p.ev(`const db = await import('/js/db.js'); return (await db.get('bookmarks', 't1')).cover;`);
    assert(c.startsWith('media:'), 'cover is ' + c);
  });
  await test('full-text search finds words inside pages, but not scripts', async () => {
    await p.ev(`location.hash = '#/all';`);
    await p.ev(`const s = document.querySelector('#search'); s.value = 'escalator'; s.dispatchEvent(new Event('input', { bubbles: true }));`);
    await p.until(`return document.querySelectorAll('#grid .card .card-snippet mark').length >= 1`);
    await p.ev(`const s = document.querySelector('#search'); s.value = 'scriptwordshouldnotindex'; s.dispatchEvent(new Event('input', { bubbles: true }));`);
    await p.until(`return !!document.querySelector('.empty h2')`);
  });
  await test('no page errors', async () => assert(!p.errors.length, p.errors.join('\n')));
  await p.close();
}

console.log('Encrypted sync (stand-in Google Drive)');
{
  const PASS = 'correct horse battery staple';
  const setUp = async (p, pass = PASS, clientId = '123-test.apps.googleusercontent.com') => {
    await p.ev(`location.hash = '#/settings';`);
    await p.until(`return !!document.querySelector('[data-act=sync-setup]')`);
    await p.ev(`document.querySelector('[data-act=sync-setup]').click();`);
    await p.until(`return !!document.querySelector('#sync-form')`);
    await p.ev(`document.querySelector('#sync-section').scrollIntoView();`);
    await p.shot('settings-sync-setup');
    await p.ev(`${clientId ? `document.querySelector('#sync-client').value = '${clientId}';` : ''}
      document.querySelector('#sync-pass').value = ${JSON.stringify(pass)}; document.querySelector('#sync-pass2').value = ${JSON.stringify(pass)};
      document.querySelector('#sync-form').requestSubmit();`);
  };
  const a = await open(`${BASE}/__test/seed.html?to=/all`);
  await a.until(`return document.querySelectorAll('#grid .card').length === 6`);
  // give device A a stored cover image so image sync is exercised
  await a.ev(`const M = await import('/js/model.js'); const db = await import('/js/db.js'); const b = await db.get('bookmarks', 'b1');
    b.cover = await M.storeImage(location.origin + '/icons/icon128.png'); b.updatedAt = Date.now(); await db.put('bookmarks', b);`);
  await test('sync is off until you turn it on', async () => {
    await a.ev(`location.hash = '#/settings';`);
    await a.until(`return document.querySelector('#sync-section')?.textContent.includes('Sync is off')`);
    assert(!(await a.ev(`return !!document.querySelector('.sync-btn')`)), 'sync indicator shown while sync is off');
  });
  await test('device A turns sync on and uploads an encrypted copy', async () => {
    await setUp(a);
    await a.until(`return document.querySelector('#sync-section')?.textContent.includes('Synced')`, 30000);
    const names = (await (await fetch(`${BASE}/__drive/_dump`)).json()).map((f) => f.name).sort();
    assert(names.includes('ember-vault.json') && names.includes('ember-library.enc') && names.some((n) => n.startsWith('m-')), names.join(', '));
  });
  await test('Google Drive only ever holds ciphertext', async () => {
    const files = await (await fetch(`${BASE}/__drive/_dump`)).json();
    const leaks = [];
    for (const f of files) {
      const text = Buffer.from(f.base64, 'base64').toString('latin1');
      for (const secret of ['Typography', 'Vignelli', 'rust', 'practicaltypography', 'grid chapter', 'PNG', 'WEBP']) if (f.name !== 'ember-vault.json' && text.includes(secret)) leaks.push(`${f.name}: ${secret}`);
    }
    assert(!leaks.length, 'plaintext found: ' + leaks.join(', '));
  });
  const b = await open(`${BASE}/__test/app.html#/all`);
  await test('device B with the same passphrase receives the library and images', async () => {
    await b.until(`return document.querySelector('.empty h2')?.textContent === 'Every link gets a line'`);
    await setUp(b);
    await b.until(`return document.querySelector('#sync-section')?.textContent.includes('Synced')`, 30000);
    const r = await b.ev(`const db = await import('/js/db.js'); const bm = await db.getAll('bookmarks'); const b1 = bm.find((x) => x.id === 'b1');
      return { n: bm.length, live: bm.filter((x) => !x.trashedAt).length, lines: (await db.getAll('collections')).length, img: !!(b1 && (await db.get('media', b1.cover.slice(6)))?.blob?.size) };`);
    assert(r.n === 7 && r.live === 6 && r.lines === 5 && r.img, JSON.stringify(r));
  });
  await test('edits and permanent deletions travel back to device A', async () => {
    await b.ev(`const db = await import('/js/db.js'); const M = await import('/js/model.js');
      const x = await db.get('bookmarks', 'b3'); x.title = 'Refactoring UI (edited on B)'; x.updatedAt = Date.now(); await db.put('bookmarks', x);
      await db.del('bookmarks', 'b6'); await M.addTombstones(['b6']);
      location.hash = '#/all'; await new Promise((r) => setTimeout(r, 200)); location.hash = '#/settings';`);
    await b.until(`return !!document.querySelector('[data-act=sync-now]') && !document.querySelector('[data-act=sync-now]').disabled`);
    await b.ev(`document.querySelector('[data-act=sync-now]').click();`);
    await b.until(`const db = await import('/js/db.js'); const st = (await db.getMeta('sync')).lastStats; return !document.querySelector('[data-act=sync-now]')?.disabled && st && st.links === 6`, 20000);
    await a.until(`return !!document.querySelector('[data-act=sync-now]') && !document.querySelector('[data-act=sync-now]').disabled`);
    await a.ev(`document.querySelector('[data-act=sync-now]').click();`);
    await a.until(`const db = await import('/js/db.js'); return (await db.get('bookmarks', 'b3'))?.title === 'Refactoring UI (edited on B)' && !(await db.get('bookmarks', 'b6'))`, 20000);
  });
  await test('a wrong passphrase is refused', async () => {
    const c = await open(`${BASE}/__test/app.html#/all`);
    await c.until(`return !!document.querySelector('.empty h2')`);
    await setUp(c, 'not the right passphrase');
    await c.until(`return /match/.test(document.querySelector('#sync-err')?.textContent || '')`, 20000);
    await c.ev(`document.querySelector('#sync-section').scrollIntoView();`);
    await c.shot('settings-sync-wrong-pass');
    const n = await c.ev(`const db = await import('/js/db.js'); return (await db.getAll('bookmarks')).length;`);
    assert(n === 0, 'device with the wrong passphrase received data');
    await c.close();
  });
  await test('one-click sign-in with Chrome’s Google account, no client ID needed', async () => {
    const d = await open(`${BASE}/__test/app.html?sso=chrome#/all`);
    await d.until(`return !!document.querySelector('.empty h2')`);
    await d.ev(`location.hash = '#/settings';`);
    await d.until(`return !!document.querySelector('[data-act=sync-setup]')`);
    await d.ev(`document.querySelector('[data-act=sync-setup]').click();`);
    await d.until(`return !!document.querySelector('#sync-form')`);
    const form = await d.ev(`return { button: document.querySelector('#sync-go').textContent.trim(), clientHidden: !document.querySelector('#sync-form details')?.open };`);
    assert(form.button === 'Sign in with Google and sync' && form.clientHidden, JSON.stringify(form));
    await d.ev(`document.querySelector('#sync-section').scrollIntoView();`);
    await d.shot('settings-sync-signin');
    await d.ev(`document.querySelector('#sync-pass').value = ${JSON.stringify(PASS)}; document.querySelector('#sync-pass2').value = ${JSON.stringify(PASS)}; document.querySelector('#sync-form').requestSubmit();`);
    await d.until(`return document.querySelector('#sync-section')?.textContent.includes('Synced')`, 30000);
    const r = await d.ev(`const db = await import('/js/db.js'); return { calls: window.__authCalls, auth: (await db.getMeta('sync')).auth, live: (await db.getAll('bookmarks')).filter((b) => !b.trashedAt).length };`);
    assert(r.auth === 'chrome' && r.calls.getAuthToken > 0 && r.calls.launchWebAuthFlow === 0 && r.live === 5, JSON.stringify(r));
    assert(!d.errors.length, d.errors.join('\n'));
    await d.close();
  });
  await test('browsers without Chrome’s sign-in (Edge, Brave) fall back to the sign-in window', async () => {
    const e = await open(`${BASE}/__test/app.html?sso=edge#/all`);
    await e.until(`return !!document.querySelector('.empty h2')`);
    await setUp(e, PASS, '');
    await e.until(`return document.querySelector('#sync-section')?.textContent.includes('Synced')`, 30000);
    const r = await e.ev(`const db = await import('/js/db.js'); return { calls: window.__authCalls, auth: (await db.getMeta('sync')).auth, live: (await db.getAll('bookmarks')).filter((b) => !b.trashedAt).length };`);
    assert(r.auth === 'web' && r.calls.getAuthToken > 0 && r.calls.launchWebAuthFlow > 0 && r.live === 5, JSON.stringify(r));
    assert(!e.errors.length, e.errors.join('\n'));
    await e.close();
  });
  await test('settings pass accessibility checks with sync on', async () => {
    await a.ev(`location.hash = '#/settings';`); await sleep(300);
    await a.ev(`document.querySelector('#sync-section').scrollIntoView();`); await sleep(200);
    assertA11y(await a.ev(A11Y), 'settings with sync');
    await a.shot('settings-sync-on');
  });
  await test('no page errors on either device', async () => assert(!a.errors.length && !b.errors.length, [...a.errors, ...b.errors].join('\n')));
  await a.close(); await b.close();
}

console.log('Real extension (fresh install)');
{
  let extId;
  await test('loads as an unpacked extension', async () => {
    extId = (await cdp('Extensions.loadUnpacked', { path: ROOT })).id;
    assert(extId, 'no extension id');
  });
  if (extId) {
    await sleep(1500);
    const p = await open(`chrome-extension://${extId}/app.html`, { isolated: false });
    await test('first run renders the welcome screen (no blank page)', async () => {
      await p.until(`return document.querySelector('.empty h2')?.textContent === 'Every link gets a line'`, 10000);
    });
    await test('imports Chrome bookmarks into lines', async () => {
      await p.ev(`const bar = (await chrome.bookmarks.getTree())[0].children[0]; const f = await chrome.bookmarks.create({ parentId: bar.id, title: 'Reading' });
        await chrome.bookmarks.create({ parentId: f.id, title: 'Example', url: 'https://example.com/' }); await chrome.bookmarks.create({ parentId: bar.id, title: 'Wiki', url: 'https://www.wikipedia.org/' });`);
      await p.ev(`document.querySelector('[data-act=import-chrome]').click();`);
      await p.until(`return document.querySelectorAll('#grid .card').length === 2`);
    });
    await test('settings render', async () => {
      await p.ev(`location.hash = '#/settings';`);
      await p.until(`return document.querySelectorAll('.settings .row').length >= 10`);
    });
    await test('dark theme passes accessibility checks', async () => {
      await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] }, p.sessionId);
      await p.ev(`location.hash = '#/all';`); await sleep(400);
      assertA11y(await p.ev(A11Y), 'dark');
      await p.shot('extension-dark');
    });
    await test('no page errors', async () => assert(!p.errors.length, p.errors.join('\n')));
    await p.close();

    const pop = await open(`chrome-extension://${extId}/popup.html`, { isolated: false, width: 380, height: 480 });
    await test('popup opens (browser page shows the cannot-save state)', async () => {
      await pop.until(`return document.querySelector('.pop-empty h2')?.textContent.includes('can’t be bookmarked')`);
      assert(!pop.errors.length, pop.errors.join('\n'));
    });
    await pop.close();

    await test('service worker registers shortcuts', async () => {
      const { targetInfos } = await cdp('Target.getTargets');
      const sw = targetInfos.find((t) => t.type === 'service_worker' && t.url.includes(extId));
      assert(sw, 'service worker not running');
      const { sessionId } = await cdp('Target.attachToTarget', { targetId: sw.targetId, flatten: true });
      const r = await cdp('Runtime.evaluate', { expression: `chrome.commands.getAll().then((c) => c.map((x) => x.name).sort().join())`, awaitPromise: true, returnByValue: true }, sessionId);
      assert(r.result.value === '_execute_action,open-linemark', r.result.value);
    });
  }
}

// ---------------------------------------------------------------- report
chrome.kill();
server.close();
try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch {}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
process.exit(failed.length ? 1 : 0);
