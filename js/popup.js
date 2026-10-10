// Quick-save popup: the page is saved the moment the popup opens; everything here refines it.
import * as db from './db.js';
import * as M from './model.js';
import { icon } from './icons.js';
import { esc, $, $$, debounce, toast, openMenu, menuItem, armConfirm, relTime } from './ui.js';
import { lineBulletHTML } from './bullets.js';

let bm = null;          // the bookmark being saved/edited
let existed = false;    // true when the page was already in the library
let collections = [];
let shot = null;        // screenshot blob (kept in memory until chosen)
let pageImage = '';     // the page's own cover image URL
let pageBlob = null;    // that image, downloaded and shrunk (stored only if chosen)
let coverMode = 'none'; // 'page' | 'shot' | 'none'

const ring = (size, color) => `<span class="bullet ring" style="--bs:${size}px;--c:${color}"></span>`;
function bullet(c, size) {
  if (!c) return ring(size, 'var(--band-ink-2)');
  return lineBulletHTML(c, size);
}
const lineOf = () => collections.find((c) => c.id === bm.collectionId) || null;

const persist = debounce(async () => { if (bm) await M.saveBookmark(bm); }, 250);

async function main() {
  collections = await db.getAll('collections');
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !M.isSavable(tab.url)) return renderUnsavable();

  const found = await M.findByUrl(tab.url);
  if (found) {
    bm = found;
    existed = true;
    coverMode = bm.cover ? (bm.coverSource === 'page' || !bm.cover.startsWith('media:') ? 'page' : 'shot') : 'none';
    pageImage = bm.cover && !bm.cover.startsWith('media:') ? bm.cover : '';
  } else {
    bm = M.newBookmark({ url: tab.url, title: tab.title });
    await M.saveBookmark(bm);
  }
  render();

  // Read the page and grab a screenshot in parallel; both are optional.
  const [meta, blob] = await Promise.all([
    M.readPageMeta(tab.id),
    M.captureTab(tab.windowId).catch(() => null),
  ]);
  shot = blob;
  // The page image is downloaded now and kept locally; the library never loads it from the web.
  if (!pageImage && meta.image) pageImage = meta.image;
  if (pageImage) pageBlob = await M.downloadImage(pageImage, tab.id);
  if (meta.text && await M.saveText(bm.id, meta.text)) {
    bm.textAt = Date.now();
    bm.health = { state: 'ok', code: 200, checkedAt: Date.now() };
  }
  if (!existed) {
    if (meta.title && meta.title.length > 2) bm.title = meta.title.trim();
    if (meta.excerpt) bm.excerpt = meta.excerpt.trim().slice(0, 600);
    if (meta.selection) bm.note = '“' + meta.selection + '”';
    bm.metaFetched = true;
    await chooseCover(pageBlob ? 'page' : shot ? 'shot' : 'none');
    render();
  } else {
    // An older bookmark still pointing at a remote image gets it stored now.
    if (bm.cover && !bm.cover.startsWith('media:')) await chooseCover(pageBlob ? 'page' : 'none');
    else await M.saveBookmark(bm);
    renderCover();
  }
}

async function chooseCover(mode) {
  if (mode === coverMode && bm.cover.startsWith('media:')) return;
  if (mode === 'shot' && shot) await M.setCover(bm, await M.saveCoverBlob(shot));
  else if (mode === 'page' && pageBlob) await M.setCover(bm, await M.saveCoverBlob(pageBlob));
  else { mode = 'none'; await M.setCover(bm, ''); }
  bm.coverSource = mode === 'none' ? '' : mode;
  coverMode = mode;
  await M.saveBookmark(bm);
}

function renderBand() {
  const c = lineOf();
  const band = $('#band');
  band.style.setProperty('--c', c ? c.color : 'var(--band-ink-2)');
  band.innerHTML = `
    ${bullet(c, 34)}
    <div class="pop-status">
      <span class="pop-note">${existed ? `Already saved · ${esc(relTime(bm.createdAt))}` : `${icon('check', 14)} Saved to`}</span>
      <button class="pop-line" id="line-btn" title="Change line"><span>${esc(c ? c.name : 'Unsorted')}</span>${icon('chevronDown', 16)}</button>
    </div>
    <button class="icon-btn${bm.favorite ? ' on' : ''}" id="fav-btn" title="${bm.favorite ? 'Unfavorite' : 'Favorite'}" aria-pressed="${bm.favorite}">${icon(bm.favorite ? 'starFilled' : 'star', 19)}</button>
    <button class="icon-btn" id="open-btn" title="Open Linemark (Alt+Shift+L)">${icon('external', 18)}</button>`;
  $('#line-btn').addEventListener('click', (e) => pickLine(e.currentTarget));
  $('#fav-btn').addEventListener('click', () => { bm.favorite = !bm.favorite; persist(); renderBand(); });
  $('#open-btn').addEventListener('click', () => openLibrary(bm.id));
}

