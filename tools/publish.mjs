#!/usr/bin/env node
// Uploads dist/chrome-<version>.zip to the Chrome Web Store and dist/edge-<version>.zip to Microsoft Edge Add-ons,
// then submits each for review. Build the zips first with `node tools/package.mjs`. No dependencies.
//
//   node tools/publish.mjs                    both stores
//   node tools/publish.mjs --store chrome     one store (chrome or edge)
//   node tools/publish.mjs --dry-run          check the zips and settings, upload nothing (with CWS_ACCESS_TOKEN,
//                                             it also reads the Chrome item's status to prove the sign-in works)
//   node tools/publish.mjs --notes "…"        notes for Edge's certification testers (default: RELEASE_NOTES, then
//                                             a line naming the version)
//
// Credentials come from the environment (GitHub Actions secrets in .github/workflows/release.yml), never from files
// in the repository. See docs/RELEASING.md for where each one comes from.
//
//   Chrome Web Store (API v2, service account), signed in either way:
//     CWS_ACCESS_TOKEN           a short-lived token for the service account (the release workflow gets one from
//                                GitHub's keyless sign-in, so no key file exists), or
//     CWS_SERVICE_ACCOUNT_JSON   the service account's JSON key (the whole file's text)
//     CWS_PUBLISHER_ID           Developer Dashboard → Publisher → Settings
//     CWS_ITEM_ID                optional; defaults to Linemark's item ID
//   Microsoft Edge Add-ons (API v1.1):
//     EDGE_CLIENT_ID, EDGE_API_KEY   Partner Center → Microsoft Edge → Publish API (the key expires every 72 days)
//     EDGE_PRODUCT_ID                Partner Center → the extension's overview → Extension identity → Product ID

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = path.resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const DRY = args.includes('--dry-run');
const STORE = opt('--store') || 'both';
const { version } = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
const NOTES = opt('--notes') || process.env.RELEASE_NOTES || `Linemark ${version}.`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const need = (name) => { const v = process.env[name]; if (!v && !DRY) throw new Error(`${name} is not set`); return v || ''; };
const zipFor = (store) => {
  const file = path.join(ROOT, 'dist', `${store}-${version}.zip`);
  if (!fs.existsSync(file)) throw new Error(`${path.relative(ROOT, file)} is missing: run node tools/package.mjs first`);
  return file;
};
const log = (store, msg) => console.log(`[${store}] ${msg}`);

