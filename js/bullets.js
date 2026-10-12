// Line bullets: the round sign that marks every line. Its face is the line's icon, emoji or letters.
// Shared by the library and the popup so both draw a line the same way.
import { bulletInk, codeFor } from './model.js';
import { esc } from './ui.js';

// The bundled icons (242 Lucide icons, 68 KB) and site logos (Simple Icons, 67 KB) load only when a line uses one,
// or when the icon picker opens. Until then a bullet shows its letters.
let ICONS = {};
let ICON_WORDS = {};
let BRANDS = {};
let BRAND_TITLES = {};
let BRAND_WORDS = {};
let pack = null;
export function loadIcons() {
  return (pack ??= Promise.all([import('./icon-pack.js'), import('./brand-pack.js')]).then(([i, b]) => {
    ICONS = i.ICONS; ICON_WORDS = i.ICON_WORDS;
    BRANDS = b.BRANDS; BRAND_TITLES = b.BRAND_TITLES; BRAND_WORDS = b.BRAND_WORDS;
  }));
}
export const usesIcons = (collections) => collections.some((c) => /^(lucide|brand):/.test(c.icon || ''));

// A line's `icon` is '' (letters), 'lucide:<name>', 'brand:<slug>' (a site's logo) or 'emoji:<emoji>'.
export function bulletFace(c) {
  if (c.smart) return { cls: ' has-icon smart', html: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5.5h16l-6.2 7.2v5.6l-3.6 1.7v-7.3z"/></svg>' };
  const icon = c.icon || '';
  if (icon.startsWith('lucide:') && ICONS[icon.slice(7)]) {
    return { cls: ' has-icon', html: iconSvg(icon.slice(7)) };
  }
  if (icon.startsWith('brand:') && BRANDS[icon.slice(6)]) {
    return { cls: ' has-icon', html: brandSvg(icon.slice(6)) };
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

// A site's logo: a filled path, drawn on a 28-unit box so it sits at the same size as the stroked icons.
export const brandSvg = (slug) =>
  `<svg class="ic" viewBox="-2 -2 28 28" fill="currentColor" aria-hidden="true"><path d="${BRANDS[slug] || ''}"/></svg>`;
export const brandTitle = (slug) => BRAND_TITLES[slug] || slug;

export function searchBrands(query) {
  const all = Object.keys(BRANDS).sort((a, b) => BRAND_TITLES[a].localeCompare(BRAND_TITLES[b]));
  const q = query.trim().toLowerCase();
  if (!q) return all;
  const words = q.split(/\s+/);
  return all.filter((s) => words.every((w) => BRAND_WORDS[s].includes(w)))
    .sort((a, b) => (BRAND_WORDS[b].startsWith(q) - BRAND_WORDS[a].startsWith(q)) || 0);
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
