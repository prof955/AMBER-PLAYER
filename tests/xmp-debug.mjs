import fs from 'node:fs'; import vm from 'node:vm';
const src = fs.readFileSync('/home/user/chiptune-console/wasm/xmp.worklet.js','utf8');
class AWP { constructor(){ this.port={onmessage:null,postMessage:()=>{},addEventListener:()=>{},removeEventListener:()=>{},start:()=>{}} } }
const reg={};
const sb={console,WebAssembly,Promise,Uint8Array,Int8Array,Int16Array,Uint16Array,Int32Array,Uint32Array,Float32Array,Float64Array,ArrayBuffer,DataView,Math,JSON,TextDecoder,TextEncoder,Date,Error,TypeError,RangeError,performance,setTimeout,clearTimeout,queueMicrotask,atob,btoa,registerProcessor:(n,c)=>{reg[n]=c},AudioWorkletProcessor:AWP,AudioWorkletGlobalScope:class{},sampleRate:48000,currentTime:0};
vm.createContext(sb); vm.runInContext(src,sb,{filename:'xmp'});
const m = await sb.Module({noInitialRun:true,print:()=>{},printErr:(...a)=>console.log('[err]',...a)});
const file = process.argv[2] || '/home/user/chiptune-console/samples/demo.mod';
const bytes = new Uint8Array(fs.readFileSync(file));
const ptr = m._malloc(bytes.length); m.HEAPU8.set(bytes, ptr);
const rc = m._xmp2_open(ptr, bytes.length, 48000);
m._free(ptr);   // simulate the adapter: free the JS-side copy right after open
console.log('open rc:', rc, m.UTF8ToString(m._xmp2_last_error()));
console.log('module:', m.UTF8ToString(m._xmp2_module_info()).slice(0,90));
console.log('formats:', m.UTF8ToString(m._xmp2_format_list()).slice(0,60), '...');
console.log('restart rc:', m._xmp2_restart());
const buf = m._xmp2_buf();
for (let i=0;i<8;i++){
  const ended = m._xmp2_play(Number(process.argv[3]||4800));
  const view = new Int16Array(m.HEAPU8.buffer, buf, Number(process.argv[3]||4800)*2);
  let peak=0, nz=0; for(const v of view){ if(v) nz++; peak=Math.max(peak,Math.abs(v)); }
  const fi = JSON.parse(m.UTF8ToString(m._xmp2_frame_info()));
  console.log(`block ${i}: ended=${ended} peak=${peak} nonzero=${nz} pos=${fi.pos} row=${fi.row} vol=${fi.volume} chans=${fi.channels.slice(0,4).map(c=>c.join('/')).join(' ')}`);
}
