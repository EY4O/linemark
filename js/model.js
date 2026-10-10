// Domain helpers shared by every Linemark context. No DOM access here: the service worker imports it too.
import * as db from './db.js';

export const hasChrome = typeof chrome !== 'undefined' && !!chrome.runtime?.id;

export const LINE_COLORS = [
  { name: 'Signal', value: '#d92a3a' },
  { name: 'Magenta', value: '#c2255c' },
  { name: 'Violet', value: '#7048e8' },
  { name: 'Cobalt', value: '#2f5bd8' },
  { name: 'Sky', value: '#1c8fd6' },
  { name: 'Teal', value: '#0b7a75' },
  { name: 'Green', value: '#2f9e44' },
  { name: 'Olive', value: '#7d8a12' },
  { name: 'Amber', value: '#f0a800' },
  { name: 'Clay', value: '#9a5b36' },
  { name: 'Slate', value: '#5c6773' },
  { name: 'Rose', value: '#e0607e' },
];

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

// Letter colour for a bullet: whichever of white / signage black contrasts more.
export function bulletInk(hex) {
  const L = luminance(hex);
  const onWhite = 1.05 / (L + 0.05);
  const onBlack = (L + 0.05) / (luminance('#16171a') + 0.05);
  return onBlack > onWhite ? '#16171a' : '#ffffff';
}

function hueOf(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (d < 0.12) return null; // greys have no hue
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

// Next line colour: least used first, then the one whose hue sits farthest from colours already on the map.
export function pickLineColor(usedColors) {
  const count = new Map();
  for (const c of usedColors) count.set(c, (count.get(c) || 0) + 1);
  const usedHues = [...count.keys()].map(hueOf).filter((h) => h !== null);
  const gap = (hex) => {
    const h = hueOf(hex);
    if (h === null) return 60;
    if (!usedHues.length) return 360;
    return Math.min(...usedHues.map((u) => Math.min(Math.abs(h - u), 360 - Math.abs(h - u))));
  };
  return [...LINE_COLORS]
    .sort((a, b) => (count.get(a.value) || 0) - (count.get(b.value) || 0) || gap(b.value) - gap(a.value))[0].value;
}

// ---------- revisits (the departures board) ----------
// A link can be given a day to come back to; on that day it shows on the Departures board.

export const endOfToday = (now = Date.now()) => { const d = new Date(now); d.setHours(23, 59, 59, 999); return d.getTime(); };
export const REVISIT_CHOICES = [['Tomorrow', 1], ['In 3 days', 3], ['In a week', 7], ['In 2 weeks', 14], ['In a month', 30]];
export function revisitIn(days, now = Date.now()) { const d = new Date(now); d.setDate(d.getDate() + days); d.setHours(9, 0, 0, 0); return d.getTime(); }
export function revisitLabel(at, now = Date.now()) {
  if (at <= endOfToday(now)) return 'Due';
  const days = Math.round((new Date(at).setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0)) / 86400000);
  if (days === 1) return 'Tomorrow';
  if (days < 7) return `In ${days} days`;
  if (days < 14) return 'In a week';
  if (days < 31) return `In ${Math.round(days / 7)} weeks`;
  return `In ${Math.round(days / 30)} month${days >= 45 ? 's' : ''}`;
}

// ---------- Chrome tab groups ----------
// Lines and tab groups both carry a colour; these map one palette onto the other by hue.
export const TAB_GROUP_COLORS = { grey: '#5c6773', blue: '#2f5bd8', red: '#d92a3a', yellow: '#f0a800', green: '#2f9e44', pink: '#c2255c', purple: '#7048e8', cyan: '#1c8fd6', orange: '#9a5b36' };
export function tabGroupColor(hex) {
  const h = hueOf(hex);
  if (h === null) return 'grey';
  const hues = Object.entries(TAB_GROUP_COLORS).filter(([, v]) => hueOf(v) !== null);
  const dist = (a, b) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
  return hues.sort((a, b) => dist(h, hueOf(a[1])) - dist(h, hueOf(b[1])))[0][0];
}
export const lineColorForGroup = (name) => TAB_GROUP_COLORS[name] || TAB_GROUP_COLORS.grey;

