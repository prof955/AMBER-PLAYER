// tests/node-engine-test.mjs — runs the *built* AudioWorklet bundles inside a
// Node VM with minimal AudioWorkletGlobalScope stubs, then renders audio and
// measures it.  Verifies the wasm engines + mixer without a browser.
//
//   node tests/node-engine-test.mjs
//
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RATE = 48000;

function loadProcessor(file) {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const registry = {};
  const sent = [];

  class AudioWorkletProcessor {
    constructor() {
      this.port = {
        onmessage: null,
        postMessage: (m) => sent.push(m),
        addEventListener: () => {},
        removeEventListener: () => {},
        start: () => {}
      };
    }
  }
  const sandbox = {
    console,
    WebAssembly,
    Promise,
    Uint8Array, Int8Array, Int16Array, Uint16Array, Int32Array, Uint32Array,
    Float32Array, Float64Array, ArrayBuffer, SharedArrayBuffer, DataView, Math, JSON,
    TextDecoder, TextEncoder, Date, Error, TypeError, RangeError, performance,
    setTimeout, clearTimeout, queueMicrotask, atob, btoa,
    AudioWorkletProcessor, AudioWorkletGlobalScope: class {}, registerProcessor,
    sampleRate: RATE, currentTime: 0,
    Response, Blob, AbortController, Headers,
    // the engine loads its .wasm through fetch(); serve it from the repo so the
    // exact browser code path is exercised here too
    fetch: async (url) => {
      const name = String(url).split('/').pop().split('?')[0];
      const p = path.join(ROOT, 'wasm', name);
      const buf = fs.readFileSync(p);
      return new Response(buf, { status: 200, headers: { 'content-type': 'application/wasm' } });
    },
    TextDecoderStream: globalThis.TextDecoderStream
  };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: file });
  function registerProcessor(name, cls) { registry[name] = cls; }
  sandbox.registerProcessor = registerProcessor;
  return { registry, sent, sandbox };
}

function makeClient(proc, sent) {
  let seq = 1;
  const pending = new Map();
  const events = [];
  const realPost = proc.port.postMessage;
  proc.port.postMessage = (m) => {
    sent.push(m);
    if (m && m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id);
      pending.delete(m.id);
      m.ok ? res(m) : rej(new Error(m.error || 'command failed'));
    } else if (m && m.event) events.push(m);
  };
  return {
    events,
    call(cmd, extra = {}, timeoutMs = 60000) {
      const id = seq++;
      return new Promise((res, rej) => {
        pending.set(id, { res, rej });
        proc.port.onmessage({ data: { id, cmd, ...extra } });
        setTimeout(() => { if (pending.has(id)) { pending.delete(id); rej(new Error(cmd + ' timed out')); } }, timeoutMs);
      });
    },
    waitEvent(name, timeoutMs = 60000) {
      const t0 = Date.now();
      return new Promise((res, rej) => {
        const iv = setInterval(() => {
          const hit = events.find((e) => e.event === name);
          if (hit) { clearInterval(iv); res(hit); }
          else if (Date.now() - t0 > timeoutMs) { clearInterval(iv); rej(new Error('timeout waiting for ' + name)); }
        }, 5);
      });
    }
  };
}

// Pulls 128-frame quanta out of the processor exactly like the audio thread does.
function render(proc, seconds, onMeters) {
  const quanta = Math.round(seconds * RATE / 128);
  const L = new Float32Array(128), R = new Float32Array(128);
  const outputs = [[L, R]];
  let peak = 0, sumSq = 0, n = 0;
  const meterSnapshots = [];
  for (let q = 0; q < quanta; q++) {
    L.fill(0); R.fill(0);
    proc.process([], outputs);
    for (let i = 0; i < 128; i++) {
      const l = L[i], r = R[i];
      const a = Math.max(Math.abs(l), Math.abs(r));
      if (a > peak) peak = a;
      sumSq += l * l + r * r; n += 2;
    }
  }
  return { peak, rms: Math.sqrt(sumSq / n), frames: quanta * 128 };
}

