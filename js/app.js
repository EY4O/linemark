// Linemark manager: state, rendering and interaction for app.html.
import * as db from './db.js';
import * as M from './model.js';
import * as IO from './io.js';
import * as Sync from './sync.js';
import * as AI from './ai.js';
import { chime } from './chime.js';
import { lineBulletHTML, iconSvg, searchIcons, cleanEmoji, loadIcons, usesIcons } from './bullets.js';
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
  ui: { view: 'cards', sort: 'newest', size: 260, theme: 'system', chime: false, wrapView: 'summary' },
  selected: new Set(),
  anchorId: null,
  limit: PAGE,
  list: [],
  editing: null,
  showAllTags: false,
  renaming: null,
  scan: null,
  sync: { enabled: false },
  syncSetup: false,
  textHits: null,  // { key, map: id -> { words, snip } } from the search worker
  textAsked: null,
  textGen: 0,      // bumped when this page changes page text, so the worker reloads its copy
  snippets: new Map(),
};

// ======================= data =======================

async function load() {
  const [bookmarks, collections, ui] = await Promise.all([db.getAll('bookmarks'), db.getAll('collections'), db.getMeta('ui', null)]);
  S.bookmarks = bookmarks;
  S.collections = collections;
  if (usesIcons(collections)) await loadIcons();
  textsChanged();
  if (ui) Object.assign(S.ui, ui);
  index();
}

function index() {
  S.bm = new Map(S.bookmarks.map((b) => [b.id, b]));
  S.col = new Map(S.collections.map((c) => [c.id, c]));
  const c = { all: 0, unsorted: 0, fav: 0, trash: 0, broken: 0, dead: 0, checked: 0, indexed: 0, due: 0, byCol: new Map(), tags: new Map(), types: new Map() };
  const dueBy = M.endOfToday();
  for (const b of S.bookmarks) {
    b._hay ??= hayOf(b);
    if (b.trashedAt) { c.trash++; continue; }
    c.all++;
    if (b.favorite) c.fav++;
    if (b.textAt) c.indexed++;
    if (b.revisitAt && b.revisitAt <= dueBy) c.due++;
    if (b.health) {
      c.checked++;
      if (b.health.state !== 'ok') c.broken++;
      if (b.health.state === 'dead') c.dead++;
    }
    if (!b.collectionId || !S.col.has(b.collectionId)) c.unsorted++;
    else c.byCol.set(b.collectionId, (c.byCol.get(b.collectionId) || 0) + 1);
    // an interchange counts on every line it stops at
    for (const a of b.alsoOn || []) if (a !== b.collectionId && S.col.has(a)) c.byCol.set(a, (c.byCol.get(a) || 0) + 1);
    for (const t of b.tags) c.tags.set(t, (c.tags.get(t) || 0) + 1);
  }
  S.counts = c;
  S.dataVer = (S.dataVer || 0) + 1; // smart-line counts are remembered until the library changes
}

const saveUI = debounce(() => db.setMeta('ui', S.ui), 300);

function kidsOf(pid) {
  return S.collections.filter((c) => (c.parentId || null) === pid).sort((a, b) => a.order - b.order);
}
function roots() {
  return S.collections.filter((c) => !c.parentId || !S.col.has(c.parentId)).sort((a, b) => a.order - b.order);
}
const fileable = (c) => c && !c.smart;
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
  for (const c of list) c.updatedAt = Date.now();
  await db.putMany('collections', list);
  for (const c of list) if (!S.col.has(c.id)) S.collections.push(c);
  index();
}

function snapshot(ids) { return ids.map((id) => structuredClone(clean(S.bm.get(id)))); }
async function restoreSnapshot(snap) {
  // An undo is a new edit: stamp it now so sync doesn't let an older copy win.
  for (const s of snap) s.updatedAt = Date.now();
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
  if (['unsorted', 'favorites', 'trash', 'settings', 'duplicates', 'broken', 'departures', 'wrapped'].includes(kind)) return { kind };
  return { kind: 'all' };
}

function go(hash) {
  if (location.hash === hash) onRoute();
  else location.hash = hash;
}

