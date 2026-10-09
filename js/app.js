// Ember manager: state, rendering and interaction for app.html.
import * as db from './db.js';
import * as M from './model.js';
import * as IO from './io.js';
import { icon } from './icons.js';
import { esc, $, $$, debounce, toast, openMenu, closeMenu, isMenuOpen, menuItem, place, armConfirm, relTime, fullDate, plural, download, pickFile } from './ui.js';

const PAGE = 120;
const FAV = 'var(--fav)';

const S = {
  bookmarks: [],
  collections: [],
  bm: new Map(),
  col: new Map(),
  counts: { all: 0, unsorted: 0, fav: 0, trash: 0, byCol: new Map(), tags: new Map(), types: new Map() },
  route: { kind: 'all' },
  query: '',
  type: 'all',
  ui: { view: 'cards', sort: 'newest', size: 260, theme: 'system' },
  selected: new Set(),
  anchorId: null,
  limit: PAGE,
  list: [],
  editing: null,
  showAllTags: false,
  renaming: null,
  scan: null,
  texts: null,
  textsLoading: false,
  snippets: new Map(),
};

// ======================= data =======================

async function load() {
  const [bookmarks, collections, ui] = await Promise.all([db.getAll('bookmarks'), db.getAll('collections'), db.getMeta('ui', null)]);
  S.bookmarks = bookmarks;
  S.collections = collections;
  S.texts = null;
  if (ui) Object.assign(S.ui, ui);
  index();
}

function index() {
  S.bm = new Map(S.bookmarks.map((b) => [b.id, b]));
  S.col = new Map(S.collections.map((c) => [c.id, c]));
  const c = { all: 0, unsorted: 0, fav: 0, trash: 0, broken: 0, dead: 0, checked: 0, indexed: 0, byCol: new Map(), tags: new Map(), types: new Map() };
  for (const b of S.bookmarks) {
    b._hay ??= (b.title + ' ' + b.url + ' ' + b.excerpt + ' ' + b.note + ' ' + b.tags.join(' ')).toLowerCase();
    if (b.trashedAt) { c.trash++; continue; }
    c.all++;
    if (b.favorite) c.fav++;
    if (b.textAt) c.indexed++;
    if (b.health) {
      c.checked++;
      if (b.health.state !== 'ok') c.broken++;
      if (b.health.state === 'dead') c.dead++;
    }
    if (!b.collectionId || !S.col.has(b.collectionId)) c.unsorted++;
    else c.byCol.set(b.collectionId, (c.byCol.get(b.collectionId) || 0) + 1);
    for (const t of b.tags) c.tags.set(t, (c.tags.get(t) || 0) + 1);
  }
  S.counts = c;
}

const saveUI = debounce(() => db.setMeta('ui', S.ui), 300);

function kidsOf(pid) {
  return S.collections.filter((c) => (c.parentId || null) === pid).sort((a, b) => a.order - b.order);
}
function roots() {
  return S.collections.filter((c) => !c.parentId || !S.col.has(c.parentId)).sort((a, b) => a.order - b.order);
}
function descendants(id) {
  const out = new Set();
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop();
    for (const k of kidsOf(cur)) if (!out.has(k.id)) { out.add(k.id); stack.push(k.id); }
  }
  return out;
}
function pathOf(id) {
  const out = [];
  let c = S.col.get(id);
  const seen = new Set();
  while (c && !seen.has(c.id)) { seen.add(c.id); out.unshift(c); c = S.col.get(c.parentId); }
  return out;
}

async function putBookmarks(list) {
  for (const b of list) { b.updatedAt = Date.now(); delete b._hay; }
  await db.putMany('bookmarks', list.map(clean));
  for (const b of list) if (!S.bm.has(b.id)) S.bookmarks.push(b);
  index();
}
const clean = (b) => { const { _hay, ...rest } = b; return rest; };
async function putCollections(list) {
  await db.putMany('collections', list);
  for (const c of list) if (!S.col.has(c.id)) S.collections.push(c);
  index();
}

function snapshot(ids) { return ids.map((id) => structuredClone(clean(S.bm.get(id)))); }
async function restoreSnapshot(snap) {
  await db.putMany('bookmarks', snap);
  for (const s of snap) {
    const i = S.bookmarks.findIndex((b) => b.id === s.id);
    if (i >= 0) S.bookmarks[i] = s; else S.bookmarks.push(s);
  }
  index();
  renderAll();
}

// ======================= routing & query =======================

