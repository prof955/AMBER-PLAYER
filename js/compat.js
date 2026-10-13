// compat.js — "uyumluluk modu": the same WASM engines, driven from the main
// thread instead of an AudioWorklet.
//
// Why this exists: some hosts never resolve audioWorklet.addModule() — very
// old browsers, sandboxed iframes with an opaque origin, CI shells, some
// embedded webviews. The engine itself does not care: it renders int16/float
// blocks through a plain function call. This module renders those blocks on
// the main thread and feeds them into the *same* FX chain (inputGain → EQ →
// masterGain → limiter → analyser), so playback, meters, EQ and the
// visualisers keep working when the worklet route is unavailable.
//
// It also powers the offline ".wav dışa aktar" feature: rendering to a file
// needs no audio clock at all.
import { ENGINE_INFO } from './formats.js';

const CHUNK = 2048;             // frames per render/schedule step
const LOOKAHEAD_S = 0.5;        // audio kept scheduled ahead of the clock
const LEAD_IN_S = 0.08;         // small delay before the first block starts
const bundles = {};             // engineKey -> { ENGINE, Module }  (evaluated once)
const instances = new Map();    // engineKey -> { mod, ENGINE }    (the playing one)

/**
 * Load the main-thread engine.
 *
 * Preferred route: `wasm/<engine>.compat.js`, a real ES module that exports
 * ENGINE + createModule (same Emscripten core + adapter as the worklet build).
 * Dynamic import means *no eval* — which matters because sandboxed preview
 * iframes commonly run under a CSP that forbids `new Function`, and the old
 * eval-based loader failed there with a blank console (screen up, no sound).
 *
 * Fallback route (hand-built trees where the compat file is missing): fetch the
 * worklet bundle and evaluate it in a Function scope.
 */
async function loadBundle(engineKey) {
  if (bundles[engineKey]) return bundles[engineKey];
  const info = ENGINE_INFO[engineKey];
  if (!info) throw new Error('bilinmeyen motor: ' + engineKey);
  const base = new URL(info.worklet, location.href).href.replace(/[^/]*$/, '');
  const compatUrl = base + engineKey + '.compat.js';

  try {
    const m = await import(/* webpackIgnore: true */ compatUrl);
    if (!m || !m.ENGINE || !m.createModule) throw new Error('compat modülü eksik: ' + compatUrl);
    bundles[engineKey] = { ENGINE: m.ENGINE, Module: m.createModule, base, route: 'es-module' };
    return bundles[engineKey];
  } catch (importErr) {
    try {
      const res = await fetch(info.worklet);
      if (!res.ok) throw new Error(`motor dosyası indirilemedi: ${info.worklet} (HTTP ${res.status})`);
      const src = await res.text();
      globalThis.AudioWorkletGlobalScope = globalThis.AudioWorkletGlobalScope || class {};
      globalThis.AudioWorkletProcessor = globalThis.AudioWorkletProcessor || class {
        constructor() { this.port = { postMessage() {}, onmessage: null, addEventListener() {}, start() {} }; }
      };
      globalThis.registerProcessor = globalThis.registerProcessor || (() => {});
      if (!globalThis.sampleRate) globalThis.sampleRate = 48000;
      // eslint-disable-next-line no-new-func
      const { ENGINE, Module } = new Function(`${src}\n;return { ENGINE, Module };`)();
      bundles[engineKey] = { ENGINE, Module, base: info.worklet.replace(/[^/]*$/, ''), route: 'eval' };
      return bundles[engineKey];
    } catch (evalErr) {
      throw new Error(`uyumluluk motoru yüklenemedi (${engineKey}): ES modül → ${importErr.message} · eval → ${evalErr.message}`);
    }
  }
}

export class Compat {
  constructor(engine) {
    this.engine = engine;
    this.mode = 'compat';
    this.key = null;
    this.mod = null;
    this.E = null;
    this.playing = false;
    this.paused = false;
    this.playMs = 0;
    this.fadeMs = 4000;
    this.loopMode = 'off';
    this.lastTrack = 0;
    this.framesRendered = 0;      // frames handed to the scheduler
    this.frameOffset = 0;         // frames before the current scheduling run (seek)
    this.startTime = 0;           // ctx.currentTime when frameOffset started
    this.nextTime = 0;
    this.sources = [];
    this.mix = { gains: new Float32Array(16).fill(1), pans: new Float32Array(16), scale: 1 };
    this.endPending = null;
    this.l = new Float32Array(CHUNK);
    this.r = new Float32Array(CHUNK);
    this.peakL = 0;
    this.peakR = 0;
    this.timers = [];
  }