function onRoute() {
  const from = routeHash();
  S.route = parseHash();
  S.enter = travelDirection(from, routeHash());
  if (S.route.kind === 'c' && !S.col.has(S.route.id)) S.route = { kind: 'all' };
  S.selected.clear();
  S.limit = PAGE;
  S.type = 'all';
  closeDrawer();
  closeMenu();
  closeBandOnMobile();
  // The station sign morphs into the next station (View Transitions); the band stays put. Skipped under reduced motion.
  between(() => { renderAll(); $('#content').scrollTop = 0; });
}
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
function between(fn) {
  if (!document.startViewTransition || reducedMotion() || document.hidden) return fn();
  // a quick second move skips the first transition; that's expected, not an error
  const t = document.startViewTransition(fn);
  for (const p of [t.ready, t.finished, t.updateCallbackDone]) p.catch(() => {});
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

// The non-text parts of a search: #tags, site:, type:, is:fav, has:note, is:broken.
function passesFilters(b, q) {
  return q.tags.every((t) => b.tags.some((x) => x.startsWith(t))) &&
    q.sites.every((s) => M.hostOf(b.url).includes(s)) &&
    (!q.types.length || q.types.includes(b.type)) &&
    (!q.fav || b.favorite) &&
    (!q.note || b.note) &&
    (!q.broken || (b.health && b.health.state !== 'ok'));
}
// A smart line's saved search: filters plus words in titles, addresses, descriptions, notes and tags.
function matchQuery(list, qstr) {
  const q = parseQuery(qstr || '');
  return list.filter((b) => passesFilters(b, q) && q.words.every((w) => (b._hay ??= hayOf(b)).includes(w)));
}
// A smart line's count, worked out once per library change and only for the band that shows it.
const smartCounts = new Map();
function smartCount(c) {
  const hit = smartCounts.get(c.id);
  if (hit && hit.ver === S.dataVer && hit.query === c.query) return hit.n;
  const n = matchQuery(S.bookmarks.filter((b) => !b.trashedAt), c.query).length;
  smartCounts.set(c.id, { ver: S.dataVer, query: c.query, n });
  return n;
}
const hayOf = (b) => (b.title + ' ' + b.url + ' ' + b.excerpt + ' ' + b.note + ' ' + b.tags.join(' ')).toLowerCase();

function baseSet(r = S.route) {
  const B = S.bookmarks;
  switch (r.kind) {
    case 'trash': return B.filter((b) => b.trashedAt);
    case 'unsorted': return B.filter((b) => !b.trashedAt && (!b.collectionId || !S.col.has(b.collectionId)));
    case 'favorites': return B.filter((b) => !b.trashedAt && b.favorite);
    case 'c': {
      const col = S.col.get(r.id);
      if (col?.smart) return matchQuery(B.filter((b) => !b.trashedAt), col.query);
      return B.filter((b) => !b.trashedAt && (b.collectionId === r.id || b.alsoOn?.includes(r.id)));
    }
    case 'departures': { const by = M.endOfToday(); return B.filter((b) => !b.trashedAt && b.revisitAt && b.revisitAt <= by); }
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
  // Page text is searched in a worker; its answer arrives a moment later and refreshes the list.
  const key = q.words.join('\u0001');
  let hits = null;
  if (q.words.length && S.counts.indexed) {
    if (S.textHits?.key === key) hits = S.textHits.map;
    else askText(key, q.words);
  }
  return list.filter((b) => {
    if (!passesFilters(b, q)) return false;
    let inText = null;
    for (const w of q.words) {
      if (b._hay.includes(w)) continue;
      const h = hits?.get(b.id);
      if (!h || !h.words.includes(w)) return false;
      inText = h;
    }
    if (inText?.snip) S.snippets.set(b.id, snippetHTML(inText.snip));
    return true;
  });
}

let searchWorker = null;
function askText(key, words) {
  if (S.textAsked === key) return;
  S.textAsked = key;
  if (!searchWorker) {
    searchWorker = new Worker(new URL('./search-worker.js', import.meta.url), { type: 'module' });
    searchWorker.onmessage = ({ data }) => {
      if (data?.type !== 'result' || data.key !== S.textAsked) return; // a newer search has replaced this one
      S.textHits = { key: data.key, map: new Map(data.hits.map(([id, w, snip]) => [id, { words: w, snip }])) };
      if (S.query.trim()) refreshList();
    };
  }
  searchWorker.postMessage({ type: 'search', key, words, gen: S.textGen });
}

// This page added or removed page text: the worker reloads its copy on the next search.
function textsChanged() {
  S.textGen++;
  S.textHits = null;
  S.textAsked = null;
}

// The passage around a match, with the match marked (the worker sends the raw pieces).
function snippetHTML(p) {
  return `${p.cutStart ? '…' : ''}${esc(p.before)}<mark>${esc(p.hit)}</mark>${esc(p.after)}${p.cutEnd ? '…' : ''}`.replace(/\n/g, ' ');
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
  else if (S.route.kind === 'departures') list.sort((a, b) => a.revisitAt - b.revisitAt);
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
  return lineBulletHTML(c, size, cls, title);
}
const lineColor = (name) => M.LINE_COLORS.find((c) => c.name === name).value;
const unsortedBullet = (size = 20, color = 'currentColor', cls = '') => `<span class="bullet ring ${cls}" style="${bs(size)}--c:${color}" title="Unsorted"></span>`;
const allBullet = (size, bg = 'var(--band-ink)', fg = 'var(--band)') => `<span class="bullet" style="--bs:${size}px;--c:${bg};--bi:${fg}">${icon('cards', 12)}</span>`;
const favBullet = (size) => `<span class="bullet" style="--bs:${size}px;--c:${FAV};--bi:#16171a">${icon('starFilled', 12)}</span>`;
const trashBullet = (size, color = 'currentColor') => `<span class="bullet dashed" style="--bs:${size}px;--c:${color}"></span>`;
// The departures board: a clock on a disc in band paper (on the dark band and toasts) or ink (on the station sign).
const departuresBullet = (size, onBand = true) => `<span class="bullet" style="--bs:${size}px;--c:var(${onBand ? '--band-ink' : '--ink'});--bi:var(${onBand ? '--band' : '--surface'})">${icon('clock', Math.round(size * 0.58))}</span>`;
const brokenBullet = (size, icoSize = 12) => `<span class="bullet" style="--bs:${size}px;--c:var(--danger);--bi:#fff">${icon('alert', icoSize)}</span>`;
const tagBullet = (size) => `<span class="bullet" style="--bs:${size}px;--c:var(--ink);--bi:var(--surface)">${icon('hash', 12)}</span>`;

// ======================= sidebar (signage band) =======================

function renderBand() {
  const r = S.route;
  const cur = (kind, id) => (r.kind === kind && (id === undefined || r.id === id || r.tag === id) ? 'aria-current="page"' : '');
  const stop = (kind, label, bullet, count, extra = '') =>
    `<a class="stop" href="#/${kind}" ${cur(kind)} data-drop="${kind}" ${extra}>${bullet}<span class="stop-name">${label}</span><span class="count" data-k="${kind}">${count ? count.toLocaleString() : ''}</span></a>`;

  const lineNode = (c, depth) => {
    const kids = kidsOf(c.id);
    const open = c.expanded && kids.length;
    const n = c.smart ? smartCount(c) : S.counts.byCol.get(c.id) || 0;
    const renaming = S.renaming === c.id;
    const here = r.kind === 'c' && r.id === c.id;
    return `<div class="line-node${S.fresh?.includes(c.id) ? ' fresh' : ''}" data-line="${c.id}">
      <div class="stop line-stop${c.smart ? ' smart' : ''}" ${here ? 'data-current' : ''} style="--c:${c.color}" draggable="${renaming ? 'false' : 'true'}" data-drop="line" data-id="${c.id}"${c.smart ? ' data-smart="1"' : ''}>
        ${kids.length
          ? `<button class="twisty${open ? ' open' : ''}" data-act="twisty" aria-expanded="${!!open}" aria-label="${open ? 'Collapse' : 'Expand'} ${esc(c.name)}">${icon('chevronRight', 14)}</button>`
          : '<span class="twisty none" aria-hidden="true"></span>'}
        ${renaming
          ? `${lineBullet(c, 20)}<input class="rename" value="${esc(c.name)}" aria-label="Line name" maxlength="80">`
          : `<a class="stop-link" href="#/c/${c.id}" ${here ? 'aria-current="page"' : ''} draggable="false"${depth ? ` data-depth="${depth}" data-path="${esc(M.linePathOf(S.collections, c.id).join(' › '))}"` : ''}>${lineBullet(c, 20)}<span class="stop-name" dir="auto">${esc(c.name)}</span></a>`}
        <span class="count" data-k="${c.id}">${n ? n.toLocaleString() : ''}</span>
        <button class="more" data-act="line-menu" aria-haspopup="menu" aria-label="Options for ${esc(c.name)}" title="Options (F2 renames)">${icon('more', 16)}</button>
      </div>
      ${open ? `<div class="line-children${depth + 1 > 8 ? ' flat' : depth + 1 > 2 ? ' deep' : ''}" style="--stem:${c.color}">${kids.map((k) => lineNode(k, depth + 1)).join('')}</div>` : ''}
    </div>`;
  };

  const tags = [...S.counts.tags.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const shownTags = S.showAllTags ? tags : tags.slice(0, 18);
  const rootLines = roots();

  $('#band').innerHTML = `
    <div class="brand">
      <span class="bullet" style="--c:var(--brand);--bi:var(--brand-ink)">L</span>
      <span class="brand-name">Linemark</span>
      <span class="brand-tools">
        ${S.sync.enabled ? `<a class="icon-btn sync-btn ${syncState()}" href="#/settings" title="${esc(syncLabel())}" aria-label="${esc(syncLabel())}">${icon('cloud', 18)}</a>` : ''}
        <button class="icon-btn" data-act="add" title="Add link (N)" aria-label="Add link">${icon('plus', 18)}</button>
      </span>
    </div>
    <div class="band-scroll">
      ${stop('all', 'All bookmarks', allBullet(20), S.counts.all)}
      ${stop('unsorted', 'Unsorted', unsortedBullet(20, 'var(--band-ink-2)'), S.counts.unsorted)}
      ${stop('favorites', 'Favorites', favBullet(20), S.counts.fav)}
      ${S.counts.due ? stop('departures', 'Departures', departuresBullet(20), S.counts.due) : ''}
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
  flipCounts($$('#band .count[data-k]'), 'band');
  S.fresh = null; // drawn once
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
    case 'departures': return { name: 'Departures', bullet: departuresBullet(46, false), color: 'var(--ink)', path: [], noun: 'link' };
    case 'broken': return { name: 'Broken links', bullet: brokenBullet(46, 20), color: 'var(--danger)', path: [{ label: 'Settings', hash: '#/settings', bullet: '' }] };
    case 'wrapped': return { name: 'Your year on the lines', bullet: `<span class="bullet" style="--bs:46px;--c:var(--brand);--bi:var(--brand-ink)">${icon('map', 22)}</span>`, color: 'var(--brand)', path: [{ label: 'Settings', hash: '#/settings', bullet: '' }], noCount: true };
    case 'settings': return { name: 'Settings & data', bullet: `<span class="bullet" style="--bs:46px;--c:var(--ink);--bi:var(--surface)">${icon('settings', 20)}</span>`, color: 'var(--ink)', path: [], noCount: true };
    case 'duplicates': return { name: 'Duplicates', bullet: `<span class="bullet" style="--bs:46px;--c:var(--ink);--bi:var(--surface)">${icon('duplicate', 20)}</span>`, color: 'var(--ink)', path: [{ label: 'Settings', hash: '#/settings', bullet: '' }] };
    case 'c': {
      const c = S.col.get(r.id);
      const p = pathOf(r.id).slice(0, -1);
      return { name: c.name, bullet: lineBullet(c, 46), color: c.color, path: p.map((x) => ({ label: x.name, hash: '#/c/' + x.id, bullet: lineBullet(x, 14) })), query: c.smart ? c.query : '' };
    }
    default: return { name: 'All bookmarks', bullet: allBullet(46, 'var(--brand)', '#16171a'), color: 'var(--brand)', path: [] };
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
  const arriving = st.dataset.at !== key;
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
      ${info.path.length ? `<nav class="station-path" aria-label="Parent lines">${info.path.map((p) => `<a href="${p.hash}">${p.bullet}${esc(p.label)}</a>`).join(icon('chevronRight', 12))}</nav>` : ''}
      ${arriving && !reducedMotion()
        ? `<h1 class="station-name flap" aria-label="${esc(info.name)}">${[...info.name].map((ch, i) => `<span aria-hidden="true" style="--i:${Math.min(i, 24)}">${esc(ch)}</span>`).join('')}</h1>`
        : `<h1 class="station-name">${esc(info.name)}</h1>`}
    </div>
    <span class="station-count">${count}${info.query ? `<span class="smart-q" title="This smart line shows every link matching this search">${icon('filter', 13)}${esc(info.query)}</span>` : ''}</span>`;
  if (searchVal === undefined) $('#search').value = S.query;
  flipCounts($$('#station-id .station-count b'), 'station:' + key);
  syncSearchChrome();
  document.title = `${info.name} · Linemark`;
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
  { id: 'map', label: 'Network map', ic: 'map' },
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
  if (S.route.kind === 'settings' || S.route.kind === 'wrapped') { sb.hidden = true; return; }
  sb.hidden = false;
  const typeBtns = TYPES.filter((t) => S.counts.types.get(t.id));
  const sizeable = S.ui.view === 'cards' || S.ui.view === 'moodboard';
  const isMap = S.ui.view === 'map';
  const extra = S.route.kind === 'trash' && S.counts.trash
    ? `<button class="btn sm danger" data-act="empty-trash">${icon('trash', 15)}<span class="lbl">Empty trash</span></button>`
    : S.route.kind === 'broken' && S.list.length
      ? `${S.counts.dead ? `<button class="btn sm danger" data-act="trash-dead">${icon('trash', 15)}<span class="lbl">Trash ${S.counts.dead} dead</span></button>` : ''}<button class="btn sm" data-act="recheck" ${S.scan ? 'disabled' : ''}>${icon('refresh', 15)}<span class="lbl">Check again</span></button>`
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
    ${sizeable && !extra.includes('data-act="empty-trash"') && !extra.includes('data-act="dedupe"') && !extra.includes('data-act="recheck"') ? `<label class="size-ctl" title="Card size">${icon('image', 15)}<input type="range" id="size" min="180" max="420" step="10" value="${S.ui.size}" aria-label="Card size">${icon('image', 19)}</label>` : ''}
    ${S.route.kind === 'trash' || S.route.kind === 'duplicates' ? '' : `<span class="select-wrap">
      <select id="sort" aria-label="Sort">
        ${[['newest', 'Newest first'], ['oldest', 'Oldest first'], ['updated', 'Recently edited'], ['title', 'Title A–Z'], ['site', 'By site']].map(([v, l]) => `<option value="${v}" ${S.ui.sort === v ? 'selected' : ''}>${l}</option>`).join('')}
      </select>${icon('chevronDown', 15)}
    </span>`}
    ${isMap ? '' : `<button class="btn sm ghost" data-act="select-all" title="Select all (Ctrl+A)" aria-label="Select all">${icon('select', 16)}<span class="lbl">Select</span></button>`}`;
}

// ======================= content =======================

function coverHTML(b, col) {
  const host = M.hostOf(b.url);
  const color = col?.color || M.colorFor(host);
  const ph = `<div class="ph" style="--pc:${color};--pi:${M.bulletInk(color)}"><span class="fav-tile">${favImg(b.url, 24) || esc((host[0] || '?').toUpperCase())}</span><span class="ph-host">${esc(host || b.url).replace(/\./g, '.<wbr>')}</span></div>`;
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
  const also = (b.alsoOn || []).map((x) => S.col.get(x)).filter(fileable).slice(0, 2);
  return `<article class="card${sel ? ' selected' : ''}" data-id="${b.id}" draggable="true" aria-labelledby="t-${b.id}" style="--c:${col?.color || 'var(--ink-3)'}">
    <div class="cover-wrap">
      <div class="cover">${coverHTML(b, col)}</div>
      ${col ? lineBullet(col, null, 'on-line', col.name) : unsortedBullet(null, 'var(--ink-3)', 'on-line')}
      ${also.map((x, i) => lineBullet(x, null, `on-line also also-${i + 1}`, 'Also on ' + x.name)).join('')}
    </div>
    <div class="card-body">
      ${col ? lineBullet(col, 16, 'hl-bullet', col.name) : unsortedBullet(16, 'var(--ink-3)', 'hl-bullet')}${also.map((x) => lineBullet(x, 16, 'hl-bullet hl-also', 'Also on ' + x.name)).join('')}
      <a class="card-title" id="t-${b.id}" dir="auto" href="${esc(b.url)}" target="_blank" rel="noopener noreferrer" title="${esc(b.title)}">${esc(b.title)}</a>
      ${S.snippets.has(b.id) ? `<p class="card-snippet"><span class="snip-label">In page</span> ${S.snippets.get(b.id)}</p>` : b.excerpt ? `<p class="card-excerpt" dir="auto">${esc(b.excerpt)}</p>` : ''}
      ${b.note ? `<p class="card-note">${icon('note', 14)}<span dir="auto">${esc(b.note)}</span></p>` : ''}
      ${b.tags.length ? `<div class="tags">${b.tags.map((t) => `<button class="tag" data-tag="${esc(t)}" aria-label="Show links tagged ${esc(t)}"><span class="hash">#</span>${esc(t)}</button>`).join('')}</div>` : ''}
      <div class="meta">${fav}<span class="host">${esc(host)}</span><span class="dot">·</span><span class="when" title="${esc(fullDate(trash ? b.trashedAt : b.createdAt))}">${when}</span>${b.favorite ? `<span class="fav-star" title="Favorite">${icon('starFilled', 14)}</span>` : ''}${!trash ? healthChip(b) : ''}${!trash && b.revisitAt ? `<span class="due${b.revisitAt <= M.endOfToday() ? ' now' : ''}" title="Revisit ${esc(fullDate(b.revisitAt))}">${icon('clock', 13)}${M.revisitLabel(b.revisitAt)}</span>` : ''}</div>
    </div>
    <button class="check" data-act="select" aria-label="Select “${name}”" aria-pressed="${sel}">${icon('check', 15)}</button>
    <div class="card-actions">
      ${trash
        ? `<button class="icon-btn" data-act="restore" title="Restore" aria-label="Restore “${name}”">${icon('restore', 17)}</button>
           <button class="icon-btn danger" data-act="destroy" title="Delete forever" aria-label="Delete “${name}” forever">${icon('trash', 17)}</button>`
        : `${S.route.kind === 'departures' ? `<button class="icon-btn" data-act="visited" title="Done: take it off the board" aria-label="Done with “${name}”">${icon('check', 17)}</button>` : ''}<button class="icon-btn${b.favorite ? ' on' : ''}" data-act="fav" title="${b.favorite ? 'Unfavorite' : 'Favorite'} (F)" aria-label="Favorite “${name}”" aria-pressed="${!!b.favorite}">${icon(b.favorite ? 'starFilled' : 'star', 17)}</button>
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
  if (S.route.kind === 'wrapped') { renderWrapped(); return; }
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
  const smartHere = S.route.kind === 'c' && S.col.get(S.route.id)?.smart;
  const searchElsewhere = S.query.trim()
    ? `<div class="group-head">${S.route.kind !== 'all' ? `<span>Searching in ${esc(stationInfo().name)}.</span><button class="btn sm ghost" data-act="search-all">${icon('search', 14)} Search all bookmarks</button>` : ''}${smartHere ? '' : `<button class="btn sm ghost" data-act="save-smart" title="Keep this search as a line that fills itself">${icon('filter', 14)} Save as smart line</button>`}</div>`
    : '';

  if (S.ui.view === 'map') { S.enter = null; content.innerHTML = `${legend}${searchElsewhere}${mapHTML(list)}`; return; }
  const enter = S.enter ? ` enter-${S.enter}` : '';
  S.enter = null;
  content.innerHTML = `${transfers}${legend}${searchElsewhere}<div class="grid ${S.ui.view}${enter}${S.selected.size ? ' selecting' : ''}" id="grid" style="--card-w:${S.ui.size}px">${list.slice(0, S.limit).map(cardHTML).join('')}</div><div class="more-sentinel" id="sentinel"></div>`;
  hydrate(content);
  observeMore();
}

// ======================= motion =======================

// Counts change like a departure board: the number flips over when it differs from last time.
const lastCounts = new Map();
function flipCounts(els, scope) {
  for (const el of els) {
    const k = scope + ':' + (el.dataset.k || '');
    const v = el.textContent;
    const before = lastCounts.get(k);
    lastCounts.set(k, v);
    if (before !== undefined && before !== v && v) {
      el.classList.remove('flip');
      void el.offsetWidth;
      el.classList.add('flip');
      // a new dead link lights the Broken links stop red as the checker finds it
      if (el.dataset.k === 'broken' && +v.replace(/\D/g, '') > +String(before).replace(/\D/g, '')) el.closest('.stop')?.querySelector('.bullet')?.classList.add('alarm');
    }
  }
}

// Which way the train travels: down the band (new stop lower in the sidebar) or up.
function travelDirection(fromHash, toHash) {
  if (fromHash === toHash) return null;
  const order = $$('#band a.stop, #band a.stop-link, #band a.tag-pill').map((a) => a.getAttribute('href'));
  const i = order.indexOf(fromHash), j = order.indexOf(toHash);
  if (i < 0 || j < 0) return 'down';
  return j > i ? 'down' : 'up';
}

// Filing a link: a dot in the link's line colour travels from where it was dropped to the line it now runs on.
function fileAnimation(fromX, fromY, zone, color) {
  const target = zone?.querySelector('.bullet');
  if (!target) return;
  const to = target.getBoundingClientRect();
  const dot = document.createElement('span');
  dot.className = 'file-dot';
  dot.style.setProperty('--c', color || 'var(--brand)');
  dot.style.left = fromX - 9 + 'px';
  dot.style.top = fromY - 9 + 'px';
  document.body.append(dot);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const dx = to.left + to.width / 2 - fromX, dy = to.top + to.height / 2 - fromY;
  const anim = reduce
    ? dot.animate([{ opacity: 0.9 }, { opacity: 0 }], { duration: 300 })
    : dot.animate([{ transform: 'translate(0, 0) scale(1.4)', opacity: 0.95 }, { transform: `translate(${dx}px, ${dy}px) scale(0.6)`, opacity: 1 }], { duration: 520, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' });
  anim.onfinish = () => { dot.remove(); target.classList.remove('arrived'); void target.offsetWidth; target.classList.add('arrived'); };
}

// ======================= Linemark Wrapped =======================
// A year on the lines, worked out from the library on this computer: saves by month, the busiest line,
// lines and branches built, top tags and sites. Exportable as an image; nothing is sent anywhere.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function wrappedData() {
  const years = [...new Set(S.bookmarks.map((b) => new Date(b.createdAt).getFullYear()))].sort((a, b) => b - a);
  const now = new Date().getFullYear();
  const year = years.includes(S.wrapYear) ? S.wrapYear : years.includes(now) ? now : years[0] || now;
  const inYear = (t) => new Date(t).getFullYear() === year;
  const saved = S.bookmarks.filter((b) => inYear(b.createdAt));
  const live = saved.filter((b) => !b.trashedAt);
  const months = MONTHS.map((_, m) => saved.filter((b) => new Date(b.createdAt).getMonth() === m).length);
  const busiestMonth = months.indexOf(Math.max(...months));
  const byLine = new Map();
  for (const b of live) if (fileable(S.col.get(b.collectionId))) byLine.set(b.collectionId, (byLine.get(b.collectionId) || 0) + 1);
  const topLines = [...byLine].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id, n]) => ({ c: S.col.get(id), n }));
  const tagCount = new Map();
  for (const b of live) for (const t of b.tags) tagCount.set(t, (tagCount.get(t) || 0) + 1);
  const topTags = [...tagCount].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const hostCount = new Map();
  for (const b of live) { const h = M.hostOf(b.url); hostCount.set(h, (hostCount.get(h) || 0) + 1); }
  const topSites = [...hostCount].sort((a, b) => b[1] - a[1]).slice(0, 3);
  const built = S.collections.filter((c) => !c.smart && inYear(c.createdAt || 0));
  const branches = built.filter((c) => c.parentId);
  const deepest = S.collections.filter(fileable).map((c) => pathOf(c.id)).sort((a, b) => b.length - a.length)[0] || [];
  const first = [...saved].sort((a, b) => a.createdAt - b.createdAt)[0];
  return {
    year, years, saved: saved.length, months, busiestMonth, topLines, topTags, topSites,
    lines: built.length - branches.length, branches: branches.length, deepest,
    favorites: live.filter((b) => b.favorite).length, interchanges: live.filter((b) => b.alsoOn?.length).length,
    smart: S.collections.filter((c) => c.smart).length, onBoard: live.filter((b) => b.revisitAt).length, first,
  };
}

function renderWrapped() {
  const d = wrappedData();
  const content = $('#content');
  jrStop?.();
  if (!d.saved) { content.innerHTML = `<div class="empty"><h2>Nothing saved in ${d.year} yet</h2><p>Your year on the lines fills in as you save pages.</p></div>`; return; }
  const journey = S.ui.wrapView === 'journey';
  const bar = `<div class="wrap-bar">
      ${d.years.length > 1 ? `<div class="wrap-years" role="group" aria-label="Year">${d.years.map((y) => `<button class="btn sm${y === d.year ? ' primary' : ''}" data-act="wrap-year" data-year="${y}" aria-pressed="${y === d.year}">${y}</button>`).join('')}</div>` : '<span></span>'}
      <div class="seg" role="group" aria-label="Show Wrapped as">
        <button data-act="wrap-view" data-v="summary" aria-pressed="${!journey}">Summary</button>
        <button data-act="wrap-view" data-v="journey" aria-pressed="${journey}">Journey</button>
      </div>
    </div>`;
  const actions = `<div class="wrap-actions"><button class="btn primary" data-act="wrap-export">${icon('download', 16)} Save as image</button><span class="hint">A picture of your year, made on your computer. Share it, or keep it.</span></div>`;
  if (journey) {
    content.innerHTML = `<div class="wrapped journey-mode">${bar}${journeyHTML(d)}${actions}</div>`;
    wireJourney();
    return;
  }
  const max = Math.max(...d.months, 1);
  const W = 880, x0 = 40, step = (W - 80) / 11;
  const yearLine = `<svg class="year-line" viewBox="0 0 ${W} 150" role="img" aria-label="Links saved each month of ${d.year}: ${d.months.map((n, m) => `${MONTHS[m]} ${n}`).join(', ')}">
      <path class="track" d="M${x0 - 20} 82 H${W - x0 + 20}"/>
      ${d.months.map((n, m) => {
        const x = x0 + m * step, r = n ? 7 + 15 * Math.sqrt(n / max) : 5;
        return `<g class="month${m === d.busiestMonth ? ' busiest' : ''}${n ? '' : ' none'}" style="--i:${m}"><circle cx="${x}" cy="82" r="${r}"/><text class="m" x="${x}" y="136">${MONTHS[m]}</text>${n ? `<text class="n" x="${x}" y="${82 - r - 10}">${n}</text>` : ''}</g>`;
      }).join('')}
    </svg>`;
  const lineRow = ({ c, n }) => `<li>${lineBullet(c, 22)}<span>${esc(M.linePathOf(S.collections, c.id).join(' › '))}</span><b class="tnum">${n}</b></li>`;
  content.innerHTML = `<div class="wrapped">
    ${bar}
    <section class="wrap-hero">
      <p class="wrap-big tnum">${d.saved.toLocaleString()}</p>
      <p class="wrap-lede">links saved in ${d.year}${d.lines + d.branches ? `, on ${plural(d.lines, 'new line')} and ${plural(d.branches, 'branch', 'branches')}` : ''}.</p>
      ${yearLine}
      <p class="wrap-note">Your busiest month was <b>${new Date(d.year, d.busiestMonth).toLocaleString(undefined, { month: 'long' })}</b>, with ${plural(d.months[d.busiestMonth], 'save')}.</p>
    </section>
    <div class="wrap-grid">
      ${d.topLines.length ? `<section class="wrap-card"><h2>Busiest lines</h2><ol class="wrap-lines">${d.topLines.map(lineRow).join('')}</ol></section>` : ''}
      ${d.topTags.length ? `<section class="wrap-card"><h2>Your tags</h2><p class="wrap-tags">${d.topTags.map(([t, n]) => `<span class="chip">#${esc(t)} <b class="tnum">${n}</b></span>`).join('')}</p></section>` : ''}
      ${d.topSites.length ? `<section class="wrap-card"><h2>Sites you kept coming back to</h2><ol class="wrap-sites">${d.topSites.map(([h, n]) => `<li><span>${esc(h)}</span><b class="tnum">${n}</b></li>`).join('')}</ol></section>` : ''}
      <section class="wrap-card"><h2>The network</h2><dl class="wrap-facts">
        <div><dt class="tnum">${d.deepest.length}</dt><dd>stops on your deepest branch${d.deepest.length > 1 ? `: ${esc(d.deepest.map((c) => c.name).join(' › '))}` : ''}</dd></div>
        <div><dt class="tnum">${d.interchanges}</dt><dd>${d.interchanges === 1 ? 'interchange' : 'interchanges'}, links on more than one line</dd></div>
        <div><dt class="tnum">${d.smart}</dt><dd>smart ${d.smart === 1 ? 'line' : 'lines'} filling themselves</dd></div>
        <div><dt class="tnum">${d.favorites}</dt><dd>${d.favorites === 1 ? 'favorite' : 'favorites'} starred</dd></div>
      </dl></section>
      ${d.first ? `<section class="wrap-card"><h2>First stop of the year</h2><p class="wrap-first"><b>${esc(d.first.title)}</b><span>${esc(M.hostOf(d.first.url))} · ${esc(new Date(d.first.createdAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric' }))}</span></p></section>` : ''}
    </div>
    ${actions}
  </div>`;
}

// ---- the Journey: the year as one ride ----
// Big month names, every page saved that year as a stop with its picture, and a white dot that runs the dotted line
// as you scroll sideways, filling it in behind with the colour of each stop's line.
const JR = { perMonth: 24, anchor: (w) => (w < 600 ? 0.16 : 0.36) }; // where the dot rides, as in .jr-track's padding
let jrStop = null; // tears down the last journey's observers
function journeyHTML(d) {
  const list = S.bookmarks.filter((b) => !b.trashedAt && new Date(b.createdAt).getFullYear() === d.year).sort((a, b) => a.createdAt - b.createdAt);
  const byMonth = MONTHS.map(() => []);
  for (const b of list) byMonth[new Date(b.createdAt).getMonth()].push(b);
  const long = (m) => new Date(d.year, m).toLocaleString(undefined, { month: 'long' });
  let k = 0;
  const blocks = byMonth.map((bs, m) => {
    if (!bs.length) return '';
    const shown = bs.slice(0, JR.perMonth);
    const lead = S.col.get(shown[0].collectionId);
    // the month is a heading (the light name); its black echo behind is decoration
    const head = `<div class="jr-month">
        <i class="jr-node" data-c="${fileable(lead) ? lead.color : ''}" data-month="${esc(long(m))}"></i>
        <h2 class="jr-name"><span class="jr-ghost" aria-hidden="true">${esc(long(m))}</span><span class="jr-fore">${esc(long(m))}</span></h2>
        <p class="jr-meta tnum">${plural(bs.length, 'save')}${m === d.busiestMonth && bs.length > 1 ? ', the busiest month' : ''}</p>
      </div>`;
    const stops = shown.map((b) => {
      const c = S.col.get(b.collectionId);
      const line = fileable(c) ? c : null;
      const path = line ? M.linePathOf(S.collections, line.id).join(' › ') : 'Unsorted';
      return `<a class="jr-stop" href="${esc(b.url)}" target="_blank" rel="noopener noreferrer" style="--y:${[0, 64, 22, 88, 40][k++ % 5]}px">
          <span class="jr-img">${coverHTML(b, line)}</span>
          <span class="jr-title">${esc(b.title)}</span>
          <span class="jr-sub">${line ? lineBullet(line, 16) : ''}<span>${esc(path)} · ${esc(new Date(b.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }))}</span></span>
          <i class="jr-node" data-c="${line ? line.color : ''}" data-month="${esc(long(m))}" data-line="${esc(path)}"></i>
        </a>`;
    }).join('');
    const more = bs.length > shown.length ? `<p class="jr-more">+${bs.length - shown.length} more in ${esc(long(m))}</p>` : '';
    return head + stops + more;
  }).join('');
  return `<div class="jr-wrap">
      <p class="jr-hud" aria-hidden="true"><b class="jr-hud-month">${d.year}</b><span class="jr-hud-line"></span><span class="jr-hud-n tnum"></span></p>
      <div class="journey" tabindex="0" role="region" aria-label="Your ${d.year}, month by month. Scroll sideways to ride it.">
        <div class="jr-track">
          <svg class="jr-svg" aria-hidden="true"></svg>
          <div class="jr-start"><i class="jr-node" data-c="var(--brand)"></i><p class="tnum">${d.year}<span>Scroll sideways to ride the year ${icon('arrowRight', 16)}</span></p></div>
          ${blocks}
          <div class="jr-end"><i class="jr-node" data-c="var(--brand)"></i><p class="tnum">${plural(list.length, 'stop')}<span>End of the line, for now.</span></p></div>
        </div>
      </div>
    </div>`;
}

function wireJourney() {
  const sc = $('.journey');
  if (!sc) return;
  const track = sc.querySelector('.jr-track');
  const svg = sc.querySelector('.jr-svg');
  const hud = { month: $('.jr-hud-month'), line: $('.jr-hud-line'), n: $('.jr-hud-n') };
  const total = sc.querySelectorAll('.jr-stop').length;
  let nodes = [], segs = [], fills = [], sts = [], dot = null, raf = 0;
  function build() {
    if (!sc.isConnected) return jrStop?.();
    // layout positions, not on-screen ones: stops slide in as they enter, and the line must not slide with them
    nodes = [...sc.querySelectorAll('.jr-node')].map((el) => {
      let x = 0, y = 0;
      for (let e = el; e && e !== track; e = e.offsetParent) { x += e.offsetLeft; y += e.offsetTop; }
      return { el, x, y, c: el.dataset.c || 'var(--ink-3)', stop: el.closest('.jr-stop') };
    });
    svg.setAttribute('width', track.scrollWidth);
    svg.setAttribute('height', track.offsetHeight);
    // metro geometry: run level, then take the change in height on a 45° diagonal into the next stop
    segs = nodes.slice(1).map((b, i) => {
      const a = nodes[i], dy = b.y - a.y, xb = Math.max(a.x, b.x - Math.abs(dy));
      const h = xb - a.x, diag = Math.hypot(b.x - xb, dy);
      return { a, b, dy, xb, h, diag, len: h + diag, d: `M${a.x} ${a.y} H${xb} L${b.x} ${b.y}` };
    });
    svg.innerHTML = `<path class="jr-dots" d="${segs.map((s) => s.d).join('')}"/>
      ${segs.map((s) => `<path class="jr-fill" d="${s.d}" style="--c:${s.b.c};stroke-dasharray:${s.len} ${s.len + 1};stroke-dashoffset:${s.len}"/>`).join('')}
      ${nodes.map((n) => `<circle class="jr-st${n.stop ? '' : ' month'}" cx="${n.x}" cy="${n.y}" r="${n.stop ? 7 : 6}" style="--c:${n.c}"/>`).join('')}
      <g class="jr-dot"><circle class="halo" r="12"/><circle class="core" r="10"/></g>`;
    fills = [...svg.querySelectorAll('.jr-fill')];
    sts = [...svg.querySelectorAll('.jr-st')];
    dot = svg.querySelector('.jr-dot');
    update();
  }
  function update() {
    raf = 0;
    if (!segs.length) return;
    const x = Math.min(nodes.at(-1).x, Math.max(nodes[0].x, sc.scrollLeft + sc.clientWidth * JR.anchor(sc.clientWidth)));
    let pos = { x: nodes[0].x, y: nodes[0].y }, next = nodes[1];
    segs.forEach((s, i) => {
      const t = x <= s.xb ? 0 : Math.min(1, (x - s.xb) / (s.b.x - s.xb));
      const done = x >= s.b.x ? s.len : x <= s.a.x ? 0 : x <= s.xb ? x - s.a.x : s.h + t * s.diag;
      fills[i].style.strokeDashoffset = s.len - done;
      if (x > s.a.x && x <= s.b.x) { pos = { x, y: s.a.y + t * s.dy }; next = s.b; }
    });
    let last = 0, passed = 0, here = null;
    nodes.forEach((n, i) => {
      const on = n.x <= x + 0.5;
      sts[i].classList.toggle('on', on);
      n.stop?.classList.toggle('passed', on);
      if (on) { last = i; if (n.stop) { passed++; here = n; } }
    });
    dot.setAttribute('transform', `translate(${pos.x} ${pos.y})`);
    dot.style.setProperty('--c', (x >= nodes.at(-1).x ? nodes.at(-1) : next).c);
    const atMonth = nodes.slice(0, last + 1).findLast((n) => n.el.dataset.month);
    hud.month.textContent = atMonth?.el.dataset.month || hud.month.textContent;
    hud.line.textContent = here?.el.dataset.line || '';
    hud.n.textContent = `${passed} of ${total}`;
  }
  const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
  sc.addEventListener('scroll', onScroll, { passive: true });
  const ro = new ResizeObserver(() => build());
  ro.observe(sc);
  // a year can hold hundreds of stops: each cover is read from storage only as it comes within a screen or so
  const near = new IntersectionObserver((es) => {
    for (const e of es) if (e.isIntersecting) { near.unobserve(e.target); hydrate(e.target); }
  }, { root: sc, rootMargin: '0px 1200px' });
  sc.querySelectorAll('.jr-stop').forEach((s) => near.observe(s));
  document.fonts.ready.then(() => sc.isConnected && build());
  jrStop = () => { ro.disconnect(); near.disconnect(); cancelAnimationFrame(raf); jrStop = null; };
}

// The image: a signage-black card with the year line in Linemark orange, drawn on a canvas.
async function exportWrapped() {
  const d = wrappedData();
  const W = 1080, H = 1350;
  const cv = new OffscreenCanvas(W, H);
  const g = cv.getContext('2d');
  await document.fonts.ready;
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const font = (w, size) => `${w} ${size}px Archivo, "Segoe UI", system-ui, sans-serif`;
  // the image is always the dark band, whichever theme the app is in, so it reads the same wherever it's shared
  const BG = '#16171a', INK = '#f4f3ef', INK2 = '#c9cad0', INK3 = '#a8aab0', RULE = '#4a4c52', BRAND = css('--brand') || '#ff5a1f';
  g.fillStyle = BG; g.fillRect(0, 0, W, H);
  g.fillStyle = BRAND; g.beginPath(); g.arc(112, 128, 34, 0, Math.PI * 2); g.fill();
  g.fillStyle = BG; g.font = font(800, 36); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('L', 112, 130);
  g.textAlign = 'left'; g.fillStyle = INK; g.font = font(760, 40); g.fillText('Linemark', 166, 130);
  g.fillStyle = INK3; g.font = font(600, 34); g.fillText(`Your year on the lines · ${d.year}`, 78, 236);
  g.fillStyle = INK; g.font = font(800, 220); g.textBaseline = 'alphabetic'; g.fillText(d.saved.toLocaleString(), 70, 470);
  g.font = font(600, 40); g.fillStyle = INK2; g.fillText('links saved', 78, 530);
  g.font = font(560, 30); g.fillStyle = INK3; g.fillText(`on ${plural(d.lines, 'new line')} and ${plural(d.branches, 'branch', 'branches')}`, 78, 580);
  const max = Math.max(...d.months, 1), y = 730, x0 = 110, step = (W - 220) / 11;
  g.strokeStyle = BRAND; g.lineWidth = 12; g.lineCap = 'round'; g.beginPath(); g.moveTo(70, y); g.lineTo(W - 70, y); g.stroke();
  d.months.forEach((n, m) => {
    const x = x0 + m * step, r = n ? 12 + 26 * Math.sqrt(n / max) : 8;
    // as on the page: quiet months in grey, the busiest filled in brand with its count above
    const busiest = n && m === d.busiestMonth;
    g.fillStyle = busiest ? BRAND : BG; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    g.lineWidth = 8; g.strokeStyle = busiest ? INK : n ? BRAND : RULE; g.stroke();
    g.textAlign = 'center';
    if (busiest) { g.fillStyle = INK; g.font = font(760, 32); g.fillText(n.toLocaleString(), x, y - r - 18); }
    g.fillStyle = m === d.busiestMonth && n ? INK : INK3; g.font = font(650, 26); g.fillText(MONTHS[m][0], x, y + 82);
  });
  g.textAlign = 'left';
  let ty = 940;
  if (d.topLines[0]) {
    const c = d.topLines[0].c;
    g.fillStyle = c.color; g.beginPath(); g.arc(100, ty - 12, 26, 0, Math.PI * 2); g.fill();
    g.fillStyle = M.bulletInk(c.color); g.font = font(800, 24); g.textAlign = 'center'; g.fillText(c.code || M.codeFor(c.name), 100, ty - 4);
    g.textAlign = 'left'; g.fillStyle = INK; g.font = font(720, 44); g.fillText(c.name.slice(0, 28), 146, ty);
    g.fillStyle = INK3; g.font = font(560, 30); g.fillText(`Busiest line · ${plural(d.topLines[0].n, 'link')}`, 146, ty + 46);
    ty += 140;
  }
  if (d.topTags.length) { g.fillStyle = INK2; g.font = font(650, 34); g.fillText(d.topTags.slice(0, 4).map(([t]) => '#' + t).join('   '), 78, ty); ty += 90; }
  g.strokeStyle = RULE; g.lineWidth = 2; g.beginPath(); g.moveTo(78, 1216); g.lineTo(W - 78, 1216); g.stroke();
  g.fillStyle = INK3; g.font = font(560, 28); g.fillText(`Deepest branch: ${plural(d.deepest.length, 'stop')} · ${plural(d.interchanges, 'interchange')} · ${plural(d.favorites, 'favorite')}`, 78, 1272);
  const blob = await cv.convertToBlob({ type: 'image/png' });
  download(`linemark-wrapped-${d.year}.png`, blob);
  toast('Wrapped image saved');
}

// ======================= network map =======================
// The listed links drawn as a transit map: each line is a coloured track with its links as stations, branches hang
// off their parent on a stem in its colour (as in the sidebar), and a link on more than one line is an interchange.
const MAP = { label: 236, step: 104, row: 104, top: 84, max: 14 };
function mapHTML(list) {
  const visible = new Set(list.map((b) => b.id));
  const items = new Map(); // line id ('' = unsorted) -> [{ b, inter }]
  const add = (id, b, inter) => { if (!items.has(id)) items.set(id, []); items.get(id).push({ b, inter }); };
  for (const b of list) {
    const main = fileable(S.col.get(b.collectionId)) ? b.collectionId : '';
    const also = (b.alsoOn || []).filter((x) => fileable(S.col.get(x)));
    add(main, b, also.length > 0);
    for (const x of also) add(x, b, true);
  }
  const rows = [];
  const walk = (cs, depth, parentRow) => {
    for (const c of cs) {
      if (!fileable(c)) continue;
      const hasOwn = items.has(c.id);
      const sub = descendants(c.id);
      if (!hasOwn && ![...sub].some((x) => items.has(x))) continue;
      const row = { c, depth, parentRow, items: items.get(c.id) || [] };
      rows.push(row);
      walk(kidsOf(c.id), depth + 1, row);
    }
  };
  walk(roots(), 0, null);
  if (items.has('')) rows.push({ c: { id: '', name: 'Unsorted', color: 'var(--ink-3)', code: '' }, depth: 0, parentRow: null, items: items.get(''), unsorted: true });
  rows.forEach((r, i) => { r.y = MAP.top + i * MAP.row; r.bx = 24 + r.depth * 20; });
  const longest = Math.min(MAP.max, Math.max(1, ...rows.map((r) => r.items.length)));
  const w = MAP.label + 40 + longest * MAP.step + 90;
  const h = MAP.top + rows.length * MAP.row - 40;
  const cut = (t, n) => (t.length > n ? t.slice(0, n - 1) + '…' : t);
  const svg = rows.map((r) => {
    const c = r.c;
    const href = r.unsorted ? '#/unsorted' : '#/c/' + c.id;
    const stem = r.parentRow ? `<path class="stem" d="M${r.parentRow.bx} ${r.parentRow.y + 12} V${r.y - 9} Q${r.parentRow.bx} ${r.y} ${r.parentRow.bx + 9} ${r.y} H${r.bx - 12}" style="--c:${r.parentRow.c.color}"/>` : '';
    const shown = r.items.slice(0, MAP.max);
    const end = MAP.label + 30 + Math.max(0, shown.length - 1) * MAP.step + 34;
    const recent = Date.now() - 86400000;
    const stations = shown.map(({ b, inter }, i) => {
      const x = MAP.label + 30 + i * MAP.step;
      return `<a class="map-stop${inter ? ' inter' : ''}${b.createdAt > recent ? ' new' : ''}" href="${esc(b.url)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(b.title)}${inter ? ' (interchange)' : ''}">
        <title>${esc(b.title)}</title>
        <circle class="hit" cx="${x}" cy="${r.y}" r="22"/>
        <circle class="dot" cx="${x}" cy="${r.y}" r="${inter ? 9 : 8}"/>
        <text x="${x + 2}" y="${r.y - 17}" transform="rotate(-30 ${x + 2} ${r.y - 17})">${esc(cut(b.title, 22))}</text>
      </a>`;
    }).join('');
    const more = r.items.length > MAP.max ? `<a class="more-stops" href="${href}"><text x="${end + 14}" y="${r.y + 5}">+${r.items.length - MAP.max} more</text></a>` : '';
    return `<g class="line-row" style="--c:${c.color};--bi:${r.unsorted ? 'var(--surface)' : M.bulletInk(c.color)}">
      ${stem}
      <a class="line-label" href="${href}" aria-label="Line ${esc(c.name)}">
        <rect class="hit" x="${r.bx - 18}" y="${r.y - 22}" width="${MAP.label - r.bx - 4}" height="44" rx="8"/>
        <circle class="lb" cx="${r.bx}" cy="${r.y}" r="12"/>${r.unsorted ? '' : `<text class="lb-code" x="${r.bx}" y="${r.y + 4}">${esc(c.code || M.codeFor(c.name))}</text>`}
        <text class="lb-name" x="${r.bx + 20}" y="${r.y + 5}">${esc(cut(c.name, Math.max(8, 24 - r.depth * 2)))}</text>
      </a>
      ${shown.length ? `<path class="track" d="M${MAP.label} ${r.y} H${end}"/>` : ''}
      ${shown.length > 1 && !reducedMotion() ? `<circle class="train" r="5"><animateMotion dur="${Math.round((end - MAP.label) / 34)}s" repeatCount="indefinite" calcMode="linear" keyPoints="0;1;0" keyTimes="0;0.5;1" path="M${MAP.label + 30} ${r.y} H${end - 34}"/></circle>` : ''}
      ${stations}${more}
    </g>`;
  }).join('');
  return `<div class="map-wrap"><svg class="netmap" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="group" aria-label="Network map: ${plural(visible.size, 'link')} on ${plural(rows.length, 'line')}">${svg}</svg></div>`;
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
  const bullets = `<div class="bullets">${sample.length ? sample.map((c) => lineBullet(c, 40)).join('') : `<span class="bullet" style="--bs:40px;--c:var(--brand);--bi:var(--brand-ink)">L</span>${lineBullet({ code: 'R', color: lineColor('Teal') }, 40)}${lineBullet({ code: 'D', color: lineColor('Cobalt') }, 40)}`}</div>`;
  if (S.query || S.type !== 'all') {
    const scope = S.counts.indexed ? `titles, tags, notes and the text of ${plural(S.counts.indexed, 'saved page')}` : 'titles, addresses, tags and notes';
    return `<div class="empty">${bullets}<h2>Nothing matches “${esc(S.query || S.type)}”</h2>
      <p>Linemark searched ${scope}. Try fewer words, or narrow with <b>#tag</b>, <b>site:github.com</b>, <b>type:video</b>, <b>is:fav</b> or <b>is:broken</b>.</p>
      <div class="actions"><button class="btn" data-act="clear-search">${icon('x', 16)} Clear search</button>${S.route.kind !== 'all' ? `<button class="btn primary" data-act="search-all">${icon('search', 16)} Search all bookmarks</button>` : ''}</div></div>`;
  }
  if (!S.bookmarks.length) {
    return `<div class="empty">${bullets}<h2>Every link gets a line</h2>
      <p>Linemark keeps your bookmarks on this machine, organised into colour-coded lines. Start by bringing in what you already have.</p>
      <div class="actions">
        ${M.hasChrome ? `<button class="btn primary" data-act="import-chrome">${icon('download', 17)} Import Chrome bookmarks</button>` : ''}
        <button class="btn" data-act="import-html">${icon('upload', 17)} Import HTML file</button>
        <button class="btn" data-act="add">${icon('plus', 17)} Add a link</button>
      </div>
      <p class="hint">Save any page with the toolbar button or <kbd>Alt</kbd><kbd>Shift</kbd><kbd>S</kbd> · search from the address bar with <kbd>lm</kbd> <kbd>Space</kbd></p></div>`;
  }
  const msgs = {
    trash: ['Trash is empty', 'Deleted links wait here until you restore them or empty the trash.'],
    unsorted: ['Nothing unsorted', 'Everything you saved is on a line. New saves land here first.'],
    favorites: ['No favorites yet', 'Star a link to keep it one click away.'],
    duplicates: ['No duplicates', 'Every link in your library is unique.'],
    departures: ['Nothing due', 'Links you set to revisit appear here on their day. Choose Revisit… in a link’s menu.'],
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
  await M.addTombstones(ids);
  await db.delMany('media', media);
  for (const m of media) mediaCache.get(m)?.then((u) => u && URL.revokeObjectURL(u)), mediaCache.delete(m);
  await db.delMany('texts', ids);
  textsChanged();
  const gone = new Set(ids);
  S.bookmarks = S.bookmarks.filter((b) => !gone.has(b.id));
  ids.forEach((id) => S.selected.delete(id));
  index();
  renderAll();
  toast(`${plural(ids.length, 'link')} deleted forever`);
}

async function move(ids, collectionId) {
  const snap = snapshot(ids);
  await putBookmarks(ids.map((id) => {
    const b = Object.assign(S.bm.get(id), { collectionId, trashedAt: null });
    if (b.alsoOn) b.alsoOn = b.alsoOn.filter((x) => x !== collectionId); // its main line now; no longer an extra stop
    return b;
  }));
  S.selected.clear();
  renderAll();
  const c = S.col.get(collectionId);
  toast(`${plural(ids.length, 'link')} moved to ${c ? c.name : 'Unsorted'}`, { action: 'Undo', onAction: () => restoreSnapshot(snap), lead: c ? lineBullet(c, 18) : unsortedBullet(18, 'var(--band-ink-2)') });
}

// Interchange: picking a line adds it as a further stop, or removes it if the link already stops there.
async function toggleAlso(ids, cid) {
  const c = S.col.get(cid);
  if (!fileable(c)) return;
  const has = ids.every((id) => S.bm.get(id).alsoOn?.includes(cid));
  const snap = snapshot(ids);
  await putBookmarks(ids.map((id) => {
    const b = S.bm.get(id);
    const set = new Set(b.alsoOn || []);
    if (has) set.delete(cid); else if (b.collectionId !== cid) set.add(cid);
    b.alsoOn = [...set].slice(0, 8);
    if (!b.alsoOn.length) delete b.alsoOn;
    return b;
  }));
  renderAll();
  toast(has ? `${plural(ids.length, 'link')} no longer on ${c.name}` : `${plural(ids.length, 'link')} now also on ${c.name}`, { action: 'Undo', onAction: () => restoreSnapshot(snap), lead: lineBullet(c, 18) });
}

// The departures board: come back to a link on a given day.
async function setRevisit(ids, at) {
  const snap = snapshot(ids);
  await putBookmarks(ids.map((id) => {
    const b = S.bm.get(id);
    if (at) b.revisitAt = at; else delete b.revisitAt;
    return b;
  }));
  afterEdit(ids);
  toast(at ? `${plural(ids.length, 'link')} on the board for ${M.revisitLabel(at).toLowerCase()}` : `${plural(ids.length, 'link')} taken off the board`, { action: 'Undo', onAction: () => restoreSnapshot(snap), lead: departuresBullet(18) });
}
function revisitMenu(anchor, ids) {
  const b = S.bm.get(ids[0]);
  openMenu(anchor, (m, close) => {
    m.innerHTML = `<div class="label" style="padding:4px 9px 6px">Revisit</div>${M.REVISIT_CHOICES.map(([l, d]) => menuItem({ label: l, iconName: 'clock', attrs: `data-days="${d}"` })).join('')}${b?.revisitAt ? `<div class="menu-sep"></div>${menuItem({ label: 'Take off the board', iconName: 'x', attrs: 'data-days="0"' })}` : ''}`;
    m.addEventListener('click', (e) => {
      const d = e.target.closest('[data-days]')?.dataset.days;
      if (d === undefined) return;
      close();
      setRevisit(ids, +d ? M.revisitIn(+d) : null);
    });
  }, { align: 'end' });
}

// Dead links: ask the Internet Archive for its closest copy (only when asked; it learns the address).
async function archivedCopy(anchor, id) {
  const b = S.bm.get(id);
  const ok = await (M.hasChrome ? chrome.permissions.request({ origins: ['https://archive.org/*'] }).catch(() => false) : true);
  if (!ok) { toast('Linemark needs permission to ask archive.org.'); return; }
  toast('Asking the Internet Archive…');
  let copy;
  try { copy = await M.findArchivedCopy(b.url); } catch (err) { toast(err.message || 'The Internet Archive didn’t answer.'); return; }
  if (!copy) { toast(`The Internet Archive has no copy of ${M.hostOf(b.url)}`); return; }
  const when = copy.when ? new Date(copy.when).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : 'an earlier date';
  openMenu(anchor, (m, close) => {
    m.innerHTML = `<div class="label" style="padding:4px 9px 6px">Archived copy from ${esc(when)}</div>
      ${menuItem({ label: 'Open archived copy', iconName: 'external', action: 'open' })}
      ${menuItem({ label: 'Use it as this link’s address', iconName: 'archive', action: 'use' })}`;
    m.addEventListener('click', async (e) => {
      const act = e.target.closest('[data-mi]')?.dataset.mi;
      if (!act) return;
      close();
      if (act === 'open') openTabs([copy.url]);
      if (act === 'use') {
        const snap = snapshot([id]);
        b.note = [b.note, `Original address: ${b.url}`].filter(Boolean).join('\n');
        b.url = copy.url;
        b.health = { state: 'ok', code: 200, note: 'Archived copy', checkedAt: Date.now() };
        await putBookmarks([b]);
        renderAll();
        toast('Now pointing at the archived copy', { action: 'Undo', onAction: () => restoreSnapshot(snap) });
      }
    });
  }, { align: 'end' });
}

// Lines ↔ Chrome tab groups: open a line as a coloured group, or keep the window's groups as lines.
async function openAsTabGroup(id) {
  const c = S.col.get(id);
  const urls = S.bookmarks.filter((b) => !b.trashedAt && (b.collectionId === id || b.alsoOn?.includes(id))).map((b) => b.url);
  if (!urls.length) { toast(`${c.name} has no links to open`); return; }
  if (urls.length > 20 && !confirmOpenMany(urls.length)) return;
  if (!(await chrome.permissions.request({ permissions: ['tabGroups'] }).catch(() => false))) { toast('Linemark needs permission to make tab groups.'); return; }
  const tabs = [];
  for (const url of urls) tabs.push(await chrome.tabs.create({ url, active: false }));
  const groupId = await chrome.tabs.group({ tabIds: tabs.map((t) => t.id) });
  await chrome.tabGroups.update(groupId, { title: c.name, color: M.tabGroupColor(c.color), collapsed: false });
  toast(`Opened ${plural(urls.length, 'tab')} as the ${c.name} tab group`, { lead: lineBullet(c, 18) });
}
async function saveTabGroups() {
  if (!(await chrome.permissions.request({ permissions: ['tabs', 'tabGroups'] }).catch(() => false))) { toast('Linemark needs permission to read your tab groups.'); return; }
  const groups = await chrome.tabGroups.query({ windowId: chrome.windows?.WINDOW_ID_CURRENT ?? -2 });
  if (!groups.length) { toast('This window has no tab groups.'); return; }
  let lines = 0, links = 0;
  for (const g of groups) {
    const tabs = (await chrome.tabs.query({ groupId: g.id })).filter((t) => M.isSavable(t.url));
    if (!tabs.length) continue;
    const name = (g.title || '').trim() || 'Tab group';
    const plan = M.planLinePath(S.collections.filter(fileable), name);
    const target = plan.target;
    if (plan.created.length) { plan.created.forEach((x) => { x.color = M.lineColorForGroup(g.color); }); await putCollections(plan.created); lines++; }
    const known = new Set(S.bookmarks.filter((b) => !b.trashedAt).map((b) => M.normalizeUrl(b.url)));
    const fresh = tabs.filter((t) => !known.has(M.normalizeUrl(t.url))).map((t) => M.newBookmark({ url: t.url, title: t.title, collectionId: target.id }));
    if (fresh.length) { await putBookmarks(fresh); links += fresh.length; }
  }
  renderAll();
  toast(links ? `Saved ${plural(links, 'link')}${lines ? ` on ${plural(lines, 'new line')}` : ''} from your tab groups` : 'Every tab in those groups is already saved');
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
  S.fresh = [c.id];
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
  const stops = S.bookmarks.filter((b) => !ids.has(b.collectionId) && b.alsoOn?.some((x) => ids.has(x))).map((b) => b.id);
  const snap = snapshot([...bms, ...stops]);
  const now = Date.now();
  await putBookmarks([
    ...bms.map((bid) => Object.assign(S.bm.get(bid), { trashedAt: now })),
    ...stops.map((bid) => { const b = S.bm.get(bid); b.alsoOn = b.alsoOn.filter((x) => !ids.has(x)); if (!b.alsoOn.length) delete b.alsoOn; return b; }),
  ]);
  await db.delMany('collections', [...ids]);
  await M.addTombstones([...ids]);
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
    if (where === 'into' && t.smart) where = 'after';
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
  if (c.smart) return smartLineMenu(anchor, c);
  openMenu(anchor, (m, close) => {
    m.innerHTML = `
      ${menuItem({ label: 'Rename', iconName: 'edit', action: 'rename' })}
      ${menuItem({ label: 'Add branch line', iconName: 'plus', action: 'child' })}
      ${menuItem({ label: 'Open all links', iconName: 'external', action: 'open' })}
      ${M.hasChrome && chrome.tabs?.group ? menuItem({ label: 'Open as tab group', iconName: 'tabs', action: 'tab-group' }) : ''}
      <div class="menu-sep"></div>
      <div class="label" style="padding:4px 9px 0">Line colour</div>
      <div class="swatches" role="radiogroup" aria-label="Line colour">${M.LINE_COLORS.map((x) => `<button class="swatch" role="radio" aria-checked="${x.value === c.color}" style="--c:${x.value}" data-color="${x.value}" title="${x.name}"></button>`).join('')}</div>
      <div class="label" style="padding:2px 9px 0">Bullet</div>
      <div class="bullet-row">
        ${lineBullet(c, 30)}
        <input class="input" id="code-input" maxlength="2" value="${esc(c.icon ? '' : c.code || '')}" placeholder="${esc(M.codeFor(c.name))}" aria-label="Bullet letters" title="One or two letters">
        <button type="button" class="btn sm" data-mi="icon">${icon('image', 15)} Icon or emoji…</button>
      </div>
      ${c.icon ? menuItem({ label: 'Use letters instead', iconName: 'x', action: 'no-icon' }) : ''}
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
      if (act === 'icon') loadIcons().then(() => iconPicker(anchor, c));
      if (act === 'no-icon') { c.icon = ''; await putCollections([c]); renderAll(); }
      if (act === 'child') newLine(id);
      if (act === 'open') openTabs(S.bookmarks.filter((b) => (b.collectionId === id || b.alsoOn?.includes(id)) && !b.trashedAt).map((b) => b.url));
      if (act === 'tab-group') openAsTabGroup(id);
      if (act === 'delete') deleteLine(id);
    });
    const codeInput = $('#code-input', m);
    codeInput.addEventListener('change', async () => {
      const v = codeInput.value.trim().toUpperCase();
      c.code = v || M.codeFor(c.name);
      c.autoCode = !v;
      if (v) c.icon = ''; // typing letters means "show letters"
      await putCollections([c]);
      renderAll();
    });
    codeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { codeInput.blur(); close(); } });
  });
}