// ---------- the Internet Archive ----------
// Asked only when someone chooses "Find archived copy" on a link that no longer works.
const ARCHIVE_API = () => globalThis.__LINEMARK_TEST_ARCHIVE__ || 'https://archive.org/wayback/available';
export async function findArchivedCopy(url) {
  const res = await fetch(`${ARCHIVE_API()}?url=${encodeURIComponent(url)}`, { credentials: 'omit' });
  if (!res.ok) throw new Error('The Internet Archive didn’t answer.');
  const snap = (await res.json())?.archived_snapshots?.closest;
  if (!snap?.available || !/^https?:\/\/web\.archive\.org\//.test(snap.url.replace(/^http:/, 'https:')) && !globalThis.__LINEMARK_TEST_ARCHIVE__) return null;
  const t = String(snap.timestamp || '');
  const when = t.length >= 8 ? new Date(Date.UTC(+t.slice(0, 4), +t.slice(4, 6) - 1, +t.slice(6, 8))).getTime() : null;
  return { url: snap.url.replace(/^http:/, 'https:'), when };
}

// ---------- line paths ----------
// "Cooking/Baking" names a line and a branch inside it. Names match case-insensitively.

export const splitLinePath = (q = '') => String(q).split('/').map((s) => s.trim()).filter(Boolean);

// The names from the top line down to this one.
export function linePathOf(collections, id) {
  const byId = new Map(collections.map((c) => [c.id, c]));
  const names = [];
  for (let c = byId.get(id), guard = 0; c && guard < 32; c = byId.get(c.parentId), guard++) names.unshift(c.name);
  return names;
}

// Walks a typed path through the existing lines: the lines it found, and the names still missing.
export function resolveLinePath(collections, names) {
  const found = [];
  let parentId = null;
  for (let i = 0; i < names.length; i++) {
    const want = names[i].toLowerCase();
    const hit = collections.find((c) => !c.smart && (c.parentId || null) === parentId && c.name.trim().toLowerCase() === want);
    if (!hit) return { found, missing: names.slice(i) };
    found.push(hit);
    parentId = hit.id;
  }
  return { found, missing: [] };
}

// What it takes for the whole path to exist: the new lines (each branch inside the one before),
// the existing parent opened so the new branch shows, and the line a link should go to.
export function planLinePath(collections, path) {
  const names = splitLinePath(path);
  const { found, missing } = resolveLinePath(collections, names);
  const all = [...collections];
  const created = [];
  let parentId = found.at(-1)?.id ?? null;
  for (const name of missing) {
    const c = { id: uid(), name, code: codeFor(name), color: pickLineColor(all.map((x) => x.color)), parentId, order: all.filter((x) => (x.parentId || null) === parentId).length, expanded: false, createdAt: Date.now() };
    const parent = all.find((x) => x.id === parentId);
    if (parent && created.includes(parent)) parent.expanded = true;
    all.push(c);
    created.push(c);
    parentId = c.id;
  }
  const host = found.at(-1);
  const opened = host && missing.length && !host.expanded ? [{ ...host, expanded: true }] : [];
  return { names, found, missing, created, opened, target: created.at(-1) || host || null };
}

// The label for the picker's create row, or '' when the whole path already exists.
export function createLineLabel(collections, path) {
  const names = splitLinePath(path);
  if (!names.length) return '';
  const { found, missing } = resolveLinePath(collections, names);
  if (!missing.length) return '';
  const what = missing.join(' › ');
  if (found.length) return `Create ${missing.length > 1 ? `“${what}”` : `branch “${what}”`} in ${found.at(-1).name}`;
  return missing.length > 1 ? `Create line “${missing[0]}” › “${missing.slice(1).join(' › ')}”` : `Create line “${what}”`;
}

export function codeFor(name = '') {
  const words = name.replace(/[^\p{L}\p{N}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '•';
  if (words.length === 1) return [...words[0]][0].toUpperCase();
  return ([...words[0]][0] + [...words[1]][0]).toUpperCase();
}

export function colorFor(seed = '') {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return LINE_COLORS[h % LINE_COLORS.length].value;
}

const TRACKING = /^(utm_|fbclid$|gclid$|mc_|ref$|ref_src$|igshid$|si$)/i;

export function normalizeUrl(raw) {
  try {
    const u = new URL(raw);
    u.hash = '';
    for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k);
    let s = u.origin.replace(/^https?:\/\/(www\.)?/, '') + u.pathname.replace(/\/+$/, '') + (u.search || '');
    return s.toLowerCase();
  } catch {
    return (raw || '').trim().toLowerCase();
  }
}

export function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

export function isSavable(url) {
  return /^(https?|ftp|file):/i.test(url || '');
}

export function detectType(url) {
  const host = hostOf(url);
  const path = (() => { try { return new URL(url).pathname.toLowerCase(); } catch { return ''; } })();
  if (/(youtube\.com|youtu\.be|vimeo\.com|twitch\.tv|dailymotion\.com|loom\.com|tiktok\.com)$/.test(host)) return 'video';
  if (/\.(png|jpe?g|gif|webp|avif|svg)$/.test(path) || /(dribbble\.com|unsplash\.com|flickr\.com|behance\.net|pinterest\.)/.test(host)) return 'image';
  if (/\.(pdf|docx?|pptx?|xlsx?|epub)$/.test(path)) return 'document';
  if (/(medium\.com|substack\.com|wikipedia\.org|nytimes\.com|theguardian\.com|dev\.to|hashnode\.|blog)/.test(host) || /\/(blog|posts?|articles?|news)\//.test(path)) return 'article';
  return 'link';
}

export function faviconUrl(url, size = 32) {
  if (!hasChrome) return '';
  return chrome.runtime.getURL(`/_favicon/?pageUrl=${encodeURIComponent(url)}&size=${size}`);
}

export function newBookmark(fields) {
  const now = Date.now();
  return {
    id: uid(),
    url: fields.url,
    title: (fields.title || '').trim() || hostOf(fields.url) || fields.url,
    excerpt: (fields.excerpt || '').trim(),
    note: fields.note || '',
    cover: fields.cover || '',
    collectionId: fields.collectionId || null,
    tags: normalizeTags(fields.tags || []),
    favorite: !!fields.favorite,
    type: fields.type || detectType(fields.url),
    createdAt: fields.createdAt || now,
    updatedAt: now,
    trashedAt: null,
    metaFetched: !!fields.metaFetched,
  };
}

export function normalizeTags(tags) {
  const out = [];
  for (let t of tags) {
    t = String(t).trim().replace(/^#+/, '').replace(/\s+/g, '-').toLowerCase();
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

export async function findByUrl(url) {
  const key = normalizeUrl(url);
  const all = await db.getAll('bookmarks');
  return all.find((b) => !b.trashedAt && normalizeUrl(b.url) === key) || null;
}

export async function saveBookmark(b) {
  b.updatedAt = Date.now();
  await db.put('bookmarks', b);
  return b;
}

export async function saveCoverBlob(blob) {
  const id = uid();
  await db.put('media', { id, blob, type: blob.type, createdAt: Date.now() });
  return 'media:' + id;
}

// Hard deletes leave a tombstone (id -> deletedAt) so sync can remove the record on other devices
// instead of bringing it back. Trash is a soft delete and needs none.
export async function addTombstones(ids) {
  if (!ids.length) return;
  const t = await db.getMeta('tombstones', {});
  const now = Date.now();
  for (const id of ids) t[id] = now;
  await db.setMeta('tombstones', t);
}

// Swap a bookmark's cover, deleting the stored image it replaces so nothing is orphaned.
export async function setCover(b, cover) {
  const old = b.cover || '';
  b.cover = cover || '';
  if (old.startsWith('media:') && old !== b.cover) await db.del('media', old.slice(6));
}

// ---------- covers are stored, never hot-linked ----------
// A page's cover image is downloaded once, shrunk, and kept beside the screenshots.
// The library never loads images from other sites when it renders.

const IMAGE_CAP = 8 * 1024 * 1024;

// Downscale any image blob to a light WebP (keeps transparency), max 960px wide.
export async function shrinkImage(blob, maxWidth = 960) {
  const bmp = await createImageBitmap(blob);
  const w = Math.min(maxWidth, bmp.width);
  const h = Math.max(1, Math.round(bmp.height * (w / bmp.width)));
  const canvas = new OffscreenCanvas(w, h);
  canvas.getContext('2d').drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  return canvas.convertToBlob({ type: 'image/webp', quality: 0.8 });
}

// Fetch an image from the extension (works with site access, or when the host allows it).
export async function fetchImage(url, timeoutMs = 12000) {
  if (!/^https?:/i.test(url || '')) return null;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, credentials: 'omit', redirect: 'follow' });
    if (!res.ok || !(res.headers.get('content-type') || '').startsWith('image/')) return null;
    const blob = await res.blob();
    return blob.size && blob.size <= IMAGE_CAP ? blob : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

// Injected into the saved page: fetch the cover from the page's own context (same-origin images
// load even without site access) and hand it back as a data URL. Must be self-contained.
export async function inPageImage(url) {
  try {
    const res = await fetch(url, { credentials: 'omit' });
    if (!res.ok || !(res.headers.get('content-type') || '').startsWith('image/')) return null;
    const blob = await res.blob();
    if (!blob.size || blob.size > 8 * 1024 * 1024) return null;
    return await new Promise((resolve) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => resolve(null); r.readAsDataURL(blob); });
  } catch {
    return null;
  }
}

// Download a page image and shrink it. Returns a Blob, or null when it can't be read.
// tabId lets the popup / context menu fall back to fetching from inside the page.
export async function downloadImage(url, tabId) {
  let blob = await fetchImage(url);
  if (!blob && tabId != null && hasChrome && chrome.scripting) {
    try {
      const [res] = await chrome.scripting.executeScript({ target: { tabId }, func: inPageImage, args: [url] });
      if (res?.result) blob = await (await fetch(res.result)).blob();
    } catch {}
  }
  if (!blob) return null;
  try { return await shrinkImage(blob); } catch { return null; }
}

// Download and store. Returns 'media:<id>' or '' when it can't be stored.
export async function storeImage(url, tabId) {
  const blob = await downloadImage(url, tabId);
  return blob ? saveCoverBlob(blob) : '';
}

// ---------- page metadata ----------

function decodeEntities(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
}

// Regex-based so it also runs inside the service worker (no DOMParser there).
export function parseMeta(html, baseUrl) {
  const head = html.slice(0, 200000);
  const metas = {};
  for (const m of head.matchAll(/<meta\s[^>]*>/gi)) {
    const tag = m[0];
    const key = (tag.match(/(?:property|name|itemprop)\s*=\s*["']([^"']+)["']/i) || [])[1];
    const val = (tag.match(/content\s*=\s*"([^"]*)"/i) || tag.match(/content\s*=\s*'([^']*)'/i) || [])[1];
    if (key && val != null && !(key.toLowerCase() in metas)) metas[key.toLowerCase()] = decodeEntities(val).trim();
  }
  const titleTag = (head.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1];
  let image = metas['og:image'] || metas['og:image:url'] || metas['twitter:image'] || metas['twitter:image:src'] || '';
  if (image) { try { image = new URL(image, baseUrl).href; } catch { image = ''; } }
  return {
    title: metas['og:title'] || metas['twitter:title'] || (titleTag ? decodeEntities(titleTag).replace(/\s+/g, ' ').trim() : ''),
    excerpt: metas['og:description'] || metas['description'] || metas['twitter:description'] || '',
    image,
  };
}

export async function fetchMeta(url, timeoutMs = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, credentials: 'omit', redirect: 'follow' });
    const type = res.headers.get('content-type') || '';
    if (!res.ok) return { error: `HTTP ${res.status}` };
    if (type.startsWith('image/')) return { title: '', excerpt: '', image: res.url };
    if (!type.includes('html')) return { title: '', excerpt: '', image: '' };
    return parseMeta(await res.text(), res.url);
  } catch (e) {
    return { error: e.name === 'AbortError' ? 'Timed out' : 'Unreachable' };
  } finally {
    clearTimeout(t);
  }
}

// ---------- page text (full-text search) ----------

export const TEXT_CAP = 20000;

export function tidyText(s) {
  return String(s || '').replace(/[ \t ]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim().slice(0, TEXT_CAP);
}

export async function saveText(id, text) {
  text = tidyText(text);
  if (!text) return false;
  await db.put('texts', { id, text });
  return true;
}

// ---------- link health ----------

// dead: the page is gone (404/410) or the site can't be reached.
// warn: the site answered but wouldn't confirm (403, 429, 5xx, timeout). Often bot protection or a blip.
// moved: it works, but now redirects to a different site.
export function classify(res, url) {
  if (res.ok) {
    if (res.redirected && hostOf(res.url) && hostOf(res.url) !== hostOf(url)) return { state: 'moved', code: res.status, finalUrl: res.url, note: `Now at ${hostOf(res.url)}` };
    return { state: 'ok', code: res.status };
  }
  if (res.status === 404 || res.status === 410) return { state: 'dead', code: res.status, note: res.status === 404 ? 'Page not found' : 'Page removed' };
  if (res.status === 401 || res.status === 403) return { state: 'warn', code: res.status, note: 'Site refused the check' };
  if (res.status === 429) return { state: 'warn', code: res.status, note: 'Site rate-limited the check' };
  if (res.status >= 500) return { state: 'warn', code: res.status, note: 'Server error' };
  return { state: 'warn', code: res.status, note: `HTTP ${res.status}` };
}

// One request per bookmark: checks health and, when asked, returns the page HTML for text and previews.
export async function probe(url, { wantHtml = false, timeoutMs = 15000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, credentials: 'omit', redirect: 'follow', cache: 'no-store' });
    const health = classify(res, url);
    let html = '';
    const type = res.headers.get('content-type') || '';
    if (wantHtml && res.ok && type.includes('html')) html = (await res.text()).slice(0, 1500000);
    else res.body?.cancel().catch(() => {});
    return { health, html, finalUrl: res.url, type };
  } catch (e) {
    const timedOut = e.name === 'AbortError';
    return { health: timedOut ? { state: 'warn', code: 0, note: 'Timed out' } : { state: 'dead', code: 0, note: 'Site unreachable' }, html: '', network: !timedOut };
  } finally {
    clearTimeout(t);
  }
}