  // ───────────────────────────────────────────────────────────── lifecycle ──
  async ensure(engineKey) {
    if (this.key === engineKey && this.mod) return;
    const { ENGINE, Module, base, route } = await loadBundle(engineKey);
    this.loadRoute = route;
    this.stopTimers();
    this._clearSources();
    this.E = ENGINE;
    this.key = engineKey;
    // one module instance per engine key; a second instance is used for scans
    const slot = instances.get(engineKey) || {};
    if (!slot.mod) {
      slot.mod = await Module({ noInitialRun: true, print() {}, printErr() {}, locateFile: (p) => (/^[a-z]+:|^\//i.test(p) ? p : base + p) });
    }
    this.mod = slot.mod;
    slot.ENGINE = ENGINE;
    instances.set(engineKey, slot);
  }

  async load(bytes, name, engineKey, opts = {}) {
    await this.ensure(engineKey);
    this.E.unmount(this.mod);
    const loaded = this.E.load(this.mod, bytes, opts) || {};
    const meta = loaded.meta || {};
    if (loaded.mix && loaded.mix.scale) this.mix.scale = loaded.mix.scale;
    this.mix.gains.fill(1);
    this.playing = false;
    this.paused = false;
    this.endPending = null;
    this._clearSources();
    const channels = this.E.channels(this.mod);
    const channelNames = this.E.channelNames(this.mod);
    return { meta, channels, channelNames, multichannel: !!meta.multichannel, mix: loaded.mix };
  }

  /** metadata only, through a throw-away module instance so playback is safe */
  async scan(bytes, engineKey) {
    const { ENGINE, Module, base } = await loadBundle(engineKey);
    const mod = await Module({ noInitialRun: true, print() {}, printErr() {}, locateFile: (p) => (/^[a-z]+:|^\//i.test(p) ? p : base + p) });
    try {
      const loaded = ENGINE.load(mod, bytes, { multichannel: false }) || {};
      return { meta: loaded.meta || {}, channels: ENGINE.channels(mod), channelNames: ENGINE.channelNames(mod) };
    } finally {
      try { ENGINE.unmount(mod); } catch (e) { /* ignore */ }
    }
  }

  // ────────────────────────────────────────────────────────────── playback ──
  async play(track = 0, opts = {}) {
    if (!this.mod) throw new Error('uyumluluk motoru yüklü değil');
    const ctx = this.engine.ctx;
    if (!ctx) throw new Error('AudioContext yok');
    if (ctx.state === 'suspended') await ctx.resume().catch(() => {});

    this.playMs = opts.playMs || 0;
    this.fadeMs = opts.fadeMs != null ? opts.fadeMs : 4000;
    this.loopMode = opts.loop || 'off';
    this.lastTrack = track;
    this.E.start(this.mod, track, {});
    this.paused = false;
    this.playing = true;
    this.endPending = null;
    this._clearSources();
    this.framesRendered = 0;
    this.frameOffset = 0;
    this.startTime = ctx.currentTime + LEAD_IN_S;
    this.nextTime = this.startTime;

    this._schedule();
    this.timers.push(setInterval(() => this._tick(), 40));
    this.timers.push(setInterval(() => this._publish(), 100));
    return { ok: true };
  }

  pause() {
    if (!this.playing || this.paused) return { ok: true };
    const pos = this.posMs();
    this.paused = true;
    this._clearSources();
    this.frameOffset = Math.round(pos * this.engine.ctx.sampleRate / 1000);
    this.framesRendered = this.frameOffset;
    return { ok: true };
  }

  resume() {
    if (!this.playing || !this.paused) return { ok: true };
    const ctx = this.engine.ctx;
    this.E.seek(this.mod, this.frameOffset * 1000 / ctx.sampleRate);
    this.paused = false;
    this.startTime = ctx.currentTime + LEAD_IN_S;
    this.nextTime = this.startTime;
    this.endPending = null;
    this._schedule();
    return { ok: true };
  }

  stop() {
    this.playing = false;
    this.paused = false;
    this.endPending = null;
    this.stopTimers();
    this._clearSources();
    return { ok: true };
  }

  seek(ms) {
    if (!this.mod || !this.playing) return { ok: true };
    const ctx = this.engine.ctx;
    this.frameOffset = Math.max(0, Math.round(ms * ctx.sampleRate / 1000));
    this.framesRendered = this.frameOffset;
    this.endPending = null;
    this.E.seek(this.mod, ms);
    this._clearSources();
    if (!this.paused) {
      this.startTime = ctx.currentTime + LEAD_IN_S;
      this.nextTime = this.startTime;
      this._schedule();
    }
    return { ok: true };
  }

  setTempo(f) { if (this.E && this.E.setTempo) this.E.setTempo(this.mod, f); return { ok: true }; }
  setChannel(ch, gain) {
    this.mix.gains[ch] = gain;
    if (this.E && this.E.setChannelGain) this.E.setChannelGain(this.mod, ch, gain);
    return { ok: true };
  }

  posMs() {
    const ctx = this.engine.ctx;
    if (!ctx || !this.playing) return 0;
    if (this.paused) return this.frameOffset * 1000 / ctx.sampleRate;
    const played = Math.floor((ctx.currentTime - this.startTime) * ctx.sampleRate);
    const frames = Math.max(this.frameOffset, Math.min(this.framesRendered, this.frameOffset + played));
    return Math.max(0, frames * 1000 / ctx.sampleRate);
  }

  // ───────────────────────────────────────────────────────────── internals ──
  stopTimers() {
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
  }

  _clearSources() {
    for (const s of this.sources) { try { s.stop(); } catch (e) { /* already stopped */ } }
    this.sources = [];
  }

  /** per-frame gain: 1 before the play length, then the fade ramp, 0 after */
  gainAt(frameIndex) {
    if (!this.playMs || this.loopMode === 'infinite') return 1;
    const rate = this.engine.ctx.sampleRate;
    const start = this.playMs * rate / 1000;
    const fade = this.fadeMs * rate / 1000;
    if (frameIndex < start) return 1;
    if (fade <= 0) return 0;
    const t = (frameIndex - start) / fade;
    return t >= 1 ? 0 : 1 - t;
  }

  _schedule() {
    const ctx = this.engine.ctx;
    const rate = ctx.sampleRate;
    const lookaheadFrames = LOOKAHEAD_S * rate;
    let guard = 0;
    while (this.playing && !this.paused && !this.endPending &&
           this.framesRendered - (this.frameOffset + Math.floor((ctx.currentTime - this.startTime) * rate)) < lookaheadFrames &&
           guard++ < 64) {
      const res = this.E.render(this.mod, CHUNK, this.l, this.r, this.mix) || {};
      const base = this.framesRendered;

      let fadeEnd = -1;
      for (let i = 0; i < CHUNK; i++) {
        const g = this.gainAt(base + i);
        if (g >= 1) continue;
        this.l[i] *= g;
        this.r[i] *= g;
        if (g <= 0) { fadeEnd = i; break; }
      }
      for (let i = 0; i < CHUNK; i++) {
        const a = Math.abs(this.l[i]);
        if (a > this.peakL) this.peakL = a;
        const b = Math.abs(this.r[i]);
        if (b > this.peakR) this.peakR = b;
      }
      if (fadeEnd >= 0) {
        this.l.fill(0, fadeEnd);
        this.r.fill(0, fadeEnd);
        this.endPending = { reason: 'length', atFrame: base + fadeEnd };
      } else if (res.ended) {
        this.endPending = { reason: 'end', atFrame: base + CHUNK };
      }

      const buf = ctx.createBuffer(2, CHUNK, ctx.sampleRate);
      buf.copyToChannel(this.l, 0);
      buf.copyToChannel(this.r, 1);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(this.engine.input);
      src.start(this.nextTime);
      src.onended = () => { this.sources = this.sources.filter((s) => s !== src); };
      this.sources.push(src);
      this.nextTime += CHUNK / ctx.sampleRate;
      this.framesRendered += CHUNK;
    }
  }

  _tick() {
    if (!this.playing || this.paused) return;
    const pos = this.posMs();
    if (this.endPending && pos >= this.endPending.atFrame * 1000 / this.engine.ctx.sampleRate - 40) {
      const reason = this.endPending.reason;
      if (this.loopMode === 'one') {                     // restart in place
        this.engine.emit('ended', { reason: 'loop' });
        this.play(this.lastTrack, { playMs: this.playMs, fadeMs: this.fadeMs, loop: this.loopMode });
        return;
      }
      this.playing = false;
      this.stopTimers();
      this.engine.emit('ended', { reason });
      return;
    }
    this._schedule();
  }

  _publish() {
    if (!this.playing) return;
    const extra = this.E.meter ? this.E.meter(this.mod) : null;
    this.engine.emit('meters', {
      levels: extra && extra.levels ? Array.from(extra.levels) : null,
      peakL: this.peakL,
      peakR: this.peakR,
      rms: (this.peakL + this.peakR) / 4,
      channels: extra ? extra.channels : null
    });
    this.peakL = 0;
    this.peakR = 0;
    const st = this.E.status ? this.E.status(this.mod) : null;
    const status = Object.assign({}, st || {}, { posMs: Math.round(this.posMs()), event: 'status' });
    this.engine.emit('status', status);
  }
}

/**
 * Offline render to a 16-bit stereo WAV. Independent of playback state: it
 * builds its own engine instance, so exporting never disturbs what you hear.
 *
 * @param {{engineKey:string, bytes:Uint8Array, seconds:number, track?:number,
 *          fadeSeconds?:number, gain?:number, onProgress?:(p:number)=>void}} o
 * @returns {Promise<Uint8Array>}
 */
export async function renderWav(o) {
  const { ENGINE, Module, base } = await loadBundle(o.engineKey);
  const rate = 44100;
  const mod = await Module({ noInitialRun: true, print() {}, printErr() {}, locateFile: (p) => (/^[a-z]+:|^\//i.test(p) ? p : base + p) });
  const loaded = ENGINE.load(mod, o.bytes, { multichannel: true }) || {};
  const total = Math.max(1, Math.floor((o.seconds || 60) * rate));
  ENGINE.start(mod, o.track || 0, {});

  const l = new Float32Array(CHUNK), r = new Float32Array(CHUNK);
  const pcm = new Int16Array(total * 2);
  const gain = o.gain != null ? o.gain : 0.85;
  const fadeFrames = Math.max(0, Math.floor((o.fadeSeconds || 0) * rate));
  const mix = { scale: (loaded.mix && loaded.mix.scale) || 1, gains: new Float32Array(16).fill(1), pans: new Float32Array(16) };

  let written = 0;
  while (written < total) {
    const n = Math.min(CHUNK, total - written);
    ENGINE.render(mod, n, l, r, mix);
    for (let i = 0; i < n; i++) {
      let g = gain;
      if (fadeFrames && written + i > total - fadeFrames) {
        g *= Math.max(0, (total - (written + i)) / fadeFrames);
      }
      const a = Math.max(-1, Math.min(1, l[i] * g));
      const b = Math.max(-1, Math.min(1, r[i] * g));
      pcm[(written + i) * 2] = a < 0 ? a * 0x8000 : a * 0x7fff;
      pcm[(written + i) * 2 + 1] = b < 0 ? b * 0x8000 : b * 0x7fff;
    }
    written += n;
    if (o.onProgress && written % (rate * 5) < CHUNK) o.onProgress(written / total);
  }
  try { ENGINE.unmount(mod); } catch (e) { /* ignore */ }
  return encodeWav(pcm, rate);
}

/** 16-bit PCM WAV container (44-byte canonical header) */
export function encodeWav(pcm, sampleRate, channels = 2) {
  const dataBytes = pcm.length * 2;
  const out = new Uint8Array(44 + dataBytes);
  const dv = new DataView(out.buffer);
  const ascii = (off, s) => { for (let i = 0; i < s.length; i++) out[off + i] = s.charCodeAt(i); };
  ascii(0, 'RIFF');
  dv.setUint32(4, 36 + dataBytes, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true);                       // PCM
  dv.setUint16(22, channels, true);
  dv.setUint32(24, sampleRate, true);
  dv.setUint32(28, sampleRate * channels * 2, true);
  dv.setUint16(32, channels * 2, true);
  dv.setUint16(34, 16, true);
  ascii(36, 'data');
  dv.setUint32(40, dataBytes, true);
  new Int16Array(out.buffer, 44).set(pcm);
  return out;
}