function parseHash() {
  const h = decodeURIComponent(location.hash.replace(/^#\/?/, ''));
  const [kind, ...rest] = h.split('/');
  const arg = rest.join('/');
  if (kind === 'c' && arg) return { kind: 'c', id: arg };
  if (kind === 'tag' && arg) return { kind: 'tag', tag: arg };
  if (['unsorted', 'favorites', 'trash', 'settings', 'duplicates', 'broken'].includes(kind)) return { kind };
  return { kind: 'all' };
}

function go(hash) {
  if (location.hash === hash) onRoute();
  else location.hash = hash;
}

function onRoute() {
  S.route = parseHash();
  if (S.route.kind === 'c' && !S.col.has(S.route.id)) S.route = { kind: 'all' };
  S.selected.clear();
  S.limit = PAGE;
  S.type = 'all';
  closeDrawer();
  closeMenu();
  closeBandOnMobile();
  renderAll();
  $('#content').scrollTop = 0;
}

function routeHash(r = S.route) {
  if (r.kind === 'c') return '#/c/' + r.id;
  if (r.kind === 'tag') return '#/tag/' + encodeURIComponent(r.tag);
  return '#/' + r.kind;
}

function parseQuery(q) {
  const out = { words: [], tags: [], sites: [], types: [], fav: false, note: false, broken: false };
  for (const tok of q.trim().toLowerCase().match(/"[^"]+"|\S+/g) || []) {
    if (tok.startsWith('#') && tok.length > 1) out.tags.push(tok.slice(1));
    else if (tok.startsWith('site:')) out.sites.push(tok.slice(5));
    else if (tok.startsWith('type:')) out.types.push(tok.slice(5));
    else if (tok === 'is:fav' || tok === 'is:favorite') out.fav = true;
    else if (tok === 'has:note') out.note = true;
    else if (tok === 'is:broken' || tok === 'is:dead') out.broken = true;
    else out.words.push(tok.replace(/^"|"$/g, ''));
  }
  return out;
}

function baseSet(r = S.route) {
  const B = S.bookmarks;
  switch (r.kind) {
    case 'trash': return B.filter((b) => b.trashedAt);
    case 'unsorted': return B.filter((b) => !b.trashedAt && (!b.collectionId || !S.col.has(b.collectionId)));
    case 'favorites': return B.filter((b) => !b.trashedAt && b.favorite);
    case 'c': return B.filter((b) => !b.trashedAt && b.collectionId === r.id);
    case 'tag': return B.filter((b) => !b.trashedAt && b.tags.includes(r.tag));
    case 'broken': return B.filter((b) => !b.trashedAt && b.health && b.health.state !== 'ok');
    case 'duplicates': {
      const groups = new Map();
      for (const b of B) if (!b.trashedAt) {
        const k = M.normalizeUrl(b.url);
        groups.set(k, [...(groups.get(k) || []), b]);
      }
      return [...groups.values()].filter((g) => g.length > 1).flat();
    }
    default: return B.filter((b) => !b.trashedAt);
  }
}

function applyQuery(list) {
  S.snippets = new Map();
  if (!S.query.trim()) return list;
  const q = parseQuery(S.query);
  // Page text is loaded on the first search, then searched alongside titles, tags and notes.
  if (q.words.length && !S.texts && S.counts.indexed) loadTexts();
  const T = S.texts;
  return list.filter((b) => {
    if (!(q.tags.every((t) => b.tags.some((x) => x.startsWith(t))) &&
      q.sites.every((s) => M.hostOf(b.url).includes(s)) &&
      (!q.types.length || q.types.includes(b.type)) &&
      (!q.fav || b.favorite) &&
      (!q.note || b.note) &&
      (!q.broken || (b.health && b.health.state !== 'ok')))) return false;
    let inText = null;
    for (const w of q.words) {
      if (b._hay.includes(w)) continue;
      const t = T?.get(b.id);
      if (!t || !t.low.includes(w)) return false;
      inText ??= w;
    }
    if (inText) S.snippets.set(b.id, snippetFor(T.get(b.id), inText));
    return true;
  });
}

async function loadTexts() {
  if (S.textsLoading) return;
  S.textsLoading = true;
  const rows = await db.getAll('texts');
  S.texts = new Map(rows.map((r) => [r.id, { raw: r.text, low: r.text.toLowerCase() }]));
  S.textsLoading = false;
  if (S.query.trim()) refreshList();
}

// A short excerpt of page text around the first match, with the match marked.
function snippetFor(t, word) {
  const i = t.low.indexOf(word);
  const start = Math.max(0, i - 70);
  const end = Math.min(t.raw.length, i + word.length + 110);
  let before = t.raw.slice(start, i);
  let after = t.raw.slice(i + word.length, end);
  if (start > 0) before = before.replace(/^\S*\s/, '');
  if (end < t.raw.length) after = after.replace(/\s\S*$/, '');
  const hit = t.raw.slice(i, i + word.length);
  return `${start > 0 ? '…' : ''}${esc(before)}<mark>${esc(hit)}</mark>${esc(after)}${end < t.raw.length ? '…' : ''}`.replace(/\n/g, ' ');
}

const SORTS = {
  newest: (a, b) => b.createdAt - a.createdAt,
  oldest: (a, b) => a.createdAt - b.createdAt,
  updated: (a, b) => b.updatedAt - a.updatedAt,
  title: (a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }),
  site: (a, b) => M.hostOf(a.url).localeCompare(M.hostOf(b.url)) || b.createdAt - a.createdAt,
};

const HEALTH_RANK = { dead: 0, moved: 1, warn: 2, ok: 3 };

function computeList() {
  let list = applyQuery(baseSet());
  const types = new Map();
  for (const b of list) types.set(b.type, (types.get(b.type) || 0) + 1);
  S.counts.types = types;
  if (S.type !== 'all') list = list.filter((b) => b.type === S.type);
  if (S.route.kind === 'duplicates') list.sort((a, b) => M.normalizeUrl(a.url).localeCompare(M.normalizeUrl(b.url)) || a.createdAt - b.createdAt);
  else if (S.route.kind === 'trash') list.sort((a, b) => b.trashedAt - a.trashedAt);
  else if (S.route.kind === 'broken') list.sort((a, b) => HEALTH_RANK[a.health.state] - HEALTH_RANK[b.health.state] || M.hostOf(a.url).localeCompare(M.hostOf(b.url)));
  else list.sort(SORTS[S.ui.sort] || SORTS.newest);
  S.list = list;
  return list;
}

// ======================= bullets =======================

// size null leaves --bs to the stylesheet (the card-size slider drives it there).
const bs = (size) => (size ? `--bs:${size}px;` : '');
function lineBullet(c, size = 20, cls = '', title = '') {
  if (!c) return unsortedBullet(size, 'currentColor', cls);
  const code = c.code || M.codeFor(c.name);
  return `<span class="bullet${[...code].length > 1 ? ' two' : ''} ${cls}" style="${bs(size)}--c:${c.color};--bi:${M.bulletInk(c.color)}"${title ? ` title="${esc(title)}"` : ''}>${esc(code)}</span>`;
}
const lineColor = (name) => M.LINE_COLORS.find((c) => c.name === name).value;
const unsortedBullet = (size = 20, color = 'currentColor', cls = '') => `<span class="bullet ring ${cls}" style="${bs(size)}--c:${color}" title="Unsorted"></span>`;
const allBullet = (size, bg = 'var(--band-ink)', fg = 'var(--band)') => `<span class="bullet" style="--bs:${size}px;--c:${bg};--bi:${fg}">${icon('cards', 12)}</span>`;
const favBullet = (size) => `<span class="bullet" style="--bs:${size}px;--c:${FAV};--bi:#16171a">${icon('starFilled', 12)}</span>`;
const trashBullet = (size, color = 'currentColor') => `<span class="bullet dashed" style="--bs:${size}px;--c:${color}"></span>`;
const brokenBullet = (size, icoSize = 12) => `<span class="bullet" style="--bs:${size}px;--c:var(--danger);--bi:#fff">${icon('alert', icoSize)}</span>`;
const tagBullet = (size) => `<span class="bullet" style="--bs:${size}px;--c:var(--ink);--bi:var(--surface)">${icon('hash', 12)}</span>`;

// ======================= sidebar (signage band) =======================

function renderBand() {
  const r = S.route;
  const cur = (kind, id) => (r.kind === kind && (id === undefined || r.id === id || r.tag === id) ? 'aria-current="page"' : '');
  const stop = (kind, label, bullet, count, extra = '') =>
    `<a class="stop" href="#/${kind}" ${cur(kind)} data-drop="${kind}" ${extra}>${bullet}<span class="stop-name">${label}</span><span class="count">${count ? count.toLocaleString() : ''}</span></a>`;

  const lineNode = (c, depth) => {
    const kids = kidsOf(c.id);
    const open = c.expanded && kids.length;
    const n = S.counts.byCol.get(c.id) || 0;
    const renaming = S.renaming === c.id;
    const here = r.kind === 'c' && r.id === c.id;
    return `<div class="line-node" data-line="${c.id}">
      <div class="stop line-stop" ${here ? 'data-current' : ''} style="--c:${c.color}" draggable="${renaming ? 'false' : 'true'}" data-drop="line" data-id="${c.id}">
        ${kids.length
          ? `<button class="twisty${open ? ' open' : ''}" data-act="twisty" aria-expanded="${!!open}" aria-label="${open ? 'Collapse' : 'Expand'} ${esc(c.name)}">${icon('chevronRight', 14)}</button>`
          : '<span class="twisty none" aria-hidden="true"></span>'}
        ${renaming
          ? `${lineBullet(c, 20)}<input class="rename" value="${esc(c.name)}" aria-label="Line name" maxlength="80">`
          : `<a class="stop-link" href="#/c/${c.id}" ${here ? 'aria-current="page"' : ''} draggable="false">${lineBullet(c, 20)}<span class="stop-name" dir="auto">${esc(c.name)}</span></a>`}
        <span class="count">${n ? n.toLocaleString() : ''}</span>
        <button class="more" data-act="line-menu" aria-haspopup="menu" aria-label="Options for ${esc(c.name)}" title="Options (F2 renames)">${icon('more', 16)}</button>
      </div>
      ${open ? `<div class="line-children" style="--stem:${c.color}">${kids.map((k) => lineNode(k, depth + 1)).join('')}</div>` : ''}
    </div>`;
  };

  const tags = [...S.counts.tags.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const shownTags = S.showAllTags ? tags : tags.slice(0, 18);
  const rootLines = roots();

  $('#band').innerHTML = `
    <div class="brand">
      <span class="bullet" style="--c:var(--ember);--bi:#16171a">E</span>
      <span class="brand-name">Ember</span>
      <button class="icon-btn" data-act="add" title="Add link (N)" aria-label="Add link">${icon('plus', 18)}</button>
    </div>
    <div class="band-scroll">
      ${stop('all', 'All bookmarks', allBullet(20), S.counts.all)}
      ${stop('unsorted', 'Unsorted', unsortedBullet(20, 'var(--band-ink-2)'), S.counts.unsorted)}
      ${stop('favorites', 'Favorites', favBullet(20), S.counts.fav)}
      ${S.counts.broken ? stop('broken', 'Broken links', brokenBullet(20), S.counts.broken) : ''}
      <section class="band-section" aria-label="Lines">
        <div class="band-head" data-drop="root">
          <span>Lines</span>
          <button class="icon-btn" data-act="new-line" title="New line" aria-label="New line">${icon('plus', 16)}</button>
        </div>
        ${rootLines.length ? rootLines.map((c) => lineNode(c, 0)).join('') : `<p class="band-empty">Lines are your collections. <button data-act="new-line">Create one</button> or import your Chrome bookmarks.</p>`}
      </section>
      ${tags.length ? `<section class="band-section" aria-label="Tags">
        <div class="band-head"><span>Tags</span></div>
        <div class="tag-cloud">
          ${shownTags.map(([t, n]) => `<a class="tag-pill" href="#/tag/${encodeURIComponent(t)}" ${cur('tag', t)}>#${esc(t)} <span class="n">${n}</span></a>`).join('')}
          ${tags.length > 18 ? `<button class="tag-more" data-act="more-tags">${S.showAllTags ? 'Show fewer' : `Show all ${tags.length}`}</button>` : ''}
        </div>
      </section>` : ''}
    </div>
    <div class="scan-status" id="scan-status" hidden></div>
    <div class="band-foot">
      ${stop('trash', 'Trash', trashBullet(18, 'var(--band-ink-2)'), S.counts.trash, 'style="flex:1"')}
      <a class="stop" href="#/settings" ${cur('settings')} style="flex:1">${icon('settings', 18)}<span class="stop-name">Settings</span></a>
      <button class="stop theme-btn" data-act="theme" title="Theme: ${S.ui.theme}" aria-label="Switch theme (now ${S.ui.theme})">${icon(S.ui.theme === 'dark' ? 'moon' : S.ui.theme === 'light' ? 'sun' : 'monitor', 18)}</button>
    </div>`;

  renderScanStatus();
  const input = $('#band input.rename');
  if (input) { input.focus(); input.select(); }
}

// ======================= station sign =======================

function stationInfo() {
  const r = S.route;
  switch (r.kind) {
    case 'unsorted': return { name: 'Unsorted', bullet: unsortedBullet(46, 'var(--ink-3)'), color: 'var(--ink-3)', path: [], noun: 'link' };
    case 'favorites': return { name: 'Favorites', bullet: favBullet(46), color: FAV, path: [] };
    case 'trash': return { name: 'Trash', bullet: trashBullet(46, 'var(--ink-3)'), color: 'var(--ink-3)', path: [] };
    case 'tag': return { name: '#' + r.tag, bullet: tagBullet(46), color: 'var(--ink)', path: [] };
    case 'broken': return { name: 'Broken links', bullet: brokenBullet(46, 20), color: 'var(--danger)', path: [{ label: 'Settings', hash: '#/settings', bullet: '' }] };
    case 'settings': return { name: 'Settings & data', bullet: `<span class="bullet" style="--bs:46px;--c:var(--ink);--bi:var(--surface)">${icon('settings', 20)}</span>`, color: 'var(--ink)', path: [], noCount: true };
    case 'duplicates': return { name: 'Duplicates', bullet: `<span class="bullet" style="--bs:46px;--c:var(--ink);--bi:var(--surface)">${icon('duplicate', 20)}</span>`, color: 'var(--ink)', path: [{ label: 'Settings', hash: '#/settings', bullet: '' }] };
    case 'c': {
      const c = S.col.get(r.id);
      const p = pathOf(r.id).slice(0, -1);
      return { name: c.name, bullet: lineBullet(c, 46), color: c.color, path: p.map((x) => ({ label: x.name, hash: '#/c/' + x.id, bullet: lineBullet(x, 14) })) };
    }
    default: return { name: 'All bookmarks', bullet: allBullet(46, 'var(--ember)', '#16171a'), color: 'var(--ember)', path: [] };
  }
}

function renderStation() {
  const info = stationInfo();
  const total = baseSet().length;
  const shown = S.list.length;
  const filtered = S.query.trim() || S.type !== 'all';
  const count = info.noCount ? '' : filtered
    ? `<b class="tnum">${shown.toLocaleString()}</b> of ${plural(total, 'link')}`
    : `<b class="tnum">${total.toLocaleString()}</b> ${total === 1 ? 'link' : 'links'}`;
  const st = $('#station');
  st.style.setProperty('--c', info.color);
  const key = routeHash();
  if (st.dataset.at !== key) {
    st.dataset.at = key;
    st.classList.remove('arrive');
    void st.offsetWidth;
    st.classList.add('arrive');
  }
  const searchVal = $('#search')?.value;
  if (!$('#search')) {
    st.innerHTML = `
      <button class="icon-btn menu-toggle" data-act="toggle-band" aria-label="Open library">${icon('headlines', 20)}</button>
      <div class="station-id" id="station-id"></div>
      <div class="station-tools">
        <label class="search">
          ${icon('search', 17)}
          <span class="sr">Search bookmarks</span>
          <input id="search" type="search" placeholder="Search, #tag, site:, type:video" autocomplete="off" spellcheck="false">
          <kbd id="search-kbd">/</kbd>
          <button class="icon-btn sm clear" id="search-clear" data-act="clear-search" aria-label="Clear search" hidden>${icon('x', 15)}</button>
        </label>
        <button class="btn primary" data-act="add" title="Add link (N)">${icon('plus', 18)}<span class="lbl">Add link</span></button>
      </div>`;
  }
  $('#station-id').innerHTML = `
    ${info.bullet}
    <div class="station-text">
      ${info.path.length ? `<nav class="station-path" aria-label="Parent lines">${info.path.map((p) => `<button data-href="${p.hash}">${p.bullet}${esc(p.label)}</button>`).join(icon('chevronRight', 12))}</nav>` : ''}
      <h1 class="station-name">${esc(info.name)}</h1>
    </div>
    <span class="station-count">${count}</span>`;
  if (searchVal === undefined) $('#search').value = S.query;
  syncSearchChrome();
  document.title = `${info.name} · Ember`;
}

function syncSearchChrome() {
  const has = !!S.query;
  $('#search-clear').hidden = !has;
  $('#search-kbd').hidden = has;
}

// ======================= sub bar =======================

const VIEWS = [
  { id: 'cards', label: 'Cards', ic: 'cards' },
  { id: 'list', label: 'List', ic: 'list' },
  { id: 'headlines', label: 'Headlines', ic: 'headlines' },
  { id: 'moodboard', label: 'Moodboard', ic: 'moodboard' },
];
const TYPES = [
  { id: 'article', label: 'Articles' },
  { id: 'video', label: 'Videos' },
  { id: 'image', label: 'Images' },
  { id: 'document', label: 'Docs' },
  { id: 'link', label: 'Links' },
];

function renderSubbar() {
  const sb = $('#subbar');
  if (S.route.kind === 'settings') { sb.hidden = true; return; }
  sb.hidden = false;
  const typeBtns = TYPES.filter((t) => S.counts.types.get(t.id));
  const sizeable = S.ui.view === 'cards' || S.ui.view === 'moodboard';
  const extra = S.route.kind === 'trash' && S.counts.trash
    ? `<button class="btn sm danger" data-act="empty-trash">${icon('trash', 15)}<span class="lbl">Empty trash</span></button>`
    : S.route.kind === 'broken' && S.list.length
      ? `${S.counts.dead ? `<button class="btn sm danger" data-act="trash-dead">${icon('trash', 15)}<span class="lbl">Trash ${plural(S.counts.dead, 'dead link')}</span></button>` : ''}<button class="btn sm" data-act="recheck" ${S.scan ? 'disabled' : ''}>${icon('refresh', 15)}<span class="lbl">Check these again</span></button>`
    : S.route.kind === 'duplicates' && S.list.length
      ? `<button class="btn sm" data-act="dedupe">${icon('trash', 15)}<span class="lbl">Keep oldest, trash the rest</span></button>`
      : S.route.kind === 'c'
        ? `<button class="btn sm ghost" data-act="open-all" title="Open every link on this line in new tabs" aria-label="Open all">${icon('external', 15)}<span class="lbl">Open all</span></button>`
        : '';
  sb.innerHTML = `
    <div class="seg" role="group" aria-label="View">
      ${VIEWS.map((v, i) => `<button data-view="${v.id}" aria-pressed="${S.ui.view === v.id}" title="${v.label} (${i + 1})" aria-label="${v.label}">${icon(v.ic, 17)}</button>`).join('')}
    </div>
    ${typeBtns.length > 1 ? `<div class="seg type-filter" role="group" aria-label="Type">
      <button data-type="all" aria-pressed="${S.type === 'all'}">All</button>
      ${typeBtns.map((t) => `<button data-type="${t.id}" aria-pressed="${S.type === t.id}">${t.label} <span class="n">${S.counts.types.get(t.id)}</span></button>`).join('')}
    </div>` : ''}
    <span class="spacer"></span>
    ${extra}
    ${sizeable ? `<label class="size-ctl" title="Card size">${icon('image', 15)}<input type="range" id="size" min="180" max="420" step="10" value="${S.ui.size}" aria-label="Card size">${icon('image', 19)}</label>` : ''}
    ${S.route.kind === 'trash' || S.route.kind === 'duplicates' ? '' : `<span class="select-wrap">
      <select id="sort" aria-label="Sort">
        ${[['newest', 'Newest first'], ['oldest', 'Oldest first'], ['updated', 'Recently edited'], ['title', 'Title A–Z'], ['site', 'By site']].map(([v, l]) => `<option value="${v}" ${S.ui.sort === v ? 'selected' : ''}>${l}</option>`).join('')}
      </select>${icon('chevronDown', 15)}
    </span>`}
    <button class="btn sm ghost" data-act="select-all" title="Select all (Ctrl+A)" aria-label="Select all">${icon('select', 16)}<span class="lbl">Select</span></button>`;
}

// ======================= content =======================

function coverHTML(b, col) {
  const host = M.hostOf(b.url);
  const color = col?.color || M.colorFor(host);
  const ph = `<div class="ph" style="--pc:${color};--pi:${M.bulletInk(color)}"><span class="fav-tile">${favImg(b.url, 24) || esc((host[0] || '?').toUpperCase())}</span><span class="ph-host">${esc(host || b.url)}</span></div>`;
  if (b.cover?.startsWith('media:')) return `<img alt="" data-media="${esc(b.cover.slice(6))}" decoding="async">` + `<template>${ph}</template>`;
  // A cover that still points at a website is never loaded from it; it shows the placeholder until stored.
  return ph;
}

function favImg(url, size = 16, cls = '') {
  const src = M.faviconUrl(url, size * 2);
  return src ? `<img class="${cls}" src="${esc(src)}" alt="" width="${size}" height="${size}" loading="lazy">` : '';
}

const HEALTH_LABEL = { dead: 'Dead', warn: 'Unverified', moved: 'Moved' };
function healthChip(b) {
  const h = b.health;
  if (!h || h.state === 'ok') return '';
  const code = h.code && h.state !== 'moved' ? ` ${h.code}` : '';
  return `<span class="health ${h.state}" title="${esc(h.note || '')}${h.checkedAt ? ` · checked ${esc(relTime(h.checkedAt))}` : ''}">${icon(h.state === 'moved' ? 'move' : 'alert', 13)}${HEALTH_LABEL[h.state]}${code}</span>`;
}

function cardHTML(b) {
  const col = S.col.get(b.collectionId);
  const host = M.hostOf(b.url);
  const sel = S.selected.has(b.id);
  const trash = !!b.trashedAt;
  const fav = favImg(b.url, 16, 'fav') || `<span class="fav-fallback">${esc((host[0] || '?').toUpperCase())}</span>`;
  const when = trash ? `trashed ${relTime(b.trashedAt)}` : relTime(b.createdAt);
  // Every control names the link it acts on, so a list of buttons is never "Select, Select, Select…".
  const name = esc(b.title.length > 70 ? b.title.slice(0, 68) + '…' : b.title);
  return `<article class="card${sel ? ' selected' : ''}" data-id="${b.id}" draggable="true" aria-labelledby="t-${b.id}" style="--c:${col?.color || 'var(--ink-3)'}">
    <div class="cover-wrap">
      <div class="cover">${coverHTML(b, col)}</div>
      ${col ? lineBullet(col, null, 'on-line', col.name) : unsortedBullet(null, 'var(--ink-3)', 'on-line')}
    </div>
    <div class="card-body">
      ${col ? lineBullet(col, 16, 'hl-bullet', col.name) : unsortedBullet(16, 'var(--ink-3)', 'hl-bullet')}
      <a class="card-title" id="t-${b.id}" dir="auto" href="${esc(b.url)}" target="_blank" rel="noopener noreferrer" title="${esc(b.title)}">${esc(b.title)}</a>
      ${S.snippets.has(b.id) ? `<p class="card-snippet"><span class="snip-label">In page</span> ${S.snippets.get(b.id)}</p>` : b.excerpt ? `<p class="card-excerpt" dir="auto">${esc(b.excerpt)}</p>` : ''}
      ${b.note ? `<p class="card-note">${icon('note', 14)}<span dir="auto">${esc(b.note)}</span></p>` : ''}
      ${b.tags.length ? `<div class="tags">${b.tags.map((t) => `<button class="tag" data-tag="${esc(t)}" aria-label="Show links tagged ${esc(t)}"><span class="hash">#</span>${esc(t)}</button>`).join('')}</div>` : ''}
      <div class="meta">${fav}<span class="host">${esc(host)}</span><span class="dot">·</span><span class="when" title="${esc(fullDate(trash ? b.trashedAt : b.createdAt))}">${when}</span>${b.favorite ? `<span class="fav-star" title="Favorite">${icon('starFilled', 14)}</span>` : ''}${!trash ? healthChip(b) : ''}</div>
    </div>
    <button class="check" data-act="select" aria-label="Select “${name}”" aria-pressed="${sel}">${icon('check', 15)}</button>
    <div class="card-actions">
      ${trash
        ? `<button class="icon-btn" data-act="restore" title="Restore" aria-label="Restore “${name}”">${icon('restore', 17)}</button>
           <button class="icon-btn danger" data-act="destroy" title="Delete forever" aria-label="Delete “${name}” forever">${icon('trash', 17)}</button>`
        : `<button class="icon-btn${b.favorite ? ' on' : ''}" data-act="fav" title="${b.favorite ? 'Unfavorite' : 'Favorite'} (F)" aria-label="Favorite “${name}”" aria-pressed="${!!b.favorite}">${icon(b.favorite ? 'starFilled' : 'star', 17)}</button>
           <button class="icon-btn" data-act="edit" title="Edit (E)" aria-label="Edit “${name}”">${icon('edit', 17)}</button>
           <button class="icon-btn" data-act="card-menu" title="More" aria-label="More actions for “${name}”" aria-haspopup="menu">${icon('more', 17)}</button>`}
    </div>
  </article>`;
}

// Re-rendering replaces card nodes; put keyboard focus back where it was.
function focusMemo() {
  const a = document.activeElement;
  const card = a?.closest?.('#grid .card');
  if (!card) return () => {};
  const id = card.dataset.id;
  const act = a.dataset.act;
  return () => {
    const next = $(`#grid .card[data-id="${id}"]`);
    if (!next) return;
    (act && next.querySelector(`[data-act="${act}"]`) || next.querySelector('.card-title'))?.focus({ preventScroll: true });
  };
}

function renderContent() {
  const restoreFocus = focusMemo();
  queueMicrotask(restoreFocus);
  const content = $('#content');
  if (S.route.kind === 'settings') { renderSettings(); return; }
  const list = S.list;
  if (!list.length) { content.innerHTML = emptyHTML(); return; }

  const children = S.route.kind === 'c' ? kidsOf(S.route.id) : [];
  const transfers = children.length && !S.query
    ? `<div class="group-head"><span>Branches</span>${children.map((c) => `<a class="fchip" href="#/c/${c.id}">${lineBullet(c, 16)} ${esc(c.name)} <span class="tnum" style="color:var(--ink-3)">${S.counts.byCol.get(c.id) || 0}</span></a>`).join('')}</div>`
    : '';
  const legend = S.route.kind === 'broken'
    ? `<dl class="legend">
        <div><dt><span class="health dead">${icon('alert', 13)}Dead</span></dt><dd>The page is gone or the site can’t be reached.</dd></div>
        <div><dt><span class="health moved">${icon('move', 13)}Moved</span></dt><dd>It now redirects to another site. Choose <b>Use new address</b> in the card menu.</dd></div>
        <div><dt><span class="health warn">${icon('alert', 13)}Unverified</span></dt><dd>The site wouldn’t confirm the page, often because of bot protection. Open it to check.</dd></div>
      </dl>`
    : '';
  const searchElsewhere = S.query && S.route.kind !== 'all'
    ? `<div class="group-head"><span>Searching in ${esc(stationInfo().name)}.</span><button class="btn sm ghost" data-act="search-all">${icon('search', 14)} Search all bookmarks</button></div>`
    : '';

  content.innerHTML = `${transfers}${legend}${searchElsewhere}<div class="grid ${S.ui.view}${S.selected.size ? ' selecting' : ''}" id="grid" style="--card-w:${S.ui.size}px">${list.slice(0, S.limit).map(cardHTML).join('')}</div><div class="more-sentinel" id="sentinel"></div>`;
  hydrate(content);
  observeMore();
}

function appendMore() {
  const grid = $('#grid');
  if (!grid || S.limit >= S.list.length) return;
  const from = S.limit;
  S.limit += PAGE;
  const tmp = document.createElement('div');
  tmp.innerHTML = S.list.slice(from, S.limit).map(cardHTML).join('');
  const nodes = [...tmp.children];
  grid.append(...nodes);
  nodes.forEach(hydrate);
}

let moreObserver;
function observeMore() {
  moreObserver?.disconnect();
  const s = $('#sentinel');
  if (!s) return;
  moreObserver = new IntersectionObserver((e) => { if (e[0].isIntersecting) appendMore(); }, { root: $('#content'), rootMargin: '800px' });
  moreObserver.observe(s);
}

// Media covers live in IndexedDB as blobs; resolve them to object URLs lazily.
const mediaCache = new Map();
async function mediaURL(id) {
  if (mediaCache.has(id)) return mediaCache.get(id);
  const p = db.get('media', id).then((m) => (m ? URL.createObjectURL(m.blob) : ''));
  mediaCache.set(id, p);
  return p;
}
function hydrate(root) {
  for (const img of root.querySelectorAll('img[data-media]')) {
    mediaURL(img.dataset.media).then((url) => {
      if (url) img.src = url; else fallbackCover(img);
    });
    img.removeAttribute('data-media');
  }
}
function fallbackCover(img) {
  const tpl = img.nextElementSibling;
  if (tpl?.tagName === 'TEMPLATE') { img.replaceWith(tpl.content.cloneNode(true)); tpl.remove(); }
}
document.addEventListener('error', (e) => {
  const t = e.target;
  if (t.tagName !== 'IMG') return;
  if (t.parentElement?.classList.contains('cover') || t.parentElement?.classList.contains('drawer-cover')) fallbackCover(t);
  else if (t.classList.contains('fav') || t.closest('.fav-tile')) t.style.visibility = 'hidden';
}, true);

function emptyHTML() {
  const sample = S.collections.slice(0, 3);
  const bullets = `<div class="bullets">${sample.length ? sample.map((c) => lineBullet(c, 40)).join('') : `<span class="bullet" style="--bs:40px;--c:var(--ember);--bi:var(--ember-ink)">E</span>${lineBullet({ code: 'R', color: lineColor('Teal') }, 40)}${lineBullet({ code: 'D', color: lineColor('Cobalt') }, 40)}`}</div>`;
  if (S.query || S.type !== 'all') {
    const scope = S.counts.indexed ? `titles, tags, notes and the text of ${plural(S.counts.indexed, 'saved page')}` : 'titles, addresses, tags and notes';
    return `<div class="empty">${bullets}<h2>Nothing matches “${esc(S.query || S.type)}”</h2>
      <p>Ember searched ${scope}. Try fewer words, or narrow with <b>#tag</b>, <b>site:github.com</b>, <b>type:video</b>, <b>is:fav</b> or <b>is:broken</b>.</p>
      <div class="actions"><button class="btn" data-act="clear-search">${icon('x', 16)} Clear search</button>${S.route.kind !== 'all' ? `<button class="btn primary" data-act="search-all">${icon('search', 16)} Search all bookmarks</button>` : ''}</div></div>`;
  }
  if (!S.bookmarks.length) {
    return `<div class="empty">${bullets}<h2>Every link gets a line</h2>
      <p>Ember keeps your bookmarks on this machine, organised into colour-coded lines. Start by bringing in what you already have.</p>
      <div class="actions">
        ${M.hasChrome ? `<button class="btn primary" data-act="import-chrome">${icon('download', 17)} Import Chrome bookmarks</button>` : ''}
        <button class="btn" data-act="import-html">${icon('upload', 17)} Import HTML file</button>
        <button class="btn" data-act="add">${icon('plus', 17)} Add a link</button>
      </div>
      <p class="hint">Save any page with the toolbar button or <kbd>Alt</kbd><kbd>Shift</kbd><kbd>S</kbd> · search from the address bar with <kbd>em</kbd> <kbd>Space</kbd></p></div>`;
  }
  const msgs = {
    trash: ['Trash is empty', 'Deleted links wait here until you restore them or empty the trash.'],
    unsorted: ['Nothing unsorted', 'Everything you saved is on a line. New saves land here first.'],
    favorites: ['No favorites yet', 'Star a link to keep it one click away.'],
    duplicates: ['No duplicates', 'Every link in your library is unique.'],
    broken: ['No broken links', 'Nothing is dead, moved or unverified. Check again any time from Settings → Health & search.'],
    tag: ['No links with this tag', 'The tag will disappear once nothing uses it.'],
    c: ['No links on this line yet', 'Drag links onto this line in the sidebar, or choose it when you save a page.'],
    all: ['No links yet', 'Save a page from the toolbar to get started.'],
  };
  const [h, p] = msgs[S.route.kind] || msgs.all;
  return `<div class="empty">${bullets}<h2>${h}</h2><p>${p}</p>${S.route.kind === 'c' || S.route.kind === 'all' ? `<div class="actions"><button class="btn primary" data-act="add">${icon('plus', 17)} Add link</button></div>` : ''}</div>`;
}

// ======================= bulk bar =======================

function renderBulk() {
  const bar = $('#bulk');
  const n = S.selected.size;
  bar.classList.toggle('show', n > 0);
  $('#grid')?.classList.toggle('selecting', n > 0);
  if (!n) return;
  const trash = S.route.kind === 'trash';
  bar.innerHTML = `<span class="count">${plural(n, 'link')} selected</span>
    ${trash
      ? `<button class="btn" data-act="bulk-restore">${icon('restore', 16)}<span class="lbl">Restore</span></button>
         <button class="btn danger" data-act="bulk-destroy">${icon('trash', 16)}<span class="lbl">Delete forever</span></button>`
      : `<button class="btn" data-act="bulk-move">${icon('move', 16)}<span class="lbl">Move to…</span></button>
         <button class="btn" data-act="bulk-tag">${icon('tag', 16)}<span class="lbl">Tag</span></button>
         <button class="btn" data-act="bulk-fav">${icon('star', 16)}<span class="lbl">Favorite</span></button>
         <button class="btn" data-act="bulk-open">${icon('external', 16)}<span class="lbl">Open</span></button>
         <button class="btn danger" data-act="bulk-trash">${icon('trash', 16)}<span class="lbl">Trash</span></button>`}
    <span class="sep"></span>
    <button class="btn" data-act="bulk-clear" aria-label="Clear selection">${icon('x', 16)}</button>`;
}

function renderSelection() {
  for (const card of $$('#grid .card')) {
    const on = S.selected.has(card.dataset.id);
    card.classList.toggle('selected', on);
    const chk = card.querySelector('.check');
    chk?.setAttribute('aria-pressed', on);
  }
  renderBulk();
}

// ======================= render all =======================

function renderAll() {
  computeList();
  renderBand();
  renderStation();
  renderSubbar();
  renderContent();
  renderBulk();
  if (S.editing && !S.bm.has(S.editing)) closeDrawer();
}

function refreshList() {
  computeList();
  renderStation();
  renderSubbar();
  renderContent();
  renderBulk();
}

// ======================= bookmark actions =======================

const selectionOr = (id) => (S.selected.has(id) && S.selected.size > 1 ? [...S.selected] : [id]);

async function trash(ids) {
  const snap = snapshot(ids);
  const now = Date.now();
  await putBookmarks(ids.map((id) => Object.assign(S.bm.get(id), { trashedAt: now })));
  ids.forEach((id) => S.selected.delete(id));
  renderAll();
  toast(`${plural(ids.length, 'link')} moved to Trash`, { action: 'Undo', onAction: () => restoreSnapshot(snap), lead: trashBullet(18, 'var(--band-ink-2)') });
}

async function restore(ids) {
  await putBookmarks(ids.map((id) => {
    const b = S.bm.get(id);
    b.trashedAt = null;
    if (b.collectionId && !S.col.has(b.collectionId)) b.collectionId = null;
    return b;
  }));
  ids.forEach((id) => S.selected.delete(id));
  renderAll();
  toast(`${plural(ids.length, 'link')} restored`);
}

async function destroy(ids) {
  const media = ids.map((id) => S.bm.get(id)?.cover).filter((c) => c?.startsWith('media:')).map((c) => c.slice(6));
  await db.delMany('bookmarks', ids);
  await db.delMany('media', media);
  for (const m of media) mediaCache.get(m)?.then((u) => u && URL.revokeObjectURL(u)), mediaCache.delete(m);
  await db.delMany('texts', ids);
  ids.forEach((id) => S.texts?.delete(id));
  const gone = new Set(ids);
  S.bookmarks = S.bookmarks.filter((b) => !gone.has(b.id));
  ids.forEach((id) => S.selected.delete(id));
  index();
  renderAll();
  toast(`${plural(ids.length, 'link')} deleted forever`);
}

async function move(ids, collectionId) {
  const snap = snapshot(ids);
  await putBookmarks(ids.map((id) => Object.assign(S.bm.get(id), { collectionId, trashedAt: null })));
  S.selected.clear();
  renderAll();
  const c = S.col.get(collectionId);
  toast(`${plural(ids.length, 'link')} moved to ${c ? c.name : 'Unsorted'}`, { action: 'Undo', onAction: () => restoreSnapshot(snap), lead: c ? lineBullet(c, 18) : unsortedBullet(18, 'var(--band-ink-2)') });
}

async function setFavorite(ids, on) {
  await putBookmarks(ids.map((id) => Object.assign(S.bm.get(id), { favorite: on })));
  afterEdit(ids);
}

// After an edit that may not change which links are listed: patch just those cards and the counts.
// Falls back to a full refresh when membership or order changed (e.g. unfavouriting inside Favorites).
function afterEdit(ids) {
  const before = S.list;
  computeList();
  const same = S.list.length === before.length && S.list.every((b, i) => b === before[i]);
  if (!same) { renderAll(); return; }
  ids.forEach(refreshCard);
  renderBand();
  renderStation();
}

async function addTags(ids, tags) {
  tags = M.normalizeTags(tags);
  if (!tags.length) return;
  await putBookmarks(ids.map((id) => {
    const b = S.bm.get(id);
    b.tags = M.normalizeTags([...b.tags, ...tags]);
    return b;
  }));
  afterEdit(ids);
  toast(`Tagged ${plural(ids.length, 'link')} with ${tags.map((t) => '#' + t).join(' ')}`);
}

function openTabs(urls) {
  if (urls.length > 20 && !confirmOpenMany(urls.length)) return;
  for (const url of urls) {
    if (M.hasChrome) chrome.tabs.create({ url, active: false });
    else window.open(url, '_blank', 'noopener');
  }
}
let openManyArmed = 0;
function confirmOpenMany(n) {
  if (Date.now() - openManyArmed < 4000) return true;
  openManyArmed = Date.now();
  toast(`That opens ${n} tabs. Click again to confirm.`);
  return false;
}

// ======================= line actions =======================

const nextColor = () => M.pickLineColor(S.collections.map((c) => c.color));

async function newLine(parentId = null) {
  const siblings = parentId ? kidsOf(parentId) : roots();
  const c = { id: M.uid(), name: 'New line', code: 'N', color: nextColor(), parentId, order: siblings.length, expanded: false, createdAt: Date.now(), autoCode: true };
  if (parentId) S.col.get(parentId).expanded = true;
  await putCollections(parentId ? [c, S.col.get(parentId)] : [c]);
  S.renaming = c.id;
  renderBand();
  return c;
}

async function renameLine(id, name) {
  const c = S.col.get(id);
  S.renaming = null;
  name = name.trim();
  if (c && name && name !== c.name) {
    c.name = name;
    if (c.autoCode !== false) c.code = M.codeFor(name);
    await putCollections([c]);
  }
  renderAll();
}

async function deleteLine(id) {
  const ids = new Set([id, ...descendants(id)]);
  const cols = S.collections.filter((c) => ids.has(c.id)).map((c) => structuredClone(c));
  const bms = S.bookmarks.filter((b) => ids.has(b.collectionId) && !b.trashedAt).map((b) => b.id);
  const snap = snapshot(bms);
  const now = Date.now();
  await putBookmarks(bms.map((bid) => Object.assign(S.bm.get(bid), { trashedAt: now })));
  await db.delMany('collections', [...ids]);
  S.collections = S.collections.filter((c) => !ids.has(c.id));
  index();
  if (S.route.kind === 'c' && ids.has(S.route.id)) go('#/all'); else renderAll();
  toast(`Line “${cols[0].name}” deleted${bms.length ? `, ${plural(bms.length, 'link')} moved to Trash` : ''}`, {
    action: 'Undo',
    onAction: async () => {
      await putCollections(cols);
      await restoreSnapshot(snap);
    },
  });
}

async function placeLine(id, targetId, where) {
  const c = S.col.get(id);
  if (!c) return;
  let parentId, index;
  if (where === 'root') { parentId = null; index = roots().length; }
  else {
    const t = S.col.get(targetId);
    if (!t || t.id === id || descendants(id).has(t.id)) return;
    if (where === 'into') { parentId = t.id; index = kidsOf(t.id).length; t.expanded = true; }
    else {
      parentId = t.parentId && S.col.has(t.parentId) ? t.parentId : null;
      const sibs = (parentId ? kidsOf(parentId) : roots()).filter((x) => x.id !== id);
      index = sibs.findIndex((x) => x.id === t.id) + (where === 'after' ? 1 : 0);
    }
  }
  const sibs = (parentId ? kidsOf(parentId) : roots()).filter((x) => x.id !== id);
  sibs.splice(index, 0, c);
  c.parentId = parentId;
  sibs.forEach((s, i) => { s.order = i; });
  const changed = [...sibs];
  if (parentId) changed.push(S.col.get(parentId));
  await putCollections(changed);
  renderAll();
}

function lineMenu(anchor, id) {
  const c = S.col.get(id);
  openMenu(anchor, (m, close) => {
    m.innerHTML = `
      ${menuItem({ label: 'Rename', iconName: 'edit', action: 'rename' })}
      ${menuItem({ label: 'Add branch line', iconName: 'plus', action: 'child' })}
      ${menuItem({ label: 'Open all links', iconName: 'external', action: 'open' })}
      <div class="menu-sep"></div>
      <div class="label" style="padding:4px 9px 0">Line colour</div>
      <div class="swatches" role="radiogroup" aria-label="Line colour">${M.LINE_COLORS.map((x) => `<button class="swatch" role="radio" aria-checked="${x.value === c.color}" style="--c:${x.value}" data-color="${x.value}" title="${x.name}"></button>`).join('')}</div>
      <div class="label" style="padding:2px 9px 0">Bullet letters</div>
      <div style="padding:6px 8px 8px"><input class="input" id="code-input" maxlength="2" value="${esc(c.code || '')}" aria-label="Bullet letters" style="height:32px;text-transform:uppercase"></div>
      <div class="menu-sep"></div>
      ${menuItem({ label: 'Delete line', iconName: 'trash', action: 'delete', danger: true })}`;
    m.addEventListener('click', async (e) => {
      const sw = e.target.closest('[data-color]');
      if (sw) {
        c.color = sw.dataset.color;
        $$('.swatch', m).forEach((s) => s.setAttribute('aria-checked', s === sw));
        await putCollections([c]);
        renderAll();
        return;
      }
      const act = e.target.closest('[data-mi]')?.dataset.mi;
      if (!act) return;
      close();
      if (act === 'rename') { S.renaming = id; renderBand(); }
      if (act === 'child') newLine(id);
      if (act === 'open') openTabs(S.bookmarks.filter((b) => b.collectionId === id && !b.trashedAt).map((b) => b.url));
      if (act === 'delete') deleteLine(id);
    });
    const codeInput = $('#code-input', m);
    codeInput.addEventListener('change', async () => {
      const v = codeInput.value.trim().toUpperCase();
      c.code = v || M.codeFor(c.name);
      c.autoCode = !v;
      await putCollections([c]);
      renderAll();
    });
    codeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { codeInput.blur(); close(); } });
  });
}