// A smart line's menu: its search, name and colour (it holds no links, so no bullet or branches).
function smartLineMenu(anchor, c) {
  openMenu(anchor, (m, close) => {
    m.innerHTML = `
      <div class="label" style="padding:4px 9px 6px">Shows links matching</div>
      <form class="smart-form"><input class="input menu-search" value="${esc(c.query)}" aria-label="Search for this smart line" spellcheck="false"></form>
      ${menuItem({ label: 'Rename', iconName: 'edit', action: 'rename' })}
      <div class="label" style="padding:4px 9px 0">Line colour</div>
      <div class="swatches" role="radiogroup" aria-label="Line colour">${M.LINE_COLORS.map((x) => `<button class="swatch" role="radio" aria-checked="${x.value === c.color}" style="--c:${x.value}" data-color="${x.value}" title="${x.name}"></button>`).join('')}</div>
      <div class="menu-sep"></div>
      ${menuItem({ label: 'Delete smart line', iconName: 'trash', action: 'delete', danger: true })}`;
    $('.smart-form', m).addEventListener('submit', async (e) => {
      e.preventDefault();
      const q = $('.menu-search', m).value.trim();
      if (!q) return;
      c.query = q;
      close();
      await putCollections([c]);
      renderAll();
    });
    m.addEventListener('click', async (e) => {
      const sw = e.target.closest('[data-color]');
      if (sw) { c.color = sw.dataset.color; $$('.swatch', m).forEach((x) => x.setAttribute('aria-checked', x === sw)); await putCollections([c]); renderAll(); return; }
      const act = e.target.closest('[data-mi]')?.dataset.mi;
      if (!act) return;
      close();
      if (act === 'rename') { S.renaming = c.id; renderBand(); }
      if (act === 'delete') deleteLine(c.id);
    });
  });
}

