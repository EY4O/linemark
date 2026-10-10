// Line bullets: the round sign that marks every line. Its face is the line's icon, emoji or letters.
// Shared by the library and the popup so both draw a line the same way.
import { ICONS, ICON_WORDS } from './icon-pack.js';
import { bulletInk, codeFor } from './model.js';
import { esc } from './ui.js';

// A line's `icon` is '' (letters), 'lucide:<name>' or 'emoji:<emoji>'.
export function bulletFace(c) {
  const icon = c.icon || '';
  if (icon.startsWith('lucide:') && ICONS[icon.slice(7)]) {
    return { cls: ' has-icon', html: iconSvg(icon.slice(7)) };
  }
  if (icon.startsWith('emoji:')) return { cls: ' has-emoji', html: `<span class="emo" aria-hidden="true">${esc(icon.slice(6))}</span>` };
  const code = c.code || codeFor(c.name);
  return { cls: [...code].length > 1 ? ' two' : '', html: esc(code) };
}

export const iconSvg = (name, sw = 2.4) =>
  `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;

// size null leaves --bs to the stylesheet (the card-size slider drives it there).
export function lineBulletHTML(c, size = 20, cls = '', title = '') {
  const face = bulletFace(c);
  return `<span class="bullet${face.cls} ${cls}" style="${size ? `--bs:${size}px;` : ''}--c:${c.color};--bi:${bulletInk(c.color)}"${title ? ` title="${esc(title)}"` : ''}>${face.html}</span>`;
}

export const iconNames = () => Object.keys(ICONS);

export function searchIcons(query) {
  const q = query.trim().toLowerCase();
  if (!q) return iconNames();
  const words = q.split(/\s+/);
  return iconNames().filter((n) => words.every((w) => ICON_WORDS[n].includes(w)))
    .sort((a, b) => (b.startsWith(q) - a.startsWith(q)) || a.localeCompare(b));
}

// One emoji (with its modifiers and joiners), or nothing.
export function cleanEmoji(text) {
  const t = String(text || '').trim();
  if (!t) return '';
  const seg = typeof Intl.Segmenter === 'function' ? [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(t)].map((s) => s.segment) : [...t];
  const first = seg[0] || '';
  return /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(first) && first.length <= 16 ? first : '';
}
