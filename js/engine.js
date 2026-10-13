// engine.js — the audio side of the console.
//
//   [chip engine worklet]  →  inputGain → EQ(low/mid/high) → masterVol
//                          →  limiter  →  analyser  →  destination
//
// Two AudioWorklet nodes exist: "play" (the audible one) and "scan" (loads a
// file just to read its metadata, never rendered). Both are instances of the
// same WASM engine, so scanning never disturbs playback.
import { ENGINE_INFO } from './formats.js';
import { Compat } from './compat.js';

const CHANNEL_FALLBACK = 8;

export class Engine {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.loadedModules = new Set();
    this.workletError = {};          // per-engine failure, so we do not retry forever
    this.mode = null;                // null = undecided | 'worklet' | 'compat'
    this.compat = new Compat(this);  // main-thread fallback (see compat.js)
    this.state = 'offline';          // offline | running | suspended | error
    this.playNode = null;
    this.playEngine = null;
    this.playMeta = null;
    this.channels = 0;
    this.channelNames = [];
    this.scanNodes = {};
    this._seq = 1;
    this._pending = new Map();
    this.on = { meters: [], status: [], ended: [], event: [], state: [] };
    this.lastPeak = 0;
    this._vol = 0.8;                                     // master volume (0..1)
    this._eq = { bass: 0, mid: 0, treble: 0 };           // tone, applied on init()
  }

  emit(kind, data) { for (const f of this.on[kind] || []) { try { f(data); } catch (e) { console.error(e); } } }

  async init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') await this.ctx.resume(); return this.ctx; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) throw new Error('Web Audio API yok (tarayıcı çok eski ya da iframe sesi engelliyor)');
    const ctx = new AC({ latencyHint: 'interactive' });
    this.ctx = ctx;
    // opaque-origin documents (sandboxed iframes without allow-same-origin) do
    // not expose audioWorklet at all: that is not an error, it just selects the
    // compatibility route instead of the worklet one
    this.workletSupported = !!ctx.audioWorklet;

    // ---- FX chain -------------------------------------------------------
    this.input = ctx.createGain();
    this.eqBass = ctx.createBiquadFilter(); this.eqBass.type = 'lowshelf'; this.eqBass.frequency.value = 220;
    this.eqMid = ctx.createBiquadFilter(); this.eqMid.type = 'peaking'; this.eqMid.frequency.value = 1400; this.eqMid.Q.value = 0.9;
    this.eqTreble = ctx.createBiquadFilter(); this.eqTreble.type = 'highshelf'; this.eqTreble.frequency.value = 5200;
    this.masterGain = ctx.createGain(); this.masterGain.gain.value = 0.8;
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -2; this.limiter.knee.value = 4; this.limiter.ratio.value = 12;
    this.limiter.attack.value = 0.003; this.limiter.release.value = 0.18;
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 4096; this.analyser.smoothingTimeConstant = 0.72; this.analyser.minDecibels = -96;

    this.input.connect(this.eqBass).connect(this.eqMid).connect(this.eqTreble)
      .connect(this.masterGain).connect(this.limiter).connect(this.analyser).connect(ctx.destination);

    // apply whatever the UI configured before the context existed
    this.setEq(this._eq.bass, this._eq.mid, this._eq.treble);
    this.masterGain.gain.value = this._vol;

    this.timeData = new Float32Array(this.analyser.fftSize);
    this.freqData = new Uint8Array(this.analyser.frequencyBinCount);

    const publish = () => {
      this.state = ctx.state === 'running' ? 'running' : ctx.state === 'suspended' ? 'suspended' : 'error';
      this.emit('state', { state: this.state, sampleRate: ctx.sampleRate, latency: ctx.baseLatency, mode: this.mode });
    };
    ctx.onstatechange = publish;
    if (ctx.state === 'suspended') await ctx.resume().catch(() => {});
    this.state = ctx.state;
    this.ready = true;
    publish();
    return ctx;
  }

  // ---------------------------------------------------------------- worklet
  /** directory URL that holds <engine>.worklet.js and <engine>.wasm */
  wasmBase(name) {
    const abs = new URL(ENGINE_INFO[name].worklet, location.href).href;
    return abs.replace(/[^/]*$/, '');
  }

  /**
   * Pick the audio route once: AudioWorklet when the host supports it,
   * otherwise the main-thread compatibility engine (same WASM, same FX chain).
   * This is what keeps the console audible inside sandboxed iframes and on
   * browsers whose worklet implementation is blocked or missing.
   */
  async ensureEngine(name) {
    if (this.mode === 'worklet') return this.ensureWorklet(name);
    if (this.mode === 'compat') return this.compat.ensure(name);
    if (!this.workletSupported) {
      // no AudioWorklet in this document: go straight to the compat engine
      this.mode = 'compat';
      this.emit('event', {
        level: 'warn',
        msg: 'bu sayfada AudioWorklet yok (sandbox’lı iframe / opaque origin) → UYUMLULUK MODU (ana iş parçacığı WASM)'
      });
      await this.compat.ensure(name);
      this.emit('event', { level: 'ok', msg: `uyumluluk motoru hazır: ${name} (${this.compat.loadRoute === 'es-module' ? 'ES modül' : 'eval'})` });
      this.republishState();
      return;
    }
    try {
      await this.ensureWorklet(name);
      this.mode = 'worklet';
    } catch (e) {
      this.mode = 'compat';
      this.emit('event', { level: 'warn', msg: 'AudioWorklet kullanılamıyor → UYUMLULUK MODU (ana iş parçacığı WASM + AudioBufferSource)' });
      await this.compat.ensure(name);
      this.emit('event', { level: 'ok', msg: `uyumluluk motoru hazır: ${name} (${this.compat.loadRoute === 'es-module' ? 'ES modül' : 'eval'})` });
    }
    this.republishState();
  }

  /** tell the UI which route is in use (status bar shows WORKLET / COMPAT) */
  republishState() {
    if (!this.ctx) return;
    this.emit('state', {
      state: this.ctx.state === 'running' ? 'running' : this.ctx.state,
      sampleRate: this.ctx.sampleRate, latency: this.ctx.baseLatency, mode: this.mode
    });
  }

  async ensureWorklet(name) {
    if (this.loadedModules.has(name)) return;
    if (!this.ctx || !this.ctx.audioWorklet) {
      const msg = 'bu belgede AudioWorklet API yok (opaque origin / sandbox’lı iframe)';
      this.workletError[name] = msg;
      throw new Error(msg);
    }
    if (this.workletError[name]) throw new Error(this.workletError[name]);   // fail fast, once
    const info = ENGINE_INFO[name];
    try {
      // addModule() can silently never settle when the host has no working
      // audio backend (headless shells, exotic browsers) - fail loudly instead.
      await Promise.race([
        this.ctx.audioWorklet.addModule(info.worklet),
        new Promise((_, rej) => setTimeout(() => rej(new Error(
          'AudioWorklet.addModule() 7 sn içinde yanıt vermedi — bu ortam AudioWorklet çalıştırmıyor olabilir. ' +
          'Masaüstü Chrome / Edge / Firefox / Safari kullanın.')), 7000))
      ]);
      this.loadedModules.add(name);
      this.emit('event', { level: 'ok', msg: `AudioWorklet yüklendi: ${info.worklet}` });
    } catch (e) {
      this.workletError[name] = `${name} motoru yüklenemedi: ${e.message}`;
      this.emit('event', { level: 'err', msg: this.workletError[name] });
      throw new Error(this.workletError[name]);
    }
  }

  _newNode(name, connect = true) {
    const node = new AudioWorkletNode(this.ctx, ENGINE_INFO[name].processor, {
      numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2]
    });
    node.port.onmessage = (e) => this._onMessage(node, e.data);
    if (connect) node.connect(this.input);
    return node;
  }

  _onMessage(node, data) {
    if (!data) return;
    if (data.id && this._pending.has(data.id)) {
      const { res, rej } = this._pending.get(data.id);
      this._pending.delete(data.id);
      data.ok ? res(data) : rej(new Error(data.error || 'komut hatası'));
      return;
    }
    if (node !== this.playNode && data.event !== 'fatal') return;   // scan nodes: ignore
    switch (data.event) {
      case 'ready':    this.emit('event', { level: 'ok', msg: 'motor hazır: ' + data.version }); break;
      case 'fatal':    this.emit('event', { level: 'err', msg: 'worklet hatası: ' + data.message }); break;
      case 'meters':   this.lastPeak = Math.max(data.peakL || 0, data.peakR || 0); this.emit('meters', data); break;
      case 'status':   this.emit('status', data); break;
      case 'trackended': this.emit('ended', data); break;
      case 'engineended': break;
    }
  }

  call(cmd, extra = {}, node = this.playNode, timeout = 40000) {
    if (!node) return Promise.reject(new Error('motor yüklü değil'));
    const id = this._seq++;
    return new Promise((res, rej) => {
      this._pending.set(id, { res, rej });
      node.port.postMessage({ id, cmd, ...extra });
      setTimeout(() => {
        if (this._pending.has(id)) { this._pending.delete(id); rej(new Error(cmd + ' zaman aşımı')); }
      }, timeout);
    });
  }

  // ------------------------------------------------------------------ load

  async fetchWasmBinary(name) {
    if (!this.wasmBinaries) this.wasmBinaries = new Map();
    if (this.wasmBinaries.has(name)) return this.wasmBinaries.get(name);
    const url = this.wasmBase(name) + name + '.wasm';
    const res = await fetch(url);
    if (!res.ok) throw new Error();
    const buf = new Uint8Array(await res.arrayBuffer());
    this.wasmBinaries.set(name, buf);
    return buf;
  }

  async load(bytes, name, engineName, { multichannel = true, scan = false } = {}) {
    await this.init();
    await this.ensureEngine(engineName);
    if (this.mode === 'compat') {
      const payload0 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
      const res = await this.compat.load(payload0, name, engineName, { multichannel });
      this.playEngine = engineName;
      this.playMeta = res.meta || {};
      this.multichannel = !!res.multichannel;
      this.channels = Math.min(res.channels || (res.meta && res.meta.voices && res.meta.voices.length) || CHANNEL_FALLBACK, 64);
      this.channelNames = res.channelNames || (res.meta && res.meta.voices) || [];
      this.bytes = payload0;
      this.name = name;
      return res;
    }
    const node = scan ? this._scanNode(engineName) : this._playNode(engineName);
    const payload = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const wasmBinary = await this.fetchWasmBinary(engineName);
    const res = await this.call('load', { bytes: payload, opts: { multichannel }, base: this.wasmBase(engineName), wasmBinary }, node);
    const meta = res.meta || {};
    if (!scan) {
      this.playEngine = engineName;
      this.playMeta = meta;
      this.channels = Math.min(res.channels || meta.voices?.length || CHANNEL_FALLBACK, 64);
      this.channelNames = res.channelNames || meta.voices || [];
      this.multichannel = !!res.multichannel;
      this.bytes = payload;
      this.name = name;
    }
    return { meta, channels: res.channels, channelNames: res.channelNames, multichannel: !!res.multichannel };
  }

  _playNode(name) {
    if (this.playNode && this.playEngine === name) return this.playNode;
    if (this.playNode) { try { this.playNode.disconnect(); } catch (e) {} this.playNode = null; }
    const node = this._newNode(name, true);
    this.playNode = node;
    this.playEngine = name;
    this.emit('event', { level: 'info', msg: 'motor kanalı açıldı: ' + name });
    return node;
  }

  _scanNode(name) {
    if (!this.scanNodes[name]) {
      const node = this._newNode(name, true);
      this.scanNodes[name] = node;
      this.emit('event', { level: 'info', msg: 'tarama kanalı açıldı: ' + name });
    }
    return this.scanNodes[name];
  }

  /** Read metadata of a file without touching playback (uses the scan channel). */
  async scanMeta(bytes, name, engineName) {
    await this.init();
    await this.ensureEngine(engineName);
    const payload = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (this.mode === 'compat') return this.compat.scan(payload, engineName);
    const wasmBinary = await this.fetchWasmBinary(engineName);
    // a metadata read is a nicety: give it a shorter budget than playback
    const res = await this.call('load', { bytes: payload, opts: { multichannel: false }, base: this.wasmBase(engineName), wasmBinary },
      this._scanNode(engineName), 8000);
    return { meta: res.meta || {}, channels: res.channels, channelNames: res.channelNames };
  }

  // -------------------------------------------------------------- controls
  play(track = 0, opts = {}) {
    if (this.mode === 'compat') return this.compat.play(track, opts);
    return this.call('play', { track, ...opts });
  }
  pause() { return this.mode === 'compat' ? this.compat.pause() : this.call('pause'); }
  resume() { return this.mode === 'compat' ? this.compat.resume() : this.call('resume'); }
  stop() {
    if (this.mode === 'compat') return this.compat.stop();
    return this.call('stop').catch(() => {});
  }
  seek(ms) { return this.mode === 'compat' ? this.compat.seek(ms) : this.call('seek', { ms }); }
  setTempo(f) {
    if (this.mode === 'compat') return this.compat.setTempo(f);
    return this.call('speed', { factor: f }).catch(() => {});
  }
  setMaster(v) { this._vol = v; if (this.masterGain) this.masterGain.gain.value = v; }
  setChannel(ch, gain) {
    if (this.mode === 'compat') return this.compat.setChannel(ch, gain);
    return this.call('channel', { channel: ch, gain }).catch(() => {});
  }
  setMuteAll(muted) {
    if (muted) { this._volBeforeMute = this._vol; this.setMaster(0); }
    else this.setMaster(this._volBeforeMute ?? 0.8);
  }

  setEq(bass, mid, treble) {
    this._eq = { bass, mid, treble };
    if (!this.eqBass) return;                            // context not created yet
    this.eqBass.gain.value = bass;
    this.eqMid.gain.value = mid;
    this.eqTreble.gain.value = treble;
  }

  /** current output level (RMS + peak) measured from the real output */
  measure() {
    if (!this.analyser || !this.timeData) return { rms: 0, peak: 0 };
    this.analyser.getFloatTimeDomainData(this.timeData);
    let sum = 0, peak = 0;
    for (let i = 0; i < this.timeData.length; i++) {
      const v = this.timeData[i];
      sum += v * v;
      const a = v < 0 ? -v : v;
      if (a > peak) peak = a;
    }
    return { rms: Math.sqrt(sum / this.timeData.length), peak };
  }

  get channelCount() { return this.channels || this.channelNames.length || 0; }
}
