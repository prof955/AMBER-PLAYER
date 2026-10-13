// playlist.js — the queue ("ARCHIVE") and its DOM list.
import { $, el, fmtBytes, fmtTime, uid } from './util.js';

export class Playlist {
  constructor(rootEl, subEl) {
    this.root = rootEl;
    this.subEl = subEl;
    this.items = [];
    this.currentId = null;
    this.onActivate = null;     // (item) => void
    this.onRemove = null;
  }

  add(item) {
    const it = Object.assign({
      id: uid(), name: '?', size: 0, bytes: null, engine: 'gme', kind: '?',
      system: '', meta: null, tracks: [], duration: null, error: null
    }, item);
    this.items.push(it);
    this.render();
    return it;
  }

  get current() { return this.items.find((i) => i.id === this.currentId) || null; }
  get(index) { return this.items[index]; }
  indexOf(item) { return this.items.indexOf(item); }
  clear() { this.items = []; this.currentId = null; this.render(); }
  remove(id) { this.items = this.items.filter((i) => i.id !== id); this.render(); }

  setCurrent(id) { this.currentId = id; this.render(); }

  render() {
    const sel = this.currentId;
    this.root.innerHTML = '';
    if (!this.items.length) {
      this.root.append(el('div', { class: 'empty', text: 'ARŞİV BOŞ — dosya bırak (.nsf .spc .gbs .vgm .vgz .gym .mod .xm .s3m .it) veya URL gir' }));
    }
    this.items.forEach((it, i) => {
      const row = el('div', {
        class: 'qitem' + (it.id === sel ? ' playing' : ''),
        onclick: () => this.onActivate && this.onActivate(it, i)
      }, [
        el('span', { class: 'idx', text: String(i + 1).padStart(2, '0') }),
        el('span', { class: 'nm', title: it.name + (it.error ? '\n' + it.error : ''), text: it.title || it.name }),
        el('span', { class: 'tag', text: (it.kind || '?') + (it.error ? ' !' : '') }),
        el('span', { class: 'tm', text: it.duration ? fmtTime(it.duration) : (it.size ? fmtBytes(it.size) : '—') })
      ]);
      if (it.error) row.style.color = 'var(--warn)';
      this.root.append(row);
    });
    this.subEl.textContent = this.items.length + ' items · ' +
      fmtBytes(this.items.reduce((a, b) => a + (b.size || 0), 0));
  }

  /** .m3u export — works with VLC/foobar2000/OpenMPT as well */
  toM3U() {
    const lines = ['#EXTM3U'];
    for (const it of this.items) {
      if (!it.tracks.length) lines.push(it.name);
      else for (const t of it.tracks) lines.push(`#EXTINF:-1,${it.name} :: ${t.title || 'track ' + (t.index + 1)}`);
    }
    return lines.join('\n') + '\n';
  }
}
