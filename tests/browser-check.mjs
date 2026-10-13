// tests/browser-check.mjs — real-browser check of the console page.
//
//   node tests/browser-check.mjs [url] [screenshot-path]
//
// Verifies, in a real Chromium:
//   1. the page boots with no JS errors and all files are served (HTTP status)
//   2. both WASM engines really instantiate *in the browser* and render audio
//      (driven directly, so it works even where AudioWorklet is unavailable:
//      headless sandboxes often never resolve audioWorklet.addModule)
//   3. the DOM pipeline works: file metadata panels, subtune list, meters,
//      ZIP ingestion, ROM inspector, timeline, EQ, options
import { chromium } from 'playwright';

const URL_ = process.argv[2] || 'http://127.0.0.1:8088/';
const SHOT = process.argv[3] || 'tests/screenshot.png';

const browser = await chromium.launch({ args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1680, height: 1050 }, deviceScaleFactor: 1 });
page.on('console', (m) => { if (m.type() === 'error') console.log('[console error]', m.text().slice(0, 200)); });
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 300)));

await page.goto(URL_, { waitUntil: 'load' });
await page.waitForTimeout(600);

// first run: the quick-start overlay must be dismissible and not block the UI
const hadOverlay = await page.evaluate(() => !!document.querySelector('#start-overlay'));
if (hadOverlay) {
  await page.click('#start-close');                                    // KAPAT
  await page.waitForTimeout(200);
}
console.log('first-run overlay:', hadOverlay ? 'shown + dismissed' : 'not shown');

console.log('boot:', JSON.stringify(await page.evaluate(() => ({
  chip: !!window.CHIP,
  logs: document.querySelectorAll('#log-body .log-line').length,
  formats: document.querySelectorAll('#formats-body .fmt-line').length,
  presets: document.querySelectorAll('#eq-presets .btn').length,
  opts: document.querySelectorAll('#opt-playlength .btn').length
}))));

// ─── engines: instantiate + render, one per page load (globals collide) ───
async function runEngine(which, file) {
  const res = await page.evaluate(async ({ which, file }) => {
    window.sampleRate = 48000;                      // worklet global, absent here
    window.AudioWorkletProcessor = class { constructor() { this.port = { postMessage() {}, onmessage: null }; } };
    window.AudioWorkletGlobalScope = class {};
    window.registerProcessor = () => {};
    const s = document.createElement('script');
    s.src = '/wasm/' + which + '.worklet.js';
    await new Promise((r, j) => { s.onload = r; s.onerror = () => j(new Error('script ' + s.src)); document.head.append(s); });
    const t0 = performance.now();
    const mod = await window.Module({ locateFile: (p) => '/wasm/' + p });
    const bootMs = Math.round(performance.now() - t0);
    const bytes = new Uint8Array(await (await fetch(file)).arrayBuffer());
    const loaded = ENGINE.load(mod, bytes, { multichannel: true });
    ENGINE.start(mod, 0, {});
    const L = new Float32Array(1024), R = new Float32Array(1024);
    const mix = { scale: (loaded.mix && loaded.mix.scale) || 1, gains: new Float32Array(16).fill(1), pans: new Float32Array(16) };
    let peak = 0, nz = 0;
    for (let i = 0; i < 40; i++) {
      ENGINE.render(mod, 1024, L, R, mix);
      for (let k = 0; k < 1024; k++) { const a = Math.abs(L[k]); if (a > peak) peak = a; if (L[k] !== 0) nz++; }
    }
    return {
      version: ENGINE.version(mod), bootMs,
      system: loaded.meta.system, title: loaded.meta.title,
      channels: ENGINE.channels(mod), names: ENGINE.channelNames(mod).slice(0, 6),
      status: ENGINE.status(mod),
      peak: Number(peak.toFixed(4)), nonzero: nz
    };
  }, { which, file });
  console.log(`engine ${which} (${file}):`, JSON.stringify(res));
  return res;
}
await runEngine('gme', '/samples/demo.vgm');
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(400);
await runEngine('xmp', '/samples/demo.mod');

// ─── UI flow: SELF TEST button (metadata path uses the scan worklet node) ──
await page.click('#btn-open-selftest');
await page.waitForTimeout(3000);
console.log('after SELF TEST:', JSON.stringify(await page.evaluate(() => ({
  queue: Array.from(document.querySelectorAll('#queue-body .qitem .nm')).map((n) => n.textContent),
  count: document.querySelector('#queue-count').textContent,
  voices: document.querySelectorAll('#voice-list .vrow').length,
  subtunes: document.querySelectorAll('#tracklist-body .tlitem').length,
  state: window.CHIP.player.state,
  logs: Array.from(document.querySelectorAll('#log-body .log-line')).slice(-6).map((n) => n.textContent.replace(/\s+/g, ' ').trim())
})), null, 2));

