// Optional, end-to-end encrypted sync through the user's own Google Drive (the hidden app-data folder).
//
// Local by default: nothing here runs unless the user turns sync on in Settings.
// Everything leaves the device encrypted with a key derived from the user's passphrase
// (PBKDF2-SHA256, 600k iterations -> AES-256-GCM). Google stores ciphertext only.
//
// Files in the app-data folder:
//   ember-vault.json   salt, iteration count and an encrypted check value (no secrets)
//   ember-library.enc  encrypted snapshot of lines, bookmarks and deletions
//   m-<id>.enc         one encrypted file per stored image (screenshots and page covers)
// Page text for full-text search is not synced; each device rebuilds its own index.

import * as db from './db.js';
import * as M from './model.js';
import { GOOGLE_WEB_CLIENT_ID, isConfigured } from './config.js';

const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const VAULT = 'ember-vault.json';
const LIBRARY = 'ember-library.enc';
const ITERATIONS = 600000;
const CHECK = 'ember-sync-v1';
// The test suite points this at a local stand-in for Google Drive; in the extension it is always Google.
const API = () => globalThis.__LINEMARK_TEST_DRIVE__ || 'https://www.googleapis.com';

export const settings = () => db.getMeta('sync', { enabled: false });
const saveSettings = (s) => db.setMeta('sync', s);

// ---------------------------------------------------------------- crypto
const te = new TextEncoder();
const td = new TextDecoder();
const b64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function deriveKey(passphrase, salt, iterations = ITERATIONS) {
  const base = await crypto.subtle.importKey('raw', te.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  // Non-extractable: the key can be used and stored on this device, but never read back out.
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

async function seal(key, bytes) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes));
  const out = new Uint8Array(12 + ct.length);
  out.set(iv);
  out.set(ct, 12);
  return out;
}

async function unseal(key, buf) {
  const bytes = new Uint8Array(buf);
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12) }, key, bytes.slice(12)));
}

// Images keep their MIME type inside the ciphertext: [type length][type][image bytes].
async function sealBlob(key, blob) {
  const type = te.encode(blob.type || 'application/octet-stream');
  const data = new Uint8Array(await blob.arrayBuffer());
  const out = new Uint8Array(1 + type.length + data.length);
  out[0] = type.length;
  out.set(type, 1);
  out.set(data, 1 + type.length);
  return seal(key, out);
}

async function unsealBlob(key, buf) {
  const bytes = await unseal(key, buf);
  const n = bytes[0];
  return new Blob([bytes.slice(1 + n)], { type: td.decode(bytes.slice(1, 1 + n)) });
}

// The derived key is remembered on this device (as a non-extractable CryptoKey) so sync can run
// without asking for the passphrase each time. "Forget" removes it.
const loadKey = () => db.getMeta('syncKey', null);
const rememberKey = (key) => db.setMeta('syncKey', key);
export const forgetKey = () => db.setMeta('syncKey', null);
export async function hasKey() { return !!(await loadKey()); }

// ---------------------------------------------------------------- Google sign-in
export const redirectUrl = () => (globalThis.chrome?.identity ? chrome.identity.getRedirectURL('google') : '');

// How this build can sign in to Google, best first:
//   'chrome' — Chrome's own account (chrome.identity.getAuthToken): one click, renewed silently. Google Chrome only.
//   'web'    — Google's sign-in window with Linemark's built-in web client: Edge, Brave, Vivaldi (and Chrome as a fallback).
//   'own'    — the user's own Google Cloud client ID ("Use your own Google project" in Settings).
const manifestClient = () => globalThis.chrome?.runtime?.getManifest?.()?.oauth2?.client_id;
// The test suite can stand in a web client; in the extension it always comes from config.js.
const webClient = () => globalThis.__LINEMARK_TEST_WEB_CLIENT__ || GOOGLE_WEB_CLIENT_ID;
export function signInOptions() {
  return {
    chrome: isConfigured(manifestClient()) && typeof globalThis.chrome?.identity?.getAuthToken === 'function',
    web: isConfigured(webClient()),
  };
}
export const builtInSignIn = () => { const o = signInOptions(); return o.chrome || o.web; };

