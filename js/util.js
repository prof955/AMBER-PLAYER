// util.js — small helpers shared by the console modules.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function el(tag, attrs = {}, children = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined && v !== false) n.setAttribute(k, v);
  }
  for (const c of [].concat(children)) if (c) n.append(c);
  return n;
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** byte at offset (0 when out of range) */
export const u8 = (b, i) => (b && i >= 0 && i < b.length ? b[i] : 0);

/** ASCII string from a byte array (stops at the given length) */
export function str(bytes, off, len) {
  let s = '';
  for (let i = 0; i < len; i++) {
    const c = u8(bytes, off + i);
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s;
}

export function fmtTime(ms, forceHours = false) {
  if (ms == null || !isFinite(ms) || ms < 0) return '--:--';
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const ss = String(s % 60).padStart(2, '0');
  const mm = String(m % 60).padStart(2, '0');
  if (h > 0 || forceHours) return `${h}:${mm}:${ss}`;
  return `${mm}:${ss}`;
}

export function fmtTimeSigned(ms) {
  if (ms == null || !isFinite(ms) || ms < 0) return '--:--';
  return fmtTime(ms);
}

export function fmtBytes(n) {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1048576).toFixed(2) + ' MB';
}

export function fmtDb(v) {
  if (!isFinite(v) || v <= 0.000001) return '-∞';
  const db = 20 * Math.log10(v);
  return (db >= 0 ? '+' : '') + db.toFixed(1);
}

export const uid = () => Math.random().toString(36).slice(2, 10);

export function basename(p) {
  const s = String(p).split(/[?#]/)[0];
  const parts = s.split('/');
  return decodeURIComponent(parts[parts.length - 1] || s);
}

export function extname(name) {
  const b = basename(name);
  const i = b.lastIndexOf('.');
  return i < 0 ? '' : b.slice(i + 1).toLowerCase();
}

export const NOTE_NAMES = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];
export function trackerNote(n) {
  if (!n) return '···';
  const i = (n - 1) % 12, o = Math.floor((n - 1) / 12);
  return NOTE_NAMES[i] + o;
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// smooth LED-style decay helper (attack fast, release slow)
export function decay(prev, v, up = 1, down = 0.12) {
  return v > prev ? prev + (v - prev) * up : prev + (v - prev) * down;
}