// ─── ZIP ingestion through drag & drop ────────────────────────────────────
console.log('zip drop:', JSON.stringify(await page.evaluate(async () => {
  const vgm = new Uint8Array(await (await fetch('/samples/demo.vgm')).arrayBuffer());
  const mod = new Uint8Array(await (await fetch('/samples/demo.mod')).arrayBuffer());
  const tbl = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = (b) => { let c = 0xFFFFFFFF; for (const x of b) c = tbl[(c ^ x) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const files = [['rips/theme.vgm', vgm], ['rips/song.mod', mod], ['rips/README.txt', new TextEncoder().encode('x')]];
  const local = [], central = [];
  const u16 = (a, v) => a.push(v & 0xFF, (v >> 8) & 0xFF);
  const u32 = (a, v) => a.push(v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF);
  for (const [name, data] of files) {
    const nm = new TextEncoder().encode(name), crc = crc32(data), off = local.length;
    local.push(0x50, 0x4b, 0x03, 0x04); u16(local, 20); u16(local, 0); u16(local, 0); u16(local, 0); u16(local, 0);
    u32(local, crc); u32(local, data.length); u32(local, data.length); u16(local, nm.length); u16(local, 0);
    local.push(...nm, ...data);
    central.push(0x50, 0x4b, 0x01, 0x02); u16(central, 20); u16(central, 20); u16(central, 0); u16(central, 0);
    u16(central, 0); u16(central, 0); u32(central, crc); u32(central, data.length); u32(central, data.length);
    u16(central, nm.length); u16(central, 0); u16(central, 0); u16(central, 0); u16(central, 0); u32(central, 0); u32(central, off);
    central.push(...nm);
  }
  const buf = new Uint8Array([...local, ...central]);
  const eocd = new Uint8Array(22);
  eocd.set([0x50, 0x4b, 0x05, 0x06], 0);
  new DataView(eocd.buffer).setUint16(8, files.length, true);
  new DataView(eocd.buffer).setUint16(10, files.length, true);
  new DataView(eocd.buffer).setUint32(12, central.length, true);
  new DataView(eocd.buffer).setUint32(16, local.length, true);
  const zip = new Uint8Array([...buf, ...eocd]);
  const file = new File([zip], 'rip-pack.zip', { type: 'application/zip' });
  const dt = new DataTransfer();
  dt.items.add(file);
  window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  await new Promise((r) => setTimeout(r, 2000));
  return {
    queue: Array.from(document.querySelectorAll('#queue-body .qitem')).map((n) => n.textContent.replace(/\s+/g, ' ').trim()),
    logs: Array.from(document.querySelectorAll('#log-body .log-line')).slice(-8).map((n) => n.textContent.replace(/\s+/g, ' ').trim())
  };
}), null, 2));

// ─── multi-subtune NSF: real fixture from the vendored libgme repo ────────
console.log('nsf drop:', JSON.stringify(await page.evaluate(async () => {
  let res;
  try { res = await fetch('/tests/fixtures/libgme-test.nsf'); } catch (e) { return { skipped: 'no fixture' }; }
  if (!res.ok) return { skipped: 'HTTP ' + res.status };
  const bytes = new Uint8Array(await res.arrayBuffer());
  const file = new File([bytes], 'libgme-test.nsf', { type: 'application/octet-stream' });
  const dt = new DataTransfer();
  dt.items.add(file);
  window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  await new Promise((r) => setTimeout(r, 2500));
  return {
    queue: Array.from(document.querySelectorAll('#queue-body .qitem .nm')).map((n) => n.textContent).slice(-1),
    system: document.querySelector('#engine-name').textContent,
    logs: Array.from(document.querySelectorAll('#log-body .log-line')).slice(-3).map((n) => n.textContent.replace(/\s+/g, ' ').trim())
  };
}), null, 2));

// ─── .vgz (gzipped VGM): must be inflated in the page, not by libgme ──────
console.log('vgz drop:', JSON.stringify(await page.evaluate(async () => {
  const vgm = new Uint8Array(await (await fetch('/samples/demo.vgm')).arrayBuffer());
  // gzip via the platform (same container format a real .vgz uses)
  const cs = new CompressionStream('gzip');
  const gz = new Uint8Array(await new Response(new Blob([vgm]).stream().pipeThrough(cs)).arrayBuffer());
  const file = new File([gz], 'theme.vgz', { type: 'application/gzip' });
  const dt = new DataTransfer();
  dt.items.add(file);
  window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  await new Promise((r) => setTimeout(r, 1800));
  return {
    queue: Array.from(document.querySelectorAll('#queue-body .qitem')).map((n) => n.textContent.replace(/\s+/g, ' ').trim()).slice(-3),
    logs: Array.from(document.querySelectorAll('#log-body .log-line')).slice(-4).map((n) => n.textContent.replace(/\s+/g, ' ').trim())
  };
}), null, 2));

// ─── ROM inspector ────────────────────────────────────────────────────────
console.log('rom drop:', JSON.stringify(await page.evaluate(async () => {
  const bytes = new Uint8Array(16 + 32 * 1024);
  bytes.set([0x4e, 0x45, 0x53, 0x1a], 0);
  bytes[4] = 2; bytes[5] = 1; bytes[6] = 0x11; bytes[7] = 0;
  const file = new File([bytes], 'Contra (U).nes', { type: 'application/octet-stream' });
  const dt = new DataTransfer();
  dt.items.add(file);
  window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  await new Promise((r) => setTimeout(r, 800));
  return {
    hidden: document.querySelector('#panel-rom').hidden,
    platform: document.querySelector('#rom-sub').textContent,
    fields: Array.from(document.querySelectorAll('#rom-body .field')).map((f) => f.textContent.replace(/\s+/g, ' ').trim()),
    steps: document.querySelectorAll('#rom-body .steps li').length
  };
}), null, 2));

// ─── EQ / options / timeline interactions ─────────────────────────────────
console.log('interactions:', JSON.stringify(await page.evaluate(() => {
  const click = (sel) => document.querySelector(sel).click();
  click('#opt-playlength .btn:nth-child(3)');
  click('#opt-loop .btn:nth-child(2)');
  click('#btn-shuffle');
  click('#btn-repeat');
  click('#eq-presets .btn:nth-child(3)');
  document.querySelector('#master-vol').value = '55';
  document.querySelector('#master-vol').dispatchEvent(new Event('input'));
  document.querySelector('#seek').value = '500';
  document.querySelector('#seek').dispatchEvent(new Event('change'));
  return {
    options: { playLength: window.CHIP.ui.options.playLengthMs, loop: window.CHIP.ui.options.loopMode },
    repeat: window.CHIP.player.repeat,
    shuffle: window.CHIP.player.shuffle,
    eq: [document.querySelector('#eq-bass').value, document.querySelector('#eq-mid').value, document.querySelector('#eq-treble').value],
    vol: document.querySelector('#master-vol-v').textContent,
    seekValue: document.querySelector('#seek').value,
    logs: Array.from(document.querySelectorAll('#log-body .log-line')).slice(-5).map((n) => n.textContent.replace(/\s+/g, ' ').trim())
  };
}), null, 2));

// ─── URL path: FETCH button pulls a file from the same origin ─────────────
await page.fill('#url-input', new URL('/samples/demo.vgm', URL_).href);
await page.click('#url-load');
await page.waitForTimeout(1500);
console.log('after URL fetch:', JSON.stringify(await page.evaluate(() => ({
  queue: document.querySelectorAll('#queue-body .qitem').length,
  source: document.querySelector('#source-label').textContent,
  logs: Array.from(document.querySelectorAll('#log-body .log-line')).slice(-3).map((n) => n.textContent.replace(/\s+/g, ' ').trim())
})), null, 2));

// ─── visuals: feed synthetic analyser data and count lit pixels ───────────
console.log('viz:', JSON.stringify(await page.evaluate(() => {
  const { spectrum, scope } = window.CHIP;
  const freq = new Uint8Array(2048);
  for (let i = 0; i < freq.length; i++) freq[i] = i < 200 ? 255 - i : 30;
  spectrum.draw(freq, 24000, true);
  const t = new Float32Array(2048);
  for (let i = 0; i < t.length; i++) t[i] = Math.sin(i / 12) * 0.7;
  scope.draw(t, true);
  const lit = (canvas) => {
    const c = document.querySelector(canvas);
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 8) n++;
    return n;
  };
  return { spectrumLit: lit('#spectrum'), scopeLit: lit('#scope'), bars: spectrum.levels.length, peakHold: Math.max(...spectrum.peaks).toFixed(3) };
}), null, 2));

await page.screenshot({ path: SHOT });
console.log('screenshot ->', SHOT);
await browser.close();
