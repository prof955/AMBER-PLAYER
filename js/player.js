// player.js — transport state machine: queue -> engine, plus the panels that
// follow it (track info, subtune list, transport readout, timeline).
import { $, fmtTime, clamp, trackerNote } from './util.js';

const AUTO_LENGTH_MS = 150000;      // 2:30 when the file carries no duration

export class Player {
  constructor(engine, playlist, ui) {
    this.engine = engine;
    this.playlist = playlist;
    this.ui = ui;

    this.state = 'STOPPED';         // STOPPED | LOADING | PLAYING | PAUSED
    this.trackIndex = 0;
    this.posMs = 0;
    this.totalMs = 0;
    this.repeat = 'all';            // off | all | one   (queue level)
    this.shuffle = false;

    this._noteLogAt = 0;
    this._lastNotes = [];

    engine.on.ended.push((d) => this._ended(d));
    engine.on.status.push((d) => this._status(d));
    engine.on.meters.push((d) => this._meters(d));
    engine.on.event.push((d) => this.ui.log.push(d.msg, d.level));
    engine.on.state.push((d) => {
      const route = d.mode === 'compat' ? ' · COMPAT' : d.mode === 'worklet' ? ' · WORKLET' : '';
      $('#ctx-state').textContent = d.state.toUpperCase() + route;
      if (d.sampleRate) $('#fx-rate').textContent = (d.sampleRate / 1000).toFixed(1) + ' kHz';
    });
  }

  setState(s) {
    this.state = s;
    $('#pos-status').textContent = s;
  }

  // ────────────────────────────────────────────────────────────── loading ──
  /** metadata scan only — never disturbs playback (separate worklet node) */
  async ensureMeta(item) {
    if (item.meta) return item.meta;
    let m = {};
    try {
      const r = await this.engine.scanMeta(item.bytes, item.name, item.engine);
      m = r.meta || {};
    } catch (e) {
      // metadata is a nicety: never let it stop playback (e.g. when the
      // AudioWorklet is unavailable the scan node cannot even be created)
      this.ui.log.push('meta okunamadı (' + (e.message || e) + ') — dosya adıyla devam', 'warn');
    }
    item.meta = m;
    item.tracks = (m.tracks && m.tracks.length)
      ? m.tracks.map((t) => ({ index: t.index, title: t.title, length: t.length, loop: t.loop, game: t.game, author: t.author }))
      : [{ index: 0, title: m.title || item.name, length: 0, loop: 0 }];
    item.title = m.title || item.tracks[0].title || item.name;
    item.duration = item.tracks.find((t) => t.length > 0)?.length || null;
    if (m.system) item.system = m.system;
    this.playlist.render();
    this.ui.setTracklist(item, (idx) => this.startTrack(idx));
    this.ui.setTrackInfo(item);
    this.ui.log.push(`meta: ${item.tracks.length} subtune · ${m.system || item.kind}` +
      (item.duration ? ` · ilk parça ${fmtTime(item.duration)}` : ''), 'ok');
    return m;
  }

  /** load the file into the play engine and start a subtune */
  async activate(item, trackIndex = 0) {
    if (!item || !item.bytes) return;
    try {
      this.setState('LOADING');
      await this.ensureMeta(item);
      const loaded = await this.engine.load(item.bytes, item.name, item.engine, {
        multichannel: this.ui.options.multichannel
      });
      const names = loaded.channelNames || loaded.meta.voices || [];
      const count = names.length || loaded.channels || 8;
      this.ui.buildChannels(count, names, loaded.multichannel);
      this.ui.unmuteAll();
      this.playlist.setCurrent(item.id);
      this.ui.setTrackInfo(item);
      this.ui.log.push(`motor: ${this.engine.playEngine} · ${count} kanal · ` +
        (loaded.multichannel ? 'per-voice mixer' : 'stereo bus'), 'ok');
      await this.startTrack(trackIndex);
    } catch (e) {
      this.setState('ERROR');
      this.ui.log.push('oynatma hatası: ' + (e.message || e), 'err');
    }
  }

