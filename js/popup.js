// Quick-save popup: the page is saved the moment the popup opens; everything here refines it.
import * as db from './db.js';
import * as M from './model.js';
import { icon } from './icons.js';
import { esc, $, $$, debounce, toast, openMenu, closeMenu, menuItem, armConfirm, relTime } from './ui.js';
import { lineBulletHTML, loadIcons, usesIcons } from './bullets.js';
import { chime } from './chime.js';

let bm = null;          // the bookmark being saved/edited
let existed = false;    // true when the page was already in the library
let collections = [];
let shot = null;        // screenshot blob (kept in memory until chosen)
let pageImage = '';     // the page's own cover image URL
let pageBlob = null;    // that image, downloaded and shrunk (stored only if chosen)
let coverMode = 'none'; // 'page' | 'shot' | 'none'
let selection = '';     // text selected on the page when the popup opened

const ring = (size, color) => `<span class="bullet ring" style="--bs:${size}px;--c:${color}"></span>`;
function bullet(c, size) {
  if (!c) return ring(size, 'var(--band-ink-2)');
  return lineBulletHTML(c, size);
}
const lineOf = () => collections.find((c) => c.id === bm.collectionId) || null;
// Every line the link stops on, main line first, then the lines it also shows on (bm.alsoOn).
const linesOn = () => [bm.collectionId, ...(bm.alsoOn || [])].filter((id) => id && collections.some((c) => c.id === id));
const MAX_LINES = 9; // a main line and up to eight more, as the library allows

const persist = debounce(async () => { if (bm) await M.saveBookmark(bm); }, 250);

