// ============================================================================
//  gme.adapter.js — libgme adapter for the shared ChipEngineProcessor.
//  Appended after the Emscripten core, before processor.tail.js.
// ============================================================================
const ENGINE = {
  id: 'chiptune-gme',
  voiceCount: 0,
  _str(mod, ptr) { return ptr ? mod.UTF8ToString(ptr) : ''; },
  _json(mod, ptr) {
    const s = this._str(mod, ptr);
    try { return JSON.parse(s); } catch (e) { return null; }
  },

  /** @param {{base?:string}} opts base = directory URL of the worklet script */
  createModule(opts) {
    const base = (opts && opts.base) || '';
    return Module({
      noInitialRun: true,
      print: () => {},
      printErr: () => {},
      wasmBinary: opts && opts.wasmBinary,
      locateFile: (path) => (base && !/^[a-z]+:|^\//i.test(path) ? base + path : path),
      onAbort: (w) => { throw new Error('wasm abort: ' + (w && w.message || w)); }
    });
  },

  version(mod) { return this._str(mod, mod._gme2_version()); },

  // ---------------------------------------------------------------- load --
  load(mod, bytes, opts) {
    const ptr = mod._malloc(bytes.length);
    mod.HEAPU8.set(bytes, ptr);
    let err;
    try {
      err = mod._gme2_open(ptr, bytes.length, sampleRate | 0, opts.multichannel === false ? 0 : 1);
    } finally {
      mod._free(ptr);
    }
    if (err) throw new Error(this._str(mod, err));

    const count = mod._gme2_track_count();
    const tracks = [];
    for (let i = 0; i < Math.min(count, 512); i++) {
      const info = this._json(mod, mod._gme2_track_info(i)) || {};
      tracks.push({
        index: i,
        title: info.song || '',
        length: info.length || 0,
        intro: info.intro || 0,
        loop: info.loop || 0,
        game: info.game || '',
        author: info.author || '',
        copyright: info.copyright || '',
        comment: info.comment || '',
        dumper: info.dumper || ''
      });
    }
    const vc = Math.min(mod._gme2_voice_count(), 16);
    this.voiceCount = vc;
    const names = [];
    for (let i = 0; i < vc; i++) names.push(this._str(mod, mod._gme2_voice_name(i)) || ('V' + (i + 1)));

    const system = this._str(mod, mod._gme2_system());
    const first = tracks[0] || {};
    const multi = !!mod._gme2_is_multichannel();
    return {
      // per-voice (multi-channel) rendering sums the voices with two extra
      // bits of headroom lost to stereo panning, so the same music measures
      // ~1.4x quieter than the plain stereo bus: compensate here (measured
      // with tests/scale-probe.mjs, rms ratio 1.392 / peak ratio 1.683).
      mix: { scale: multi ? 1.4 : 1.0 },
      meta: {
        system,
        extension: this._str(mod, mod._gme2_extension()),
        multitrack: !!mod._gme2_multitrack(),
        multichannel: !!mod._gme2_is_multichannel(),
        trackCount: count,
        tracks,
        voices: names,
        title: first.title || '',
        game: first.game || '',
        author: first.author || '',
        copyright: first.copyright || '',
        comment: first.comment || '',
        dumper: first.dumper || ''
      }
    };
  },

  unmount(mod) { try { mod._gme2_close(); } catch (e) {} },
  start(mod, track) { mod._gme2_start_track(track | 0); },
  seek(mod, ms) { mod._gme2_seek(ms | 0); },
  setTempo(mod, f) { mod._gme2_set_tempo(f); },
  channels(mod) { return this.voiceCount; },
  channelNames(mod) {
    const out = [];
    for (let i = 0; i < this.voiceCount; i++) out.push(this._str(mod, mod._gme2_voice_name(i)) || ('V' + (i + 1)));
    return out;
  },
  setMix(mod, mix) { /* per-voice mix is done in render() */ },

  // -------------------------------------------------------------- render --
  render(mod, frames, outL, outR, mix) {
    const ended = mod._gme2_play(frames | 0);
    const ptr = mod._gme2_buf();
    const chans = mod._gme2_out_channels();
    const heap = new Int16Array(mod.HEAPU8.buffer, ptr, frames * chans);
    const S = 1 / 32768;
    const nv = this.voiceCount;

    if (chans === 2 || nv === 0) {
      for (let f = 0; f < frames; f++) {
        outL[f] = heap[f * 2] * S;
        outR[f] = heap[f * 2 + 1] * S;
      }
      // stereo fallback: the UI drives its meters from the output peak (L/R)
      return { ended: !!ended, levels: null };
    }

    // ---- multi-channel mix: 8 stereo pairs -> our stereo bus ----
    const levels = new Float32Array(nv);
    for (let f = 0; f < frames; f++) { outL[f] = 0; outR[f] = 0; }
    for (let v = 0; v < nv; v++) {
      let g = mix.gains[v] != null ? mix.gains[v] : 1;
      if (g <= 0.0001) continue;
      const pan = mix.pans[v] || 0;
      const gl = g * (pan <= 0 ? 1 : 1 - pan * 0.85);
      const gr = g * (pan >= 0 ? 1 : 1 + pan * 0.85);
      let peak = 0;
      const base = v * 2;
      const stride = nv * 2;
      for (let f = 0; f < frames; f++) {
        const l = heap[f * stride + base] * S;
        const r = heap[f * stride + base + 1] * S;
        const a = (l < 0 ? -l : l) + (r < 0 ? -r : r);
        if (a > peak) peak = a;
        outL[f] += l * gl;
        outR[f] += r * gr;
      }
      levels[v] = Math.min(1, peak * 0.5 * g);
    }
    const sc = mix.scale || 1;
    for (let f = 0; f < frames; f++) {
      let l = outL[f] * sc, r = outR[f] * sc;
      l = l * (27 + l * l) / (27 + 9 * l * l);   // tanh-ish soft clip
      r = r * (27 + r * r) / (27 + 9 * r * r);
      outL[f] = l; outR[f] = r;
    }
    return { ended: !!ended, levels };
  },

  meter(mod) { return null; },   // per-voice levels come back from render()

  status(mod) {
    return {
      tell: mod._gme2_tell(),
      engineEnded: !!mod._gme2_track_ended(),
      multichannel: !!mod._gme2_is_multichannel()
    };
  },

  setChannelGain(mod, ch, gain) { /* handled by mixer */ }
};
