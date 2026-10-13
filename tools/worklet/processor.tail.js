// ============================================================================
//  processor.tail.js — shared AudioWorkletProcessor for both engines.
//
//  Appended after an Emscripten MODULARIZE core (SINGLE_FILE) + an adapter
//  file that defines `ENGINE`.  Never loaded on its own.
//
//  ENGINE contract (implemented by gme.adapter.js / xmp.adapter.js):
//    id           : processor name registered in the AudioWorklet
//    createModule(): returns Promise<EmscriptenModule>
//    version(mod) : short string
//    load(mod, bytes, opts)                 -> { meta }        (throws on error)
//    unmount(mod)
//    start(mod, track, opts)                -> void
//    render(mod, frames, outL, outR, mix)   -> { ended, levels? }
//    channels(mod) / channelNames(mod)
//    seek(mod, ms)
//    setTempo(mod, factor)
//    setChannelGain(mod, ch, gain)          -> handled by ENGINE or mix
//    meter(mod)                             -> { levels, channels }
//    status(mod)                            -> { pos, total, row, pattern, bpm, speed, extra }
//    setMix(mod, mix)                       (optional)
// ============================================================================
const BLOCK_FRAMES = 1024;

class ChipEngineProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.mod = null;
    this.ready = false;
    this.queue = [];
    this.loaded = false;

    // ring buffer of rendered audio
    this.ringL = new Float32Array(BLOCK_FRAMES);
    this.ringR = new Float32Array(BLOCK_FRAMES);
    this.ringRead = 0;
    this.ringLen = 0;

    this.playing = false;
    this.paused = false;

    this.playFrames = 0;              // frames played for the current track
    this.playMs = 0;                  // resolved play length (0 = unlimited)
    this.fadeMs = 4000;
    this.loopMode = 'off';            // off | one | auto | infinite
    this.master = 1.0;
    this.engineEnded = false;

    // mixer (per channel gain / pan), used by engines that render per-channel
    this.mix = { gains: [], pans: [], mono: [], scale: 1 };

    this.postAcc = 0;
    this.meterAcc = 0;
    this.meterLevels = new Float32Array(16);
    this.peakL = 0; this.peakR = 0;
    this.rmsAcc = 0; this.rmsN = 0;
    this.rowLast = -1; this.patLast = -1;
    this.lastNote = [];

    this.modPromise = null;
    this.port.onmessage = (e) => this.onCommand(e.data);
  }

  /**
   * The WASM module is created on the first `load` command, because that is
   * when the main thread tells us where the engine's .wasm files live (the
   * worklet scope cannot resolve URLs on its own).
   */
  ensureModule(base) {
    if (this.modPromise) return this.modPromise;
    this.modPromise = ENGINE.createModule({ base: base || '' }).then((mod) => {
      this.mod = mod;
      this.ready = true;
      this.port.postMessage({ event: 'ready', version: ENGINE.version(mod) });
      const q = this.queue; this.queue = [];
      for (const m of q) this.onCommand(m);
      return mod;
    }).catch((err) => {
      this.port.postMessage({ event: 'fatal', message: String(err && err.message || err) });
      return null;
    });
    return this.modPromise;
  }

  // ------------------------------------------------------------- commands --
  onCommand(msg) {
    if (!msg || !msg.cmd) return;
    if (!this.ready) {                 // engine not compiled yet -> queue it
      this.queue.push(msg);
      if (msg.cmd === 'load') this.ensureModule(msg.base);   // first load kicks it off
      return;
    }
    const reply = (payload) => this.port.postMessage({ id: msg.id, ...payload });
    try {
      switch (msg.cmd) {
        case 'load': {
          const bytes = msg.bytes instanceof Uint8Array ? msg.bytes : new Uint8Array(msg.bytes);
          ENGINE.unmount(this.mod);
          const res = ENGINE.load(this.mod, bytes, msg.opts || {});
          this.loaded = true;
          this.playing = false;
          this.paused = false;
          this.playFrames = 0;
          this.engineEnded = false;
          this.ringRead = this.ringLen = 0;
          const chn = ENGINE.channels(this.mod);
          const names = ENGINE.channelNames(this.mod);
          this.mix.gains = new Float32Array(16).fill(1);
          this.mix.pans  = new Float32Array(16);
          for (let i = 0; i < 16; i++) this.mix.pans[i] = (i % 2) ? 1 : -1;
          this.mix.scale = 1;
          if (res && res.mix) Object.assign(this.mix, res.mix);
          ENGINE.setMix && ENGINE.setMix(this.mod, this.mix);
          reply({ ok: true, meta: res.meta || {}, channels: chn, channelNames: names,
                  multichannel: !!(res.meta && res.meta.multichannel) });
          break;
        }
        case 'play': {
          if (!this.loaded) { reply({ ok: false, error: 'nothing loaded' }); break; }
          this.playMs   = msg.playMs || 0;
          this.fadeMs   = msg.fadeMs != null ? msg.fadeMs : 4000;
          this.loopMode = msg.loop || 'off';
          this.master   = msg.master != null ? msg.master : this.master;
          this.lastTrack = msg.track || 0;
          ENGINE.start(this.mod, this.lastTrack, msg.opts || {});
          this.playing = true; this.paused = false;
          this.playFrames = 0; this.engineEnded = false;
          this.ringRead = this.ringLen = 0;
          this.rowLast = this.patLast = -1;
          reply({ ok: true });
          break;
        }
        case 'pause':  this.paused = true;  reply({ ok: true }); break;
        case 'resume': this.paused = false; reply({ ok: true }); break;
        case 'stop':
          this.playing = false; this.paused = false; this.ringRead = this.ringLen = 0;
          reply({ ok: true });
          break;
        case 'seek': {
          if (!this.loaded) { reply({ ok: false }); break; }
          ENGINE.seek(this.mod, msg.ms || 0);
          this.playFrames = Math.max(0, (msg.ms || 0) * sampleRate / 1000);
          this.engineEnded = false;
          this.ringRead = this.ringLen = 0;
          reply({ ok: true });
          break;
        }
        case 'speed': ENGINE.setTempo(this.mod, msg.factor || 1); reply({ ok: true }); break;
        case 'master': this.master = msg.value; reply({ ok: true }); break;
        case 'channel': {
          const ch = msg.channel | 0;
          if (msg.gain != null) this.mix.gains[ch] = msg.gain;
          if (msg.pan != null)  this.mix.pans[ch]  = msg.pan;
          if (msg.mute != null) this.mix.gains[ch] = msg.mute ? 0 : (msg.gain != null ? msg.gain : 1);
          ENGINE.setChannelGain && ENGINE.setChannelGain(this.mod, ch, this.mix.gains[ch]);
          ENGINE.setMix && ENGINE.setMix(this.mod, this.mix);
          reply({ ok: true });
          break;
        }
        case 'mixscale': this.mix.scale = msg.value; ENGINE.setMix && ENGINE.setMix(this.mod, this.mix); reply({ ok: true }); break;
        case 'unload': ENGINE.unmount(this.mod); this.loaded = false; this.playing = false; reply({ ok: true }); break;
        default: reply({ ok: false, error: 'unknown command ' + msg.cmd });
      }
    } catch (e) {
      reply({ ok: false, error: String(e && e.message || e) });
    }
  }

  // -------------------------------------------------------------- render ---
  fillRing() {
    const active = ENGINE.render(this.mod, BLOCK_FRAMES, this.ringL, this.ringR, this.mix);
    this.ringLen = BLOCK_FRAMES;
    this.ringRead = 0;
    this.engineEnded = !!(active && active.ended);
    return active;
  }

  gainAt(frameIndex) {
    if (!this.playMs || this.loopMode === 'infinite') return this.master;
    const start = this.playMs * sampleRate / 1000;
    const fade  = this.fadeMs * sampleRate / 1000;
    if (frameIndex < start) return this.master;
    if (fade <= 0) return 0;
    const t = (frameIndex - start) / fade;
    return t >= 1 ? 0 : this.master * (1 - t);
  }

  process(inputs, outputs) {
    const out = outputs[0];
    const L = out[0], R = out[1] || out[0];
    if (!this.playing || this.paused || !this.loaded) return true;

    let i = 0;
    while (i < L.length) {
      if (this.ringRead >= this.ringLen) {
        const res = this.fillRing();
        if (res && res.levels) this.absorbLevels(res.levels);
        if (this.ringLen === 0) break;
        if (this.engineEnded) this.port.postMessage({ event: 'engineended' });
      }
      const n = Math.min(L.length - i, this.ringLen - this.ringRead);
      for (let k = 0; k < n; k++) {
        const g = this.gainAt(this.playFrames + k);
        const l = this.ringL[this.ringRead + k] * g;
        const r = this.ringR[this.ringRead + k] * g;
        L[i + k] = l; R[i + k] = r;
        const al = l < 0 ? -l : l, ar = r < 0 ? -r : r;
        if (al > this.peakL) this.peakL = al;
        if (ar > this.peakR) this.peakR = ar;
        this.rmsAcc += l * l + r * r; this.rmsN += 2;
      }
      this.ringRead += n; i += n; this.playFrames += n;

      const gNow = this.gainAt(this.playFrames);
      const fadedOut = this.playMs && this.loopMode !== 'infinite' && gNow <= 0 && this.fadeMs > 0;
      if (this.engineEnded || fadedOut) {
        if (this.loopMode === 'one') {                 // repeat one: restart in place
          this.port.postMessage({ event: 'trackended', reason: 'loop' });
          this.playFrames = 0;
          this.engineEnded = false;
          this.ringRead = this.ringLen = 0;
          ENGINE.start(this.mod, this.lastTrack || 0, {});
        } else {                                       // the queue decides what is next
          this.playing = false;
          this.port.postMessage({ event: 'trackended', reason: this.engineEnded ? 'end' : 'length' });
          break;
        }
      }
    }

    // throttled telemetry (meters ~20 Hz, status ~8 Hz)
    this.meterAcc += L.length / sampleRate;
    if (this.meterAcc >= 0.05) {
      this.meterAcc = 0;
      const extra = ENGINE.meter ? ENGINE.meter(this.mod) : null;
      if (extra && extra.levels) this.absorbLevels(extra.levels);
      this.port.postMessage({
        event: 'meters',
        levels: Array.from(this.meterLevels, (v) => Math.round(v * 1000) / 1000),
        peakL: this.peakL, peakR: this.peakR,
        rms: this.rmsN ? Math.sqrt(this.rmsAcc / this.rmsN) : 0,
        channels: extra ? extra.channels : null
      });
      this.peakL = this.peakR = 0; this.rmsAcc = 0; this.rmsN = 0;
    }
    this.postAcc += L.length / sampleRate;
    if (this.postAcc >= 0.12) {
      this.postAcc = 0;
      const st = ENGINE.status(this.mod);
      if (st) {
        st.event = 'status';
        st.posMs = Math.round(this.playFrames / sampleRate * 1000);
        this.port.postMessage(st);
      }
    }
    return true;
  }

  absorbLevels(levels) {
    for (let i = 0; i < levels.length && i < this.meterLevels.length; i++) {
      // fast attack / slow release so the bars feel like real VU meters
      const v = levels[i] || 0;
      this.meterLevels[i] = v > this.meterLevels[i] ? v : this.meterLevels[i] * 0.82 + v * 0.18;
    }
  }
}

registerProcessor(ENGINE.id, ChipEngineProcessor);