function render() {
  renderBand();
  const host = M.hostOf(bm.url);
  const fav = M.faviconUrl(bm.url, 32);
  $('#body').innerHTML = `
    <div class="pop-main">
      <div class="pop-cover"><div class="pop-thumb" id="thumb"></div><div class="cover-switch" id="cover-switch"></div></div>
      <div>
        <textarea class="textarea pop-title" id="title" rows="3" aria-label="Title">${esc(bm.title)}</textarea>
        <div class="pop-host">${fav ? `<img src="${esc(fav)}" alt="">` : ''}<span>${esc(host)}</span></div>
      </div>
    </div>
    <div class="tags-input" id="tags">${chips()}<input id="tag-input" placeholder="${bm.tags.length ? '' : 'Add tags…'}" aria-label="Tags" autocomplete="off"></div>
    <textarea class="textarea" id="note" rows="2" placeholder="Note to self" aria-label="Note">${esc(bm.note)}</textarea>
    <div class="pop-foot">
      <button class="btn ghost danger sm" id="remove">${icon('trash', 15)} ${existed ? 'Move to Trash' : 'Remove'}</button>
      <span class="spacer"></span>
      <button class="btn primary" id="done">Done</button>
    </div>`;
  renderCover();
  const title = $('#title');
  title.addEventListener('input', () => { bm.title = title.value.trim() || host; persist(); });
  $('#note').addEventListener('input', (e) => { bm.note = e.target.value; persist(); });
  $('#done').addEventListener('click', async () => { await persist.flush(); window.close(); });
  $('#remove').addEventListener('click', async (e) => {
    if (!armConfirm(e.currentTarget, existed ? 'Confirm' : 'Remove it')) return;
    if (existed) { bm.trashedAt = Date.now(); await M.saveBookmark(bm); }
    else {
      if (bm.cover.startsWith('media:')) await db.del('media', bm.cover.slice(6));
      await db.del('texts', bm.id);
      await db.del('bookmarks', bm.id);
      await M.addTombstones([bm.id]);
    }
    bm = null;
    window.close();
  });
  wireTags();
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); $('#done').click(); }
  });
}

function renderCover() {
  const thumb = $('#thumb');
  if (!thumb) return;
  const pending = !existed && shot === null && coverMode === 'none' && !bm.metaFetched;
  if (pending) thumb.innerHTML = '<div class="shimmer"></div>';
  else if (bm.cover.startsWith('media:')) {
    // Always preview from local data, never from the remote site.
    const show = (blob) => { if (blob) thumb.innerHTML = `<img src="${URL.createObjectURL(blob)}" alt="">`; };
    db.get('media', bm.cover.slice(6)).then((m) => show(m?.blob || (coverMode === 'page' ? pageBlob : shot)));
  } else thumb.innerHTML = `<div class="thumb-empty">${icon('image', 22)}</div>`;

  $('#cover-switch').innerHTML = `
    <button data-mode="page" aria-pressed="${coverMode === 'page'}" ${pageBlob || coverMode === 'page' ? '' : 'disabled'} title="${pageImage && !pageBlob ? 'This page’s image couldn’t be downloaded' : 'The page’s own cover image, stored on this computer'}">Page</button>
    <button data-mode="shot" aria-pressed="${coverMode === 'shot'}" ${shot || coverMode === 'shot' ? '' : 'disabled'} title="Screenshot of what you see">Screen</button>
    <button data-mode="none" aria-pressed="${coverMode === 'none'}" title="No cover">None</button>`;
  $$('#cover-switch button').forEach((b) => b.addEventListener('click', async () => {
    await chooseCover(b.dataset.mode);
    renderCover();
  }));
}

const chips = () => bm.tags.map((t) => `<span class="chip">#${esc(t)}<button data-t="${esc(t)}" aria-label="Remove ${esc(t)}">${icon('x', 12)}</button></span>`).join('');