export async function hasHostAccess() {
  if (!hasChrome || !chrome.permissions) return false;
  return chrome.permissions.contains({ origins: ['<all_urls>'] });
}

// Injected into the page being saved (chrome.scripting.executeScript). Must be self-contained.
export function pageMetaExtractor() {
  const pick = (...sels) => {
    for (const s of sels) {
      const el = document.querySelector(s);
      const v = el && (el.getAttribute('content') || el.getAttribute('href'));
      if (v) return v.trim();
    }
    return '';
  };
  let image = pick('meta[property="og:image"]', 'meta[property="og:image:url"]', 'meta[name="twitter:image"]', 'meta[name="twitter:image:src"]', 'link[rel="image_src"]');
  try { if (image) image = new URL(image, location.href).href; } catch { image = ''; }
  const sel = String(window.getSelection ? window.getSelection() : '').trim().slice(0, 600);
  const root = document.querySelector('article, main, [role="main"]') || document.body;
  const text = root ? root.innerText.slice(0, 40000) : '';
  return {
    text,
    title: pick('meta[property="og:title"]', 'meta[name="twitter:title"]') || document.title,
    excerpt: pick('meta[property="og:description"]', 'meta[name="description"]', 'meta[name="twitter:description"]'),
    image,
    selection: sel,
  };
}

// Screenshot of the visible tab, downscaled to a light JPEG blob.
export async function captureTab(windowId, maxWidth = 800) {
  // Captured lossless, then stored once as WebP: about a third smaller than the JPEG this used to keep.
  const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
  const src = await (await fetch(dataUrl)).blob();
  const bmp = await createImageBitmap(src);
  const w = Math.min(maxWidth, bmp.width);
  const h = Math.round(bmp.height * (w / bmp.width));
  const canvas = new OffscreenCanvas(w, h);
  canvas.getContext('2d').drawImage(bmp, 0, 0, w, h);
  return canvas.convertToBlob({ type: 'image/webp', quality: 0.78 });
}

export async function readPageMeta(tabId) {
  try {
    const [res] = await chrome.scripting.executeScript({ target: { tabId }, func: pageMetaExtractor });
    return res?.result || {};
  } catch {
    return {};
  }
}
