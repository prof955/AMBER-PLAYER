// Loudness comparison: libgme stereo mix vs. our 8-channel sum, to calibrate mix.scale.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
const ROOT='/home/user/chiptune-console';
const RATE=48000;
const src=fs.readFileSync(path.join(ROOT,'wasm/gme.worklet.js'),'utf8');
const registry={}; const sent=[];
class AWP{constructor(){this.port={onmessage:null,postMessage:(m)=>sent.push(m),addEventListener(){},removeEventListener(){},start(){}}}}
const sb={console,WebAssembly,Promise,Uint8Array,Int8Array,Int16Array,Uint16Array,Int32Array,Uint32Array,Float32Array,Float64Array,ArrayBuffer,DataView,Math,JSON,TextDecoder,TextEncoder,Date,Error,TypeError,RangeError,performance,setTimeout,clearTimeout,queueMicrotask,atob,btoa,registerProcessor:(n,c)=>{registry[n]=c},AudioWorkletProcessor:AWP,AudioWorkletGlobalScope:class{},sampleRate:RATE,currentTime:0};
vm.createContext(sb); vm.runInContext(src,sb,{filename:'gme'});

async function run(multichannel, seconds=6){
  const proc=new registry['chiptune-gme']();
  const events=[];
  let seq=1; let resolveReady;
  const readyP=new Promise(r=>resolveReady=r);
  proc.port.postMessage=(m)=>{ if(m&&m.event){events.push(m); if(m.event==='ready')resolveReady(m);} };
  await readyP;
  const bytes=new Uint8Array(fs.readFileSync(path.join(ROOT,'tests/fixtures/libgme-test.nsf')));
  proc.port.onmessage({data:{id:seq++,cmd:'load',bytes,opts:{multichannel}}});
  await new Promise(r=>setTimeout(r,50));
  proc.port.onmessage({data:{id:seq++,cmd:'play',track:0,playMs:0,loop:'off',fadeMs:2000,master:1}});
  const L=new Float32Array(128),R=new Float32Array(128);
  let sumSq=0,n=0,peak=0;
  for(let q=0;q<seconds*RATE/128;q++){
    L.fill(0);R.fill(0);
    proc.process([],[[L,R]]);
    for(let i=0;i<128;i++){const l=L[i],r=R[i];sumSq+=l*l+r*r;n+=2;peak=Math.max(peak,Math.abs(l),Math.abs(r));}
  }
  return {rms:Math.sqrt(sumSq/n),peak};
}
const stereo=await run(false,6);
const multi=await run(true,6);
console.log('stereo      rms=%s peak=%s', stereo.rms.toFixed(5), stereo.peak.toFixed(4));
console.log('multichannel rms=%s peak=%s', multi.rms.toFixed(5), multi.peak.toFixed(4));
console.log('ratio rms=%s peak=%s', (stereo.rms/multi.rms).toFixed(3), (stereo.peak/multi.peak).toFixed(3));
console.log('suggested mix.scale =', (stereo.rms/multi.rms).toFixed(2));