async function runEngine({ engine, file, seconds = 4, multichannel = true, track = 0, channelGains, tempo = 1, label }) {
  const bundle = engine === 'gme' ? 'wasm/gme.worklet.js' : 'wasm/xmp.worklet.js';
  const procName = engine === 'gme' ? 'chiptune-gme' : 'chiptune-xmp';
  const { registry, sent } = loadProcessor(bundle);
  const Proc = registry[procName];
  if (!Proc) throw new Error('processor ' + procName + ' not registered');

  const proc = new Proc();
  const client = makeClient(proc, sent);
  const bytes = new Uint8Array(fs.readFileSync(file));
  const loaded = await client.call('load', { bytes, opts: { multichannel }, base: 'http://chiptune.test/wasm/' });
  const ready = await client.waitEvent('ready');
  if (channelGains) for (const [ch, g] of Object.entries(channelGains)) await client.call('channel', { channel: +ch, gain: g });
  if (tempo !== 1) await client.call('speed', { factor: tempo });
  await client.call('play', { track, playMs: 0, loop: 'off', fadeMs: 3000, master: 1 });

  const out = render(proc, seconds);
  const meters = client.events.filter((e) => e.event === 'meters');
  const statuses = client.events.filter((e) => e.event === 'status');
  const lastMeters = meters[meters.length - 1] || {};
  const lastStatus = statuses[statuses.length - 1] || {};

  return {
    label: label || path.basename(file),
    version: ready.version,
    meta: loaded.meta,
    channels: loaded.channels,
    channelNames: loaded.channelNames,
    ...out,
    meters: lastMeters.levels || [],
    meterCount: meters.length,
    rmsDb: 20 * Math.log10(Math.max(out.rms, 1e-9)),
    peakDb: 20 * Math.log10(Math.max(out.peak, 1e-9)),
    status: lastStatus
  };
}

const V = path.join(ROOT, 'tests/fixtures');
const results = [];
const cases = [
  { engine: 'gme', file: path.join(V, 'libgme-test.nsf'), multichannel: true,  label: 'gme NSF (percussive) multichannel' },
  { engine: 'gme', file: path.join(V, 'libgme-test.nsf'), multichannel: false, label: 'gme NSF (percussive) stereo' },
  { engine: 'gme', file: path.join(V, 'libgme-test.nsf'), multichannel: true,  label: 'gme NSF track tempo x1.5', tempo: 1.5 },
  { engine: 'xmp', file: path.join(V, 'ft2_tremor_delay.xm'), label: 'xmp XM module' },
  { engine: 'xmp', file: path.join(V, 'mpt116_32chn.it'), label: 'xmp IT 32ch' },
  { engine: 'gme', file: path.join(ROOT, 'samples/demo.vgm'), multichannel: true, label: 'gme built-in demo VGM (SN76489)' },
  { engine: 'xmp', file: path.join(ROOT, 'samples/demo.mod'), label: 'xmp built-in demo MOD (ProTracker)' },
];

for (const c of cases) {
  if (!fs.existsSync(c.file)) { console.log(`SKIP ${c.label}: missing ${c.file}`); continue; }
  const t0 = Date.now();
  try {
    const r = await runEngine(c);
    results.push(r);
    const ok = r.rms > 0.001 && r.peak > 0.01;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${r.label} (${Date.now() - t0} ms)`);
    console.log(`     engine=${r.version} system="${r.meta.system}" tracks=${r.meta.trackCount} multichannel=${r.meta.multichannel}`);
    console.log(`     voices=${r.channels} [${(r.channelNames || []).join(', ')}]`);
    console.log(`     rendered ${r.frames} frames  rms=${r.rms.toFixed(5)} (${r.rmsDb.toFixed(1)} dBFS)  peak=${r.peak.toFixed(4)}`);
    if (r.meters.length) console.log(`     meters=[${r.meters.slice(0, 8).map((v) => Number(v).toFixed(2)).join(' ')}]`);
    const s = r.status;
    console.log(`     status pos=${s.posMs}ms tell=${s.tell ?? '-'} row=${s.row ?? '-'} pat=${s.pattern ?? '-'} bpm=${s.bpm ?? '-'}`);
    if (r.meta.tracks && r.meta.tracks.length) {
      console.log(`     tracklist: ${r.meta.tracks.slice(0, 5).map((t) => `#${t.index} "${t.title || '?'}" ${t.length}ms`).join(' | ')}`);
    }
  } catch (e) {
    console.log(`FAIL ${c.label}: ${String(e.message || e).split('\n')[0]}`);
  }
}

// channel-mute sanity check: muting every voice must silence the output
try {
  const muted = await runEngine({
    engine: 'gme', file: path.join(V, 'libgme-test.nsf'), multichannel: true, seconds: 2,
    channelGains: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 }, label: 'gme all channels muted'
  });
  const silent = muted.rms < 0.0005;
  console.log(`${silent ? 'PASS' : 'FAIL'} mute-all silences output (rms=${muted.rms.toFixed(6)})`);
  results.push(muted);
} catch (e) {
  console.log('FAIL mute-all test: ' + e.message);
}
console.log(`\n${results.length} engine runs completed`);