  resolvePlayMs(item, trackIndex) {
    const opt = this.ui.options.playLengthMs;
    if (opt === -1) return 0;                                  // infinite
    if (opt > 0) return opt;                                   // fixed length
    const t = (item.tracks || [])[trackIndex];
    if (t && t.length > 0) return t.length;                    // auto: real length
    return AUTO_LENGTH_MS;                                     // auto: fallback
  }

  async startTrack(trackIndex) {
    const item = this.playlist.current;
    if (!item) return;
    this.trackIndex = trackIndex;
    item.trackIndex = trackIndex;
    const playMs = this.resolvePlayMs(item, trackIndex);
    const opts = this.ui.options;
    const loop = opts.loopMode === 'infinite' ? 'infinite' : opts.loopMode === 'one' ? 'one' : 'off';
    const fadeMs = opts.loopMode === 'infinite' ? 0 : opts.fadeMs;
    // timeline length: a fixed play length wins, else the file's own length,
    // else whatever the engine reports while playing (libxmp knows total_time)
    const own = (item.tracks || [])[trackIndex];
    this.totalMs = opts.playLengthMs > 0 ? opts.playLengthMs
      : (own && own.length > 0 ? own.length : 0);
    try {
      await this.engine.play(trackIndex, { playMs, loop, fadeMs, master: 1 });
      this.setState('PLAYING');
      const t = (item.tracks || [])[trackIndex] || {};
      this.ui.log.push(`▶ ${item.name}${item.tracks.length > 1 ? ` [${trackIndex + 1}/${item.tracks.length}]` : ''}` +
        `${t.title ? ' · ' + t.title : ''} · ${playMs ? fmtTime(playMs) + (fadeMs ? ` +${fadeMs / 1000}s fade` : '') : 'sınırsız'} · loop=${opts.loopMode}`);
      this.ui.setTracklist(item, (idx) => this.startTrack(idx));
      this.ui.setTrackInfo(item);
      $('#np-track').textContent = item.tracks.length > 1 ? `${trackIndex + 1}/${item.tracks.length}` : '1/1';
      $('#np-label').textContent = t.title || item.title || item.name;
      $('#np-now').textContent = t.title || item.title || item.name;
      this._updateTimeline();
    } catch (e) {
      this.setState('ERROR');
      this.ui.log.push('başlatma hatası: ' + (e.message || e), 'err');
    }
  }

  // ───────────────────────────────────────────────────────────── transport ──
  async toggle() {
    const cur = this.playlist.current;
    if (!cur) {
      const first = this.playlist.items[0];
      if (first) return this.activate(first, 0);
      this.ui.log.push('kuyruk boş — dosya bırak ya da URL gir', 'warn');
      return;
    }
    if (this.state === 'PLAYING') { await this.engine.pause(); this.setState('PAUSED'); this.ui.log.push('duraklatıldı'); }
    else if (this.state === 'PAUSED') { await this.engine.resume(); this.setState('PLAYING'); this.ui.log.push('devam'); }
    else await this.activate(cur, this.trackIndex);
  }

  async stop() {
    await this.engine.stop();
    this.setState('STOPPED');
    this.posMs = 0;
    this.ui.log.push('durduruldu');
    this._updateTimeline();
  }

  nextIndex(dir = 1) {
    const items = this.playlist.items;
    if (!items.length) return -1;
    const cur = this.playlist.indexOf(this.playlist.current);
    if (this.shuffle && items.length > 1) {
      let n = cur;
      while (n === cur) n = Math.floor(Math.random() * items.length);
      return n;
    }
    return (cur + dir + items.length) % items.length;
  }

  async next(auto = false) {
    const i = this.nextIndex(1);
    if (i < 0) { await this.stop(); return; }
    if (!auto && this.repeat === 'one' && !this.shuffle) return this.startTrack(this.trackIndex);
    await this.activate(this.playlist.items[i], 0);
  }