function wireTags() {
  const box = $('#tags');
  const input = $('#tag-input');
  const allTags = new Set();
  db.getAll('bookmarks').then((all) => all.forEach((b) => b.tags.forEach((t) => allTags.add(t))));
  const redraw = () => {
    $$('.chip', box).forEach((c) => c.remove());
    input.insertAdjacentHTML('beforebegin', chips());
    input.placeholder = bm.tags.length ? '' : 'Add tags…';
  };
  const commit = (raw) => {
    const add = M.normalizeTags(raw.split(','));
    if (!add.length) return;
    bm.tags = M.normalizeTags([...bm.tags, ...add]);
    persist();
    redraw();
  };
  const suggest = () => {
    const q = input.value.trim().replace(/^#/, '').toLowerCase();
    const list = q ? [...allTags].filter((t) => t.includes(q) && !bm.tags.includes(t)).slice(0, 5) : [];
    if (!list.length) { document.querySelector('.menu')?.remove(); return; }
    openMenu(box, (m, close) => {
      m.innerHTML = list.map((t) => menuItem({ label: '#' + t, attrs: `data-tag="${esc(t)}"` })).join('');
      m.addEventListener('mousedown', (e) => e.preventDefault());
      m.addEventListener('click', (e) => { const t = e.target.closest('[data-tag]')?.dataset.tag; if (t) { input.value = ''; close(); commit(t); input.focus(); } });
    });
    input.focus();
  };
  box.addEventListener('click', (e) => {
    const rm = e.target.closest('[data-t]');
    if (rm) { bm.tags = bm.tags.filter((t) => t !== rm.dataset.t); persist(); redraw(); return; }
    input.focus();
  });
  input.addEventListener('input', () => {
    if (input.value.includes(',')) { const v = input.value; input.value = ''; commit(v); }
    suggest();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && input.value.trim()) { e.preventDefault(); e.stopPropagation(); const v = input.value; input.value = ''; commit(v); document.querySelector('.menu')?.remove(); }
    if (e.key === 'Backspace' && !input.value && bm.tags.length) { bm.tags.pop(); persist(); redraw(); }
  });
  input.addEventListener('blur', () => { if (input.value.trim()) { const v = input.value; input.value = ''; commit(v); } });
}

function pickLine(anchor) {
  const flat = [];
  const kids = (pid) => collections.filter((c) => (c.parentId || null) === pid).sort((a, b) => a.order - b.order);
  const ids = new Set(collections.map((c) => c.id));
  const walk = (list, d) => { for (const c of list) { flat.push([c, d]); walk(kids(c.id), d + 1); } };
  walk(collections.filter((c) => !c.parentId || !ids.has(c.parentId)).sort((a, b) => a.order - b.order), 0);
  openMenu(anchor, (m, close) => {
    const draw = (q = '') => {
      const ql = q.toLowerCase();
      const items = flat.filter(([c]) => !ql || c.name.toLowerCase().includes(ql));
      $('.list', m).innerHTML =
        (!ql ? menuItem({ label: 'Unsorted', lead: ring(18, 'var(--ink-3)'), checked: !bm.collectionId, attrs: 'data-pick=""' }) : '') +
        items.map(([c, d]) => menuItem({ label: c.name, lead: `<span style="width:${d * 14}px;flex:none"></span>${bullet(c, 18)}`, checked: c.id === bm.collectionId, attrs: `data-pick="${c.id}"` })).join('') +
        (q ? menuItem({ label: `Create line “${q}”`, iconName: 'plus', attrs: `data-create="${esc(q)}"` }) : '');
    };
    m.innerHTML = `<input class="input menu-search" placeholder="Find or create a line" aria-label="Find a line"><div class="list"></div>`;
    draw();
    const input = $('input', m);
    input.addEventListener('input', () => draw(input.value.trim()));
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('.list .menu-item', m)?.click(); } });
    m.addEventListener('click', async (e) => {
      const it = e.target.closest('.menu-item');
      if (!it) return;
      if (it.dataset.create) {
        const color = M.pickLineColor(collections.map((c) => c.color));
        const c = { id: M.uid(), name: it.dataset.create, code: M.codeFor(it.dataset.create), color, parentId: null, order: collections.filter((x) => !x.parentId).length, expanded: false, createdAt: Date.now(), updatedAt: Date.now() };
        await db.put('collections', c);
        collections.push(c);
        bm.collectionId = c.id;
      } else {
        bm.collectionId = it.dataset.pick || null;
      }
      close();
      bm.trashedAt = null;
      persist();
      renderBand();
      toast(`Moved to ${lineOf()?.name || 'Unsorted'}`);
    });
  }, { width: 300 });
}

function renderUnsavable() {
  $('#band').innerHTML = `${ring(34, 'var(--band-ink-2)')}<div class="pop-status"></div><button class="icon-btn" id="open-btn" title="Open Linemark (Alt+Shift+L)">${icon('external', 18)}</button>`;
  $('#open-btn').addEventListener('click', () => openLibrary());
  $('#body').innerHTML = `<div class="pop-empty">
    <h2>This page can’t be bookmarked</h2>
    <p>Browser pages such as the new-tab page, settings and the Web Store can’t be saved. Open a website and try again.</p>
    <div><button class="btn primary" id="open">${icon('external', 16)} Open Linemark</button></div>
  </div>`;
  $('#open').addEventListener('click', () => openLibrary());
}

async function openLibrary(editId) {
  await persist.flush();
  await chrome.runtime.sendMessage({ type: 'open-linemark', edit: editId || null });
  window.close();
}

window.addEventListener('pagehide', () => persist.flush());
main().catch((e) => {
  console.error(e);
  $('#body').innerHTML = `<div class="pop-empty"><h2>Couldn’t save this page</h2><p>${esc(e.message || String(e))}</p></div>`;
});