// Line picker (used by Move, the drawer, and Add link).
function linePicker(anchor, currentId, onPick, { allowNone = true, title } = {}) {
  openMenu(anchor, (m, close) => {
    const flat = [];
    const walk = (list, depth) => { for (const c of list) { flat.push([c, depth]); walk(kidsOf(c.id), depth + 1); } };
    walk(roots(), 0);
    const draw = (q = '') => {
      const ql = q.toLowerCase();
      const items = flat.filter(([c]) => !ql || c.name.toLowerCase().includes(ql));
      $('.picker-list', m).innerHTML =
        (allowNone && !ql ? menuItem({ label: 'Unsorted', lead: unsortedBullet(18, 'var(--ink-3)'), action: '', checked: !currentId, attrs: 'data-pick=""' }) : '') +
        items.map(([c, d]) => menuItem({ label: c.name, lead: `<span style="width:${d * 14}px;flex:none"></span>${lineBullet(c, 18)}`, checked: c.id === currentId, attrs: `data-pick="${c.id}"` })).join('') +
        (q ? menuItem({ label: `Create line “${q}”`, iconName: 'plus', attrs: `data-create="${esc(q)}"` }) : '') +
        (!items.length && !q ? '<div class="menu-empty">No lines yet.</div>' : '');
    };
    m.innerHTML = `${title ? `<div class="label" style="padding:4px 9px 6px">${esc(title)}</div>` : ''}<input class="input menu-search" placeholder="Find or create a line" aria-label="Find a line"><div class="picker-list"></div>`;
    draw();
    const input = $('.menu-search', m);
    input.addEventListener('input', () => draw(input.value.trim()));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); $('.picker-list .menu-item', m)?.click(); }
    });
    m.addEventListener('click', async (e) => {
      const it = e.target.closest('.menu-item');
      if (!it) return;
      if (it.dataset.create) {
        const siblings = roots();
        const c = { id: M.uid(), name: it.dataset.create, code: M.codeFor(it.dataset.create), color: nextColor(), parentId: null, order: siblings.length, expanded: false, createdAt: Date.now() };
        await putCollections([c]);
        close();
        onPick(c.id);
        return;
      }
      close();
      onPick(it.dataset.pick || null);
    });
  }, { width: 280 });
}