  async prev() {
    const item = this.playlist.current;
    if (item && item.tracks.length > 1 && this.trackIndex > 0) return this.startTrack(this.trackIndex - 1);
    const i = this.nextIndex(-1);
    if (i < 0) return;
    await this.activate(this.playlist.items[i], 0);
  }

  async seek(ms) {
    if (!this.playlist.current) return;
    this.posMs = clamp(ms, 0, this.totalMs || ms);
    await this.engine.seek(this.posMs);
    this._updateTimeline();
  }

  setTempo(f) {
    this.engine.setTempo(f);
    $('#np-levels').textContent = f.toFixed(2) + 'x';
  }

  // ────────────────────────────────────────────────────────────── events ──
  _ended(d) {
    if (d.reason === 'loop') { this.ui.log.push('↻ parça başa döndü (repeat one)'); return; }
    this.ui.log.push('parça bitti (' + (d.reason === 'end' ? 'dosya sonu' : 'süre doldu') + ')');
    const last = this.playlist.indexOf(this.playlist.current) >= this.playlist.items.length - 1;
    if (this.repeat === 'off' && !this.shuffle && last) {
      this.setState('STOPPED');
      this._updateTimeline();
      return;
    }
    this.next(true);
  }

  _status(d) {
    this.posMs = d.posMs || 0;
    if (!this.totalMs && d.totalMs) this.totalMs = d.totalMs;
    const item = this.playlist.current;
    const t = item && item.tracks[this.trackIndex];
    if (!this.totalMs && t && t.length > 0) this.totalMs = t.length;
    this.ui.setPlaybackStatus({
      posMs: this.posMs,
      totalMs: this.totalMs,
      state: this.state,
      pattern: d.pattern != null ? String(d.pattern).padStart(2, '0') : null,
      row: d.row != null ? String(d.row).padStart(2, '0') : null,
      bpm: d.bpm,
      speed: d.speed,
      speedFactor: d.tempoFactor
    });
    if (item) $('#np-now').textContent = (item.tracks[this.trackIndex] || {}).title || item.title || item.name;
    this._updateTimeline();
  }

  _updateTimeline() {
    const seek = $('#seek');
    if (this.totalMs > 0) {
      seek.value = String(Math.round(clamp(this.posMs / this.totalMs, 0, 1) * 1000));
      seek.disabled = false;
    } else {
      seek.value = '0';
      seek.disabled = false;
    }
    const pct = this.totalMs > 0 ? clamp(this.posMs / this.totalMs, 0, 1) * 100 : 0;
    const mk = window.__timeline;
    if (mk) {
      mk.pos.style.left = pct.toFixed(2) + '%';
      // libgme reports the intro length: that is where the music starts looping
      const t = (this.playlist.current?.tracks || [])[this.trackIndex];
      const intro = t && t.intro > 0 ? t.intro : 0;
      if (intro && this.totalMs > intro) {
        mk.loop.hidden = false;
        mk.loop.style.left = ((intro / this.totalMs) * 100).toFixed(2) + '%';
      } else mk.loop.hidden = true;
    }
  }

  _meters(d) {
    this.ui.setMeters(d);
    // real note stream from the tracker engine -> console-style log lines
    if (d.channels && Date.now() - this._noteLogAt > 260) {
      for (let i = 0; i < d.channels.length; i++) {
        const c = d.channels[i];
        if (!c || !c.note) { this._lastNotes[i] = 0; continue; }
        if (c.note !== this._lastNotes[i]) {
          this._lastNotes[i] = c.note;
          this._noteLogAt = Date.now();
          this.ui.log.push(`CH${String(i + 1).padStart(2, '0')} ${trackerNote(c.note)} v${String(c.vol ?? 0).padStart(2, '0')} i${String(c.ins ?? 0).padStart(2, '0')}`);
          break;
        }
      }
    }
  }
}