async function saveSmartLine() {
  const q = S.query.trim();
  if (!q) return;
  const c = { id: M.uid(), name: q.length > 40 ? q.slice(0, 38) + '…' : q, code: 'S', color: nextColor(), parentId: null, order: roots().length, expanded: false, createdAt: Date.now(), smart: true, query: q };
  await putCollections([c]);
  S.query = '';
  if ($('#search')) $('#search').value = '';
  go('#/c/' + c.id);
  toast(`Smart line “${c.name}” keeps every link matching ${q}`, { lead: lineBullet(c, 18) });
}

// Icon picker for a line's bullet: bundled Lucide icons (searchable) or any emoji.
function iconPicker(anchor, c) {
  openMenu(anchor, (m, close) => {
    m.classList.add('icon-picker');
    m.innerHTML = `
      <div class="picker-head">${lineBullet(c, 30, 'picker-preview')}<input class="input menu-search" placeholder="Search icons: book, code, travel…" aria-label="Search icons"></div>
      <div class="icon-grid" role="group" aria-label="Icons"></div>
      <form class="emoji-row"><label class="label" for="emoji-in">Or any emoji</label><input class="input" id="emoji-in" placeholder="🚆" autocomplete="off" aria-describedby="emoji-err"><button class="btn sm" type="submit">Use</button><span class="field-error" id="emoji-err" role="alert"></span></form>`;
    const grid = $('.icon-grid', m);
    const draw = (q = '') => {
      const names = searchIcons(q);
      grid.innerHTML = names.length
        ? names.map((n) => `<button type="button" class="icon-cell" data-icon="${n}" aria-label="${n.replace(/-/g, ' ')}" title="${n.replace(/-/g, ' ')}" aria-pressed="${c.icon === 'lucide:' + n}">${iconSvg(n, 2)}</button>`).join('')
        : `<div class="menu-empty">No icons match “${esc(q)}”. Try an emoji below.</div>`;
    };
    draw();
    const set = async (value) => {
      c.icon = value;
      await putCollections([c]);
      close();
      renderAll();
    };
    const search = $('.menu-search', m);
    search.addEventListener('input', () => draw(search.value));
    search.addEventListener('keydown', (e) => { if (e.key === 'ArrowDown') { e.preventDefault(); $('.icon-cell', grid)?.focus(); } });
    grid.addEventListener('click', (e) => { const b = e.target.closest('[data-icon]'); if (b) set('lucide:' + b.dataset.icon); });
    $('.emoji-row', m).addEventListener('submit', (e) => {
      e.preventDefault();
      const emo = cleanEmoji($('#emoji-in', m).value);
      if (!emo) { $('#emoji-err', m).textContent = 'Type or paste a single emoji.'; $('#emoji-in', m).setAttribute('aria-invalid', 'true'); return; }
      set('emoji:' + emo);
    });
  }, { width: 352 });
}