function tagPrompt(anchor, onDone) {
  openMenu(anchor, (m, close) => {
    const all = [...S.counts.tags.keys()].sort();
    m.innerHTML = `<div class="label" style="padding:4px 9px 6px">Add tags (comma separated)</div><input class="input menu-search" placeholder="reading, design" aria-label="Tags"><div class="tag-sugg"></div>`;
    const input = $('input', m);
    const sugg = $('.tag-sugg', m);
    const draw = () => {
      const last = input.value.split(',').pop().trim().replace(/^#/, '').toLowerCase();
      const list = all.filter((t) => !last || t.includes(last)).slice(0, 8);
      sugg.innerHTML = list.map((t) => menuItem({ label: '#' + t, attrs: `data-t="${esc(t)}"` })).join('');
    };
    draw();
    input.addEventListener('input', draw);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); close(); onDone(input.value.split(',')); }
    });
    sugg.addEventListener('click', (e) => {
      const t = e.target.closest('[data-t]')?.dataset.t;
      if (!t) return;
      const parts = input.value.split(',').slice(0, -1).map((s) => s.trim()).filter(Boolean);
      input.value = [...parts, t].join(', ') + ', ';
      input.focus();
      draw();
    });
  }, { width: 280 });
}

function cardMenu(anchor, id) {
  const b = S.bm.get(id);
  openMenu(anchor, (m, close) => {
    m.innerHTML = `
      ${menuItem({ label: 'Edit', iconName: 'edit', action: 'edit' })}
      ${menuItem({ label: b.favorite ? 'Remove from Favorites' : 'Add to Favorites', iconName: b.favorite ? 'starFilled' : 'star', action: 'fav' })}
      ${menuItem({ label: 'Move to…', iconName: 'move', action: 'move' })}
      ${menuItem({ label: 'Add tags…', iconName: 'tag', action: 'tag' })}
      ${b.health?.state === 'moved' ? menuItem({ label: `Use new address (${M.hostOf(b.health.finalUrl)})`, iconName: 'move', action: 'use-new' }) : ''}
      ${b.health && b.health.state !== 'ok' ? menuItem({ label: 'Mark as working', iconName: 'check', action: 'mark-ok' }) : ''}
      ${menuItem({ label: 'Copy link', iconName: 'copy', action: 'copy' })}
      ${menuItem({ label: 'Open in new tab', iconName: 'external', action: 'open' })}
      <div class="menu-sep"></div>
      ${menuItem({ label: 'Move to Trash', iconName: 'trash', action: 'trash', danger: true })}`;
    m.addEventListener('click', (e) => {
      const act = e.target.closest('[data-mi]')?.dataset.mi;
      if (!act) return;
      close();
      const ids = selectionOr(id);
      if (act === 'edit') openDrawer(id);
      if (act === 'fav') setFavorite(ids, !b.favorite);
      if (act === 'move') linePicker(anchor, b.collectionId, (cid) => move(ids, cid), { title: `Move ${plural(ids.length, 'link')} to` });
      if (act === 'tag') tagPrompt(anchor, (tags) => addTags(ids, tags));
      if (act === 'copy') navigator.clipboard.writeText(b.url).then(() => toast('Link copied'));
      if (act === 'use-new') { b.url = b.health.finalUrl; b.health = { state: 'ok', code: 200, checkedAt: Date.now() }; putBookmarks([b]).then(renderAll); toast(`Address updated to ${M.hostOf(b.url)}`); }
      if (act === 'mark-ok') { b.health = { state: 'ok', code: 0, note: 'Marked as working', checkedAt: Date.now() }; putBookmarks([b]).then(renderAll); }
      if (act === 'open') openTabs([b.url]);
      if (act === 'trash') trash(ids);
    });
  }, { align: 'end' });
}

// ======================= add link =======================

function defaultsForRoute() {
  const r = S.route;
  return {
    collectionId: r.kind === 'c' ? r.id : null,
    favorite: r.kind === 'favorites',
    tags: r.kind === 'tag' ? [r.tag] : [],
  };
}

