// Import / export: Chrome bookmark tree, Netscape bookmark HTML, Linemark JSON backups.
import * as db from './db.js';
import * as M from './model.js';

// Shape returned by importers: { collections: [...], bookmarks: [...] } (fresh ids, ready to write).
// `known` is a Set of normalized URLs to skip as duplicates.

function lineFrom(name, parentId, order) {
  return {
    id: M.uid(),
    name: (name || 'Untitled').trim() || 'Untitled',
    code: M.codeFor(name),
    color: M.colorFor(name + order),
    parentId,
    order,
    expanded: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export async function importChrome(known, { skipDupes = true } = {}) {
  const [root] = await chrome.bookmarks.getTree();
  const out = { collections: [], bookmarks: [], skipped: 0 };
  const walk = (node, parentId) => {
    let order = 0;
    for (const child of node.children || []) {
      if (child.url) {
        if (!M.isSavable(child.url)) continue;
        const key = M.normalizeUrl(child.url);
        if (skipDupes && known.has(key)) { out.skipped++; continue; }
        known.add(key);
        out.bookmarks.push(M.newBookmark({ url: child.url, title: child.title, collectionId: parentId, createdAt: child.dateAdded }));
      } else {
        const hasAny = countLinks(child) > 0;
        if (!hasAny) continue;
        const line = lineFrom(child.title, parentId, order++);
        out.collections.push(line);
        walk(child, line.id);
      }
    }
  };
  // Root folders (Bookmarks bar, Other, Mobile) become top-level lines.
  let order = 1000;
  for (const top of root.children || []) {
    if (!countLinks(top)) continue;
    const line = lineFrom(top.title, null, order++);
    out.collections.push(line);
    walk(top, line.id);
  }
  return out;
}

function countLinks(node) {
  if (node.url) return 1;
  return (node.children || []).reduce((n, c) => n + countLinks(c), 0);
}

export function parseNetscape(html, known, { skipDupes = true } = {}) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const out = { collections: [], bookmarks: [], skipped: 0 };
  const rootDl = doc.querySelector('dl');
  if (!rootDl) return out;

  const walk = (dl, parentId) => {
    let order = 0;
    for (const dt of [...dl.children].filter((n) => n.tagName === 'DT')) {
      const h3 = dt.querySelector(':scope > h3');
      const a = dt.querySelector(':scope > a');
      if (h3) {
        const sub = dt.querySelector(':scope > dl') || (dt.nextElementSibling?.tagName === 'DL' ? dt.nextElementSibling : null);
        const line = lineFrom(h3.textContent, parentId, order++);
        out.collections.push(line);
        if (sub) walk(sub, line.id);
      } else if (a) {
        const url = a.getAttribute('href');
        if (!M.isSavable(url)) continue;
        const key = M.normalizeUrl(url);
        if (skipDupes && known.has(key)) { out.skipped++; continue; }
        known.add(key);
        const add = parseInt(a.getAttribute('add_date') || '0', 10);
        const tags = (a.getAttribute('tags') || '').split(',').filter(Boolean);
        let excerpt = '';
        const dd = dt.querySelector(':scope > dd') || (dt.nextElementSibling?.tagName === 'DD' ? dt.nextElementSibling : null);
        if (dd) excerpt = dd.textContent.trim();
        let cover = a.getAttribute('data-cover') || '';
        if (!/^https?:/i.test(cover)) cover = '';
        out.bookmarks.push(M.newBookmark({
          url,
          title: a.textContent,
          excerpt,
          tags,
          cover,
          collectionId: parentId,
          createdAt: add ? (add > 1e11 ? add : add * 1000) : Date.now(),
        }));
      }
    }
  };
  walk(rootDl, null);
  // Drop empty lines created from empty folders.
  const used = new Set(out.bookmarks.map((b) => b.collectionId));
  let changed = true;
  while (changed) {
    changed = false;
    for (const c of out.collections) if (c.parentId && used.has(c.id) && !used.has(c.parentId)) { used.add(c.parentId); changed = true; }
  }
  out.collections = out.collections.filter((c) => used.has(c.id));
  return out;
}

export async function commitImport(result, existingTopCount) {
  // Keep imported top-level lines after the existing ones.
  const tops = result.collections.filter((c) => !c.parentId);
  tops.forEach((c, i) => { c.order = existingTopCount + i; });
  const used = (await db.getAll('collections')).map((c) => c.color);
  for (const c of result.collections) {
    c.color = M.pickLineColor(used);
    used.push(c.color);
  }
  await db.batch(async () => {
    await db.putMany('collections', result.collections);
    await db.putMany('bookmarks', result.bookmarks);
  });
}

// ---------- export ----------
const escAttr = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function toNetscape({ bookmarks, collections }) {
  const live = bookmarks.filter((b) => !b.trashedAt);
  const kids = (pid) => collections.filter((c) => (c.parentId || null) === pid).sort((a, b) => a.order - b.order);
  const ids = new Set(collections.map((c) => c.id));
  const linkLine = (b, pad) => {
    const tags = b.tags.length ? ` TAGS="${escAttr(b.tags.join(','))}"` : '';
    const cover = /^https?:/i.test(b.cover) ? ` DATA-COVER="${escAttr(b.cover)}"` : '';
    let s = `${pad}<DT><A HREF="${escAttr(b.url)}" ADD_DATE="${Math.floor(b.createdAt / 1000)}" LAST_MODIFIED="${Math.floor(b.updatedAt / 1000)}"${tags}${cover}>${escAttr(b.title)}</A>\n`;
    const desc = [b.excerpt, b.note].filter(Boolean).join('\n\n');
    if (desc) s += `${pad}<DD>${escAttr(desc)}\n`;
    return s;
  };
  const folder = (c, depth) => {
    const pad = '    '.repeat(depth);
    let s = `${pad}<DT><H3 ADD_DATE="${Math.floor((c.createdAt || Date.now()) / 1000)}">${escAttr(c.name)}</H3>\n${pad}<DL><p>\n`;
    for (const k of kids(c.id)) s += folder(k, depth + 1);
    for (const b of live.filter((b) => b.collectionId === c.id)) s += linkLine(b, pad + '    ');
    return s + `${pad}</DL><p>\n`;
  };
  let body = '';
  for (const c of kids(null)) body += folder(c, 1);
  const unsorted = live.filter((b) => !b.collectionId || !ids.has(b.collectionId));
  if (unsorted.length) {
    body += `    <DT><H3>Unsorted</H3>\n    <DL><p>\n`;
    for (const b of unsorted) body += linkLine(b, '        ');
    body += `    </DL><p>\n`;
  }
  return `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file.
     It will be read and overwritten.
     DO NOT EDIT! -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
${body}</DL><p>
`;
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export async function toBackup({ includeMedia = true } = {}) {
  const [bookmarks, collections] = await Promise.all([db.getAll('bookmarks'), db.getAll('collections')]);
  const backup = { app: 'ember', version: 2, exportedAt: new Date().toISOString(), collections, bookmarks, media: [], texts: await db.getAll('texts') };
  if (includeMedia) {
    const used = new Set(bookmarks.map((b) => b.cover).filter((c) => c?.startsWith('media:')).map((c) => c.slice(6)));
    for (const m of await db.getAll('media')) {
      if (used.has(m.id)) backup.media.push({ id: m.id, data: await blobToDataUrl(m.blob) });
    }
  }
  return new Blob([JSON.stringify(backup)], { type: 'application/json' });
}

// A backup is untrusted input: keep only well-formed records, coerce every field, drop the rest.
const str = (v, max = 100000) => (typeof v === 'string' ? v.slice(0, max) : '');
const num = (v, fallback) => (Number.isFinite(v) ? v : fallback);
const isId = (v) => typeof v === 'string' && /^[\w-]{1,64}$/.test(v);
const isHex = (v) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
const HEALTH = new Set(['ok', 'dead', 'warn', 'moved']);

function cleanCollection(c, i) {
  if (!c || !isId(c.id) || !str(c.name).trim()) return null;
  const name = str(c.name, 200).trim();
  return {
    id: c.id,
    name,
    code: str(c.code, 2).trim().toUpperCase() || M.codeFor(name),
    color: isHex(c.color) ? c.color : M.colorFor(name + i),
    parentId: isId(c.parentId) ? c.parentId : null,
    order: num(c.order, i),
    expanded: !!c.expanded,
    createdAt: num(c.createdAt, Date.now()),
    ...(c.autoCode === false ? { autoCode: false } : {}),
  };
}

function cleanBookmark(b, mediaIds) {
  if (!b || !isId(b.id) || !M.isSavable(b.url)) return null;
  const cover = str(b.cover, 4000);
  const h = b.health && HEALTH.has(b.health.state) ? { state: b.health.state, code: num(b.health.code, 0), note: str(b.health.note, 200), checkedAt: num(b.health.checkedAt, Date.now()), ...(M.isSavable(b.health.finalUrl) ? { finalUrl: b.health.finalUrl } : {}) } : undefined;
  return {
    id: b.id,
    url: str(b.url, 4000),
    title: str(b.title, 500).trim() || M.hostOf(b.url) || b.url,
    excerpt: str(b.excerpt, 2000),
    note: str(b.note, 20000),
    // stored covers must exist in this backup; remote ones are kept (shown as a placeholder until stored)
    cover: cover.startsWith('media:') ? (mediaIds.has(cover.slice(6)) ? cover : '') : /^https?:/i.test(cover) ? cover : '',
    coverSource: ['page', 'shot'].includes(b.coverSource) ? b.coverSource : '',
    collectionId: isId(b.collectionId) ? b.collectionId : null,
    tags: M.normalizeTags(Array.isArray(b.tags) ? b.tags.filter((t) => typeof t === 'string').slice(0, 50) : []),
    favorite: !!b.favorite,
    type: ['article', 'video', 'image', 'document', 'link'].includes(b.type) ? b.type : M.detectType(b.url),
    createdAt: num(b.createdAt, Date.now()),
    updatedAt: num(b.updatedAt, Date.now()),
    trashedAt: Number.isFinite(b.trashedAt) ? b.trashedAt : null,
    metaFetched: !!b.metaFetched,
    ...(Number.isFinite(b.textAt) ? { textAt: b.textAt } : {}),
    ...(h ? { health: h } : {}),
  };
}

export async function restoreBackup(text) {
  const data = JSON.parse(text);
  // 'ember' is the backup format id from before the rename to Linemark; both are accepted.
  if (!data || !['ember', 'linemark'].includes(data.app) || !Array.isArray(data.bookmarks)) throw new Error('This file is not a Linemark backup.');
  const media = [];
  for (const m of Array.isArray(data.media) ? data.media : []) {
    if (!isId(m?.id) || typeof m.data !== 'string' || !/^data:image\//.test(m.data)) continue;
    try {
      const blob = await (await fetch(m.data)).blob();
      media.push({ id: m.id, blob, type: blob.type, createdAt: Date.now() });
    } catch {}
  }
  const mediaIds = new Set(media.map((m) => m.id));
  // media already on this computer also counts as present
  for (const k of await db.keys('media')) mediaIds.add(k);
  const collections = (Array.isArray(data.collections) ? data.collections : []).map(cleanCollection).filter(Boolean);
  const bookmarks = data.bookmarks.map((b) => cleanBookmark(b, mediaIds)).filter(Boolean);
  const ids = new Set(bookmarks.map((b) => b.id));
  const texts = (Array.isArray(data.texts) ? data.texts : []).filter((t) => ids.has(t?.id) && typeof t.text === 'string').map((t) => ({ id: t.id, text: M.tidyText(t.text) }));
  await db.batch(async () => {
    await db.putMany('collections', collections);
    await db.putMany('bookmarks', bookmarks);
    await db.putMany('media', media);
    await db.putMany('texts', texts);
  });
  return { bookmarks: bookmarks.length, collections: collections.length, skipped: data.bookmarks.length - bookmarks.length };
}