// Line picker (used by Move, the drawer, and Add link).
function linePicker(anchor, currentId, onPick, { allowNone = true, title, checked = null, exclude = null } = {}) {
  openMenu(anchor, (m, close) => {
    const flat = [];
    const walk = (list, depth) => { for (const c of list) { if (!fileable(c)) continue; if (c.id !== exclude) flat.push([c, depth]); walk(kidsOf(c.id), depth + 1); } };
    walk(roots(), 0);
    const draw = (q = '') => {
      // "Videos/Markiplier" finds or creates a line and a branch inside it
      const ql = M.splitLinePath(q).join('/').toLowerCase();
      const path = (c) => M.linePathOf(S.collections, c.id);
      const items = flat.filter(([c]) => !ql || path(c).join('/').toLowerCase().includes(ql));
      const create = M.createLineLabel(S.collections, q);
      $('.picker-list', m).innerHTML =
        (allowNone && !ql ? menuItem({ label: 'Unsorted', lead: unsortedBullet(18, 'var(--ink-3)'), action: '', checked: !currentId, attrs: 'data-pick=""' }) : '') +
        items.map(([c, d]) => menuItem({ label: ql && d ? path(c).join(' › ') : c.name, lead: `<span style="width:${ql ? 0 : d * 14}px;flex:none"></span>${lineBullet(c, 18)}`, checked: checked ? checked.has(c.id) : c.id === currentId, attrs: `data-pick="${c.id}"` })).join('') +
        (create ? menuItem({ label: create, iconName: 'plus', attrs: `data-create="${esc(q)}"` }) : '') +
        (!items.length && !q ? '<div class="menu-empty">No lines yet.</div>' : '');
    };
    m.innerHTML = `${title ? `<div class="label" style="padding:4px 9px 6px">${esc(title)}</div>` : ''}<input class="input menu-search" placeholder="Find a line, or type Line/Branch" aria-label="Find a line, or type Line/Branch to create a branch"><div class="picker-list"></div>`;
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
        const plan = M.planLinePath(S.collections, it.dataset.create);
        for (const o of plan.opened) S.col.get(o.id).expanded = true;
        S.fresh = plan.created.map((x) => x.id);
        await putCollections([...plan.created, ...plan.opened.map((o) => S.col.get(o.id))]);
        close();
        onPick(plan.target?.id || null);
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
      ${menuItem({ label: 'Also show on…', iconName: 'interchange', action: 'also' })}
      ${menuItem({ label: b.revisitAt ? `Revisit (${M.revisitLabel(b.revisitAt).toLowerCase()})…` : 'Revisit…', iconName: 'clock', action: 'revisit' })}
      ${b.health && ['dead', 'warn'].includes(b.health.state) ? menuItem({ label: 'Find archived copy', iconName: 'archive', action: 'archive' }) : ''}
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
      if (act === 'also') linePicker(anchor, null, (cid) => cid && toggleAlso(ids, cid), { title: 'Also show on', allowNone: false, checked: new Set(b.alsoOn || []), exclude: b.collectionId });
      if (act === 'revisit') revisitMenu(anchor, ids);
      if (act === 'archive') archivedCopy(anchor, id);
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
  if (S.ui.chime && urls.length) chime();
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
  if (!ok) { toast('Linemark needs the “tabs” permission to read your open tabs.'); return; }
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
            toast('Linemark couldn’t reach any site. Check your connection and try again.');
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
      textsChanged();
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
  el.innerHTML = `<div class="scan-line"><span>${what}</span><span class="tnum">${j.done.toLocaleString()} / ${j.total.toLocaleString()}</span><button class="icon-btn sm" data-act="scan-cancel" aria-label="Stop">${icon('x', 14)}</button></div><div class="progress train"><i style="width:${(j.done / j.total) * 100}%"></i></div>`;
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
  if (!granted) { toast('Linemark needs permission to read sites for this. Nothing was fetched.'); return; }
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
      <div class="ai-row" id="d-ai" hidden></div>
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
  offerSuggestions(b);
}

// On-device AI: offered only where Chrome has its built-in model; it runs only when Suggest is clicked.
// The answer is kept for the open link, so applying one suggestion redraws the drawer with the rest.
async function offerSuggestions(b) {
  const box = $('#d-ai');
  if (!box) return;
  if (S.aiOut?.id === b.id) { box.hidden = false; showSuggestions(b, S.aiOut); return; }
  const status = await AI.aiStatus();
  if (status === 'unavailable' || S.editing !== b.id || !$('#d-ai')) return;
  box.hidden = false;
  box.innerHTML = `<button type="button" class="btn sm" id="d-suggest">${icon('sparkles', 15)} Suggest line, tags and summary</button><span class="hint">Uses Chrome’s built-in AI on this computer. Nothing is sent anywhere.${status === 'downloadable' ? ' The first time, Chrome downloads its model.' : ''}</span>`;
  $('#d-suggest').addEventListener('click', async () => {
    const btn = $('#d-suggest');
    btn.disabled = true;
    btn.innerHTML = `${icon('sparkles', 15)} Thinking…`;
    try {
      const text = (await db.get('texts', b.id))?.text || b.excerpt || '';
      const lines = S.collections.filter(fileable).map((c) => M.linePathOf(S.collections, c.id).join('/'));
      const out = await AI.suggest({ title: b.title, url: b.url, text, lines, tags: [...S.counts.tags.keys()] }, (p) => { btn.innerHTML = `${icon('sparkles', 15)} Downloading the model… ${Math.round(p * 100)}%`; });
      S.aiOut = { id: b.id, ...out };
      if (S.editing === b.id && $('#d-ai')) showSuggestions(b, S.aiOut);
    } catch {
      btn.disabled = false;
      btn.innerHTML = `${icon('sparkles', 15)} Suggest line, tags and summary`;
      toast('Chrome’s built-in AI couldn’t make a suggestion this time.');
    }
  });
}

function showSuggestions(b, out) {
  const box = $('#d-ai');
  const found = out.line ? M.resolveLinePath(S.collections, M.splitLinePath(out.line)) : null;
  const existing = found && !found.missing.length ? found.found.at(-1) : null;
  const showLine = out.line && (!existing || existing.id !== b.collectionId);
  const tags = out.tags.filter((t) => !b.tags.includes(t));
  const showSum = out.summary && b.excerpt !== out.summary;
  if (!showLine && !tags.length && !showSum) { box.innerHTML = `<span class="hint">${icon('check', 14)} Suggestions applied.</span>`; return; }
  box.innerHTML = `<div class="ai-out">
      <div class="ai-head">${icon('sparkles', 14)} Suggestions <span class="hint">Click to apply</span></div>
      ${showLine ? `<button type="button" class="ai-chip" data-ai="line">${existing ? lineBullet(existing, 16) : icon('plus', 14)}${esc(existing ? M.linePathOf(S.collections, existing.id).join(' › ') : 'New line: ' + M.splitLinePath(out.line).join(' › '))}</button>` : ''}
      ${tags.map((t) => `<button type="button" class="ai-chip" data-ai="tag" data-t="${esc(t)}">${icon('plus', 13)}#${esc(t)}</button>`).join('')}
      ${showSum ? `<p class="ai-sum">${esc(out.summary)}</p><button type="button" class="btn sm" data-ai="summary">Use as description</button>` : ''}
    </div>`;
  box.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-ai]');
    if (!el) return;
    const kind = el.dataset.ai;
    if (kind === 'line') {
      const plan = M.planLinePath(S.collections.filter(fileable), out.line);
      for (const o of plan.opened) S.col.get(o.id).expanded = true;
      if (plan.created.length || plan.opened.length) await putCollections([...plan.created, ...plan.opened.map((o) => S.col.get(o.id))]);
      b.collectionId = plan.target?.id || null;
      S.fresh = plan.created.map((x) => x.id);
    }
    if (kind === 'tag') b.tags = M.normalizeTags([...b.tags, el.dataset.t]);
    if (kind === 'summary') b.excerpt = out.summary;
    await putBookmarks([b]);
    renderAll();
    renderDrawer();
  });
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
      m.addEventListener('click', (e) => { const t = e.target.closest('[data-t]')?.dataset.t; if (t) { input.value = ''; closeMenu(); commit(t); } });
    }, { focus: false });
  };
  input.addEventListener('input', () => {
    if (input.value.includes(',')) { const v = input.value; input.value = ''; closeMenu(); commit(v); return; }
    suggest();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); const v = input.value; input.value = ''; closeMenu(); commit(v); }
    if (e.key === 'Backspace' && !input.value && b.tags.length) { b.tags.pop(); putBookmarks([b]).then(() => { renderDrawer(); $('#d-tag-input')?.focus(); renderBand(); refreshCard(b.id); }); }
  });
  // Leaving the field commits what was typed, unless focus moved into the suggestion list.
  input.addEventListener('blur', (e) => {
    if (e.relatedTarget?.closest?.('.menu')) return;
    if (input.value.trim()) { const v = input.value; input.value = ''; closeMenu(); commit(v); }
  });
  $('#d-tags').addEventListener('click', (e) => { if (e.target.id === 'd-tags') input.focus(); });
}

// ======================= sync (optional) =======================

let syncTimer = null;
let syncing = false;

const syncState = () => (syncing ? 'busy' : S.sync.locked || S.sync.lastError ? 'warn' : 'ok');
function syncLabel() {
  if (syncing) return 'Sync: syncing now';
  if (S.sync.locked) return 'Sync: locked, enter your passphrase in Settings';
  if (S.sync.lastError) return 'Sync needs attention: ' + S.sync.lastError;
  return S.sync.lastSync ? `Sync: up to date, ${relTime(S.sync.lastSync)}` : 'Sync: on';
}

async function refreshSyncState() {
  const s = await Sync.settings();
  S.sync = { enabled: !!s.enabled, lastSync: s.lastSync, lastError: s.lastError, lastStats: s.lastStats, clientId: s.clientId || '', locked: s.enabled && !(await Sync.hasKey()) };
}

// Changes sync a little after you stop editing, when the library opens, and every five minutes.
function scheduleSync(delay = 15000) {
  if (!S.sync.enabled || S.sync.locked) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(runSync, delay);
}

async function runSync({ interactive = false, announceResult = false } = {}) {
  if (syncing) return;
  syncing = true;
  renderBand();
  try {
    const st = await Sync.syncNow({ interactive });
    if (st && (st.received || st.removed || st.downloaded)) { await load(); renderAll(); }
    if (announceResult) toast(st ? `Synced: ${plural(st.received, 'change')} received${st.removed ? `, ${st.removed} removed` : ''}` : 'Sync is off');
  } catch (e) {
    if (announceResult) toast(e.message, { duration: 8000 });
  } finally {
    syncing = false;
    await refreshSyncState();
    renderBand();
    if (S.route.kind === 'settings') renderSettings();
  }
}

function syncSection() {
  const sy = S.sync;
  const intro = `<p>Linemark works fully on this computer, and sync stays off unless you turn it on. With sync, your library stays the same in Chrome, Edge, Brave or Vivaldi on your other computers. Everything is encrypted here with your passphrase before it reaches your own Google Drive, so Google only ever stores scrambled data.</p>`;
  let rows;
  if (!sy.enabled && !S.syncSetup) {
    rows = `<div class="row"><div class="what"><b>Sync is off</b><span>Your library lives only in this browser profile.</span></div><div class="act"><button class="btn" data-act="sync-setup">${icon('cloud', 16)} Set up sync</button></div></div>`;
  } else if (!sy.enabled) {
    const redirect = Sync.redirectUrl();
    const builtIn = Sync.builtInSignIn();
    const own = `<div class="field"><label for="sync-client">Google OAuth client ID</label>
        <input class="input" id="sync-client" autocomplete="off" spellcheck="false" placeholder="1234567890-abc.apps.googleusercontent.com" value="${esc(sy.clientId)}">
        <span class="hint">In the <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener">Google Cloud console</a>: turn on the Google Drive API, add the <b>drive.appdata</b> scope to the consent screen, then create a <b>Web application</b> client with this authorised redirect URI:</span>
        <span class="copy-row"><code id="sync-redirect">${esc(redirect || 'Available when Linemark runs as an extension')}</code>${redirect ? `<button type="button" class="btn sm" data-act="copy-redirect">${icon('copy', 14)} Copy</button>` : ''}</span>
      </div>`;
    rows = `<form class="sync-form" id="sync-form" novalidate>
      ${builtIn ? '<p class="hint">Sign in with your Google account, then choose a passphrase. Sign-in only gives Linemark its private app folder in your Drive; the passphrase is what encrypts your library.</p>' : '<p class="hint">This copy of Linemark has no built-in Google sign-in yet, so sync uses a Google project you own.</p>'}
      <div class="field"><label for="sync-pass">Passphrase</label><input class="input" id="sync-pass" type="password" autocomplete="new-password" minlength="10" required aria-describedby="sync-pass-hint"><span class="hint" id="sync-pass-hint">At least 10 characters. Use the same passphrase on every device. Linemark can’t recover it; if it’s lost, only the cloud copy is lost, never this computer’s library.</span></div>
      <div class="field"><label for="sync-pass2">Confirm passphrase</label><input class="input" id="sync-pass2" type="password" autocomplete="new-password" required></div>
      ${builtIn ? `<details class="advanced" ${sy.clientId ? 'open' : ''}><summary>Advanced: use your own Google project</summary>${own}</details>` : own}
      <span class="field-error" id="sync-err" role="alert"></span>
      <div class="form-actions"><button class="btn primary" type="submit" id="sync-go">${icon('cloud', 16)} ${builtIn ? 'Sign in with Google and sync' : 'Connect Google Drive and sync'}</button><button class="btn ghost" type="button" data-act="sync-cancel">Cancel</button></div>
    </form>`;
  } else if (sy.locked) {
    rows = `<form class="sync-form" id="sync-unlock" novalidate>
      <div class="field"><label for="sync-unlock-pass">Passphrase</label><input class="input" id="sync-unlock-pass" type="password" autocomplete="current-password" required><span class="hint">This device forgot its key. Enter your sync passphrase to carry on syncing.</span></div>
      <span class="field-error" id="sync-err" role="alert"></span>
      <div class="form-actions"><button class="btn primary" type="submit">${icon('cloud', 16)} Unlock and sync</button><button class="btn ghost" type="button" data-act="sync-off">Turn off sync</button></div>
    </form>`;
  } else {
    const st = sy.lastStats;
    rows = `
      <div class="row"><div class="what"><b>${sy.lastSync ? `Synced ${relTime(sy.lastSync)}` : 'Sync is on'}</b><span>${st ? `${plural(st.links, 'link')} on ${plural(st.lines, 'line')} and ${plural(st.images, 'image')} in your encrypted cloud copy.` : 'Waiting for the first sync.'}</span>${sy.lastError ? `<span class="field-error">${esc(sy.lastError)}</span>` : ''}</div>
        <div class="act"><button class="btn" data-act="sync-now" ${syncing ? 'disabled' : ''}>${icon('refresh', 16)} ${syncing ? 'Syncing…' : 'Sync now'}</button></div></div>
      <div class="row"><div class="what"><b>This device</b><span>Remembers its encryption key, so sync runs by itself. Forget it to require the passphrase again.</span></div><div class="act"><button class="btn ghost" data-act="sync-forget">Forget key</button></div></div>
      <div class="row"><div class="what"><b>Turn off sync</b><span>Stops syncing on this device. The encrypted cloud copy stays, so your other devices keep working. Deleting the cloud copy turns sync off everywhere.</span></div><div class="act"><button class="btn" data-act="sync-off">Turn off</button><button class="btn danger" data-act="sync-off-delete">${icon('trash', 16)} Delete cloud copy</button></div></div>`;
  }
  return `<section id="sync-section"><h2>${icon('cloud', 20)} Sync <span class="tag-optional">Optional</span></h2>${intro}<div class="rows">${rows}</div></section>`;
}

// Deep lines bundle their stems, so names can run out of room: hovering or focusing one shows its full path.
function wireLineTips() {
  let tip = null;
  let owner = null;
  const hide = () => { if (tip) tip.hidden = true; owner?.removeAttribute('aria-describedby'); owner = null; };
  const show = (a) => {
    const name = $('.stop-name', a);
    const cut = name && name.scrollWidth > name.clientWidth + 1;
    if (!a.dataset.path || !(cut || +a.dataset.depth >= 3)) return;
    if (!tip) { tip = document.createElement('div'); tip.className = 'line-tip'; tip.id = 'line-tip'; tip.setAttribute('role', 'tooltip'); document.body.append(tip); }
    const parts = a.dataset.path.split(' › ');
    tip.innerHTML = parts.map((p, i) => (i === parts.length - 1 ? `<b>${esc(p)}</b>` : esc(p))).join(' <i>›</i> ');
    tip.hidden = false;
    const row = a.closest('.stop').getBoundingClientRect();
    const band = $('#band').getBoundingClientRect();
    tip.style.left = `${Math.max(8, Math.min(band.right + 8, innerWidth - tip.offsetWidth - 8))}px`;
    tip.style.top = `${row.top + row.height / 2}px`;
    owner = a;
    a.setAttribute('aria-describedby', 'line-tip');
  };
  const band = $('#band');
  band.addEventListener('mouseover', (e) => { const a = e.target.closest('.stop-link'); if (a !== owner) { hide(); if (a) show(a); } });
  band.addEventListener('mouseleave', hide);
  band.addEventListener('focusin', (e) => { const a = e.target.closest('.stop-link'); hide(); if (a) show(a); });
  band.addEventListener('focusout', hide);
  band.addEventListener('scroll', hide, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); });
}

function wireSyncForms() {
  const form = $('#sync-form');
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#sync-err');
    const clientId = $('#sync-client').value.trim();
    const pass = $('#sync-pass').value;
    const fail = (msg, field) => { err.textContent = msg; field?.setAttribute('aria-invalid', 'true'); field?.focus(); };
    $$('#sync-form [aria-invalid]').forEach((f) => f.removeAttribute('aria-invalid'));
    const needsOwn = !Sync.builtInSignIn();
    if ((needsOwn || clientId) && !/\.apps\.googleusercontent\.com$/.test(clientId)) {
      $('#sync-form details')?.setAttribute('open', '');
      return fail(needsOwn ? 'Enter your Google OAuth client ID (it ends in .apps.googleusercontent.com).' : 'That doesn’t look like a Google OAuth client ID (it ends in .apps.googleusercontent.com). Leave it empty to sign in with Google.', $('#sync-client'));
    }
    if (pass.length < 10) return fail('Use a passphrase of at least 10 characters.', $('#sync-pass'));
    if (pass !== $('#sync-pass2').value) return fail('The two passphrases don’t match.', $('#sync-pass2'));
    // the identity permission has to be requested inside the click
    const ok = await chrome.permissions.request({ permissions: ['identity'] }).catch(() => false);
    if (!ok) return fail('Linemark needs Chrome’s sign-in permission to connect to Google Drive.');
    const btn = $('#sync-go');
    btn.disabled = true;
    btn.textContent = 'Signing in and encrypting…';
    try {
      syncing = true;
      const st = await Sync.enable({ clientId, passphrase: pass });
      syncing = false;
      S.syncSetup = false;
      await load();
      await refreshSyncState();
      renderAll();
      toast(`Sync is on: ${plural(st.links, 'link')} encrypted and synced`);
    } catch (ex) {
      syncing = false;
      await refreshSyncState();
      btn.disabled = false;
      btn.innerHTML = `${icon('cloud', 16)} ${Sync.builtInSignIn() ? 'Sign in with Google and sync' : 'Connect Google Drive and sync'}`;
      fail(ex.message);
    }
  });
  $('#sync-unlock')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#sync-err');
    try {
      syncing = true;
      await Sync.unlock($('#sync-unlock-pass').value);
      syncing = false;
      await load();
      await refreshSyncState();
      renderAll();
      toast('Sync unlocked');
    } catch (ex) {
      syncing = false;
      err.textContent = ex.message;
      $('#sync-unlock-pass').setAttribute('aria-invalid', 'true');
    }
  });
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
        ${M.hasChrome ? `<div class="row"><div class="what"><b>Chrome bookmarks</b><span>Copies your bookmarks bar and other folders into Linemark. Chrome’s own bookmarks are left untouched.</span></div><div class="act"><button class="btn primary" data-act="import-chrome">${icon('download', 16)} Import</button></div></div>` : ''}
        ${M.hasChrome && chrome.tabs?.group ? `<div class="row"><div class="what"><b>Tab groups</b><span>Keeps each tab group in this window as a line in its colour. Tabs you already saved are skipped.</span></div><div class="act"><button class="btn" data-act="save-tab-groups">${icon('tabs', 16)} Save as lines</button></div></div>` : ''}
        <div class="row"><div class="what"><b>Bookmark HTML file</b><span>The standard export from Chrome, Edge, Firefox, Safari, Raindrop or Pocket. Tags and descriptions are kept.</span></div><div class="act"><button class="btn" data-act="import-html">${icon('upload', 16)} Choose file</button></div></div>
        <div class="row"><div class="what"><b>Linemark backup</b><span>Restores lines, links, notes and screenshots from a JSON backup. Matching links are updated.</span></div><div class="act"><button class="btn" data-act="import-json">${icon('upload', 16)} Restore</button></div></div>
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
    ${syncSection()}
    <section>
      <h2>${icon('refresh', 20)} Health &amp; search</h2>
      <p>Linemark reads each saved page directly: once to see if it still works, and to keep its text for full-text search. One request per link, four at a time. Cover images are downloaded once and kept on this computer; the library never loads anything from the web while you browse it.</p>
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
        ${host ? `<div class="row"><div class="what"><b>Site access</b><span>Granted. Linemark uses it only for the actions above and the Refresh button.</span></div><div class="act"><button class="btn" data-act="revoke-host">${icon('x', 16)} Revoke</button></div></div>` : ''}
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
        <div class="act"><div class="seg" role="group" aria-label="Theme">${['system', 'light', 'dark'].map((t) => `<button data-theme-set="${t}" aria-pressed="${S.ui.theme === t}">${icon(t === 'dark' ? 'moon' : t === 'light' ? 'sun' : 'monitor', 15)} ${t[0].toUpperCase() + t.slice(1)}</button>`).join('')}</div></div></div>
        <div class="row"><div class="what"><b>Station chime</b><span>Two soft notes when you save from the toolbar or here in Linemark (right-click saves stay quiet). Made on your computer; off unless you turn it on.</span></div>
        <div class="act"><button class="switch" role="switch" aria-checked="${!!S.ui.chime}" data-act="chime" aria-label="Station chime"></button></div></div></div>
    </section>
    <section>
      <h2>${icon('keyboard', 20)} Shortcuts</h2>
      <div class="rows"><div class="keys">
        <div>Save current page <span><kbd>Alt</kbd><kbd>Shift</kbd><kbd>S</kbd></span></div>
        <div>Open Linemark <span><kbd>Alt</kbd><kbd>Shift</kbd><kbd>L</kbd></span></div>
        <div>Search from address bar <span title="Type lm (lower-case L, M), then Space"><kbd>L</kbd><kbd>M</kbd><kbd>Space</kbd></span></div>
        <div>Search <span><kbd>/</kbd></span></div>
        <div>Add link <span><kbd>N</kbd></span></div>
        <div>Switch view <span><kbd>1</kbd>–<kbd>5</kbd></span></div>
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
      <div class="rows"><div class="row"><div class="what"><b class="tnum">${plural(S.counts.all, 'link')} on ${plural(S.collections.length, 'line')}, ${plural(S.counts.tags.size, 'tag')}</b><span>Using ${mb} of local storage in this Chrome profile.</span></div></div>
        <div class="row"><div class="what"><b>Linemark Wrapped</b><span>Your year on the lines: what you saved, where it went, and when. Worked out on this computer.</span></div><div class="act"><a class="btn" href="#/wrapped">${icon('map', 16)} Open</a></div></div></div>
    </section>
  </div>`;
  wireSyncForms();
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
      case 'visited': setRevisit(selectionOr(id), null); break;
      case 'save-smart': saveSmartLine(); break;
      case 'save-tab-groups': saveTabGroups(); break;
      case 'chime': S.ui.chime = !S.ui.chime; saveUI(); if (S.ui.chime) chime(); actEl.setAttribute('aria-checked', S.ui.chime); break;
      case 'wrap-year': S.wrapYear = +actEl.dataset.year; renderWrapped(); break;
      case 'wrap-view': S.ui.wrapView = actEl.dataset.v; saveUI(); between(renderWrapped); break;
      case 'wrap-export': exportWrapped(); break;
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
        if (!granted) { toast('Linemark needs permission to read the page.'); break; }
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
      case 'export-html': download(`linemark-bookmarks-${stamp()}.html`, new Blob([IO.toNetscape(S)], { type: 'text/html' })); break;
      case 'export-json': download(`linemark-backup-${stamp()}.json`, await IO.toBackup()); break;
      case 'scan': startScan(actEl.dataset.kind); break;
      case 'scan-cancel': if (S.scan) S.scan.cancelled = true; break;
      case 'recheck': startScan('links', S.list.map((x) => x.id)); break;
      case 'trash-dead': trash(S.bookmarks.filter((x) => !x.trashedAt && x.health?.state === 'dead').map((x) => x.id)); break;
      case 'sync-setup': S.syncSetup = true; renderSettings().then(() => $('#sync-client')?.focus()); break;
      case 'sync-cancel': S.syncSetup = false; renderSettings(); break;
      case 'copy-redirect': navigator.clipboard.writeText($('#sync-redirect').textContent).then(() => toast('Redirect URI copied')); break;
      case 'sync-now': runSync({ interactive: true, announceResult: true }); break;
      case 'sync-forget': await Sync.forgetKey(); await refreshSyncState(); renderAll(); toast('This device forgot its sync key'); break;
      case 'sync-off': await Sync.disable(); await refreshSyncState(); renderAll(); toast('Sync is off. Your library stays on this computer.'); break;
      case 'sync-off-delete': {
        if (!armConfirm(actEl, 'Delete the cloud copy?')) break;
        try { await Sync.disable({ deleteCloud: true }); toast('Cloud copy deleted. Sync is off; your library stays on this computer.'); }
        catch (ex) { toast(ex.message, { duration: 8000 }); }
        await refreshSyncState(); renderAll();
        break;
      }
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
  wireLineTips();
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
    if (/^[1-5]$/.test(e.key) && S.route.kind !== 'settings') { setView(VIEWS[+e.key - 1].id); return; }
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

const BM_MIME = 'application/x-linemark-bookmarks';
const LINE_MIME = 'application/x-linemark-line';

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
      if (!dragLine && zone.dataset.smart) return;
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
    if (kind === 'line') {
      const color = S.col.get(S.bm.get(ids[0])?.collectionId)?.color;
      const target = zone.dataset.id;
      await move(ids, target);
      fileAnimation(e.clientX, e.clientY, $(`#band .line-stop[data-id="${target}"]`), color);
    }
    else if (kind === 'unsorted') move(ids, null);
    else if (kind === 'favorites') { await setFavorite(ids, true); toast(`${plural(ids.length, 'link')} added to Favorites`, { lead: favBullet(18) }); }
    else if (kind === 'trash') trash(ids);
    else if (kind === 'all') { /* no-op */ }
  });
}

