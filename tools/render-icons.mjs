#!/usr/bin/env node
// Renders Linemark's icon PNGs from its two SVG sources:
//   store/logo/linemark.svg   the full mark: icons/icon48.png, icons/icon128.png (inside the store's 96x96 safe area),
//                             icons/icon512.png, docs/images/icon.png (site and README) and store/edge/logo-300.png
//   icons/logo.svg            the toolbar mark: icons/icon16.png and icons/icon32.png
// store/images/icon-128.png and the promo tiles come from tools/store-assets.mjs.
//
//   node tools/render-icons.mjs        (needs Google Chrome; set CHROME_PATH if it isn't found)

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const FULL = 'store/logo/linemark.svg', SMALL = 'icons/logo.svg';
// [source, output, canvas size, artwork size]: the artwork is centred on the canvas
const JOBS = [
  [SMALL, 'icons/icon16.png', 16, 16],
  [SMALL, 'icons/icon32.png', 32, 32],
  [FULL, 'icons/icon48.png', 48, 48],
  [FULL, 'icons/icon128.png', 128, 96],
  [FULL, 'icons/icon512.png', 512, 512],
  [FULL, 'docs/images/icon.png', 512, 512],
  [FULL, 'store/edge/logo-300.png', 300, 300],
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CHROME = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome'].find((p) => p && fs.existsSync(p));
if (!CHROME) { console.error('Chrome not found. Set CHROME_PATH.'); process.exit(2); }
const PROFILE = fs.mkdtempSync(path.join(os.tmpdir(), 'lm-icons-'));
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-pipe', `--user-data-dir=${PROFILE}`, '--hide-scrollbars', '--disable-gpu', 'about:blank'], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
let id = 0; const pending = new Map(); let buf = '';
chrome.stdio[4].on('data', (d) => { buf += d.toString(); for (let i; (i = buf.indexOf('\0')) >= 0;) { const m = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } } });
const cdp = (method, params = {}, sessionId) => new Promise((r) => { const i = ++id; pending.set(i, r); chrome.stdio[3].write(JSON.stringify({ id: i, method, params, ...(sessionId ? { sessionId } : {}) }) + '\0'); });
await sleep(800);

const { result: t } = await cdp('Target.createTarget', { url: 'about:blank' });
const { result: a } = await cdp('Target.attachToTarget', { targetId: t.targetId, flatten: true });
const S = a.sessionId;
await cdp('Page.enable', {}, S);
await cdp('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } }, S);
const { result: { frameTree } } = await cdp('Page.getFrameTree', {}, S);

for (const [src, out, size, art] of JOBS) {
  await cdp('Emulation.setDeviceMetricsOverride', { width: size, height: size, deviceScaleFactor: 1, mobile: false }, S);
  const data = fs.readFileSync(path.join(ROOT, src)).toString('base64');
  const pad = (size - art) / 2;
  await cdp('Page.setDocumentContent', { frameId: frameTree.frame.id, html: `<style>html,body{margin:0;background:transparent}img{display:block;margin:${pad}px}</style><img src="data:image/svg+xml;base64,${data}" width="${art}" height="${art}">` }, S);
  for (let i = 0; i < 50; i++) {
    const { result } = await cdp('Runtime.evaluate', { expression: `document.querySelector('img')?.complete`, returnByValue: true }, S);
    if (result.result.value) break;
    await sleep(50);
  }
  const { result: shot } = await cdp('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: size, height: size, scale: 1 } }, S);
  fs.writeFileSync(path.join(ROOT, out), Buffer.from(shot.data, 'base64'));
  console.log(`  wrote ${out} (${size}px)`);
}

chrome.kill();
try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch {}
