// IndexedDB persistence shared by the manager, the popup and the service worker.
// Stores: bookmarks, collections, media (cover blobs), texts (page text), meta (key/value settings).

const DB_NAME = 'ember';
const DB_VERSION = 2;
let dbPromise = null;

export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('bookmarks')) {
        const s = db.createObjectStore('bookmarks', { keyPath: 'id' });
        s.createIndex('collectionId', 'collectionId');
        s.createIndex('url', 'url');
      }
      if (!db.objectStoreNames.contains('collections')) db.createObjectStore('collections', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('media')) db.createObjectStore('media', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
      // v2: readable page text for full-text search, one row per bookmark id.
      if (!db.objectStoreNames.contains('texts')) db.createObjectStore('texts', { keyPath: 'id' });
    };
    req.onsuccess = () => {
      const db = req.result;
      // Let a newer version (e.g. after an extension update) take over instead of blocking it.
      db.onversionchange = () => { db.close(); dbPromise = null; };
      resolve(db);
    };
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function done(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
  });
}

function wrap(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getAll(store) {
  const db = await openDB();
  return wrap(db.transaction(store).objectStore(store).getAll());
}

export async function get(store, id) {
  const db = await openDB();
  return wrap(db.transaction(store).objectStore(store).get(id));
}

export async function put(store, value) {
  return putMany(store, [value]);
}

export async function putMany(store, values) {
  if (!values.length) return;
  const db = await openDB();
  const tx = db.transaction(store, 'readwrite');
  const os = tx.objectStore(store);
  for (const v of values) os.put(v);
  await done(tx);
  announce(store);
}

export async function del(store, id) {
  return delMany(store, [id]);
}

export async function delMany(store, ids) {
  if (!ids.length) return;
  const db = await openDB();
  const tx = db.transaction(store, 'readwrite');
  const os = tx.objectStore(store);
  for (const id of ids) os.delete(id);
  await done(tx);
  announce(store);
}

export async function keys(store) {
  const db = await openDB();
  return wrap(db.transaction(store).objectStore(store).getAllKeys());
}

export async function byIndex(store, index, value) {
  const db = await openDB();
  return wrap(db.transaction(store).objectStore(store).index(index).getAll(value));
}

export async function getMeta(key, fallback = null) {
  const row = await get('meta', key);
  return row ? row.value : fallback;
}

export async function setMeta(key, value) {
  return put('meta', { key, value });
}

// Cross-context change notifications (extension pages and the service worker share an origin).
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('ember') : null;
let quiet = false;

const localListeners = new Set();

function announce(store) {
  if (quiet) return;
  if (channel && store !== 'media') channel.postMessage({ type: 'changed', store });
  localListeners.forEach((fn) => fn(store));
}

// Writes made in this context (the broadcast above only reaches other contexts).
export function onLocalChange(fn) {
  localListeners.add(fn);
  return () => localListeners.delete(fn);
}

export function onRemoteChange(fn) {
  if (channel) channel.addEventListener('message', (e) => e.data?.type === 'changed' && fn(e.data.store));
}

// Run a burst of writes and announce once at the end.
export async function batch(fn) {
  quiet = true;
  try { await fn(); } finally { quiet = false; }
  announce('bookmarks');
}
