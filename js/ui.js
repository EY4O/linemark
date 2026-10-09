// Small UI primitives: escaping, toasts, anchored menus, time formatting, downloads.
import { icon } from './icons.js';

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function debounce(fn, ms) {
  let t;
  const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  d.flush = (...a) => { clearTimeout(t); return fn(...a); };
  return d;
}

// ---------- toasts ----------
export function toast(message, { action, onAction, lead = '', duration = 5200 } = {}) {
  const host = $('#toasts');
  const el = document.createElement('div');
  el.className = 'toast' + (action ? '' : ' plain');
  el.innerHTML = `${lead}<span>${esc(message)}</span>${action ? `<button type="button">${esc(action)}</button>` : ''}`;
  host.appendChild(el);
  const close = () => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 260);
  };
  let timer = setTimeout(close, duration);
  el.addEventListener('mouseenter', () => clearTimeout(timer));
  el.addEventListener('mouseleave', () => { timer = setTimeout(close, 2200); });
  if (action) {
    el.querySelector('button').addEventListener('click', () => {
      clearTimeout(timer);
      close();
      onAction?.();
    });
  }
  while (host.children.length > 3) host.firstElementChild.remove();
  return close;
}

// ---------- anchored menus ----------
let openMenuEl = null;
let menuCleanup = null;
let menuReturn = null;

export function closeMenu() {
  if (!openMenuEl) return false;
  const hadFocus = openMenuEl.contains(document.activeElement);
  openMenuEl.remove();
  openMenuEl = null;
  menuCleanup?.();
  menuCleanup = null;
  // Keyboard users land back on the control that opened the menu.
  if (hadFocus && menuReturn?.isConnected) menuReturn.focus({ preventScroll: true });
  menuReturn = null;
  return true;
}

export function isMenuOpen() { return !!openMenuEl; }

// anchor: an element or {x, y}. build(menuEl, close) fills the menu.
export function openMenu(anchor, build, { align = 'start', width } = {}) {
  closeMenu();
  menuReturn = anchor instanceof Element ? anchor : document.activeElement;
  const m = document.createElement('div');
  m.className = 'menu';
  m.setAttribute('role', 'menu');
  if (width) m.style.width = width + 'px';
  document.body.appendChild(m);
  build(m, closeMenu);
  place(m, anchor, align);
  openMenuEl = m;
  const onDown = (e) => {
    if (!m.contains(e.target) && !(anchor instanceof Element && anchor.contains(e.target))) closeMenu();
  };
  const onKey = (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); closeMenu(); }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const items = $$('.menu-item, .swatch', m);
      if (!items.length) return;
      e.preventDefault();
      const i = items.indexOf(document.activeElement);
      const next = e.key === 'ArrowDown' ? (i + 1) % items.length : (i <= 0 ? items.length - 1 : i - 1);
      items[next].focus();
    }
  };
  const onScroll = (e) => { if (!m.contains(e.target)) closeMenu(); };
  setTimeout(() => {
    document.addEventListener('pointerdown', onDown, true);
    window.addEventListener('resize', closeMenu);
    document.addEventListener('scroll', onScroll, true);
  });
  document.addEventListener('keydown', onKey, true);
  menuCleanup = () => {
    document.removeEventListener('pointerdown', onDown, true);
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', closeMenu);
    document.removeEventListener('scroll', onScroll, true);
  };
  const first = m.querySelector('input, .menu-item');
  first?.focus({ preventScroll: true });
  return m;
}

export function place(m, anchor, align = 'start') {
  const r = anchor instanceof Element ? anchor.getBoundingClientRect() : { left: anchor.x, right: anchor.x, top: anchor.y, bottom: anchor.y, width: 0 };
  const mw = m.offsetWidth;
  const mh = m.offsetHeight;
  let x = align === 'end' ? r.right - mw : r.left;
  let y = r.bottom + 6;
  if (y + mh > innerHeight - 8) y = Math.max(8, r.top - mh - 6);
  x = Math.max(8, Math.min(x, innerWidth - mw - 8));
  m.style.left = x + 'px';
  m.style.top = y + 'px';
}

export function menuItem({ label, iconName, lead = '', danger = false, checked = false, action, attrs = '' }) {
  return `<button type="button" class="menu-item${danger ? ' danger' : ''}" role="menuitem" data-mi="${esc(action || '')}" ${attrs}>${lead || (iconName ? icon(iconName, 17) : '')}<span>${esc(label)}</span>${checked ? `<span class="check">${icon('check', 16)}</span>` : ''}</button>`;
}

// ---------- confirm-in-place buttons ----------
export function armConfirm(btn, confirmLabel = 'Click again to confirm') {
  if (btn.dataset.armed === '1') return true;
  const original = btn.innerHTML;
  btn.dataset.armed = '1';
  btn.classList.add('danger');
  btn.innerHTML = `${icon('trash', 16)}<span class="lbl">${esc(confirmLabel)}</span>`;
  setTimeout(() => {
    if (!btn.isConnected) return;
    btn.dataset.armed = '';
    btn.innerHTML = original;
  }, 3500);
  return false;
}

// ---------- time ----------
const MONTH = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
const MONTH_YEAR = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const FULL = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export function relTime(ts) {
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  if (s < 86400 * 7) return Math.floor(s / 86400) + 'd ago';
  const d = new Date(ts);
  return d.getFullYear() === new Date().getFullYear() ? MONTH.format(d) : MONTH_YEAR.format(d);
}
export const fullDate = (ts) => FULL.format(new Date(ts));

export function plural(n, one, many = one + 's') {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}

// ---------- files ----------
export function download(filename, blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

export function pickFile(input) {
  return new Promise((resolve) => {
    input.value = '';
    input.onchange = () => resolve(input.files[0] || null);
    input.click();
  });
}
