// On-device suggestions with Chrome's built-in AI. The model runs on this computer: nothing about the page is sent
// anywhere, and Linemark only asks it when someone clicks Suggest. Where Chrome has no built-in model, nothing shows.
import { normalizeTags } from './model.js';

const LM = () => globalThis.LanguageModel;

// 'available', 'downloadable' (the first use downloads the model), 'downloading', or 'unavailable'
export async function aiStatus() {
  if (!LM()?.availability) return 'unavailable';
  try { return await LM().availability(); } catch { return 'unavailable'; }
}

const SCHEMA = {
  type: 'object',
  properties: {
    line: { type: 'string' },
    tags: { type: 'array', items: { type: 'string' }, maxItems: 4 },
    summary: { type: 'string' },
  },
  required: ['line', 'tags', 'summary'],
};

// A line (an existing path, or a new "Parent/Child"), up to four tags, and a one- or two-sentence summary.
export async function suggest({ title, url, text, lines, tags }, onProgress) {
  const session = await LM().create({
    initialPrompts: [{ role: 'system', content: 'You help someone file their web bookmarks. Reply only with the JSON requested, in English unless the page is in another language.' }],
    monitor(m) { m.addEventListener('downloadprogress', (e) => onProgress?.(e.loaded)); },
  });
  try {
    const prompt = [
      `Bookmark title: ${title}`,
      `Address: ${url}`,
      `Start of the page text: ${String(text || '').slice(0, 4000)}`,
      '',
      `Their lines (folders), as paths: ${lines.join('; ') || 'none yet'}`,
      `Tags they already use: ${tags.slice(0, 60).join(', ') || 'none yet'}`,
      '',
      'Choose the best existing line path for this page. If none fits, suggest a new short one (write "Parent/Child" to put it under an existing line).',
      'Suggest up to four short lowercase tags, preferring ones they already use.',
      'Write a one- or two-sentence summary of what the page is.',
    ].join('\n');
    const out = JSON.parse(await session.prompt(prompt, { responseConstraint: SCHEMA }));
    return {
      line: String(out.line || '').trim().slice(0, 120),
      tags: normalizeTags(Array.isArray(out.tags) ? out.tags.map(String) : []).slice(0, 4),
      summary: String(out.summary || '').trim().slice(0, 600),
    };
  } finally {
    session.destroy?.();
  }
}
