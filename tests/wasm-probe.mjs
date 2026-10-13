import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
page.on('console', (m) => console.log('[page]', m.type(), m.text().slice(0, 300)));
page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 300)));
await page.goto('http://127.0.0.1:8088/tests/worklet-probe.html');   // simple blank-ish page
const r = await page.evaluate(async () => {
  const steps = [];
  window.AudioWorkletProcessor = class { constructor() { this.port = { postMessage() {}, onmessage: null }; } };
  window.AudioWorkletGlobalScope = class {};
  window.registerProcessor = () => {};
  window.sampleRate = 48000;   // provided by AudioWorkletGlobalScope, not by a page
  steps.push('shimmed');
  const s = document.createElement('script');
  s.src = '/wasm/gme.worklet.js';
  await new Promise((res, rej) => { s.onload = res; s.onerror = () => rej(new Error('script load fail')); document.head.append(s); });
  steps.push('script loaded, Module=' + typeof window.Module + ' ENGINE=' + (typeof ENGINE));
  const mod = await window.Module({ locateFile: (p) => '/wasm/' + p });
  steps.push('module ready, HEAPU8=' + mod.HEAPU8.length);
  const bytes = new Uint8Array(await (await fetch('/samples/demo.vgm')).arrayBuffer());
  steps.push('file ' + bytes.length + ' bytes');
  const loaded = ENGINE.load(mod, bytes, { multichannel: true });
  steps.push('load ok: ' + loaded.meta.system + ' / ' + loaded.meta.title + ' mix=' + JSON.stringify(loaded.mix));
  ENGINE.start(mod, 0, {});
  const L = new Float32Array(1024), R = new Float32Array(1024);
  const mix = { scale: (loaded.mix && loaded.mix.scale) || 1, gains: new Float32Array(16).fill(1), pans: new Float32Array(16) };
  let peak = 0, nz = 0;
  for (let i = 0; i < 12; i++) { ENGINE.render(mod, 1024, L, R, mix); for (const v of L) { if (Math.abs(v) > peak) peak = Math.abs(v); if (v) nz++; } }
  steps.push('RENDERED peak=' + peak.toFixed(4) + ' nonzero=' + nz);
  return steps.join('\n');
}).catch((e) => 'EVAL FAILED: ' + e.message.split('\n')[0]);
console.log(r);
await browser.close();