async function token(interactive) {
  const s = await settings();
  // setups from before built-in sign-in recorded no method: they used their own client ID
  const auth = s.auth || (s.clientId ? 'own' : 'web');
  if (auth === 'chrome') return chromeToken(interactive);
  if (s.token && s.tokenExp > Date.now() + 60000) return s.token;
  const clientId = auth === 'own' ? s.clientId : webClient();
  if (!isConfigured(clientId)) throw new SyncError(auth === 'own' ? 'Add your Google OAuth client ID first.' : 'This copy of Linemark has no built-in Google sign-in. Use your own Google project instead.');
  const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
    client_id: clientId,
    response_type: 'token',
    redirect_uri: redirectUrl(),
    scope: SCOPE,
    include_granted_scopes: 'true',
    ...(interactive ? {} : { prompt: 'none' }),
  });
  let resp;
  try {
    resp = await chrome.identity.launchWebAuthFlow({ url, interactive });
  } catch (e) {
    throw new SyncError(interactive ? `Google sign-in didn’t finish: ${e.message}` : 'Sign in to Google again to keep syncing.', { needsSignIn: true });
  }
  const p = new URLSearchParams(new URL(resp).hash.slice(1));
  if (p.get('error') || !p.get('access_token')) throw new SyncError(`Google sign-in failed: ${p.get('error') || 'no access token'}`, { needsSignIn: true });
  s.token = p.get('access_token');
  s.tokenExp = Date.now() + (+p.get('expires_in') || 3600) * 1000;
  await saveSettings(s);
  return s.token;
}

// Chrome keeps and renews this token itself; a 401 means it went stale and is dropped from Chrome's cache.
async function chromeToken(interactive) {
  try {
    const r = await chrome.identity.getAuthToken({ interactive, scopes: [SCOPE] });
    const t = typeof r === 'string' ? r : r?.token;
    if (!t) throw new Error('no token');
    return t;
  } catch (e) {
    throw new SyncError(interactive ? `Google sign-in didn’t finish: ${e.message}` : 'Sign in to Google again to keep syncing.', { needsSignIn: true });
  }
}

async function dropToken(t) {
  const s = await settings();
  if (s.auth === 'chrome') await chrome.identity.removeCachedAuthToken({ token: t }).catch(() => {});
  else { s.token = null; await saveSettings(s); }
}

export class SyncError extends Error {
  constructor(message, extra = {}) { super(message); Object.assign(this, extra); }
}

// ---------------------------------------------------------------- Drive (app-data folder only)
async function drive(path, { method = 'GET', body, headers = {}, interactive = false, raw = false } = {}) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const t = await token(interactive);
    const res = await fetch(API() + path, { method, body, headers: { Authorization: `Bearer ${t}`, ...headers } });
    if (res.status === 401 && attempt === 0) {
      await dropToken(t);
      continue;
    }
    if (!res.ok) {
      const msg = res.status === 403 ? 'Google Drive refused the request. Check that the Drive API is enabled for your client ID.' : res.status === 404 ? 'A sync file went missing on Google Drive. Try again.' : `Google Drive answered ${res.status}.`;
      throw new SyncError(msg);
    }
    if (raw) return res;
    return res.status === 204 ? null : res.json();
  }
}

async function listFiles(interactive) {
  const files = [];
  let pageToken = '';
  do {
    const q = new URLSearchParams({ spaces: 'appDataFolder', fields: 'nextPageToken,files(id,name,modifiedTime)', pageSize: '1000', ...(pageToken ? { pageToken } : {}) });
    const r = await drive(`/drive/v3/files?${q}`, { interactive });
    files.push(...r.files);
    pageToken = r.nextPageToken || '';
  } while (pageToken);
  return new Map(files.map((f) => [f.name, f]));
}

const download = async (id) => (await drive(`/drive/v3/files/${id}?alt=media`, { raw: true })).arrayBuffer();

async function create(name, bytes, type = 'application/octet-stream') {
  const boundary = 'linemark' + crypto.getRandomValues(new Uint32Array(2)).join('');
  const meta = JSON.stringify({ name, parents: ['appDataFolder'] });
  const body = new Blob([`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${type}\r\n\r\n`, bytes, `\r\n--${boundary}--`]);
  return drive('/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime', { method: 'POST', body, headers: { 'Content-Type': `multipart/related; boundary=${boundary}` } });
}