// ---------- Chrome Web Store, API v2 ----------
// A service account's JSON key is exchanged for an access token: a JWT signed with its private key (RS256).
async function googleToken(keyJson) {
  const key = JSON.parse(keyJson);
  const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: 'RS256', typ: 'JWT' });
  const claims = b64({ iss: key.client_email, scope: 'https://www.googleapis.com/auth/chromewebstore', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 });
  const sig = crypto.createSign('RSA-SHA256').update(`${head}.${claims}`).sign(key.private_key).toString('base64url');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${claims}.${sig}` }),
  });
  const out = await res.json();
  if (!res.ok || !out.access_token) throw new Error(`Google sign-in failed: ${res.status} ${JSON.stringify(out)}`);
  return out.access_token;
}

async function chrome() {
  const file = zipFor('chrome');
  const publisher = need('CWS_PUBLISHER_ID');
  const item = process.env.CWS_ITEM_ID || 'laapaiiaipeoilipnbhpjmjbdkomhjln';
  const preset = process.env.CWS_ACCESS_TOKEN;
  const keyJson = preset ? '' : need('CWS_SERVICE_ACCOUNT_JSON');
  log('chrome', `${path.basename(file)} → item ${item}${DRY ? ' (dry run)' : ''}`);
  if (DRY && !(preset && publisher)) return;
  const token = preset || await googleToken(keyJson);
  const api = `https://chromewebstore.googleapis.com/v2/publishers/${publisher}/items/${item}`;
  const call = async (url, init = {}) => {
    const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers || {}) } });
    const text = await res.text();
    let body; try { body = JSON.parse(text); } catch { body = text; }
    if (!res.ok) throw new Error(`${init.method || 'GET'} ${url} → ${res.status} ${typeof body === 'string' ? body : JSON.stringify(body)}`);
    return body;
  };
  if (DRY) { // read-only: proves the token, the publisher and the service account's access
    const st = await call(`${api}:fetchStatus`);
    log('chrome', `signed in; the store answered: ${JSON.stringify(st).slice(0, 300)}`);
    return;
  }
  const up = await call(`https://chromewebstore.googleapis.com/upload/v2/publishers/${publisher}/items/${item}:upload`, {
    method: 'POST', headers: { 'Content-Type': 'application/zip' }, body: fs.readFileSync(file),
  });
  log('chrome', `upload: ${up.uploadState || JSON.stringify(up)}`);
  // a large upload is processed after the request returns; wait for it before publishing
  let state = up.uploadState;
  for (let i = 0; i < 30 && /PROGRESS/.test(state || ''); i++) {
    await sleep(5000);
    const st = await call(`${api}:fetchStatus`);
    state = st.lastAsyncUploadState || st.uploadState || state;
    log('chrome', `upload: ${state}`);
  }
  if (/FAIL/.test(state || '')) throw new Error(`upload failed: ${JSON.stringify(up)}`);
  const pub = await call(`${api}:publish`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  log('chrome', `submitted for review: ${JSON.stringify(pub)}`);
}

// ---------- Microsoft Edge Add-ons, API v1.1 ----------
async function edge() {
  const file = zipFor('edge');
  const product = need('EDGE_PRODUCT_ID');
  const headers = { Authorization: `ApiKey ${need('EDGE_API_KEY')}`, 'X-ClientID': need('EDGE_CLIENT_ID') };
  log('edge', `${path.basename(file)} → product ${product || '(not set)'}${DRY ? ' (dry run)' : ''}`);
  if (DRY) return;
  const api = `https://api.addons.microsoftedge.microsoft.com/v1/products/${product}`;
  // each step answers 202 with the operation to poll in its Location header
  const start = async (url, init) => {
    const res = await fetch(url, { ...init, headers: { ...headers, ...(init.headers || {}) } });
    if (res.status !== 202) throw new Error(`POST ${url} → ${res.status} ${await res.text()}`);
    const loc = res.headers.get('location') || '';
    return loc.split('/').pop().trim();
  };
  const wait = async (url, what) => {
    for (let i = 0; i < 60; i++) {
      await sleep(5000);
      const res = await fetch(url, { headers });
      const body = await res.json().catch(() => ({}));
      const status = body.status || 'InProgress';
      if (status !== 'InProgress') {
        if (status !== 'Succeeded') throw new Error(`${what} ${status}: ${JSON.stringify(body)}`);
        log('edge', `${what}: ${status}`);
        return body;
      }
    }
    throw new Error(`${what}: still in progress after 5 minutes`);
  };
  const upId = await start(`${api}/submissions/draft/package`, { method: 'POST', headers: { 'Content-Type': 'application/zip' }, body: fs.readFileSync(file) });
  await wait(`${api}/submissions/draft/package/operations/${upId}`, 'upload');
  const pubId = await start(`${api}/submissions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ notes: NOTES }) });
  await wait(`${api}/submissions/operations/${pubId}`, 'submitted for certification');
}

const run = { chrome, edge };
const stores = STORE === 'both' ? ['chrome', 'edge'] : [STORE];
let failed = false;
for (const s of stores) {
  if (!run[s]) { console.error(`Unknown store "${s}": use chrome, edge or both`); process.exit(2); }
  try { await run[s](); } catch (e) { failed = true; console.error(`[${s}] ${e.message}`); }
}
process.exit(failed ? 1 : 0);
