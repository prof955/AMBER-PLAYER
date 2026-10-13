import fs from 'node:fs'; import vm from 'node:vm';
const src = fs.readFileSync('/home/user/chiptune-console/wasm/gme.worklet.js','utf8');
class AWP { constructor(){ this.port={onmessage:null,postMessage:()=>{},addEventListener:()=>{},removeEventListener:()=>{},start:()=>{}} } }
const reg={};
const sb={console,WebAssembly,Promise,Uint8Array,Int8Array,Int16Array,Uint16Array,Int32Array,Uint32Array,Float32Array,Float64Array,ArrayBuffer,DataView,Math,JSON,TextDecoder,TextEncoder,Date,Error,TypeError,RangeError,performance,setTimeout,clearTimeout,queueMicrotask,atob,btoa,registerProcessor:(n,c)=>{reg[n]=c},AudioWorkletProcessor:AWP,AudioWorkletGlobalScope:class{},sampleRate:48000,currentTime:0};
vm.createContext(sb); vm.runInContext(src,sb,{filename:'gme'});
const m = await sb.Module({noInitialRun:true,print:()=>{},printErr:(...a)=>console.log('[err]',...a)});
const bytes = new Uint8Array(fs.readFileSync('/home/user/chiptune-console/samples/demo.vgm'));
const ptr = m._malloc(bytes.length); m.HEAPU8.set(bytes,ptr);
console.log('open:', m.UTF8ToString(m._gme2_open(ptr,bytes.length,48000,0)) || '(ok)');
console.log('system:', m.UTF8ToString(m._gme2_system()), '| voices:', m._gme2_voice_count(), '| multich:', m._gme2_is_multichannel());
console.log('tracks:', m._gme2_track_count(), 'warn:', JSON.stringify(m.UTF8ToString(m._gme2_warning())));
console.log('start_track rc:', m._gme2_start_track(0));
console.log('info:', m.UTF8ToString(m._gme2_track_info(0)));
const buf = m._gme2_buf();
for (let i=0;i<6;i++){
  const ended = m._gme2_play(1024);
  const n = m._gme2_out_channels()*1024;
  const view = new Int16Array(m.HEAPU8.buffer, buf, n);
  let peak=0; for(const v of view) peak=Math.max(peak,Math.abs(v));
  console.log(`block ${i}: ended=${ended} chans=${m._gme2_out_channels()} peak=${peak} tell=${m._gme2_tell()} err="${m.UTF8ToString(m._gme2_last_error())}"`);
}