const update = (id, bytes, type = 'application/octet-stream') =>
  drive(`/upload/drive/v3/files/${id}?uploadType=media&fields=id,name,modifiedTime`, { method: 'PATCH', body: bytes, headers: { 'Content-Type': type } });

const remove = (id) => drive(`/drive/v3/files/${id}`, { method: 'DELETE' });

// ---------------------------------------------------------------- merge (pure)
const stamp = (r) => r.updatedAt || r.createdAt || 0;

// Newest version of each record wins; a deletion newer than a record removes it everywhere.
export function merge(local, remote) {
  const tombstones = { ...remote.tombstones };
  for (const [id, at] of Object.entries(local.tombstones)) tombstones[id] = Math.max(at, tombstones[id] || 0);
  const pick = (a = [], b = []) => {
    const out = new Map();
    for (const r of [...a, ...b]) {
      const cur = out.get(r.id);
      if (!cur || stamp(r) > stamp(cur)) out.set(r.id, r);
    }
    for (const [id, r] of out) if (tombstones[id] && tombstones[id] >= stamp(r)) out.delete(id);
    return [...out.values()];
  };
  return { collections: pick(local.collections, remote.collections), bookmarks: pick(local.bookmarks, remote.bookmarks), tombstones };
}

// ---------------------------------------------------------------- setup / unlock
// Turn sync on. First device: creates the vault. Later devices: the passphrase must match it.
// With no clientId, Linemark signs in with its built-in Google sign-in (Chrome's account first).
export async function enable({ clientId = '', passphrase }) {
  if (!passphrase || passphrase.length < 10) throw new SyncError('Use a passphrase of at least 10 characters.');
  const own = clientId.trim();
  const opts = signInOptions();
  const auth = own ? 'own' : opts.chrome ? 'chrome' : opts.web ? 'web' : null;
  if (!auth) throw new SyncError('This copy of Linemark has no built-in Google sign-in. Use your own Google project instead.');
  const s = { ...(await settings()), auth, clientId: own, token: null, enabled: false, lastError: '' };
  await saveSettings(s);
  let files;
  try {
    files = await listFiles(true);
  } catch (e) {
    // Chrome's own sign-in isn't available in every Chromium browser: fall back to the sign-in window.
    if (auth !== 'chrome' || !opts.web) throw e;
    s.auth = 'web';
    await saveSettings(s);
    files = await listFiles(true);
  }
  let key;
  if (files.has(VAULT)) {
    const vault = JSON.parse(td.decode(await download(files.get(VAULT).id)));
    key = await deriveKey(passphrase, unb64(vault.salt), vault.iterations);
    try {
      if (td.decode(await unseal(key, unb64(vault.check))) !== CHECK) throw new Error();
    } catch {
      throw new SyncError('That passphrase doesn’t match the one used on your other devices.');
    }
  } else {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    key = await deriveKey(passphrase, salt);
    const vault = { app: 'ember', v: 1, kdf: 'PBKDF2-SHA256', iterations: ITERATIONS, salt: b64(salt), check: b64(await seal(key, te.encode(CHECK))) };
    await create(VAULT, te.encode(JSON.stringify(vault)), 'application/json');
  }
  await rememberKey(key);
  s.enabled = true;
  await saveSettings(s);
  return syncNow();
}

// Unlock on a device that turned sync on before but forgot its key.
export async function unlock(passphrase) {
  const files = await listFiles(true);
  if (!files.has(VAULT)) throw new SyncError('There is no Linemark sync data on this Google account yet.');
  const vault = JSON.parse(td.decode(await download(files.get(VAULT).id)));
  const key = await deriveKey(passphrase, unb64(vault.salt), vault.iterations);
  try {
    if (td.decode(await unseal(key, unb64(vault.check))) !== CHECK) throw new Error();
  } catch {
    throw new SyncError('That passphrase doesn’t match.');
  }
  await rememberKey(key);
  return syncNow();
}

export async function disable({ deleteCloud = false } = {}) {
  if (deleteCloud) {
    const files = await listFiles(true);
    for (const f of files.values()) await remove(f.id);
  }
  const s = await settings();
  if (s.auth === 'chrome') {
    const t = await chromeToken(false).catch(() => null);
    if (t) await chrome.identity.removeCachedAuthToken({ token: t }).catch(() => {});
  }
  await saveSettings({ enabled: false, clientId: s.clientId || '' });
  await forgetKey();
}