async function main() {
  collections = await db.getAll('collections');
  M.setPalette((await db.getMeta('ui', {}))?.palette);
  if (usesIcons(collections)) await loadIcons();
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
  if (!existed && (await db.getMeta('ui', {}))?.chime) chime(); // the station chime, if it's switched on

  // Read the page and grab a screenshot in parallel; both are optional.
  const [meta, blob] = await Promise.all([
    M.readPageMeta(tab.id),
    M.captureTab(tab.windowId).catch(() => null),
  ]);
  shot = blob;
  selection = (meta.selection || '').replace(/\s+/g, ' ').trim();
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
    // text selected on the page is kept as a highlight of it
    if (selection) M.addHighlight(bm, selection);
    bm.metaFetched = true;
    await chooseCover(pageBlob ? 'page' : shot ? 'shot' : 'none');
    render();
  } else {
    // An older bookmark still pointing at a remote image gets it stored now.
    if (bm.cover && !bm.cover.startsWith('media:')) await chooseCover(pageBlob ? 'page' : 'none');
    else await M.saveBookmark(bm);
    renderCover();
    renderHighlight();
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
  const parents = c ? M.linePathOf(collections, c.id).slice(0, -1) : []; // a branch names the line it's on
  const extra = linesOn().slice(1).map((id) => collections.find((x) => x.id === id));
  const band = $('#band');
  band.style.setProperty('--c', c ? c.color : 'var(--band-ink-2)');
  // the first time a new save is shown, a train runs along the line stripe and stops at the bullet
  if (!existed && !band.dataset.arrived) { band.dataset.arrived = '1'; band.classList.add('arrive'); }
  band.innerHTML = `
    ${bullet(c, 34)}
    <div class="pop-status">
      <span class="pop-note">${existed ? `Already saved · ${esc(relTime(bm.createdAt))}` : `${icon('check', 14)} Saved to`}${parents.length ? `${existed ? ' · ' : ' '}<span class="pop-path">${esc(parents.join(' › '))} ›</span>` : ''}</span>
      <button class="pop-line" id="line-btn" title="${extra.length ? esc(`Also on ${extra.map((x) => x.name).join(', ')}`) : 'Change line'}"><span>${esc(c ? c.name : 'Unsorted')}</span>${extra.length ? `<span class="pop-more">+${extra.length}</span>` : ''}${icon('chevronDown', 16)}</button>
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
    <div class="pop-hl" id="pop-hl" hidden></div>
    <div class="tags-input" id="tags">${chips()}<input id="tag-input" placeholder="${bm.tags.length ? '' : 'Add tags…'}" aria-label="Tags" autocomplete="off"></div>
    <textarea class="textarea" id="note" rows="2" placeholder="Note to self" aria-label="Note">${esc(bm.note)}</textarea>
    <div class="pop-foot">
      <button class="btn ghost danger sm" id="remove">${icon('trash', 15)} ${existed ? 'Move to Trash' : 'Remove'}</button>
      <span class="spacer"></span>
      <button class="btn primary" id="done">Done</button>
    </div>`;
  renderCover();
  renderHighlight();
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

// Highlights: the passage selected on the page, saved (a new save keeps it at once) or offered to save, and how
// many this page has.
function renderHighlight() {
  const box = $('#pop-hl');
  if (!box) return;
  const hs = bm.highlights || [];
  const kept = selection && hs.find((h) => h.text === selection.slice(0, 4000));
  const count = hs.length === 1 ? '1 highlight on this page' : `${hs.length} highlights on this page`;
  if (!selection && !hs.length) { box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = selection
    ? `<p class="pop-hl-label">${icon('highlighter', 14)} ${kept ? 'Saved as a highlight' : 'Selected on this page'}</p>
       <blockquote dir="auto">${esc(selection)}</blockquote>
       ${kept
         ? `<div class="pop-hl-foot"><span class="pop-hl-n">${count}</span><button type="button" class="btn ghost sm" id="hl-remove">Remove highlight</button></div>`
         : `<button type="button" class="btn sm" id="hl-save">${icon('highlighter', 15)} Save as a highlight</button>`}`
    : `<p class="pop-hl-label">${icon('highlighter', 14)} ${count}</p>`;
  $('#hl-save')?.addEventListener('click', async () => {
    M.addHighlight(bm, selection);
    await M.saveBookmark(bm);
    renderHighlight();
    $('#hl-remove')?.focus();
  });
  $('#hl-remove')?.addEventListener('click', async () => {
    M.removeHighlight(bm, kept.id);
    await M.saveBookmark(bm);
    renderHighlight();
    $('#hl-save')?.focus();
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

  // an unavailable choice says why, in its tooltip and to screen readers
  const hasPage = pageBlob || coverMode === 'page', hasShot = shot || coverMode === 'shot';
  const pageWhy = hasPage ? 'The page’s own cover image, stored on this computer' : pending ? 'Still reading the page…' : pageImage ? 'This page’s image couldn’t be downloaded' : 'This page has no cover image';
  const shotWhy = hasShot ? 'Screenshot of what you see' : pending ? 'Still taking the screenshot…' : `${M.BROWSER} didn’t allow a screenshot of this page`;
  $('#cover-switch').innerHTML = `
    <button data-mode="page" aria-pressed="${coverMode === 'page'}" ${hasPage ? '' : 'disabled'} title="${pageWhy}">Page</button>
    <button data-mode="shot" aria-pressed="${coverMode === 'shot'}" ${hasShot ? '' : 'disabled'} title="${shotWhy}">Screen</button>
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
    if (!list.length) { closeMenu(); return; }
    openMenu(box, (m, close) => {
      m.innerHTML = list.map((t) => menuItem({ label: '#' + t, attrs: `data-tag="${esc(t)}"` })).join('');
      m.addEventListener('mousedown', (e) => e.preventDefault());
      m.addEventListener('click', (e) => { const t = e.target.closest('[data-tag]')?.dataset.tag; if (t) { input.value = ''; close(); commit(t); input.focus(); } });
    }, { focus: false });
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
    if (e.key === 'Enter' && input.value.trim()) { e.preventDefault(); e.stopPropagation(); const v = input.value; input.value = ''; commit(v); closeMenu(); }
    if (e.key === 'Backspace' && !input.value && bm.tags.length) { bm.tags.pop(); persist(); redraw(); }
  });
  // Leaving the field commits what was typed, unless focus moved into the suggestion list.
  input.addEventListener('blur', (e) => {
    if (e.relatedTarget?.closest?.('.menu')) return;
    if (input.value.trim()) { const v = input.value; input.value = ''; closeMenu(); commit(v); }
  });
}

// The line picker is a checklist: tick every line the link belongs on. The first ticked is its main line (the one the
// band names); the rest are lines it also stops on, as an interchange. Unsorted clears them all. "Line/Branch" makes a
// branch and ticks it. The list stays open until Done, Escape or a click outside.
function pickLine(anchor) {
  const flat = [];
  const kids = (pid) => collections.filter((c) => (c.parentId || null) === pid).sort((a, b) => a.order - b.order);
  const ids = new Set(collections.map((c) => c.id));
  const walk = (list, d) => { for (const c of list) { if (c.smart) continue; flat.push([c, d]); walk(kids(c.id), d + 1); } }; // smart lines are searches, not places to file
  walk(collections.filter((c) => !c.parentId || !ids.has(c.parentId)).sort((a, b) => a.order - b.order), 0);
  const setLines = (list) => {
    bm.collectionId = list[0] || null;
    bm.alsoOn = list.slice(1, MAX_LINES);
    if (!bm.alsoOn.length) delete bm.alsoOn;
    bm.trashedAt = null;
    persist();
    renderBand();
  };
  openMenu(anchor, (m, close) => {
    const row = (id, label, lead, on, main) =>
      `<button type="button" class="menu-item pick${on ? ' on' : ''}" role="menuitemcheckbox" aria-checked="${on}" data-pick="${id}">${lead}<span class="pick-name">${esc(label)}</span>${main ? '<span class="pick-main">Main</span>' : ''}<span class="pick-box" aria-hidden="true">${on ? icon('check', 13) : ''}</span></button>`;
    const draw = (q = '') => {
      // "Cooking/Baking" finds or creates a line and a branch inside it
      const ql = M.splitLinePath(q).join('/').toLowerCase();
      const path = (c) => M.linePathOf(collections, c.id);
      const items = flat.filter(([c]) => !ql || path(c).join('/').toLowerCase().includes(ql));
      const create = M.createLineLabel(collections, q);
      const on = linesOn();
      $('.list', m).innerHTML =
        (!ql ? row('', 'Unsorted', ring(18, 'var(--ink-3)'), !on.length, false) : '') +
        items.map(([c, d]) => row(c.id, ql && d ? path(c).join(' › ') : c.name, `<span style="width:${ql ? 0 : d * 14}px;flex:none"></span>${bullet(c, 18)}`, on.includes(c.id), on.length > 1 && on[0] === c.id)).join('') +
        (create ? menuItem({ label: create, iconName: 'plus', attrs: `data-create="${esc(q)}"` }) : '');
      const n = on.length;
      $('.pick-count', m).textContent = n > 1 ? `On ${n} lines` : n ? 'On 1 line' : 'Unsorted';
    };
    m.innerHTML = `<input class="input menu-search" placeholder="Find a line, or type Line/Branch" aria-label="Find a line, or type Line/Branch to create a branch">
      <p class="pick-hint">Tick every line it belongs on.</p>
      <div class="list"></div>
      <div class="pick-foot"><span class="pick-count" aria-live="polite"></span><button type="button" class="btn primary sm" id="pick-done">Done</button></div>`;
    draw();
    const input = $('input', m);
    input.addEventListener('input', () => draw(input.value.trim()));
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('.list .menu-item', m)?.click(); } });
    $('#pick-done', m).addEventListener('click', () => { close(); $('#line-btn')?.focus(); });
    m.addEventListener('click', async (e) => {
      const it = e.target.closest('.list .menu-item');
      if (!it) return;
      const on = linesOn();
      if (it.dataset.create) {
        const plan = M.planLinePath(collections, it.dataset.create);
        const changed = [...plan.created, ...plan.opened].map((c) => ({ ...c, updatedAt: Date.now() }));
        await db.putMany('collections', changed);
        for (const c of changed) { const i = collections.findIndex((x) => x.id === c.id); if (i >= 0) collections[i] = c; else collections.push(c); }
        flat.length = 0;
        walk(collections.filter((c) => !c.parentId || !collections.some((x) => x.id === c.parentId)).sort((a, b) => a.order - b.order), 0);
        const id = plan.target?.id;
        if (id && !on.includes(id)) {
          if (on.length >= MAX_LINES) { toast(`A link can stop on up to ${MAX_LINES} lines`); return; }
          setLines([...on, id]);
        }
        input.value = '';
        draw();
        $(`.list [data-pick="${id}"]`, m)?.focus();
        return;
      }
      const id = it.dataset.pick;
      if (!id) setLines([]);
      else if (on.includes(id)) setLines(on.filter((x) => x !== id));
      else if (on.length >= MAX_LINES) { toast(`A link can stop on up to ${MAX_LINES} lines`); return; }
      else setLines([...on, id]);
      draw(input.value.trim());
      $(`.list [data-pick="${id}"]`, m)?.focus();
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