// ======================= boot =======================

// IndexedDB writes can fail (quota, corrupted profile). Say so instead of failing silently.
window.addEventListener('unhandledrejection', (e) => {
  const msg = e.reason?.name === 'QuotaExceededError' ? 'Chrome is out of storage space for Linemark. Free some disk space, then try again.' : `Something went wrong: ${e.reason?.message || e.reason}`;
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
  await refreshSyncState();
  bindEvents();
  renderAll();
  // Optional sync: nothing runs unless it was turned on.
  db.onLocalChange((store) => { if (store !== 'meta' && store !== 'media' && !syncing) scheduleSync(); });
  scheduleSync(1500);
  setInterval(() => scheduleSync(0), 5 * 60 * 1000);

  // The popup's "open" button asks an already-open manager to edit a link.
  if (typeof BroadcastChannel !== 'undefined') {
    new BroadcastChannel('ember').addEventListener('message', async (e) => {
      if (e.data?.type !== 'open-edit') return;
      if (!S.bm.has(e.data.id)) { await load(); renderAll(); }
      openDrawer(e.data.id);
    });
  }

  db.onRemoteChange(debounce(async (store) => {
    if (store !== 'meta') scheduleSync();
    await load();
    renderAll();
    if (S.editing && S.bm.has(S.editing) && !$('#drawer').contains(document.activeElement)) renderDrawer();
  }, 120));
}

// If startup fails, say so on the page instead of leaving it blank.
boot().catch((e) => {
  console.error(e);
  $('#content').innerHTML = `<div class="empty"><h2>Linemark couldn’t start</h2>
    <p>${esc(e?.message || String(e))}</p>
    <p>Your bookmarks are stored in this Chrome profile and haven’t been touched. Try reloading. If it keeps happening, open <b>chrome://extensions</b> and check Linemark’s <b>Errors</b>.</p>
    <div class="actions"><button class="btn primary" id="boot-retry">Reload</button></div></div>`;
  $('#boot-retry').addEventListener('click', () => location.reload());
});
