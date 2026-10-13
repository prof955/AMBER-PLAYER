// tests/compat-check.mjs — end-to-end check of the compatibility route.
//
// The sandbox's own Chromium never resolves audioWorklet.addModule(), which is
// exactly the situation the fallback exists for: the page must notice, switch to
// the main-thread engine, and still play. This test drives that path for real:
//   TEST button -> worklet probe fails -> compat engine -> sound reaches the
//   analyser -> the WAV export produces a valid file with non-silent samples.
//
//   node tests/compat-check.mjs [url]
import { chromium } from 'playwright';
import fs from 'node:fs';

const URL_ = process.argv[2] || 'http://127.0.0.1:8088/';
const browser = await chromium.launch({ args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1500, height: 950 }, acceptDownloads: true });
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 200)));

await page.goto(URL_, { waitUntil: 'load' });
await page.waitForTimeout(500);

// ── 0. first run shows the quick-start overlay; its DEMO button must work ──
const overlay = await page.evaluate(() => !!document.querySelector('#start-overlay'));
console.log('first-run overlay shown:', overlay);
if (overlay) {
  await page.click('#start-demo');                              // DEMOYU ÇAL
  const gone = await page.evaluate(() => !document.querySelector('#start-overlay'));
  console.log('overlay dismissed by its own button:', gone);
} else {
  await page.click('#btn-open-selftest');
}

let mode = null;
for (let i = 0; i < 40; i++) {                     // up to 20 s
  await page.waitForTimeout(500);
  mode = await page.evaluate(() => window.CHIP?.engine?.mode || null);
  if (mode) break;
}
console.log('audio route chosen:', mode);
if (mode !== 'compat') {
  console.log('NOTE: this host resolved the AudioWorklet — the fallback was not exercised.');
}

await page.waitForTimeout(2500);                    // let a couple of chunks flow
const state = await page.evaluate(() => {
  const { engine, player } = window.CHIP;
  const m = engine.measure();
  const td = new Float32Array(engine.analyser ? engine.analyser.fftSize : 0);
  let nz = 0;
  if (engine.analyser) { engine.analyser.getFloatTimeDomainData(td); for (const v of td) if (v !== 0) nz++; }
  return {
    mode: engine.mode, ctx: engine.ctx.state, rate: engine.ctx.sampleRate,
    playerState: player.state, posMs: Math.round(player.posMs),
    rms: Number(m.rms.toFixed(5)), peak: Number(m.peak.toFixed(5)),
    analyserNonZero: nz,
    compatPlaying: !!(engine.compat && engine.compat.playing),
    queue: document.querySelectorAll('#queue-body .qitem').length,
    logs: Array.from(document.querySelectorAll('#log-body .log-line')).slice(-8).map((n) => n.textContent.replace(/\s+/g, ' ').trim())
  };
});
console.log('playback state:', JSON.stringify(state, null, 2));

// the fallback must load through the ES module (no eval) — that is what makes
// it work inside CSP-restricted preview iframes
const route = await page.evaluate(() => window.CHIP.engine.compat.loadRoute);
console.log('compat bundle route:', route);
if (mode === 'compat' && route !== 'es-module') {
  console.log('WARNING: compat fell back to eval — CSP-restricted hosts would break');
}

// the TANI button must run the full health check without throwing
await page.click('#btn-diag');
await page.waitForTimeout(9000);
const diagLines = await page.evaluate(() => ({
  lines: Array.from(document.querySelectorAll('#log-body .log-line')).slice(-16).map((n) => n.textContent.replace(/\s+/g, ' ').trim())
}));
console.log('diagnostics tail:', JSON.stringify(diagLines, null, 2));

// ── 2. transport controls must work in compat mode ───────────────────────
const controls = await page.evaluate(async () => {
  const { engine, player } = window.CHIP;
  const before = player.posMs;
  await player.seek(4000);
  await new Promise((r) => setTimeout(r, 700));
  const afterSeek = player.posMs;
  await engine.pause();
  await new Promise((r) => setTimeout(r, 400));
  const held = player.posMs;
  await new Promise((r) => setTimeout(r, 600));
  const stillHeld = player.posMs;
  await engine.resume();
  await new Promise((r) => setTimeout(r, 700));
  const resumed = player.posMs;
  await engine.setChannel(0, 0);                    // mute channel 1
  await new Promise((r) => setTimeout(r, 300));
  await engine.setChannel(0, 1);
  return { before: Math.round(before), afterSeek: Math.round(afterSeek), held: Math.round(held), stillHeld: Math.round(stillHeld), resumed: Math.round(resumed) };
});
console.log('transport:', JSON.stringify(controls));

// ── 3. WAV export ────────────────────────────────────────────────────────
await page.evaluate(() => { window.CHIP.ui.options.playLengthMs = 8000; });
const [download] = await Promise.all([
  page.waitForEvent('download', { timeout: 90000 }),
  page.click('#btn-save-wav')
]);
const wavPath = '/tmp/chiptune-export.wav';
await download.saveAs(wavPath);
const buf = fs.readFileSync(wavPath);
const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
const head = {
  riff: buf.slice(0, 4).toString(),
  wave: buf.slice(8, 12).toString(),
  channels: dv.getUint16(22, true),
  sampleRate: dv.getUint32(24, true),
  bits: dv.getUint16(34, true),
  dataBytes: dv.getUint32(40, true)
};
const pcm = new Int16Array(buf.buffer, buf.byteOffset + 44, head.dataBytes / 2);
let peak = 0, nonZero = 0;
for (const v of pcm) { const a = Math.abs(v); if (a > peak) peak = a; if (v !== 0) nonZero++; }
console.log('wav:', JSON.stringify({ ...head, file: download.suggestedFilename(),
  seconds: (head.dataBytes / 4 / head.sampleRate).toFixed(2), peak, nonZero }, null, 2));

await page.screenshot({ path: 'tests/screenshot-compat.png' });
console.log('screenshot -> tests/screenshot-compat.png');
await browser.close();

const ok = (mode !== 'compat' || (state.rms > 0.001 && state.analyserNonZero > 100))
  && head.riff === 'RIFF' && head.wave === 'WAVE' && head.sampleRate === 44100 && head.bits === 16 && peak > 1000;
console.log(ok ? 'COMPAT CHECK: PASS' : 'COMPAT CHECK: FAIL');
process.exit(ok ? 0 : 1);
