// ============================================================================
//  xmp.adapter.js — libxmp adapter for the shared ChipEngineProcessor.
//  Tracker modules: MOD / S3M / XM / IT / 669 / MED / ... (Amiga + demoscene)
// ============================================================================
const ENGINE = {
  id: 'chiptune-xmp',
  chanCount: 0,

  _str(mod, ptr) { return ptr ? mod.UTF8ToString(ptr) : ''; },
  _json(mod, ptr) { try { return JSON.parse(this._str(mod, ptr)); } catch (e) { return null; } },

  /** @param {{base?:string}} opts base = directory URL of the worklet script */
  createModule(opts) {
    const base = (opts && opts.base) || '';
    return Module({
      noInitialRun: true,
      print: () => {},
      printErr: () => {},
      locateFile: (path) => (base && !/^[a-z]+:|^\//i.test(path) ? base + path : path),
      onAbort: (w) => { throw new Error('wasm abort: ' + (w && w.message || w)); }
    });
  },

  version(mod) { return this._str(mod, mod._xmp2_version()); },

  // ---------------------------------------------------------------- load --
  load(mod, bytes, opts) {
    const ptr = mod._malloc(bytes.length);
    mod.HEAPU8.set(bytes, ptr);
    let rc;
    try {
      rc = mod._xmp2_open(ptr, bytes.length, sampleRate | 0);
    } finally {
      mod._free(ptr);
    }
    if (rc !== 0) throw new Error(this._str(mod, mod._xmp2_last_error()) || ('libxmp error ' + rc));

    const info = this._json(mod, mod._xmp2_module_info()) || {};
    this.chanCount = Math.min(info.channels || 4, 64);
    const formats = this._str(mod, mod._xmp2_format_list()).split(',').filter(Boolean);

    return {
      meta: {
        system: 'Tracker Module (' + (info.type || '?') + ')',
        tracker: info.type || '',
        title: info.name || '',
        game: '',
        author: '',
        channels: info.channels || 0,
        patterns: info.patterns || 0,
        instruments: info.instruments || 0,
        samples: info.samples || 0,
        orders: info.length || 0,
        bpm: info.bpm || 0,
        speed: info.speed || 0,
        trackCount: 1,
        tracks: [{ index: 0, title: info.name || '', length: 0, game: '', author: '' }],
        voices: this.channelNames(mod),
        formats,
        multitrack: false,
        multichannel: true
      },
      mix: { scale: 1 }
    };
  },

  unmount(mod) { try { mod._xmp2_close(); } catch (e) {} },
  start(mod, track) { mod._xmp2_restart(); },
  seek(mod, ms) { mod._xmp2_seek(ms | 0); },
  setTempo(mod, f) { mod._xmp2_set_tempo(f); },
  channels(mod) { return this.chanCount; },
  channelNames(mod) {
    const out = [];
    for (let i = 0; i < this.chanCount; i++) out.push('CH ' + String(i + 1).padStart(2, '0'));
    return out;
  },
  setChannelGain(mod, ch, gain) { mod._xmp2_mute(ch | 0, gain <= 0.001 ? 1 : 0); },
  setMix(mod, mix) { /* scales are applied in render() */ },

  // -------------------------------------------------------------- render --
  render(mod, frames, outL, outR, mix) {
    const ended = mod._xmp2_play(frames | 0);
    const ptr = mod._xmp2_buf();
    const heap = new Int16Array(mod.HEAPU8.buffer, ptr, frames * 2);
    const S = 1 / 32768;
    const sc = (mix.scale || 1) * 0.9;
    for (let f = 0; f < frames; f++) {
      outL[f] = heap[f * 2] * S * sc;
      outR[f] = heap[f * 2 + 1] * S * sc;
    }
    return { ended: !!ended, levels: null };
  },

  // meters come from the player state: note on/off + channel volume/pan
  meter(mod) {
    const fi = this._json(mod, mod._xmp2_frame_info());
    if (!fi || !fi.channels) return null;
    const n = Math.min(fi.channels.length, 64);
    const levels = new Float32Array(n);
    const channels = new Array(n);
    for (let i = 0; i < n; i++) {
      const [note, vol, pan, ins] = fi.channels[i];
      levels[i] = note ? Math.min(1, (vol / 64) * 0.95) : 0;
      channels[i] = { note, vol, pan, ins };
    }
    return { levels, channels };
  },

  status(mod) {
    const fi = this._json(mod, mod._xmp2_frame_info());
    if (!fi) return null;
    return {
      positionMs: fi.time || 0,
      totalMs: fi.total_time || 0,
      pattern: fi.pattern,
      row: fi.row,
      rows: fi.rows,
      bpm: fi.bpm,
      speed: fi.speed,
      loopCount: fi.loop_count,
      sequence: fi.sequence,
      tempoFactor: fi.tempo_factor,
      playing: fi.frame >= 0
    };
  }
};