function addPopover(anchor, state = {}) {
  const d = defaultsForRoute();
  const target = 'target' in state ? state.target : d.collectionId;
  const c = S.col.get(target);
  openMenu(anchor, (m, close) => {
    m.innerHTML = `
      <form class="add-form" style="display:grid;gap:12px;padding:8px">
        <div class="field"><label for="add-url">Link</label><input class="input" id="add-url" placeholder="example.com/article" required autocomplete="off" spellcheck="false" aria-describedby="add-err" value="${esc(state.url || '')}"><span class="field-error" id="add-err" role="alert"></span></div>
        <div class="field"><label>Line</label><button type="button" class="picker" id="add-line">${c ? lineBullet(c, 18) : unsortedBullet(18, 'var(--ink-3)')}<span class="name">${esc(c ? c.name : 'Unsorted')}</span>${icon('chevronDown', 15)}</button></div>
        <div style="display:flex;gap:8px;justify-content:flex-end;align-items:center">
          ${M.hasChrome ? `<button type="button" class="btn ghost sm" id="add-tabs" style="margin-right:auto">${icon('cards', 15)} Save all open tabs</button>` : ''}
          <button class="btn primary" type="submit">${icon('plus', 16)} Save</button>
        </div>
      </form>`;
    $('#add-line', m).addEventListener('click', () => {
      const url = $('#add-url', m).value;
      linePicker(anchor, target, (cid) => addPopover(anchor, { url, target: cid }), { title: 'Save to' });
    });
    $('#add-tabs', m)?.addEventListener('click', () => { close(); saveAllTabs(); });
    $('form', m).addEventListener('submit', async (e) => {
      e.preventDefault();
      let url = $('#add-url', m).value.trim();
      if (!url) return;
      if (!/^[a-z]+:/i.test(url)) url = 'https://' + url;
      let valid = M.isSavable(url);
      try { valid = valid && !!new URL(url).hostname.includes('.') || /^(file|https?:\/\/localhost)/i.test(url); } catch { valid = false; }
      if (!valid) {
        $('#add-err', m).textContent = 'Enter a web address, like example.com/article.';
        $('#add-url', m).setAttribute('aria-invalid', 'true');
        $('#add-url', m).focus();
        return;
      }
      close();
      await addUrls([url], { ...d, collectionId: target });
    });
  }, { width: 340, align: 'end' });
}

async function addUrls(urls, defaults) {
  const existing = new Set(S.bookmarks.filter((b) => !b.trashedAt).map((b) => M.normalizeUrl(b.url)));
  const fresh = [];
  let dupes = 0;
  for (const url of urls) {
    if (!M.isSavable(url)) continue;
    const key = M.normalizeUrl(url);
    if (existing.has(key)) { dupes++; continue; }
    existing.add(key);
    fresh.push(M.newBookmark({ url, ...defaults }));
  }
  if (!fresh.length) {
    if (dupes) toast(dupes === 1 ? 'Already saved' : `All ${dupes} links were already saved`);
    return [];
  }
  await putBookmarks(fresh);
  renderAll();
  const c = S.col.get(defaults.collectionId);
  toast(`${fresh.length === 1 ? 'Saved' : `Saved ${fresh.length} links`} to ${c ? c.name : 'Unsorted'}${dupes ? ` (${dupes} already saved)` : ''}`, fresh.length === 1
    ? { action: 'Edit', onAction: () => openDrawer(fresh[0].id), lead: c ? lineBullet(c, 18) : unsortedBullet(18, 'var(--band-ink-2)') }
    : { lead: c ? lineBullet(c, 18) : unsortedBullet(18, 'var(--band-ink-2)') });
  if (await M.hasHostAccess()) scan(fresh.map((b) => b.id), { quiet: true });
  return fresh;
}

async function saveAllTabs() {
  const ok = await chrome.permissions.request({ permissions: ['tabs'] }).catch(() => false);
  if (!ok) { toast('Ember needs the “tabs” permission to read your open tabs.'); return; }
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const urls = tabs.map((t) => t.url).filter((u) => M.isSavable(u));
  if (!urls.length) { toast('No web pages open in this window'); return; }
  const name = 'Session · ' + new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date());
  const c = { id: M.uid(), name, code: 'S', color: nextColor(), parentId: null, order: roots().length, expanded: false, createdAt: Date.now() };
  await putCollections([c]);
  const titles = new Map(tabs.map((t) => [t.url, t.title]));
  const existing = new Set(S.bookmarks.filter((b) => !b.trashedAt).map((b) => M.normalizeUrl(b.url)));
  const fresh = urls.filter((u) => !existing.has(M.normalizeUrl(u))).map((url) => M.newBookmark({ url, title: titles.get(url), collectionId: c.id }));
  await putBookmarks(fresh);
  go('#/c/' + c.id);
  toast(`Saved ${plural(fresh.length, 'tab')} to ${name}${urls.length - fresh.length ? ` (${urls.length - fresh.length} already saved)` : ''}`, { lead: lineBullet(c, 18) });
  if (await M.hasHostAccess()) scan(fresh.map((b) => b.id), { quiet: true });
}

// ======================= scanning: link health, page text, previews =======================

// One request per link answers three questions: is it alive, what does the page say, and what does it look like.
// check: record link health. Page text and missing previews are filled from the same response when available.
async function scan(ids, { kind = 'quiet', quiet = false, onProgress } = {}) {
  if (!navigator.onLine) { if (!quiet) toast('You’re offline. Connect and try again.'); return 0; }
  const job = { kind, cancelled: false, done: 0, total: ids.length };
  if (!quiet) S.scan = job;
  const queue = [...ids];
  const pendingDead = [];
  let reached = false;
  // Write each result straight to the database; the in-memory index is rebuilt once at the end.
  const save = async (b) => { b.updatedAt = Date.now(); delete b._hay; await db.put('bookmarks', clean(b)); };
  const worker = async () => {
    while (queue.length && !job.cancelled) {
      const id = queue.shift();
      const b = S.bm.get(id);
      if (!b) continue;
      if (kind === 'covers') {
        const cur = S.bm.get(id);
        if (cur && /^https?:/i.test(cur.cover || '')) {
          await M.setCover(cur, await M.storeImage(cur.cover));
          cur.coverSource = cur.cover ? 'page' : '';
          await save(cur);
        }
        job.done++;
        onProgress?.(job.done, ids.length);
        continue;
      }
      const wantHtml = !b.textAt || !b.metaFetched;
      const r = await M.probe(b.url, { wantHtml });
      const cur = S.bm.get(id);
      if (cur) {
        const health = { ...r.health, checkedAt: Date.now() };
        if (r.network && !reached) {
          // Hold "unreachable" results until at least one site answers: a dead connection is not a dead library.
          pendingDead.push([cur, health]);
          if (pendingDead.length >= 8) {
            job.cancelled = true;
            toast('Ember couldn’t reach any site. Check your connection and try again.');
          }
        } else {
          if (!r.network) reached = true;
          cur.health = health;
          if (r.html) await absorbPage(cur, r.html);
          await save(cur);
        }
      }
      if (reached && pendingDead.length) {
        for (const [pb, ph] of pendingDead.splice(0)) { pb.health = ph; await save(pb); }
      }
      job.done++;
      onProgress?.(job.done, ids.length);
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  if (!job.cancelled) for (const [pb, ph] of pendingDead) { pb.health = ph; await save(pb); }
  if (S.scan === job) S.scan = null;
  if (kind === 'links' && !job.cancelled) { S.ui.lastCheck = Date.now(); saveUI(); }
  index();
  renderAll();
  return job.done;
}

// Fill page text and any missing preview details from fetched HTML.
async function absorbPage(b, html) {
  if (!b.textAt) {
    const text = htmlToText(html);
    if (await M.saveText(b.id, text)) {
      b.textAt = Date.now();
      if (S.texts) { const t = M.tidyText(text); S.texts.set(b.id, { raw: t, low: t.toLowerCase() }); }
    }
  }
  if (!b.metaFetched) {
    const meta = M.parseMeta(html, b.url);
    const host = M.hostOf(b.url);
    if (meta.title && (!b.title || b.title === host || b.title === b.url)) b.title = meta.title.slice(0, 300);
    if (meta.excerpt && !b.excerpt) b.excerpt = meta.excerpt.slice(0, 600);
    if (meta.image && !b.cover) { b.cover = await M.storeImage(meta.image); if (b.cover) b.coverSource = 'page'; }
    b.metaFetched = true;
  }
}

function htmlToText(html) {
  // Break lines at block ends so words from neighbouring blocks don't run together.
  html = html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h[1-6]|tr|td|th|section|article|blockquote|pre|dd|dt|figcaption)>/gi, '$&\n');
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script, style, noscript, template, svg, nav, header, footer, aside, form, iframe').forEach((n) => n.remove());
  const root = doc.querySelector('article, main, [role="main"]') || doc.body;
  return root ? root.textContent : '';
}

// Screen readers hear the start, each quarter, and the end; the visual panel updates on every link.
let announcedQuarter = -1;
function announce(msg) {
  const el = $('#announce');
  if (el) { el.textContent = ''; setTimeout(() => { el.textContent = msg; }, 50); }
}

function renderScanStatus() {
  const el = $('#scan-status');
  if (!el) return;
  const j = S.scan;
  el.hidden = !j;
  if (!j) { announcedQuarter = -1; return; }
  const what = { links: 'Checking links', text: 'Indexing pages', previews: 'Fetching previews', covers: 'Storing covers' }[j.kind] || 'Reading pages';
  const quarter = Math.floor((j.done / j.total) * 4);
  if (quarter !== announcedQuarter && quarter < 4) {
    announcedQuarter = quarter;
    announce(quarter === 0 ? `${what}: ${j.total.toLocaleString()} to go.` : `${what}: ${quarter * 25}% done.`);
  }
  el.innerHTML = `<div class="scan-line"><span>${what}</span><span class="tnum">${j.done.toLocaleString()} / ${j.total.toLocaleString()}</span><button class="icon-btn sm" data-act="scan-cancel" aria-label="Stop">${icon('x', 14)}</button></div><div class="progress"><i style="width:${(j.done / j.total) * 100}%"></i></div>`;
}

const SCAN_KINDS = {
  links: { pick: (b) => true, verb: 'Checking' },
  text: { pick: (b) => !b.textAt, verb: 'Indexing' },
  previews: { pick: (b) => !b.metaFetched, verb: 'Reading' },
  covers: { pick: (b) => /^https?:/i.test(b.cover || ''), verb: 'Storing' },
};

async function startScan(kind, ids) {
  // permissions.request must run inside the click, before any other await.
  const granted = await chrome.permissions.request({ origins: ['<all_urls>'] }).catch(() => false);
  if (!granted) { toast('Ember needs permission to read sites for this. Nothing was fetched.'); return; }
  ids ??= S.bookmarks.filter((b) => !b.trashedAt && SCAN_KINDS[kind].pick(b)).map((b) => b.id);
  if (!ids.length) return;
  const total = ids.length;
  const run = scan(ids, {
    kind,
    onProgress: (n) => {
      renderScanStatus();
      const row = $(`#row-${kind}`);
      if (!row) return;
      const p = $('.progress', row);
      p.hidden = false;
      p.firstElementChild.style.width = (n / total) * 100 + '%';
      $('.what span', row).textContent = `${SCAN_KINDS[kind].verb} ${n.toLocaleString()} of ${total.toLocaleString()}…`;
    },
  });
  if (S.route.kind === 'settings') renderSettings();
  else renderSubbar();
  renderScanStatus();
  const done = await run;
  renderScanStatus();
  const msg = {
    links: () => S.counts.broken ? `Checked ${plural(done, 'link')}: ${S.counts.dead} dead, ${S.counts.broken - S.counts.dead} need a look` : `Checked ${plural(done, 'link')}. All working`,
    text: () => `Indexed ${plural(S.counts.indexed, 'page')} for full-text search`,
    previews: () => 'Previews updated',
    covers: () => 'Covers are now stored on this computer',
  }[kind];
  announce(msg());
  toast(msg(), kind === 'links' && S.counts.broken && S.route.kind !== 'broken' ? { action: 'Review', onAction: () => go('#/broken') } : {});
}

// ======================= drawer (edit) =======================

function openDrawer(id) {
  const b = S.bm.get(id);
  if (!b) return;
  S.editing = id;
  renderDrawer();
  const d = $('#drawer');
  d.classList.add('open');
  d.setAttribute('aria-hidden', 'false');
  $('#scrim').classList.add('show');
  $('.app').inert = true;
  setTimeout(() => $('#d-title')?.focus({ preventScroll: true }), 60);
}

function closeDrawer() {
  if (!S.editing) return false;
  saveDrawer.flush();
  const id = S.editing;
  S.editing = null;
  const d = $('#drawer');
  d.classList.remove('open');
  d.setAttribute('aria-hidden', 'true');
  $('#scrim').classList.remove('show');
  $('.app').inert = false;
  // Return focus to the card that was being edited.
  $(`#grid .card[data-id="${id}"] .card-title`)?.focus({ preventScroll: true });
  return true;
}

