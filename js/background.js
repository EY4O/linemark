// Service worker: context menus, keyboard command, omnibox search, opening the manager.
import * as db from './db.js';
import * as M from './model.js';

const APP = chrome.runtime.getURL('app.html');

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'linemark-save-page', title: 'Save page to Linemark', contexts: ['page', 'frame', 'selection'] });
    chrome.contextMenus.create({ id: 'linemark-save-link', title: 'Save link to Linemark', contexts: ['link'] });
    chrome.contextMenus.create({ id: 'linemark-open', title: 'Open Linemark library', contexts: ['action'] });
  });
  chrome.action.setBadgeBackgroundColor({ color: '#ff5a1f' });
  if (chrome.action.setBadgeTextColor) chrome.action.setBadgeTextColor({ color: '#16171a' });
  if (reason === 'install') openLibrary();
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'linemark-open') return openLibrary();
  if (info.menuItemId === 'linemark-save-page' && tab) return savePage(tab);
  if (info.menuItemId === 'linemark-save-link' && info.linkUrl) return saveLink(info.linkUrl, info.selectionText, tab);
});

chrome.commands.onCommand.addListener((cmd) => {
  if (cmd === 'open-linemark') openLibrary();
});

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.type === 'open-linemark') {
    openLibrary(msg.edit).then(() => reply({ ok: true }));
    return true;
  }
});

async function flash(tabId, text) {
  try {
    await chrome.action.setBadgeText({ tabId, text });
    setTimeout(() => chrome.action.setBadgeText({ tabId, text: '' }).catch(() => {}), 2500);
  } catch {}
}

async function savePage(tab) {
  if (!M.isSavable(tab.url)) return flash(tab.id, '×');
  const found = await M.findByUrl(tab.url);
  if (found) return flash(tab.id, '✓');
  const b = M.newBookmark({ url: tab.url, title: tab.title });
  await M.saveBookmark(b);
  flash(tab.id, '✓');
  const [meta, shot] = await Promise.all([
    M.readPageMeta(tab.id),
    M.captureTab(tab.windowId).catch(() => null),
  ]);
  if (meta.title) b.title = meta.title.trim();
  if (meta.excerpt) b.excerpt = meta.excerpt.trim().slice(0, 600);
  if (meta.selection) b.note = '“' + meta.selection + '”';
  // Covers are stored locally: the page image if it can be downloaded, otherwise the screenshot.
  if (meta.image) { b.cover = await M.storeImage(meta.image, tab.id); if (b.cover) b.coverSource = 'page'; }
  if (!b.cover && shot) { b.cover = await M.saveCoverBlob(shot); b.coverSource = 'shot'; }
  if (meta.text && await M.saveText(b.id, meta.text)) b.textAt = Date.now();
  b.health = { state: 'ok', code: 200, checkedAt: Date.now() };
  b.metaFetched = true;
  await M.saveBookmark(b);
}

async function saveLink(url, text, tab) {
  if (!M.isSavable(url)) return;
  if (await M.findByUrl(url)) return tab && flash(tab.id, '✓');
  const b = M.newBookmark({ url, title: text || '' });
  await M.saveBookmark(b);
  if (tab) flash(tab.id, '✓');
  if (await M.hasHostAccess()) {
    const meta = await M.fetchMeta(url);
    if (!meta.error) {
      if (meta.title && !text) b.title = meta.title;
      if (meta.excerpt) b.excerpt = meta.excerpt.slice(0, 600);
      if (meta.image) { b.cover = await M.storeImage(meta.image); if (b.cover) b.coverSource = 'page'; }
    }
    b.metaFetched = true;
    await M.saveBookmark(b);
  }
}

async function openLibrary(editId) {
  const contexts = chrome.runtime.getContexts ? await chrome.runtime.getContexts({ contextTypes: ['TAB'] }) : [];
  const open = contexts.find((c) => c.documentUrl?.startsWith(APP));
  if (open && open.tabId >= 0) {
    await chrome.tabs.update(open.tabId, { active: true });
    if (open.windowId >= 0) await chrome.windows.update(open.windowId, { focused: true });
    if (editId) new BroadcastChannel('ember').postMessage({ type: 'open-edit', id: editId });
    return;
  }
  await chrome.tabs.create({ url: APP + (editId ? `?edit=${encodeURIComponent(editId)}` : '') });
}

// ---------- omnibox: type "em" + space in the address bar ----------
const xml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));

chrome.omnibox.setDefaultSuggestion({ description: 'Search Linemark for <match>%s</match>' });

chrome.omnibox.onInputChanged.addListener(async (text, suggest) => {
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return suggest([]);
  const all = await db.getAll('bookmarks');
  const hits = all
    .filter((b) => !b.trashedAt)
    .map((b) => {
      const title = b.title.toLowerCase();
      const hay = `${title} ${b.url.toLowerCase()} ${b.tags.join(' ')} ${(b.note || '').toLowerCase()}`;
      if (!words.every((w) => hay.includes(w))) return null;
      const score = words.reduce((s, w) => s + (title.startsWith(w) ? 4 : title.includes(w) ? 2 : 1), 0) + (b.favorite ? 1 : 0);
      return { b, score };
    })
    .filter(Boolean)
    .sort((a, z) => z.score - a.score || z.b.createdAt - a.b.createdAt)
    .slice(0, 8);
  suggest(hits.map(({ b }) => ({
    content: b.url,
    description: `${xml(b.title)} <dim>· ${xml(M.hostOf(b.url))}${b.tags.length ? ' · ' + xml(b.tags.map((t) => '#' + t).join(' ')) : ''}</dim>`,
  })));
});

chrome.omnibox.onInputEntered.addListener((text, disposition) => {
  const url = /^(https?|ftp|file):/i.test(text) ? text : `${APP}?q=${encodeURIComponent(text)}#/all`;
  if (disposition === 'currentTab') chrome.tabs.update({ url });
  else chrome.tabs.create({ url, active: disposition === 'newForegroundTab' });
});
