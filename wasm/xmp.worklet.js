async function Module(moduleArg={}){var Module=moduleArg;var ENVIRONMENT_IS_AUDIO_WORKLET=!!globalThis.AudioWorkletGlobalScope;var programArgs=[];var thisProgram="./this.program";var scriptDirectory="";function locateFile(path){if(Module["locateFile"]){return Module["locateFile"](path,scriptDirectory)}return scriptDirectory+path}var readAsync,readBinary;{}var out=console.log.bind(console);var err=console.error.bind(console);var wasmBinary=Module["wasmBinary"];var ABORT=false;class EmscriptenEH{}class EmscriptenSjLj extends EmscriptenEH{}var runtimeInitialized=false;function updateMemoryViews(){var b=wasmMemory.buffer;Module["HEAP16"]=HEAP16=new Int16Array(b);Module["HEAPU8"]=HEAPU8=new Uint8Array(b);HEAPU32=new Uint32Array(b);HEAP64=new BigInt64Array(b)}function preRun(){var preRun=Module["preRun"];if(preRun){if(typeof preRun=="function")preRun=[preRun];onPreRuns.push(...preRun)}callRuntimeCallbacks(onPreRuns)}function initRuntime(){runtimeInitialized=true;wasmExports["q"]()}function postRun(){var postRun=Module["postRun"];if(postRun){if(typeof postRun=="function")postRun=[postRun];onPostRuns.push(...postRun)}callRuntimeCallbacks(onPostRuns)}function abort(what){Module["onAbort"]?.(what);what=`Aborted(${what})`;err(what);ABORT=true;what+=". Build with -sASSERTIONS for more info.";var e=new WebAssembly.RuntimeError(what);throw e}var wasmBinaryFile;function findWasmBinary(){return locateFile("xmp.wasm")}function getBinarySync(file){if(wasmBinary)return wasmBinary;if(readBinary){return readBinary(file)}throw"both async and sync fetching of the wasm failed"}async function getWasmBinary(binaryFile){if(!wasmBinary){try{var response=await readAsync(binaryFile);return new Uint8Array(response)}catch{}}return getBinarySync(binaryFile)}async function instantiateArrayBuffer(binaryFile,imports){try{var binary=await getWasmBinary(binaryFile);var instance=await WebAssembly.instantiate(binary,imports);return instance}catch(reason){err(`failed to asynchronously prepare wasm: ${reason}`);abort(reason)}}async function instantiateAsync(binary,binaryFile,imports){if(!binary){try{var response=fetch(binaryFile,{credentials:"same-origin"});var instantiationResult=await WebAssembly.instantiateStreaming(response,imports);return instantiationResult}catch(reason){err(`wasm streaming compile failed: ${reason}`);err("falling back to ArrayBuffer instantiation")}}return instantiateArrayBuffer(binaryFile,imports)}function getWasmImports(){var imports={a:wasmImports};return imports}async function createWasm(){function receiveInstance(instance){wasmExports=instance.exports;assignWasmExports(wasmExports);updateMemoryViews();return wasmExports}function receiveInstantiationResult(result){return receiveInstance(result["instance"])}var info=getWasmImports();var instantiateWasm=Module["instantiateWasm"];if(instantiateWasm){return new Promise(resolve=>{instantiateWasm(info,inst=>resolve(receiveInstance(inst)))})}wasmBinaryFile??=findWasmBinary();var result=await instantiateAsync(wasmBinary,wasmBinaryFile,info);var exports=receiveInstantiationResult(result);return exports}class ExitStatus{name="ExitStatus";constructor(status){this.message=`Program terminated with exit(${status})`;this.status=status}}var callRuntimeCallbacks=callbacks=>{while(callbacks.length>0){callbacks.shift()(Module)}};var onPostRuns=[];var onPreRuns=[];var noExitRuntime=true;var UTF8Decoder=globalThis.TextDecoder&&new TextDecoder;var findStringEnd=(heapOrArray,idx,maxBytesToRead,ignoreNul)=>{var maxIdx=idx+maxBytesToRead;if(ignoreNul)return maxIdx;while(heapOrArray[idx]&&!(idx>=maxIdx))++idx;return idx};var UTF8ArrayToString=(heapOrArray,idx=0,maxBytesToRead,ignoreNul)=>{var endPtr=findStringEnd(heapOrArray,idx,maxBytesToRead,ignoreNul);if(endPtr-idx>16&&heapOrArray.buffer&&UTF8Decoder){return UTF8Decoder.decode(heapOrArray.subarray(idx,endPtr))}var str="";while(idx<endPtr){var u0=heapOrArray[idx++];if(!(u0&128)){str+=String.fromCharCode(u0);continue}var u1=heapOrArray[idx++]&63;if((u0&224)==192){str+=String.fromCharCode((u0&31)<<6|u1);continue}var u2=heapOrArray[idx++]&63;if((u0&240)==224){u0=(u0&15)<<12|u1<<6|u2}else{u0=(u0&7)<<18|u1<<12|u2<<6|heapOrArray[idx++]&63}if(u0<65536){str+=String.fromCharCode(u0)}else{var ch=u0-65536;str+=String.fromCharCode(55296|ch>>10,56320|ch&1023)}}return str};var HEAPU8;var UTF8ToString=(ptr,maxBytesToRead,ignoreNul)=>ptr?UTF8ArrayToString(HEAPU8,ptr,maxBytesToRead,ignoreNul):"";var SYSCALLS={varargs:undefined,getStr(ptr){var ret=UTF8ToString(ptr);return ret}};function ___syscall_fcntl64(fd,cmd,varargs){SYSCALLS.varargs=varargs;return 0}var ___syscall_getdents64=(fd,dirp,count)=>{};function ___syscall_ioctl(fd,op,varargs){SYSCALLS.varargs=varargs;return 0}function ___syscall_openat(dirfd,path,flags,varargs){SYSCALLS.varargs=varargs}var ___syscall_umask=mask=>{var old=SYSCALLS.currentUmask;SYSCALLS.currentUmask=mask;return old};var ___syscall_unlinkat=(dirfd,path,flags)=>{};var _emscripten_get_now=()=>performance.now();var _emscripten_date_now=()=>Date.now();var nowIsMonotonic=1;var checkWasiClock=clock_id=>clock_id>=0&&clock_id<=3;var INT53_MAX=9007199254740992;var INT53_MIN=-9007199254740992;var bigintToI53Checked=num=>num<INT53_MIN||num>INT53_MAX?NaN:Number(num);var HEAP64;function _clock_time_get(clk_id,ignored_precision,ptime){ignored_precision=bigintToI53Checked(ignored_precision);if(!checkWasiClock(clk_id)){return 28}var now;if(clk_id===0){now=_emscripten_date_now()}else if(nowIsMonotonic){now=_emscripten_get_now()}else{return 52}var nsec=Math.round(now*1e6);HEAP64[ptime>>3]=BigInt(nsec);return 0}var abortOnCannotGrowMemory=requestedSize=>{abort("OOM")};var _emscripten_resize_heap=requestedSize=>{var oldSize=HEAPU8.length;requestedSize>>>=0;abortOnCannotGrowMemory(requestedSize)};var ENV={};var getExecutableName=()=>thisProgram;var getEnvStrings=()=>{if(!getEnvStrings.strings){var lang=(globalThis.navigator?.language??"C").replace("-","_")+".UTF-8";var env={USER:"web_user",LOGNAME:"web_user",PATH:"/",PWD:"/",HOME:"/home/web_user",LANG:lang,_:getExecutableName()};for(var x in ENV){if(ENV[x]===undefined)delete env[x];else env[x]=ENV[x]}var strings=[];for(var x in env){strings.push(`${x}=${env[x]}`)}getEnvStrings.strings=strings}return getEnvStrings.strings};var stringToUTF8Array=(str,heap,outIdx,maxBytesToWrite)=>{if(!(maxBytesToWrite>0))return 0;var startIdx=outIdx;var endIdx=outIdx+maxBytesToWrite-1;for(var i=0;i<str.length;++i){var u=str.codePointAt(i);if(u<=127){if(outIdx>=endIdx)break;heap[outIdx++]=u}else if(u<=2047){if(outIdx+1>=endIdx)break;heap[outIdx++]=192|u>>6;heap[outIdx++]=128|u&63}else if(u<=65535){if(outIdx+2>=endIdx)break;heap[outIdx++]=224|u>>12;heap[outIdx++]=128|u>>6&63;heap[outIdx++]=128|u&63}else{if(outIdx+3>=endIdx)break;heap[outIdx++]=240|u>>18;heap[outIdx++]=128|u>>12&63;heap[outIdx++]=128|u>>6&63;heap[outIdx++]=128|u&63;i++}}heap[outIdx]=0;return outIdx-startIdx};var stringToUTF8=(str,outPtr,maxBytesToWrite)=>stringToUTF8Array(str,HEAPU8,outPtr,maxBytesToWrite);var HEAPU32;var _environ_get=(__environ,environ_buf)=>{var bufSize=0;var envp=0;for(var string of getEnvStrings()){var ptr=environ_buf+bufSize;HEAPU32[__environ+envp>>2]=ptr;bufSize+=stringToUTF8(string,ptr,Infinity)+1;envp+=4}return 0};var lengthBytesUTF8=str=>{var len=0;for(var i=0;i<str.length;++i){var c=str.charCodeAt(i);if(c<=127){len++}else if(c<=2047){len+=2}else if(c>=55296&&c<=57343){len+=4;++i}else{len+=3}}return len};var _environ_sizes_get=(penviron_count,penviron_buf_size)=>{var strings=getEnvStrings();HEAPU32[penviron_count>>2]=strings.length;var bufSize=0;for(var string of strings){bufSize+=lengthBytesUTF8(string)+1}HEAPU32[penviron_buf_size>>2]=bufSize;return 0};var _fd_close=fd=>52;var _fd_read=(fd,iov,iovcnt,pnum)=>52;function _fd_seek(fd,offset,whence,newOffset){offset=bigintToI53Checked(offset);return 70}var printCharBuffers=[null,[],[]];var printChar=(stream,curr)=>{var buffer=printCharBuffers[stream];if(!curr||curr===10){(stream===1?out:err)(UTF8ArrayToString(buffer));buffer.length=0}else{buffer.push(curr)}};var _fd_write=(fd,iov,iovcnt,pnum)=>{var num=0;for(var i=0;i<iovcnt;i++){var ptr=HEAPU32[iov>>2];var len=HEAPU32[iov+4>>2];iov+=8;for(var j=0;j<len;j++){printChar(fd,HEAPU8[ptr+j])}num+=len}HEAPU32[pnum>>2]=num;return 0};var HEAP16;{if(Module["noExitRuntime"])noExitRuntime=Module["noExitRuntime"];if(Module["print"])out=Module["print"];if(Module["printErr"])err=Module["printErr"];if(Module["arguments"])programArgs=Module["arguments"];if(Module["thisProgram"])thisProgram=Module["thisProgram"];var preInit=Module["preInit"];if(preInit){if(typeof preInit=="function")Module["preInit"]=preInit=[preInit];while(preInit.length>0){preInit.shift()()}}}Module["UTF8ToString"]=UTF8ToString;Module["stringToUTF8"]=stringToUTF8;Module["lengthBytesUTF8"]=lengthBytesUTF8;var _xmp2_version,_xmp2_last_error,_xmp2_open,_free,_malloc,_xmp2_close,_xmp2_buf,_xmp2_play,_xmp2_last_peak,_xmp2_module_info,_xmp2_frame_info,_xmp2_channel_count,_xmp2_seek,_xmp2_set_tempo,_xmp2_set_volume,_xmp2_mute,_xmp2_restart,_xmp2_format_list,memory,__indirect_function_table,wasmMemory;function assignWasmExports(wasmExports){_xmp2_version=Module["_xmp2_version"]=wasmExports["r"];_xmp2_last_error=Module["_xmp2_last_error"]=wasmExports["s"];_xmp2_open=Module["_xmp2_open"]=wasmExports["t"];_free=Module["_free"]=wasmExports["u"];_malloc=Module["_malloc"]=wasmExports["v"];_xmp2_close=Module["_xmp2_close"]=wasmExports["w"];_xmp2_buf=Module["_xmp2_buf"]=wasmExports["x"];_xmp2_play=Module["_xmp2_play"]=wasmExports["y"];_xmp2_last_peak=Module["_xmp2_last_peak"]=wasmExports["z"];_xmp2_module_info=Module["_xmp2_module_info"]=wasmExports["A"];_xmp2_frame_info=Module["_xmp2_frame_info"]=wasmExports["B"];_xmp2_channel_count=Module["_xmp2_channel_count"]=wasmExports["C"];_xmp2_seek=Module["_xmp2_seek"]=wasmExports["D"];_xmp2_set_tempo=Module["_xmp2_set_tempo"]=wasmExports["E"];_xmp2_set_volume=Module["_xmp2_set_volume"]=wasmExports["F"];_xmp2_mute=Module["_xmp2_mute"]=wasmExports["G"];_xmp2_restart=Module["_xmp2_restart"]=wasmExports["H"];_xmp2_format_list=Module["_xmp2_format_list"]=wasmExports["I"];memory=wasmMemory=wasmExports["p"];__indirect_function_table=wasmExports["__indirect_function_table"]}var wasmImports={d:___syscall_fcntl64,m:___syscall_getdents64,o:___syscall_ioctl,b:___syscall_openat,l:___syscall_umask,k:___syscall_unlinkat,n:_clock_time_get,h:_emscripten_date_now,j:_emscripten_resize_heap,f:_environ_get,g:_environ_sizes_get,a:_fd_close,i:_fd_read,e:_fd_seek,c:_fd_write};async function run(){preRun();var setStatus=Module["setStatus"];if(setStatus){setStatus("Running...");await new Promise(resolve=>setTimeout(resolve,1));setTimeout(setStatus,1,"")}if(ABORT)return;initRuntime();Module["onRuntimeInitialized"]?.();postRun()}var wasmExports;wasmExports=await createWasm();await run();
;return Module}if(typeof exports==="object"&&typeof module==="object"){module.exports=Module;module.exports.default=Module}else if(typeof define==="function"&&define["amd"])define([],()=>Module);
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
      wasmBinary: opts && opts.wasmBinary,
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