function renderDrawer() {
  const b = S.bm.get(S.editing);
  const col = S.col.get(b.collectionId);
  const d = $('#drawer');
  d.innerHTML = `
    <div class="drawer-head" style="--c:${col?.color || 'var(--ink-3)'}">
      ${col ? lineBullet(col, 22) : unsortedBullet(22, 'var(--ink-3)')}
      <h2>Edit link</h2>
      <span class="saved" id="d-saved">${icon('check', 14)} Saved</span>
      <button class="icon-btn" data-act="close-drawer" aria-label="Close (Esc)">${icon('x', 18)}</button>
    </div>
    <div class="drawer-body">
      <div class="drawer-cover" id="d-cover">${coverHTML(b, col)}
        <div class="cover-tools">
          ${M.hasChrome ? `<button class="btn sm" data-act="refetch" title="Read title, description and cover from the page">${icon('refresh', 15)} Refresh</button>` : ''}
          ${b.cover ? `<button class="btn sm" data-act="remove-cover">${icon('x', 15)} Remove cover</button>` : ''}
        </div>
      </div>
      <div class="field"><label for="d-title">Title</label><textarea class="textarea title-input" id="d-title" rows="1">${esc(b.title)}</textarea></div>
      <div class="field"><label for="d-url">Address</label>
        <div class="url-row"><input class="input" id="d-url" value="${esc(b.url)}" spellcheck="false">
        <a class="btn" href="${esc(b.url)}" target="_blank" rel="noopener noreferrer" title="Open">${icon('external', 16)}</a>
        <button class="btn" data-act="copy-url" title="Copy">${icon('copy', 16)}</button></div>
      </div>
      <div class="field"><label>Line</label><button class="picker" id="d-line">${col ? lineBullet(col, 18) : unsortedBullet(18, 'var(--ink-3)')}<span class="name">${esc(col ? pathOf(col.id).map((x) => x.name).join(' › ') : 'Unsorted')}</span>${icon('chevronDown', 15)}</button></div>
      <div class="field"><label for="d-tag-input">Tags</label><div class="tags-input" id="d-tags">${b.tags.map((t) => `<span class="chip">#${esc(t)}<button data-act="rm-tag" data-t="${esc(t)}" aria-label="Remove ${esc(t)}">${icon('x', 12)}</button></span>`).join('')}<input id="d-tag-input" placeholder="${b.tags.length ? '' : 'Add tags…'}" autocomplete="off"></div></div>
      <div class="field"><label for="d-excerpt">Description</label><textarea class="textarea" id="d-excerpt" rows="3">${esc(b.excerpt)}</textarea></div>
      <div class="field"><label for="d-note">Note</label><textarea class="textarea" id="d-note" rows="4" placeholder="Why you saved it, what to remember…">${esc(b.note)}</textarea></div>
      <div class="toggle-row"><span style="font-weight:600;display:flex;gap:8px;align-items:center">${icon('star', 17)} Favorite</span><button class="switch" role="switch" aria-checked="${b.favorite}" data-act="d-fav" aria-label="Favorite"></button></div>
      <dl class="drawer-meta"><dt>Saved</dt><dd>${esc(fullDate(b.createdAt))}</dd><dt>Edited</dt><dd>${esc(fullDate(b.updatedAt))}</dd><dt>Type</dt><dd>${esc(b.type)}</dd><dt>Link</dt><dd>${b.health ? `${esc({ ok: 'Working', dead: 'Dead', warn: 'Unverified', moved: 'Moved' }[b.health.state])}${b.health.code ? ` · ${b.health.code}` : ''}${b.health.note ? ` · ${esc(b.health.note)}` : ''} · checked ${esc(relTime(b.health.checkedAt))}` : 'Not checked yet'}</dd><dt>Page text</dt><dd>${b.textAt ? `Indexed ${esc(relTime(b.textAt))}` : 'Not indexed'}</dd></dl>
    </div>
    <div class="drawer-foot">
      ${b.trashedAt
        ? `<button class="btn" data-act="d-restore">${icon('restore', 16)} Restore</button>`
        : `<button class="btn danger" data-act="d-trash">${icon('trash', 16)} Move to Trash</button>`}
      <span class="spacer"></span>
      <button class="btn primary" data-act="close-drawer">Done</button>
    </div>`;
  hydrate(d);
  autosize($('#d-title'));
  for (const id of ['d-title', 'd-url', 'd-excerpt', 'd-note']) $('#' + id).addEventListener('input', (e) => { if (e.target.id === 'd-title') autosize(e.target); saveDrawer(); });
  $('#d-line').addEventListener('click', (e) => linePicker(e.currentTarget, b.collectionId, async (cid) => {
    b.collectionId = cid;
    await putBookmarks([b]);
    renderDrawer();
    renderAll();
  }));
  wireTagInput(b);
}

function autosize(t) { t.style.height = 'auto'; t.style.height = t.scrollHeight + 2 + 'px'; }

const saveDrawer = debounce(async () => {
  const b = S.bm.get(S.editing);
  if (!b || !$('#d-title')) return;
  const url = $('#d-url').value.trim();
  b.title = $('#d-title').value.trim() || M.hostOf(url) || url;
  if (M.isSavable(url) && url !== b.url) { b.url = url; b.type = M.detectType(url); }
  b.excerpt = $('#d-excerpt').value;
  b.note = $('#d-note').value;
  await putBookmarks([b]);
  const s = $('#d-saved');
  if (s) { s.classList.add('show'); clearTimeout(s._t); s._t = setTimeout(() => s.classList.remove('show'), 1400); }
  refreshCard(b.id);
}, 400);

function refreshCard(id) {
  const old = $(`#grid .card[data-id="${id}"]`);
  const b = S.bm.get(id);
  if (!old || !b) return;
  const tmp = document.createElement('div');
  tmp.innerHTML = cardHTML(b);
  const card = tmp.firstElementChild;
  const restoreFocus = focusMemo();
  old.replaceWith(card);
  hydrate(card);
  restoreFocus();
}

function wireTagInput(b) {
  const input = $('#d-tag-input');
  const commit = async (raw) => {
    const add = M.normalizeTags(raw.split(','));
    if (!add.length) return;
    b.tags = M.normalizeTags([...b.tags, ...add]);
    await putBookmarks([b]);
    renderDrawer();
    $('#d-tag-input')?.focus();
    renderBand();
    refreshCard(b.id);
  };
  const suggest = () => {
    const q = input.value.trim().replace(/^#/, '').toLowerCase();
    if (!q) { closeMenu(); return; }
    const list = [...S.counts.tags.keys()].filter((t) => t.includes(q) && !b.tags.includes(t)).slice(0, 6);
    if (!list.length) { closeMenu(); return; }
    openMenu($('#d-tags'), (m) => {
      m.innerHTML = list.map((t) => menuItem({ label: '#' + t, attrs: `data-t="${esc(t)}"` })).join('');
      m.addEventListener('mousedown', (e) => e.preventDefault());
      m.addEventListener('click', (e) => { const t = e.target.closest('[data-t]')?.dataset.t; if (t) { closeMenu(); commit(t); } });
    });
    input.focus();
  };
  input.addEventListener('input', () => {
    if (input.value.includes(',')) { const v = input.value; input.value = ''; closeMenu(); commit(v); return; }
    suggest();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); const v = input.value; input.value = ''; closeMenu(); commit(v); }
    if (e.key === 'Backspace' && !input.value && b.tags.length) { b.tags.pop(); putBookmarks([b]).then(() => { renderDrawer(); $('#d-tag-input')?.focus(); renderBand(); refreshCard(b.id); }); }
  });
  input.addEventListener('blur', () => { if (input.value.trim()) { const v = input.value; input.value = ''; commit(v); } });
  $('#d-tags').addEventListener('click', (e) => { if (e.target.id === 'd-tags') input.focus(); });
}

// ======================= settings =======================

// Stored images no bookmark (live or trashed) refers to any more.
async function orphanMedia() {
  const used = new Set(S.bookmarks.map((b) => b.cover).filter((c) => c?.startsWith('media:')).map((c) => c.slice(6)));
  return (await db.keys('media')).filter((k) => !used.has(k));
}

function scanRow(kind, title, status, count, label, extra = '') {
  const running = S.scan?.kind === kind;
  const busy = S.scan && !running;
  return `<div class="row" id="row-${kind}"><div class="what"><b>${title}</b><span>${status}</span><div class="progress" ${running ? '' : 'hidden'}><i style="width:${running ? (S.scan.done / S.scan.total) * 100 : 0}%"></i></div></div>
    <div class="act">${extra}${running
      ? `<button class="btn" data-act="scan-cancel">Stop</button>`
      : `<button class="btn" data-act="scan" data-kind="${kind}" ${count && M.hasChrome && !busy ? '' : 'disabled'}>${icon(kind === 'text' ? 'search' : 'refresh', 16)} ${label}</button>`}</div></div>`;
}