// ---------------------------------------------------------------- the sync itself
let running = null;

export function syncNow(opts) {
  if (!running) running = runSync(opts).finally(() => { running = null; });
  return running;
}

async function runSync({ interactive = false } = {}) {
  const s = await settings();
  if (!s.enabled) return null;
  const key = await loadKey();
  if (!key) throw new SyncError('Enter your passphrase to unlock sync on this device.', { locked: true });
  try {
    const files = await listFiles(interactive);

    // 1. merge the remote snapshot into local data
    const [collections, bookmarks, tombstones] = await Promise.all([db.getAll('collections'), db.getAll('bookmarks'), db.getMeta('tombstones', {})]);
    const local = { collections, bookmarks, tombstones };
    let remote = { collections: [], bookmarks: [], tombstones: {} };
    if (files.has(LIBRARY)) {
      try {
        remote = JSON.parse(td.decode(await unseal(key, await download(files.get(LIBRARY).id))));
      } catch {
        throw new SyncError('The synced library couldn’t be decrypted with this device’s key. Turn sync off and on again with your passphrase.');
      }
    }
    const merged = merge(local, remote);
    const changes = await applyLocally(local, merged);

    // 2. images: upload what the cloud lacks, download what this device lacks
    const want = new Set(merged.bookmarks.map((b) => b.cover).filter((c) => c?.startsWith('media:')).map((c) => c.slice(6)));
    const localMedia = new Set(await db.keys('media'));
    let uploaded = 0, downloaded = 0;
    for (const id of want) {
      const name = `m-${id}.enc`;
      if (localMedia.has(id) && !files.has(name)) {
        const m = await db.get('media', id);
        if (m?.blob) { await create(name, await sealBlob(key, m.blob)); uploaded++; }
      } else if (!localMedia.has(id) && files.has(name)) {
        const blob = await unsealBlob(key, await download(files.get(name).id));
        await db.put('media', { id, blob, type: blob.type, createdAt: Date.now() });
        downloaded++;
      }
    }
    // tidy cloud images nothing refers to any more (only old ones, so another device's fresh upload is safe)
    for (const [name, f] of files) {
      if (name.startsWith('m-') && !want.has(name.slice(2, -4)) && Date.now() - Date.parse(f.modifiedTime) > 86400000) await remove(f.id);
    }

    // 3. upload the merged snapshot
    const snapshot = { app: 'ember', v: 1, at: Date.now(), collections: merged.collections, bookmarks: merged.bookmarks.map(({ _hay, ...b }) => b), tombstones: merged.tombstones };
    const sealed = await seal(key, te.encode(JSON.stringify(snapshot)));
    if (files.has(LIBRARY)) await update(files.get(LIBRARY).id, sealed);
    else await create(LIBRARY, sealed);

    const fresh = await settings();
    Object.assign(fresh, { lastSync: Date.now(), lastError: '', lastStats: { links: merged.bookmarks.length, lines: merged.collections.length, images: want.size, ...changes, uploaded, downloaded } });
    await saveSettings(fresh);
    return fresh.lastStats;
  } catch (e) {
    const fresh = await settings();
    fresh.lastError = e.message;
    await saveSettings(fresh);
    throw e;
  }
}

// Write the merged result into IndexedDB: only records that actually changed.
async function applyLocally(local, merged) {
  const diff = (before, after) => {
    const old = new Map(before.map((r) => [r.id, stamp(r)]));
    const keep = new Set(after.map((r) => r.id));
    return { put: after.filter((r) => old.get(r.id) !== stamp(r)), del: before.filter((r) => !keep.has(r.id)).map((r) => r.id) };
  };
  const c = diff(local.collections, merged.collections);
  const b = diff(local.bookmarks, merged.bookmarks);
  if (c.put.length || c.del.length || b.put.length || b.del.length) {
    await db.batch(async () => {
      await db.putMany('collections', c.put);
      await db.delMany('collections', c.del);
      await db.putMany('bookmarks', b.put.map(({ _hay, ...r }) => r));
      await db.delMany('bookmarks', b.del);
      await db.delMany('texts', b.del);
    });
  }
  await db.setMeta('tombstones', merged.tombstones);
  return { received: c.put.length + b.put.length, removed: c.del.length + b.del.length };
}
