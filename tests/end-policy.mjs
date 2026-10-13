// tests/end-policy.mjs — the contract between the processor and the queue:
//   loop 'off'      -> track ends (reason 'length'/'end') and audio stops
//   loop 'one'      -> processor restarts the subtune in place and keeps going
//   loop 'infinite' -> playMs is ignored, audio never fades out
//   seek            -> playback continues from the requested position
// Run: node tests/end-policy.mjs
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RATE = 48000;
const QUANTUM = 128;

function boot(file) {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const registry = {};
  class AudioWorkletProcessor {
    constructor() { this.port = { onmessage: null, postMessage: () => {}, addEventListener: () => {}, removeEventListener: () => {}, start: () => {} }; }
  }
  const sandbox = {
    console, WebAssembly, Promise, Uint8Array, Int8Array, Int16Array, Uint16Array, Int32Array, Uint32Array,
    Float32Array, Float64Array, ArrayBuffer, SharedArrayBuffer, DataView, Math, JSON, TextDecoder, TextEncoder,
    Date, Error, TypeError, RangeError, performance, setTimeout, clearTimeout, queueMicrotask, atob, btoa,
    AudioWorkletProcessor, AudioWorkletGlobalScope: class {}, Response, Blob, AbortController, Headers,
    registerProcessor: (n, c) => { registry[n] = c; },
    fetch: async (url) => {
      const name = String(url).split('/').pop().split('?')[0];
      return new Response(fs.readFileSync(path.join(ROOT, 'wasm', name)),
        { status: 200, headers: { 'content-type': 'application/wasm' } });
    },
    sampleRate: RATE, currentTime: 0
  };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: file });
  return { registry, sandbox };
}

function client(proc) {
  const events = [];
  let seq = 1;
  const pending = new Map();
  proc.port.postMessage = (m) => {
    if (m && m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id);
      pending.delete(m.id);
      m.ok ? res(m) : rej(new Error(m.error || 'failed'));
    } else if (m && m.event) events.push({ ...m, at: Date.now() });
  };
  return {
    events,
    call(cmd, extra = {}) {
      const id = seq++;
      return new Promise((res, rej) => {
        pending.set(id, { res, rej });
        proc.port.onmessage({ data: { id, cmd, ...extra } });
        setTimeout(() => { if (pending.has(id)) { pending.delete(id); rej(new Error(cmd + ' timed out')); } }, 30000);
      });
    }
  };
}

/** render `seconds` of audio, recording rms per 0.25 s window */
function play(proc, seconds) {
  const L = new Float32Array(QUANTUM), R = new Float32Array(QUANTUM);
  const out = [[L, R]];
  const windows = [];
  const perWindow = Math.round(0.25 * RATE / QUANTUM);
  let sum = 0, n = 0;
  for (let q = 0; q < Math.round(seconds * RATE / QUANTUM); q++) {
    L.fill(0); R.fill(0);
    proc.process([], out);
    for (let i = 0; i < QUANTUM; i++) { sum += L[i] * L[i] + R[i] * R[i]; n += 2; }
    if ((q + 1) % perWindow === 0) { windows.push(Number(Math.sqrt(sum / n).toFixed(5))); sum = 0; n = 0; }
  }
  return windows;
}

const results = [];
function check(name, ok, detail) {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
}

// ── 1. fixed play length + fade: must end with reason 'length' ────────────
{
  const { registry } = boot('wasm/gme.worklet.js');
  const proc = new registry['chiptune-gme']();
  const c = client(proc);
  const bytes = new Uint8Array(fs.readFileSync(path.join(ROOT, 'samples/demo.vgm')));
  await c.call('load', { bytes, opts: { multichannel: true }, base: 'http://x/wasm/' });
  await c.call('play', { track: 0, playMs: 400, loop: 'off', fadeMs: 200, master: 1 });
  const windows = play(proc, 1.6);
  const ended = c.events.filter((e) => e.event === 'trackended');
  check('play length ends the track', ended.length >= 1 && ended[0].reason === 'length',
    `reason=${ended[0] && ended[0].reason} rms=${windows.join(',')}`);
  check('audio stops after the fade', windows[windows.length - 1] < 0.001, `last rms=${windows[windows.length - 1]}`);
  check('audio was audible before the fade', windows[0] > 0.02, `first rms=${windows[0]}`);
}

// ── 2. repeat one: restarts in place, audio keeps flowing ────────────────
{
  const { registry } = boot('wasm/gme.worklet.js');
  const proc = new registry['chiptune-gme']();
  const c = client(proc);
  const bytes = new Uint8Array(fs.readFileSync(path.join(ROOT, 'samples/demo.vgm')));
  await c.call('load', { bytes, opts: { multichannel: true }, base: 'http://x/wasm/' });
  await c.call('play', { track: 0, playMs: 400, loop: 'one', fadeMs: 200, master: 1 });
  const windows = play(proc, 1.8);
  const loops = c.events.filter((e) => e.event === 'trackended' && e.reason === 'loop');
  check('repeat one restarts in place', loops.length >= 1, `loop events=${loops.length}`);
  const tail = windows.slice(-3);
  check('audio never stops in repeat one', tail.every((v) => v > 0.02), `tail rms=${tail.join(',')}`);
}

// ── 3. infinite loop: playMs ignored, no fade, no end ────────────────────
{
  const { registry } = boot('wasm/xmp.worklet.js');
  const proc = new registry['chiptune-xmp']();
  const c = client(proc);
  const bytes = new Uint8Array(fs.readFileSync(path.join(ROOT, 'samples/demo.mod')));
  await c.call('load', { bytes, opts: { multichannel: true }, base: 'http://x/wasm/' });
  await c.call('play', { track: 0, playMs: 300, loop: 'infinite', fadeMs: 500, master: 1 });
  const windows = play(proc, 2.2);
  const ends = c.events.filter((e) => e.event === 'trackended');
  check('infinite loop never ends', ends.length === 0, `events=${ends.length}`);
  const tail = windows.slice(-3);
  check('infinite loop keeps playing past playMs', tail.every((v) => v > 0.01), `tail rms=${tail.join(',')}`);
}

// ── 4. seek: position restarts from the requested spot ───────────────────
{
  const { registry } = boot('wasm/xmp.worklet.js');
  const proc = new registry['chiptune-xmp']();
  const c = client(proc);
  const bytes = new Uint8Array(fs.readFileSync(path.join(ROOT, 'samples/demo.mod')));
  await c.call('load', { bytes, opts: { multichannel: true }, base: 'http://x/wasm/' });
  await c.call('play', { track: 0, playMs: 0, loop: 'off', fadeMs: 0, master: 1 });
  play(proc, 0.5);
  await c.call('seek', { ms: 8000 });
  const windows = play(proc, 0.6);
  const status = c.events.filter((e) => e.event === 'status').pop() || {};
  check('after seek the clock is at the new position', Math.abs((status.posMs || 0) - 8000) < 1500,
    `posMs=${status.posMs}`);
  check('audio continues after seek', windows.some((v) => v > 0.01), `rms=${windows.join(',')}`);
}

console.log(`\n${results.filter(Boolean).length}/${results.length} end-policy checks passed`);
process.exit(results.every(Boolean) ? 0 : 1);