async function renderSettings() {
  const content = $('#content');
  const est = navigator.storage?.estimate ? await navigator.storage.estimate().catch(() => null) : null;
  const host = await M.hasHostAccess();
  const missing = S.bookmarks.filter((b) => !b.trashedAt && !b.metaFetched).length;
  const remote = S.bookmarks.filter((b) => !b.trashedAt && /^https?:/i.test(b.cover || '')).length;
  const orphans = await orphanMedia();
  const dupes = baseSet({ kind: 'duplicates' }).length;
  if (S.route.kind !== 'settings') return;
  const mb = est?.usage ? (est.usage / 1048576).toFixed(1) + ' MB' : '—';
  content.innerHTML = `<div class="settings">
    <section>
      <h2>${icon('download', 20)} Bring links in</h2>
      <p>Folders become lines, and links you already have are skipped.</p>
      <div class="rows">
        ${M.hasChrome ? `<div class="row"><div class="what"><b>Chrome bookmarks</b><span>Copies your bookmarks bar and other folders into Ember. Chrome’s own bookmarks are left untouched.</span></div><div class="act"><button class="btn primary" data-act="import-chrome">${icon('download', 16)} Import</button></div></div>` : ''}
        <div class="row"><div class="what"><b>Bookmark HTML file</b><span>The standard export from Chrome, Edge, Firefox, Safari, Raindrop or Pocket. Tags and descriptions are kept.</span></div><div class="act"><button class="btn" data-act="import-html">${icon('upload', 16)} Choose file</button></div></div>
        <div class="row"><div class="what"><b>Ember backup</b><span>Restores lines, links, notes and screenshots from a JSON backup. Matching links are updated.</span></div><div class="act"><button class="btn" data-act="import-json">${icon('upload', 16)} Restore</button></div></div>
      </div>
    </section>
    <section>
      <h2>${icon('upload', 20)} Take links out</h2>
      <p>Your data is yours. Export at any time; nothing is kept anywhere but this browser profile.</p>
      <div class="rows">
        <div class="row"><div class="what"><b>Bookmark HTML</b><span>Lines become folders. Import it into Chrome via Bookmark manager › Import, or into any other browser.</span></div><div class="act"><button class="btn" data-act="export-html">${icon('download', 16)} Export</button></div></div>
        <div class="row"><div class="what"><b>Full backup (JSON)</b><span>Everything, including notes, saved screenshots and indexed page text.</span></div><div class="act"><button class="btn" data-act="export-json">${icon('download', 16)} Back up</button></div></div>
      </div>
    </section>
    <section>
      <h2>${icon('refresh', 20)} Health &amp; search</h2>
      <p>Ember reads each saved page directly: once to see if it still works, and to keep its text for full-text search. One request per link, four at a time. Cover images are downloaded once and kept on this computer; the library never loads anything from the web while you browse it.</p>
      <div class="rows">
        ${scanRow('links', 'Broken links',
          !S.counts.checked ? 'No links checked yet.' : `${S.counts.dead ? plural(S.counts.dead, 'dead link') : 'No dead links'}${S.counts.broken - S.counts.dead ? `, ${S.counts.broken - S.counts.dead} to look at` : ''}${S.ui.lastCheck ? ` · last full check ${relTime(S.ui.lastCheck)}` : ''}.`,
          S.counts.all, `Check ${S.counts.all.toLocaleString()}`,
          S.counts.broken ? `<a class="btn ghost" href="#/broken">Review ${S.counts.broken}</a>` : '')}
        ${scanRow('text', 'Full-text search',
          `${S.counts.indexed.toLocaleString()} of ${plural(S.counts.all, 'page')} indexed. Pages you save from the toolbar are indexed automatically.`,
          S.counts.all - S.counts.indexed, `Index ${(S.counts.all - S.counts.indexed).toLocaleString()}`)}
        ${scanRow('previews', 'Missing previews',
          missing ? `${plural(missing, 'link')} without a title, description or cover read from the page.` : 'Every link has its preview details.',
          missing, `Fetch ${missing.toLocaleString()}`)}
        ${remote ? scanRow('covers', 'Covers not stored yet',
          `${plural(remote, 'cover')} still point${remote === 1 ? 's' : ''} at another website, so ${remote === 1 ? 'it shows' : 'they show'} a placeholder. Store them once and they load from this computer.`,
          remote, `Store ${remote.toLocaleString()}`) : ''}
        ${host ? `<div class="row"><div class="what"><b>Site access</b><span>Granted. Ember uses it only for the actions above and the Refresh button.</span></div><div class="act"><button class="btn ghost" data-act="revoke-host">Revoke</button></div></div>` : ''}
      </div>
    </section>
    <section>
      <h2>${icon('duplicate', 20)} Tidy up</h2>
      <div class="rows">
        <div class="row"><div class="what"><b>Duplicates</b><span>${dupes ? `${plural(dupes, 'link')} share an address with another link.` : 'No duplicate addresses.'}</span></div><div class="act"><a class="btn" href="#/duplicates">${icon('duplicate', 16)} Review</a></div></div>
        <div class="row"><div class="what"><b>Unused images</b><span>${orphans.length ? `${plural(orphans.length, 'stored image')} no longer belong to any link.` : 'Every stored image belongs to a link.'}</span></div><div class="act"><button class="btn" data-act="reclaim" ${orphans.length ? '' : 'disabled'}>${icon('trash', 16)} Reclaim space</button></div></div>
        <div class="row"><div class="what"><b>Trash</b><span>${S.counts.trash ? `${plural(S.counts.trash, 'link')} in Trash.` : 'Trash is empty.'}</span></div><div class="act"><a class="btn" href="#/trash">${icon('trash', 16)} Open Trash</a></div></div>
      </div>
    </section>
    <section>
      <h2>${icon('sun', 20)} Appearance</h2>
      <div class="rows"><div class="row"><div class="what"><b>Theme</b><span>The signage band stays dark; the work area follows this setting.</span></div>
        <div class="act"><div class="seg" role="group" aria-label="Theme">${['system', 'light', 'dark'].map((t) => `<button data-theme-set="${t}" aria-pressed="${S.ui.theme === t}">${icon(t === 'dark' ? 'moon' : t === 'light' ? 'sun' : 'monitor', 15)} ${t[0].toUpperCase() + t.slice(1)}</button>`).join('')}</div></div></div></div>
    </section>
    <section>
      <h2>${icon('keyboard', 20)} Shortcuts</h2>
      <div class="rows"><div class="keys">
        <div>Save current page <span><kbd>Alt</kbd><kbd>Shift</kbd><kbd>S</kbd></span></div>
        <div>Open Ember <span><kbd>Alt</kbd><kbd>Shift</kbd><kbd>E</kbd></span></div>
        <div>Search from address bar <span><kbd>em</kbd><kbd>Space</kbd></span></div>
        <div>Search <span><kbd>/</kbd></span></div>
        <div>Add link <span><kbd>N</kbd></span></div>
        <div>Switch view <span><kbd>1</kbd>–<kbd>4</kbd></span></div>
        <div>Edit focused link <span><kbd>E</kbd></span></div>
        <div>Favorite focused link <span><kbd>F</kbd></span></div>
        <div>Select all <span><kbd>Ctrl</kbd><kbd>A</kbd></span></div>
        <div>Trash selection <span><kbd>Del</kbd></span></div>
        <div>Rename focused line <span><kbd>F2</kbd></span></div>
      </div></div>
      ${M.hasChrome ? `<p class="settings-note">Change the keyboard shortcuts at chrome://extensions/shortcuts.</p>` : ''}
    </section>
    <section>
      <h2>${icon('cards', 20)} Library</h2>
      <div class="rows"><div class="row"><div class="what"><b class="tnum">${plural(S.counts.all, 'link')} on ${plural(S.collections.length, 'line')}, ${plural(S.counts.tags.size, 'tag')}</b><span>Using ${mb} of local storage in this Chrome profile.</span></div></div></div>
    </section>
  </div>`;
}

let importing = false;
async function guarded(fn) {
  if (importing) return;
  importing = true;
  try { await fn(); } catch (e) { toast(`Import failed: ${e.message || e}`); } finally { importing = false; }
}

async function doImportChrome() {
  if (!M.hasChrome) return;
  const known = new Set(S.bookmarks.filter((b) => !b.trashedAt).map((b) => M.normalizeUrl(b.url)));
  const res = await IO.importChrome(known);
  if (!res.bookmarks.length) { toast(res.skipped ? `Nothing new: all ${res.skipped} Chrome bookmarks are already here` : 'Chrome has no bookmarks to import'); return; }
  await IO.commitImport(res, roots().length);
  await load();
  go('#/all');
  toast(`Imported ${plural(res.bookmarks.length, 'link')} into ${plural(res.collections.length, 'line')}${res.skipped ? ` · ${res.skipped} already here` : ''}`, { lead: lineBullet({ code: 'IN', color: lineColor('Teal') }, 18) });
}

async function doImportHTML() {
  const file = await pickFile($('#file-html'));
  if (!file) return;
  const known = new Set(S.bookmarks.filter((b) => !b.trashedAt).map((b) => M.normalizeUrl(b.url)));
  const res = IO.parseNetscape(await file.text(), known);
  if (!res.bookmarks.length) { toast(res.skipped ? `Nothing new: all ${res.skipped} links are already here` : 'No bookmarks found in that file'); return; }
  await IO.commitImport(res, roots().length);
  await load();
  go('#/all');
  toast(`Imported ${plural(res.bookmarks.length, 'link')} into ${plural(res.collections.length, 'line')}${res.skipped ? ` · ${res.skipped} already here` : ''}`);
}

async function doImportJSON() {
  const file = await pickFile($('#file-json'));
  if (!file) return;
  try {
    const r = await IO.restoreBackup(await file.text());
    mediaCache.clear();
    await load();
    renderAll();
    toast(`Restored ${plural(r.bookmarks, 'link')} and ${plural(r.collections, 'line')}${r.skipped ? ` · ${plural(r.skipped, 'damaged entry', 'damaged entries')} skipped` : ''}`);
  } catch (e) {
    toast(e instanceof SyntaxError ? 'That file is not valid JSON.' : e.message);
  }
}

const stamp = () => new Date().toISOString().slice(0, 10);

// ======================= events =======================

function bindEvents() {
  window.addEventListener('hashchange', onRoute);

  document.addEventListener('click', async (e) => {
    const t = e.target;

    // station breadcrumb
    const hrefBtn = t.closest('[data-href]');
    if (hrefBtn) { go(hrefBtn.dataset.href); return; }

    // view / type / theme toggles
    const v = t.closest('[data-view]');
    if (v) { setView(v.dataset.view); return; }
    const ty = t.closest('[data-type]');
    if (ty) { S.type = ty.dataset.type; S.limit = PAGE; refreshList(); return; }
    const th = t.closest('[data-theme-set]');
    if (th) { setTheme(th.dataset.themeSet); return; }

    const tagBtn = t.closest('.tag[data-tag]');
    if (tagBtn) { e.preventDefault(); go('#/tag/' + encodeURIComponent(tagBtn.dataset.tag)); return; }

    const actEl = t.closest('[data-act]');
    const card = t.closest('.card');

    // card body click in selection mode toggles selection
    if (card && (!actEl || actEl.dataset.act === 'select') && (S.selected.size || actEl || e.shiftKey)) {
      if (t.closest('a.card-title') && !S.selected.size && !e.shiftKey && !actEl) return;
      e.preventDefault();
      toggleSelect(card.dataset.id, e.shiftKey);
      return;
    }
    if (!actEl) return;
    const act = actEl.dataset.act;
    const id = card?.dataset.id;

    switch (act) {
      case 'add': addPopover(actEl); break;
      case 'toggle-band': {
        const open = $('#band').classList.toggle('open');
        $('#scrim').classList.toggle('show', open);
        if (open) $('#band .stop')?.focus();
        break;
      }
      case 'clear-search': setQuery(''); $('#search').focus(); break;
      case 'search-all': go('#/all'); break;
      case 'select-all': selectAll(); break;
      case 'edit': openDrawer(id); break;
      case 'fav': setFavorite(selectionOr(id), !S.bm.get(id).favorite); break;
      case 'card-menu': cardMenu(actEl, id); break;
      case 'restore': restore(selectionOr(id)); break;
      case 'destroy': if (armConfirm(actEl, '')) destroy(selectionOr(id)); else toast('Click the trash icon again to delete forever'); break;
      case 'new-line': e.preventDefault(); newLine(null); break;
      case 'twisty': {
        e.preventDefault();
        const c = S.col.get(actEl.closest('[data-id]').dataset.id);
        c.expanded = !c.expanded;
        await putCollections([c]);
        renderBand();
        break;
      }
      case 'line-menu': e.preventDefault(); lineMenu(actEl, actEl.closest('[data-id]').dataset.id); break;
      case 'more-tags': S.showAllTags = !S.showAllTags; renderBand(); break;
      case 'theme': setTheme({ system: 'light', light: 'dark', dark: 'system' }[S.ui.theme]); break;
      case 'empty-trash': if (armConfirm(actEl, 'Delete all forever?')) destroy(S.bookmarks.filter((b) => b.trashedAt).map((b) => b.id)); break;
      case 'dedupe': dedupe(); break;
      case 'open-all': openTabs(S.list.map((b) => b.url)); break;
      // bulk
      case 'bulk-clear': S.selected.clear(); renderSelection(); break;
      case 'bulk-trash': trash([...S.selected]); break;
      case 'bulk-restore': restore([...S.selected]); break;
      case 'bulk-destroy': if (armConfirm(actEl, 'Confirm delete')) destroy([...S.selected]); break;
      case 'bulk-fav': setFavorite([...S.selected], ![...S.selected].every((x) => S.bm.get(x).favorite)); break;
      case 'bulk-open': openTabs([...S.selected].map((x) => S.bm.get(x).url)); break;
      case 'bulk-move': linePicker(actEl, null, (cid) => move([...S.selected], cid), { title: `Move ${plural(S.selected.size, 'link')} to` }); break;
      case 'bulk-tag': tagPrompt(actEl, (tags) => addTags([...S.selected], tags)); break;
      // drawer
      case 'close-drawer': closeDrawer(); break;
      case 'copy-url': navigator.clipboard.writeText($('#d-url').value).then(() => toast('Link copied')); break;
      case 'rm-tag': {
        const b = S.bm.get(S.editing);
        b.tags = b.tags.filter((x) => x !== actEl.dataset.t);
        await putBookmarks([b]);
        renderDrawer(); renderBand(); refreshCard(b.id);
        break;
      }
      case 'd-fav': {
        const b = S.bm.get(S.editing);
        b.favorite = !b.favorite;
        actEl.setAttribute('aria-checked', b.favorite);
        await putBookmarks([b]);
        renderBand(); refreshCard(b.id);
        break;
      }
      case 'd-trash': { const bid = S.editing; closeDrawer(); trash([bid]); break; }
      case 'd-restore': { const bid = S.editing; closeDrawer(); restore([bid]); break; }
      case 'remove-cover': {
        const b = S.bm.get(S.editing);
        await M.setCover(b, '');
        b.coverSource = '';
        await putBookmarks([b]);
        renderDrawer(); refreshCard(b.id);
        break;
      }
      case 'refetch': {
        const granted = await chrome.permissions.request({ origins: ['<all_urls>'] }).catch(() => false);
        if (!granted) { toast('Ember needs permission to read the page.'); break; }
        const b = S.bm.get(S.editing);
        actEl.disabled = true;
        const r = await M.probe(b.url, { wantHtml: true });
        b.health = { ...r.health, checkedAt: Date.now() };
        if (r.html) {
          const meta = M.parseMeta(r.html, b.url);
          if (meta.title) b.title = meta.title;
          if (meta.excerpt) b.excerpt = meta.excerpt;
          if (meta.image) {
            const stored = await M.storeImage(meta.image);
            if (stored) { await M.setCover(b, stored); b.coverSource = 'page'; }
          }
          b.metaFetched = true;
          b.textAt = 0;
          await absorbPage(b, r.html);
        }
        await putBookmarks([b]);
        renderDrawer(); refreshCard(b.id); renderBand();
        toast(r.html ? 'Details, page text and link status refreshed' : `Couldn’t read the page: ${b.health.note || 'no HTML returned'}`);
        break;
      }
      // settings
      case 'import-chrome': guarded(doImportChrome); break;
      case 'import-html': guarded(doImportHTML); break;
      case 'import-json': guarded(doImportJSON); break;
      case 'export-html': download(`ember-bookmarks-${stamp()}.html`, new Blob([IO.toNetscape(S)], { type: 'text/html' })); break;
      case 'export-json': download(`ember-backup-${stamp()}.json`, await IO.toBackup()); break;
      case 'scan': startScan(actEl.dataset.kind); break;
      case 'scan-cancel': if (S.scan) S.scan.cancelled = true; break;
      case 'recheck': startScan('links', S.list.map((x) => x.id)); break;
      case 'trash-dead': trash(S.bookmarks.filter((x) => !x.trashedAt && x.health?.state === 'dead').map((x) => x.id)); break;
      case 'reclaim': {
        const ids = await orphanMedia();
        await db.delMany('media', ids);
        toast(`Removed ${plural(ids.length, 'unused image')}`);
        renderSettings();
        break;
      }
      case 'revoke-host': await chrome.permissions.remove({ origins: ['<all_urls>'] }); renderSettings(); toast('Site access revoked'); break;
    }
  });

  // close band on mobile when clicking a stop
  $('#band').addEventListener('click', (e) => {
    if (e.target.closest('a.stop') && S.renaming && !e.target.closest('input')) S.renaming = null;
  });

  // right-click on a line opens its menu
  $('#band').addEventListener('contextmenu', (e) => {
    const stop = e.target.closest('.stop[data-id]');
    if (!stop) return;
    e.preventDefault();
    lineMenu({ x: e.clientX, y: e.clientY }, stop.dataset.id);
  });
  $('#content').addEventListener('contextmenu', (e) => {
    const card = e.target.closest('.card');
    if (!card || S.route.kind === 'trash') return;
    e.preventDefault();
    cardMenu({ x: e.clientX, y: e.clientY }, card.dataset.id);
  });

  // inline rename
  $('#band').addEventListener('keydown', (e) => {
    if (!e.target.matches('input.rename')) return;
    if (e.key === 'Enter') { e.preventDefault(); renameLine(S.renaming, e.target.value); }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); S.renaming = null; renderBand(); }
  });
  $('#band').addEventListener('focusout', (e) => {
    if (e.target.matches('input.rename') && S.renaming) renameLine(S.renaming, e.target.value);
  });
  $('#band').addEventListener('click', (e) => { if (e.target.matches('input.rename')) e.preventDefault(); }, true);
  $('#band').addEventListener('dblclick', (e) => {
    const stop = e.target.closest('.stop[data-id]');
    if (stop) { S.renaming = stop.dataset.id; renderBand(); }
  });

  // search
  const typeSearch = debounce((v) => setQuery(v), 110);
  $('#station').addEventListener('input', (e) => {
    if (e.target.id !== 'search') return;
    S.query = e.target.value;
    syncSearchChrome();
    typeSearch(e.target.value);
  });
  $('#station').addEventListener('keydown', (e) => {
    if (e.target.id !== 'search') return;
    if (e.key === 'Escape') { e.stopPropagation(); if (S.query) setQuery(''); else e.target.blur(); }
    if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); $('#grid .card-title')?.focus(); }
  });

  // sort + size
  $('#subbar').addEventListener('change', (e) => {
    if (e.target.id === 'sort') { S.ui.sort = e.target.value; saveUI(); S.limit = PAGE; refreshList(); }
  });
  $('#subbar').addEventListener('input', (e) => {
    if (e.target.id === 'size') {
      S.ui.size = +e.target.value;
      $('#grid')?.style.setProperty('--card-w', S.ui.size + 'px');
      saveUI();
    }
  });

  $('#scrim').addEventListener('click', () => { if (!closeDrawer()) closeBandOnMobile(); });

  // keyboard
  document.addEventListener('keydown', (e) => {
    const typing = e.target.matches('input, textarea, select, [contenteditable]');
    if (e.key === 'F2' && e.target.closest?.('.line-stop')) {
      e.preventDefault();
      S.renaming = e.target.closest('.line-stop').dataset.id;
      renderBand();
      return;
    }
    if (e.key === 'Escape') {
      if (isMenuOpen()) return;
      if (closeDrawer()) return;
      if ($('#band').classList.contains('open')) { closeBandOnMobile(); return; }
      if (S.selected.size) { S.selected.clear(); renderSelection(); return; }
      if (S.query && !typing) { setQuery(''); return; }
      return;
    }
    if (typing || e.altKey) return;
    if ((e.key === '/' && !e.ctrlKey) || (e.key.toLowerCase() === 'k' && (e.ctrlKey || e.metaKey))) { e.preventDefault(); $('#search').focus(); $('#search').select(); return; }
    if (e.ctrlKey || e.metaKey) {
      if (e.key.toLowerCase() === 'a' && $('#grid')) { e.preventDefault(); selectAll(); }
      return;
    }
    if (S.editing) return;
    const card = document.activeElement?.closest?.('.card');
    const id = card?.dataset.id;
    if (e.key === 'n') { e.preventDefault(); addPopover($('.station-tools .btn.primary')); return; }
    if (/^[1-4]$/.test(e.key) && S.route.kind !== 'settings') { setView(VIEWS[+e.key - 1].id); return; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && (S.selected.size || id)) {
      e.preventDefault();
      const ids = S.selected.size ? [...S.selected] : [id];
      if (S.route.kind === 'trash') return;
      trash(ids);
      return;
    }
    if (!id) return;
    if (e.key === 'e') { e.preventDefault(); openDrawer(id); }
    if (e.key === 'f') { e.preventDefault(); setFavorite([id], !S.bm.get(id).favorite).then(() => $(`.card[data-id="${id}"] .card-title`)?.focus()); }
    if (e.key === 'x' || e.key === ' ') { e.preventDefault(); toggleSelect(id, e.shiftKey); }
    if (['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(e.key)) {
      e.preventDefault();
      moveFocus(card, e.key);
    }
  });

  bindDrag();
}

function moveFocus(card, key) {
  const cards = $$('#grid .card');
  const i = cards.indexOf(card);
  if (i < 0) return;
  let next = i;
  if (key === 'ArrowRight') next = i + 1;
  if (key === 'ArrowLeft') next = i - 1;
  if (key === 'ArrowDown' || key === 'ArrowUp') {
    const r = card.getBoundingClientRect();
    const dir = key === 'ArrowDown' ? 1 : -1;
    let best = null, bestD = Infinity;
    for (const c of cards) {
      const cr = c.getBoundingClientRect();
      if (dir * (cr.top - r.top) <= 4) continue;
      const d = Math.abs(cr.top - r.top) * 4 + Math.abs(cr.left - r.left);
      if (d < bestD) { bestD = d; best = c; }
    }
    if (best) next = cards.indexOf(best);
  }
  cards[Math.max(0, Math.min(cards.length - 1, next))]?.querySelector('.card-title')?.focus();
}

function toggleSelect(id, range) {
  if (range && S.anchorId) {
    const ids = S.list.map((b) => b.id);
    const a = ids.indexOf(S.anchorId), b = ids.indexOf(id);
    if (a >= 0 && b >= 0) {
      for (let i = Math.min(a, b); i <= Math.max(a, b); i++) S.selected.add(ids[i]);
      renderSelection();
      return;
    }
  }
  if (S.selected.has(id)) S.selected.delete(id); else S.selected.add(id);
  S.anchorId = id;
  renderSelection();
}

function selectAll() {
  const all = S.list.map((b) => b.id);
  const allOn = all.every((id) => S.selected.has(id));
  S.selected = allOn ? new Set() : new Set(all);
  if (!allOn && S.limit < S.list.length) { S.limit = S.list.length; renderContent(); }
  renderSelection();
}

async function dedupe() {
  const groups = new Map();
  for (const b of S.list) groups.set(M.normalizeUrl(b.url), [...(groups.get(M.normalizeUrl(b.url)) || []), b]);
  const extra = [];
  for (const g of groups.values()) {
    g.sort((a, b) => a.createdAt - b.createdAt);
    // keep the oldest, but carry over tags / notes from the rest
    const keep = g[0];
    for (const d of g.slice(1)) {
      keep.tags = M.normalizeTags([...keep.tags, ...d.tags]);
      if (d.note && !keep.note.includes(d.note)) keep.note = [keep.note, d.note].filter(Boolean).join('\n\n');
      if (!keep.cover && d.cover) keep.cover = d.cover;
      extra.push(d.id);
    }
    await putBookmarks([keep]);
  }
  if (extra.length) trash(extra);
}

function setQuery(q) {
  S.query = q;
  S.limit = PAGE;
  const input = $('#search');
  if (input && input.value !== q) input.value = q;
  refreshList();
}

function setView(view) {
  S.ui.view = view;
  saveUI();
  renderSubbar();
  renderContent();
  renderBulk();
}

function setTheme(theme) {
  S.ui.theme = theme;
  saveUI();
  try { localStorage.setItem('ember-theme', theme); } catch {}
  applyTheme();
  renderBand();
  if (S.route.kind === 'settings') renderSettings();
}

function applyTheme() {
  const dark = S.ui.theme === 'dark' || (S.ui.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

function closeBandOnMobile() {
  if (!$('#band')?.classList.contains('open')) return;
  $('#band').classList.remove('open');
  if (!S.editing) $('#scrim').classList.remove('show');
}

// ======================= drag & drop =======================

const BM_MIME = 'application/x-ember-bookmarks';
const LINE_MIME = 'application/x-ember-line';

function bindDrag() {
  let dragIds = null;
  let dragLine = null;

  document.addEventListener('dragstart', (e) => {
    const card = e.target.closest?.('.card');
    const lineStop = e.target.closest?.('.stop[data-id]');
    if (card) {
      const id = card.dataset.id;
      dragIds = S.selected.has(id) ? [...S.selected] : [id];
      e.dataTransfer.effectAllowed = 'copyMove';
      e.dataTransfer.setData(BM_MIME, JSON.stringify(dragIds));
      e.dataTransfer.setData('text/uri-list', dragIds.map((x) => S.bm.get(x).url).join('\n'));
      e.dataTransfer.setData('text/plain', dragIds.map((x) => S.bm.get(x).url).join('\n'));
      const ghost = document.createElement('div');
      ghost.className = 'drag-ghost';
      const col = S.col.get(S.bm.get(id).collectionId);
      ghost.innerHTML = `${col ? lineBullet(col, 20) : unsortedBullet(20, 'var(--band-ink-2)')}${dragIds.length > 1 ? `${dragIds.length} links` : esc(S.bm.get(id).title.slice(0, 48))}`;
      document.body.appendChild(ghost);
      e.dataTransfer.setDragImage(ghost, 14, 16);
      setTimeout(() => ghost.remove());
      dragIds.forEach((x) => $(`.card[data-id="${x}"]`)?.classList.add('dragging'));
    } else if (lineStop) {
      dragLine = lineStop.dataset.id;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData(LINE_MIME, dragLine);
    }
  });

  document.addEventListener('dragend', () => {
    $$('.dragging').forEach((x) => x.classList.remove('dragging'));
    clearDropMarks();
    dragIds = null;
    dragLine = null;
  });

  const zoneOf = (e) => e.target.closest?.('[data-drop]');
  const clearDropMarks = () => $$('.drop-into, .drop-before, .drop-after').forEach((x) => x.classList.remove('drop-into', 'drop-before', 'drop-after'));
  const lineWhere = (zone, e) => {
    const r = zone.getBoundingClientRect();
    const y = (e.clientY - r.top) / r.height;
    return y < 0.28 ? 'before' : y > 0.72 ? 'after' : 'into';
  };
  const external = (e) => !dragIds && !dragLine && [...e.dataTransfer.types].some((t) => t === 'text/uri-list');

  document.addEventListener('dragover', (e) => {
    const zone = zoneOf(e);
    const overContent = e.target.closest?.('#content');
    if (!zone && !(overContent && external(e))) return;
    if (zone) {
      const kind = zone.dataset.drop;
      if (dragLine) {
        if (kind !== 'line' && kind !== 'root') return;
        if (kind === 'line' && (zone.dataset.id === dragLine || descendants(dragLine).has(zone.dataset.id))) return;
      } else if (!dragIds && !external(e)) return;
      if (!dragLine && kind === 'root') return;
      e.preventDefault();
      clearDropMarks();
      if (dragLine && kind === 'line') zone.classList.add('drop-' + lineWhere(zone, e));
      else zone.classList.add('drop-into');
      e.dataTransfer.dropEffect = external(e) ? 'copy' : 'move';
    } else {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  });

  document.addEventListener('dragleave', (e) => {
    const zone = zoneOf(e);
    if (zone && !zone.contains(e.relatedTarget)) zone.classList.remove('drop-into', 'drop-before', 'drop-after');
  });

  document.addEventListener('drop', async (e) => {
    const zone = zoneOf(e);
    const ext = external(e);
    const overContent = e.target.closest?.('#content');
    if (!zone && !(overContent && ext)) return;
    e.preventDefault();
    const where = zone && dragLine && zone.dataset.drop === 'line' ? lineWhere(zone, e) : null;
    clearDropMarks();
    if (dragLine) {
      if (zone.dataset.drop === 'root') placeLine(dragLine, null, 'root');
      else if (zone.dataset.drop === 'line') placeLine(dragLine, zone.dataset.id, where);
      return;
    }
    let ids = dragIds;
    if (!ids && e.dataTransfer.types.includes(BM_MIME)) ids = JSON.parse(e.dataTransfer.getData(BM_MIME));
    if (ext) {
      const urls = e.dataTransfer.getData('text/uri-list').split(/\r?\n/).filter((l) => l && !l.startsWith('#'));
      const d = defaultsForRoute();
      if (zone?.dataset.drop === 'line') d.collectionId = zone.dataset.id;
      if (zone?.dataset.drop === 'unsorted') d.collectionId = null;
      if (zone?.dataset.drop === 'favorites') d.favorite = true;
      addUrls(urls, d);
      return;
    }
    if (!ids?.length) return;
    const kind = zone.dataset.drop;
    if (kind === 'line') move(ids, zone.dataset.id);
    else if (kind === 'unsorted') move(ids, null);
    else if (kind === 'favorites') { await setFavorite(ids, true); toast(`${plural(ids.length, 'link')} added to Favorites`, { lead: favBullet(18) }); }
    else if (kind === 'trash') trash(ids);
    else if (kind === 'all') { /* no-op */ }
  });
}

// ======================= boot =======================

// IndexedDB writes can fail (quota, corrupted profile). Say so instead of failing silently.
window.addEventListener('unhandledrejection', (e) => {
  const msg = e.reason?.name === 'QuotaExceededError' ? 'Chrome is out of storage space for Ember. Free some disk space, then try again.' : `Something went wrong: ${e.reason?.message || e.reason}`;
  toast(msg, { duration: 8000 });
});

async function boot() {
  await load();
  applyTheme();
  try { localStorage.setItem('ember-theme', S.ui.theme); } catch {}
  const params = new URLSearchParams(location.search);
  if (params.get('q')) S.query = params.get('q');
  if (params.get('edit')) setTimeout(() => openDrawer(params.get('edit')), 50);
  if (params.has('q') || params.has('edit')) history.replaceState(null, '', location.pathname + location.hash);
  S.route = parseHash();
  if (S.route.kind === 'c' && !S.col.has(S.route.id)) S.route = { kind: 'all' };
  bindEvents();
  renderAll();

  // The popup's "open" button asks an already-open manager to edit a link.
  if (typeof BroadcastChannel !== 'undefined') {
    new BroadcastChannel('ember').addEventListener('message', async (e) => {
      if (e.data?.type !== 'open-edit') return;
      if (!S.bm.has(e.data.id)) { await load(); renderAll(); }
      openDrawer(e.data.id);
    });
  }

  db.onRemoteChange(debounce(async () => {
    await load();
    renderAll();
    if (S.editing && S.bm.has(S.editing) && !$('#drawer').contains(document.activeElement)) renderDrawer();
  }, 120));
}

// If startup fails, say so on the page instead of leaving it blank.
boot().catch((e) => {
  console.error(e);
  $('#content').innerHTML = `<div class="empty"><h2>Ember couldn’t start</h2>
    <p>${esc(e?.message || String(e))}</p>
    <p>Your bookmarks are stored in this Chrome profile and haven’t been touched. Try reloading. If it keeps happening, open <b>chrome://extensions</b> and check Ember’s <b>Errors</b>.</p>
    <div class="actions"><button class="btn primary" id="boot-retry">Reload</button></div></div>`;
  $('#boot-retry').addEventListener('click', () => location.reload());
});
