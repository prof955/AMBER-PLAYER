async function Module(moduleArg={}){var Module=moduleArg;var ENVIRONMENT_IS_AUDIO_WORKLET=!!globalThis.AudioWorkletGlobalScope;var programArgs=[];var thisProgram="./this.program";var scriptDirectory="";function locateFile(path){if(Module["locateFile"]){return Module["locateFile"](path,scriptDirectory)}return scriptDirectory+path}var readAsync,readBinary;{}var out=console.log.bind(console);var err=console.error.bind(console);var wasmBinary;var ABORT=false;class EmscriptenEH{}class EmscriptenSjLj extends EmscriptenEH{}var runtimeInitialized=false;function updateMemoryViews(){var b=wasmMemory.buffer;HEAP8=new Int8Array(b);Module["HEAP16"]=HEAP16=new Int16Array(b);Module["HEAPU8"]=HEAPU8=new Uint8Array(b);HEAPU32=new Uint32Array(b)}function preRun(){var preRun=Module["preRun"];if(preRun){if(typeof preRun=="function")preRun=[preRun];onPreRuns.push(...preRun)}callRuntimeCallbacks(onPreRuns)}function initRuntime(){runtimeInitialized=true;wasmExports["e"]()}function postRun(){var postRun=Module["postRun"];if(postRun){if(typeof postRun=="function")postRun=[postRun];onPostRuns.push(...postRun)}callRuntimeCallbacks(onPostRuns)}function abort(what){Module["onAbort"]?.(what);what=`Aborted(${what})`;err(what);ABORT=true;what+=". Build with -sASSERTIONS for more info.";var e=new WebAssembly.RuntimeError(what);throw e}var wasmBinaryFile;function findWasmBinary(){return locateFile("gme.wasm")}function getBinarySync(file){if(readBinary){return readBinary(file)}throw"both async and sync fetching of the wasm failed"}async function getWasmBinary(binaryFile){if(!wasmBinary){try{var response=await readAsync(binaryFile);return new Uint8Array(response)}catch{}}return getBinarySync(binaryFile)}async function instantiateArrayBuffer(binaryFile,imports){try{var binary=await getWasmBinary(binaryFile);var instance=await WebAssembly.instantiate(binary,imports);return instance}catch(reason){err(`failed to asynchronously prepare wasm: ${reason}`);abort(reason)}}async function instantiateAsync(binary,binaryFile,imports){if(!binary){try{var response=fetch(binaryFile,{credentials:"same-origin"});var instantiationResult=await WebAssembly.instantiateStreaming(response,imports);return instantiationResult}catch(reason){err(`wasm streaming compile failed: ${reason}`);err("falling back to ArrayBuffer instantiation")}}return instantiateArrayBuffer(binaryFile,imports)}function getWasmImports(){var imports={a:wasmImports};return imports}async function createWasm(){function receiveInstance(instance){wasmExports=instance.exports;assignWasmExports(wasmExports);updateMemoryViews();return wasmExports}function receiveInstantiationResult(result){return receiveInstance(result["instance"])}var info=getWasmImports();var instantiateWasm=Module["instantiateWasm"];if(instantiateWasm){return new Promise(resolve=>{instantiateWasm(info,inst=>resolve(receiveInstance(inst)))})}wasmBinaryFile??=findWasmBinary();var result=await instantiateAsync(wasmBinary,wasmBinaryFile,info);var exports=receiveInstantiationResult(result);return exports}class ExitStatus{name="ExitStatus";constructor(status){this.message=`Program terminated with exit(${status})`;this.status=status}}var callRuntimeCallbacks=callbacks=>{while(callbacks.length>0){callbacks.shift()(Module)}};var onPostRuns=[];var onPreRuns=[];var noExitRuntime=true;var HEAP8;var HEAPU32;class ExceptionInfo{constructor(excPtr){this.excPtr=excPtr;this.ptr=excPtr-24}set_type(type){HEAPU32[this.ptr+4>>2]=type}get_type(){return HEAPU32[this.ptr+4>>2]}set_destructor(destructor){HEAPU32[this.ptr+8>>2]=destructor}get_destructor(){return HEAPU32[this.ptr+8>>2]}set_caught(caught){caught=caught?1:0;HEAP8[this.ptr+12]=caught}get_caught(){return HEAP8[this.ptr+12]!=0}set_rethrown(rethrown){rethrown=rethrown?1:0;HEAP8[this.ptr+13]=rethrown}get_rethrown(){return HEAP8[this.ptr+13]!=0}init(type,destructor){this.set_adjusted_ptr(0);this.set_type(type);this.set_destructor(destructor)}set_adjusted_ptr(adjustedPtr){HEAPU32[this.ptr+16>>2]=adjustedPtr}get_adjusted_ptr(){return HEAPU32[this.ptr+16>>2]}}var uncaughtExceptionCount=0;var __Unwind_RaiseException=ex=>{abort()};var ___cxa_throw=(ptr,type,destructor)=>{var info=new ExceptionInfo(ptr);info.init(type,destructor);uncaughtExceptionCount++;__Unwind_RaiseException(ptr)};var __abort_js=()=>abort("");var abortOnCannotGrowMemory=requestedSize=>{abort("OOM")};var HEAPU8;var _emscripten_resize_heap=requestedSize=>{var oldSize=HEAPU8.length;requestedSize>>>=0;abortOnCannotGrowMemory(requestedSize)};var HEAP16;var UTF8Decoder=globalThis.TextDecoder&&new TextDecoder;var findStringEnd=(heapOrArray,idx,maxBytesToRead,ignoreNul)=>{var maxIdx=idx+maxBytesToRead;if(ignoreNul)return maxIdx;while(heapOrArray[idx]&&!(idx>=maxIdx))++idx;return idx};var UTF8ArrayToString=(heapOrArray,idx=0,maxBytesToRead,ignoreNul)=>{var endPtr=findStringEnd(heapOrArray,idx,maxBytesToRead,ignoreNul);if(endPtr-idx>16&&heapOrArray.buffer&&UTF8Decoder){return UTF8Decoder.decode(heapOrArray.subarray(idx,endPtr))}var str="";while(idx<endPtr){var u0=heapOrArray[idx++];if(!(u0&128)){str+=String.fromCharCode(u0);continue}var u1=heapOrArray[idx++]&63;if((u0&224)==192){str+=String.fromCharCode((u0&31)<<6|u1);continue}var u2=heapOrArray[idx++]&63;if((u0&240)==224){u0=(u0&15)<<12|u1<<6|u2}else{u0=(u0&7)<<18|u1<<12|u2<<6|heapOrArray[idx++]&63}if(u0<65536){str+=String.fromCharCode(u0)}else{var ch=u0-65536;str+=String.fromCharCode(55296|ch>>10,56320|ch&1023)}}return str};var UTF8ToString=(ptr,maxBytesToRead,ignoreNul)=>ptr?UTF8ArrayToString(HEAPU8,ptr,maxBytesToRead,ignoreNul):"";var stringToUTF8Array=(str,heap,outIdx,maxBytesToWrite)=>{if(!(maxBytesToWrite>0))return 0;var startIdx=outIdx;var endIdx=outIdx+maxBytesToWrite-1;for(var i=0;i<str.length;++i){var u=str.codePointAt(i);if(u<=127){if(outIdx>=endIdx)break;heap[outIdx++]=u}else if(u<=2047){if(outIdx+1>=endIdx)break;heap[outIdx++]=192|u>>6;heap[outIdx++]=128|u&63}else if(u<=65535){if(outIdx+2>=endIdx)break;heap[outIdx++]=224|u>>12;heap[outIdx++]=128|u>>6&63;heap[outIdx++]=128|u&63}else{if(outIdx+3>=endIdx)break;heap[outIdx++]=240|u>>18;heap[outIdx++]=128|u>>12&63;heap[outIdx++]=128|u>>6&63;heap[outIdx++]=128|u&63;i++}}heap[outIdx]=0;return outIdx-startIdx};var stringToUTF8=(str,outPtr,maxBytesToWrite)=>stringToUTF8Array(str,HEAPU8,outPtr,maxBytesToWrite);var lengthBytesUTF8=str=>{var len=0;for(var i=0;i<str.length;++i){var c=str.charCodeAt(i);if(c<=127){len++}else if(c<=2047){len+=2}else if(c>=55296&&c<=57343){len+=4;++i}else{len+=3}}return len};{if(Module["noExitRuntime"])noExitRuntime=Module["noExitRuntime"];if(Module["print"])out=Module["print"];if(Module["printErr"])err=Module["printErr"];if(Module["arguments"])programArgs=Module["arguments"];if(Module["thisProgram"])thisProgram=Module["thisProgram"];var preInit=Module["preInit"];if(preInit){if(typeof preInit=="function")Module["preInit"]=preInit=[preInit];while(preInit.length>0){preInit.shift()()}}}Module["UTF8ToString"]=UTF8ToString;Module["stringToUTF8"]=stringToUTF8;Module["lengthBytesUTF8"]=lengthBytesUTF8;var _gme2_version,_gme2_warning,_free,_malloc,_gme2_last_error,_gme2_out_channels,_gme2_open,_gme2_close,_gme2_track_count,_gme2_system,_gme2_extension,_gme2_multitrack,_gme2_is_multichannel,_gme2_voice_count,_gme2_voice_name,_gme2_track_info,_gme2_identify,_gme2_start_track,_gme2_seek,_gme2_tell,_gme2_track_ended,_gme2_set_tempo,_gme2_mute_voice,_gme2_mute_voices,_gme2_set_equalizer,_gme2_set_stereo_depth,_gme2_enable_accuracy,_gme2_last_peak,_gme2_buf,_gme2_play,memory,__indirect_function_table,wasmMemory;function assignWasmExports(wasmExports){_gme2_version=Module["_gme2_version"]=wasmExports["f"];_gme2_warning=Module["_gme2_warning"]=wasmExports["g"];_free=Module["_free"]=wasmExports["h"];_malloc=Module["_malloc"]=wasmExports["i"];_gme2_last_error=Module["_gme2_last_error"]=wasmExports["j"];_gme2_out_channels=Module["_gme2_out_channels"]=wasmExports["k"];_gme2_open=Module["_gme2_open"]=wasmExports["l"];_gme2_close=Module["_gme2_close"]=wasmExports["m"];_gme2_track_count=Module["_gme2_track_count"]=wasmExports["n"];_gme2_system=Module["_gme2_system"]=wasmExports["o"];_gme2_extension=Module["_gme2_extension"]=wasmExports["p"];_gme2_multitrack=Module["_gme2_multitrack"]=wasmExports["q"];_gme2_is_multichannel=Module["_gme2_is_multichannel"]=wasmExports["r"];_gme2_voice_count=Module["_gme2_voice_count"]=wasmExports["s"];_gme2_voice_name=Module["_gme2_voice_name"]=wasmExports["t"];_gme2_track_info=Module["_gme2_track_info"]=wasmExports["u"];_gme2_identify=Module["_gme2_identify"]=wasmExports["v"];_gme2_start_track=Module["_gme2_start_track"]=wasmExports["w"];_gme2_seek=Module["_gme2_seek"]=wasmExports["x"];_gme2_tell=Module["_gme2_tell"]=wasmExports["y"];_gme2_track_ended=Module["_gme2_track_ended"]=wasmExports["z"];_gme2_set_tempo=Module["_gme2_set_tempo"]=wasmExports["A"];_gme2_mute_voice=Module["_gme2_mute_voice"]=wasmExports["B"];_gme2_mute_voices=Module["_gme2_mute_voices"]=wasmExports["C"];_gme2_set_equalizer=Module["_gme2_set_equalizer"]=wasmExports["D"];_gme2_set_stereo_depth=Module["_gme2_set_stereo_depth"]=wasmExports["E"];_gme2_enable_accuracy=Module["_gme2_enable_accuracy"]=wasmExports["F"];_gme2_last_peak=Module["_gme2_last_peak"]=wasmExports["G"];_gme2_buf=Module["_gme2_buf"]=wasmExports["H"];_gme2_play=Module["_gme2_play"]=wasmExports["I"];memory=wasmMemory=wasmExports["d"];__indirect_function_table=wasmExports["__indirect_function_table"]}var wasmImports={a:___cxa_throw,c:__abort_js,b:_emscripten_resize_heap};async function run(){preRun();var setStatus=Module["setStatus"];if(setStatus){setStatus("Running...");await new Promise(resolve=>setTimeout(resolve,1));setTimeout(setStatus,1,"")}if(ABORT)return;initRuntime();Module["onRuntimeInitialized"]?.();postRun()}var wasmExports;wasmExports=await createWasm();await run();
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
      // the .wasm sits next to the worklet script; the main thread tells us
      // where that is (worklet scopes have no document to resolve against)
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
// ---------------------------------------------------------------------------
//  compat.tail.js — appended after the Emscripten core + the engine adapter to
//  expose the very same engine to the main thread as an ES module.
//
//  Two jobs:
//    1. js/compat.js imports this file when AudioWorklet is unavailable
//       (sandboxed iframes, old browsers) — ES module + dynamic import means
//       no eval(), so it also works under a strict Content-Security-Policy.
//    2. it is the engine behind the offline ".wav" export.
//
//  The AudioWorklet globals the adapter references are created here if the host
//  does not provide them, so the adapter code stays byte-identical to the
//  worklet build.
// ---------------------------------------------------------------------------
if (typeof globalThis.AudioWorkletGlobalScope === 'undefined') globalThis.AudioWorkletGlobalScope = class {};
if (typeof globalThis.AudioWorkletProcessor === 'undefined') {
  globalThis.AudioWorkletProcessor = class {
    constructor() {
      this.port = { postMessage() {}, onmessage: null, addEventListener() {}, removeEventListener() {}, start() {} };
    }
  };
}
if (typeof globalThis.registerProcessor === 'undefined') globalThis.registerProcessor = () => {};
if (typeof globalThis.sampleRate === 'undefined') globalThis.sampleRate = 48000;
if (typeof globalThis.currentTime === 'undefined') globalThis.currentTime = 0;

export { ENGINE };
export function createModule(opts) { return Module(opts); }
