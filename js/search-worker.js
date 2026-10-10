// Full-text search, off the page's main thread. Page text lives here, one copy per page, and is searched
// case-insensitively in place (no lowercased duplicate), so typing never waits on a scan of the whole library.
import * as db from './db.js';

let texts = null;   // Map: bookmark id -> page text
let loaded = -1;    // the generation the copy above belongs to
let loading = null;

// A write to the texts store anywhere (popup, sync, restore) drops the copy; the next search reloads it.
db.onRemoteChange((store) => { if (store === 'texts') texts = null; });

async function ensure(gen) {
  if (texts && loaded === gen) return;
  loading ??= db.getAll('texts').then((rows) => {
    texts = new Map(rows.map((r) => [r.id, r.text]));
    loaded = gen;
  }).finally(() => { loading = null; });
  await loading;
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// The passage around a match: the raw text before, the match, and after, cut at word boundaries.
function passage(text, at, len) {
  const start = Math.max(0, at - 70);
  const end = Math.min(text.length, at + len + 110);
  let before = text.slice(start, at);
  let after = text.slice(at + len, end);
  if (start > 0) before = before.replace(/^\S*\s/, '');
  if (end < text.length) after = after.replace(/\s\S*$/, '');
  return { before, hit: text.slice(at, at + len), after, cutStart: start > 0, cutEnd: end < text.length };
}

self.onmessage = async ({ data }) => {
  if (data?.type !== 'search') return;
  await ensure(data.gen);
  const res = [];
  const re = data.words.map((w) => new RegExp(escapeRe(w), 'iu'));
  for (const [id, text] of texts) {
    let found = null;
    let snip = null;
    for (let k = 0; k < re.length; k++) {
      const m = re[k].exec(text);
      if (!m) continue;
      (found ??= []).push(data.words[k]);
      snip ??= passage(text, m.index, m[0].length);
    }
    if (found) res.push([id, found, snip]);
  }
  self.postMessage({ type: 'result', key: data.key, hits: res });
};
