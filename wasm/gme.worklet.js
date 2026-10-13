async function Module(moduleArg={}){var Module=moduleArg;var ENVIRONMENT_IS_AUDIO_WORKLET=!!globalThis.AudioWorkletGlobalScope;var programArgs=[];var thisProgram="./this.program";var scriptDirectory="";function locateFile(path){if(Module["locateFile"]){return Module["locateFile"](path,scriptDirectory)}return scriptDirectory+path}var readAsync,readBinary;{}var out=console.log.bind(console);var err=console.error.bind(console);var wasmBinary=Module["wasmBinary"];var ABORT=false;class EmscriptenEH{}class EmscriptenSjLj extends EmscriptenEH{}var runtimeInitialized=false;function updateMemoryViews(){var b=wasmMemory.buffer;HEAP8=new Int8Array(b);Module["HEAP16"]=HEAP16=new Int16Array(b);Module["HEAPU8"]=HEAPU8=new Uint8Array(b);HEAPU32=new Uint32Array(b)}function preRun(){var preRun=Module["preRun"];if(preRun){if(typeof preRun=="function")preRun=[preRun];onPreRuns.push(...preRun)}callRuntimeCallbacks(onPreRuns)}function initRuntime(){runtimeInitialized=true;wasmExports["e"]()}function postRun(){var postRun=Module["postRun"];if(postRun){if(typeof postRun=="function")postRun=[postRun];onPostRuns.push(...postRun)}callRuntimeCallbacks(onPostRuns)}function abort(what){Module["onAbort"]?.(what);what=`Aborted(${what})`;err(what);ABORT=true;what+=". Build with -sASSERTIONS for more info.";var e=new WebAssembly.RuntimeError(what);throw e}var wasmBinaryFile;function findWasmBinary(){return locateFile("gme.wasm")}function getBinarySync(file){if(wasmBinary)return wasmBinary;if(readBinary){return readBinary(file)}throw"both async and sync fetching of the wasm failed"}async function getWasmBinary(binaryFile){if(!wasmBinary){try{var response=await readAsync(binaryFile);return new Uint8Array(response)}catch{}}return getBinarySync(binaryFile)}async function instantiateArrayBuffer(binaryFile,imports){try{var binary=await getWasmBinary(binaryFile);var instance=await WebAssembly.instantiate(binary,imports);return instance}catch(reason){err(`failed to asynchronously prepare wasm: ${reason}`);abort(reason)}}async function instantiateAsync(binary,binaryFile,imports){if(!binary){try{var response=fetch(binaryFile,{credentials:"same-origin"});var instantiationResult=await WebAssembly.instantiateStreaming(response,imports);return instantiationResult}catch(reason){err(`wasm streaming compile failed: ${reason}`);err("falling back to ArrayBuffer instantiation")}}return instantiateArrayBuffer(binaryFile,imports)}function getWasmImports(){var imports={a:wasmImports};return imports}async function createWasm(){function receiveInstance(instance){wasmExports=instance.exports;assignWasmExports(wasmExports);updateMemoryViews();return wasmExports}function receiveInstantiationResult(result){return receiveInstance(result["instance"])}var info=getWasmImports();var instantiateWasm=Module["instantiateWasm"];if(instantiateWasm){return new Promise(resolve=>{instantiateWasm(info,inst=>resolve(receiveInstance(inst)))})}wasmBinaryFile??=findWasmBinary();var result=await instantiateAsync(wasmBinary,wasmBinaryFile,info);var exports=receiveInstantiationResult(result);return exports}class ExitStatus{name="ExitStatus";constructor(status){this.message=`Program terminated with exit(${status})`;this.status=status}}var callRuntimeCallbacks=callbacks=>{while(callbacks.length>0){callbacks.shift()(Module)}};var onPostRuns=[];var onPreRuns=[];var noExitRuntime=true;var HEAP8;var HEAPU32;class ExceptionInfo{constructor(excPtr){this.excPtr=excPtr;this.ptr=excPtr-24}set_type(type){HEAPU32[this.ptr+4>>2]=type}get_type(){return HEAPU32[this.ptr+4>>2]}set_destructor(destructor){HEAPU32[this.ptr+8>>2]=destructor}get_destructor(){return HEAPU32[this.ptr+8>>2]}set_caught(caught){caught=caught?1:0;HEAP8[this.ptr+12]=caught}get_caught(){return HEAP8[this.ptr+12]!=0}set_rethrown(rethrown){rethrown=rethrown?1:0;HEAP8[this.ptr+13]=rethrown}get_rethrown(){return HEAP8[this.ptr+13]!=0}init(type,destructor){this.set_adjusted_ptr(0);this.set_type(type);this.set_destructor(destructor)}set_adjusted_ptr(adjustedPtr){HEAPU32[this.ptr+16>>2]=adjustedPtr}get_adjusted_ptr(){return HEAPU32[this.ptr+16>>2]}}var uncaughtExceptionCount=0;var __Unwind_RaiseException=ex=>{abort()};var ___cxa_throw=(ptr,type,destructor)=>{var info=new ExceptionInfo(ptr);info.init(type,destructor);uncaughtExceptionCount++;__Unwind_RaiseException(ptr)};var __abort_js=()=>abort("");var abortOnCannotGrowMemory=requestedSize=>{abort("OOM")};var HEAPU8;var _emscripten_resize_heap=requestedSize=>{var oldSize=HEAPU8.length;requestedSize>>>=0;abortOnCannotGrowMemory(requestedSize)};var HEAP16;var UTF8Decoder=globalThis.TextDecoder&&new TextDecoder;var findStringEnd=(heapOrArray,idx,maxBytesToRead,ignoreNul)=>{var maxIdx=idx+maxBytesToRead;if(ignoreNul)return maxIdx;while(heapOrArray[idx]&&!(idx>=maxIdx))++idx;return idx};var UTF8ArrayToString=(heapOrArray,idx=0,maxBytesToRead,ignoreNul)=>{var endPtr=findStringEnd(heapOrArray,idx,maxBytesToRead,ignoreNul);if(endPtr-idx>16&&heapOrArray.buffer&&UTF8Decoder){return UTF8Decoder.decode(heapOrArray.subarray(idx,endPtr))}var str="";while(idx<endPtr){var u0=heapOrArray[idx++];if(!(u0&128)){str+=String.fromCharCode(u0);continue}var u1=heapOrArray[idx++]&63;if((u0&224)==192){str+=String.fromCharCode((u0&31)<<6|u1);continue}var u2=heapOrArray[idx++]&63;if((u0&240)==224){u0=(u0&15)<<12|u1<<6|u2}else{u0=(u0&7)<<18|u1<<12|u2<<6|heapOrArray[idx++]&63}if(u0<65536){str+=String.fromCharCode(u0)}else{var ch=u0-65536;str+=String.fromCharCode(55296|ch>>10,56320|ch&1023)}}return str};var UTF8ToString=(ptr,maxBytesToRead,ignoreNul)=>ptr?UTF8ArrayToString(HEAPU8,ptr,maxBytesToRead,ignoreNul):"";var stringToUTF8Array=(str,heap,outIdx,maxBytesToWrite)=>{if(!(maxBytesToWrite>0))return 0;var startIdx=outIdx;var endIdx=outIdx+maxBytesToWrite-1;for(var i=0;i<str.length;++i){var u=str.codePointAt(i);if(u<=127){if(outIdx>=endIdx)break;heap[outIdx++]=u}else if(u<=2047){if(outIdx+1>=endIdx)break;heap[outIdx++]=192|u>>6;heap[outIdx++]=128|u&63}else if(u<=65535){if(outIdx+2>=endIdx)break;heap[outIdx++]=224|u>>12;heap[outIdx++]=128|u>>6&63;heap[outIdx++]=128|u&63}else{if(outIdx+3>=endIdx)break;heap[outIdx++]=240|u>>18;heap[outIdx++]=128|u>>12&63;heap[outIdx++]=128|u>>6&63;heap[outIdx++]=128|u&63;i++}}heap[outIdx]=0;return outIdx-startIdx};var stringToUTF8=(str,outPtr,maxBytesToWrite)=>stringToUTF8Array(str,HEAPU8,outPtr,maxBytesToWrite);var lengthBytesUTF8=str=>{var len=0;for(var i=0;i<str.length;++i){var c=str.charCodeAt(i);if(c<=127){len++}else if(c<=2047){len+=2}else if(c>=55296&&c<=57343){len+=4;++i}else{len+=3}}return len};{if(Module["noExitRuntime"])noExitRuntime=Module["noExitRuntime"];if(Module["print"])out=Module["print"];if(Module["printErr"])err=Module["printErr"];if(Module["arguments"])programArgs=Module["arguments"];if(Module["thisProgram"])thisProgram=Module["thisProgram"];var preInit=Module["preInit"];if(preInit){if(typeof preInit=="function")Module["preInit"]=preInit=[preInit];while(preInit.length>0){preInit.shift()()}}}Module["UTF8ToString"]=UTF8ToString;Module["stringToUTF8"]=stringToUTF8;Module["lengthBytesUTF8"]=lengthBytesUTF8;var _gme2_version,_gme2_warning,_free,_malloc,_gme2_last_error,_gme2_out_channels,_gme2_open,_gme2_close,_gme2_track_count,_gme2_system,_gme2_extension,_gme2_multitrack,_gme2_is_multichannel,_gme2_voice_count,_gme2_voice_name,_gme2_track_info,_gme2_identify,_gme2_start_track,_gme2_seek,_gme2_tell,_gme2_track_ended,_gme2_set_tempo,_gme2_mute_voice,_gme2_mute_voices,_gme2_set_equalizer,_gme2_set_stereo_depth,_gme2_enable_accuracy,_gme2_last_peak,_gme2_buf,_gme2_play,memory,__indirect_function_table,wasmMemory;function assignWasmExports(wasmExports){_gme2_version=Module["_gme2_version"]=wasmExports["f"];_gme2_warning=Module["_gme2_warning"]=wasmExports["g"];_free=Module["_free"]=wasmExports["h"];_malloc=Module["_malloc"]=wasmExports["i"];_gme2_last_error=Module["_gme2_last_error"]=wasmExports["j"];_gme2_out_channels=Module["_gme2_out_channels"]=wasmExports["k"];_gme2_open=Module["_gme2_open"]=wasmExports["l"];_gme2_close=Module["_gme2_close"]=wasmExports["m"];_gme2_track_count=Module["_gme2_track_count"]=wasmExports["n"];_gme2_system=Module["_gme2_system"]=wasmExports["o"];_gme2_extension=Module["_gme2_extension"]=wasmExports["p"];_gme2_multitrack=Module["_gme2_multitrack"]=wasmExports["q"];_gme2_is_multichannel=Module["_gme2_is_multichannel"]=wasmExports["r"];_gme2_voice_count=Module["_gme2_voice_count"]=wasmExports["s"];_gme2_voice_name=Module["_gme2_voice_name"]=wasmExports["t"];_gme2_track_info=Module["_gme2_track_info"]=wasmExports["u"];_gme2_identify=Module["_gme2_identify"]=wasmExports["v"];_gme2_start_track=Module["_gme2_start_track"]=wasmExports["w"];_gme2_seek=Module["_gme2_seek"]=wasmExports["x"];_gme2_tell=Module["_gme2_tell"]=wasmExports["y"];_gme2_track_ended=Module["_gme2_track_ended"]=wasmExports["z"];_gme2_set_tempo=Module["_gme2_set_tempo"]=wasmExports["A"];_gme2_mute_voice=Module["_gme2_mute_voice"]=wasmExports["B"];_gme2_mute_voices=Module["_gme2_mute_voices"]=wasmExports["C"];_gme2_set_equalizer=Module["_gme2_set_equalizer"]=wasmExports["D"];_gme2_set_stereo_depth=Module["_gme2_set_stereo_depth"]=wasmExports["E"];_gme2_enable_accuracy=Module["_gme2_enable_accuracy"]=wasmExports["F"];_gme2_last_peak=Module["_gme2_last_peak"]=wasmExports["G"];_gme2_buf=Module["_gme2_buf"]=wasmExports["H"];_gme2_play=Module["_gme2_play"]=wasmExports["I"];memory=wasmMemory=wasmExports["d"];__indirect_function_table=wasmExports["__indirect_function_table"]}var wasmImports={a:___cxa_throw,c:__abort_js,b:_emscripten_resize_heap};async function run(){preRun();var setStatus=Module["setStatus"];if(setStatus){setStatus("Running...");await new Promise(resolve=>setTimeout(resolve,1));setTimeout(setStatus,1,"")}if(ABORT)return;initRuntime();Module["onRuntimeInitialized"]?.();postRun()}var wasmExports;wasmExports=await createWasm();await run();
;return Module}if(typeof exports==="object"&&typeof module==="object"){module.exports=Module;module.exports.default=Module}else if(typeof define==="function"&&define["amd"])define([],()=>Module);
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
      for (let f = 0; f < frames; f++) {
        const l = heap[f * 16 + base] * S;
        const r = heap[f * 16 + base + 1] * S;
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
  ensureModule(base, wasmBinary) {
    if (this.modPromise) return this.modPromise;
    this.port.postMessage({ event: 'event', level: 'info', msg: 'ensureModule: wasmBinary len=' + (wasmBinary ? wasmBinary.length : 'NULL') + ' type=' + typeof wasmBinary + ' isUint8=' + (wasmBinary instanceof Uint8Array) });
    this.modPromise = ENGINE.createModule({ base: base || '', wasmBinary }).then((mod) => {
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
      if (msg.cmd === 'load') this.ensureModule(msg.base, msg.wasmBinary);   // first load kicks it off
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
