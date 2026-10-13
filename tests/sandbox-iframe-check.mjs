// tests/sandbox-iframe-check.mjs — reproduces the Arena live-preview embedding:
// the app inside <iframe sandbox="allow-scripts"> (no allow-same-origin), which
// gives the document an *opaque origin*. In that mode module scripts, dynamic
// import() and fetch() are all CORS-checked against an `Origin: null` request,
// so a static server without Access-Control-Allow-Origin breaks the app even
// though the HTML itself renders.
//
//   node tests/sandbox-iframe-check.mjs [url]
//
// PASS = the app boots inside the sandboxed frame and renders audio.
import { chromium } from 'playwright';

const URL_ = process.argv[2] || 'http://127.0.0.1:8088/';
const browser = await chromium.launch({ args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });

const logs = [];
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(m.type() + ': ' + m.text().slice(0, 180)); });

await page.setContent(`<!doctype html><meta charset="utf-8">
<body style="margin:0">
<iframe id="pv" src="${URL_}" sandbox="allow-scripts allow-popups allow-forms"
        style="border:0;width:1280px;height:860px"></iframe>
</body>`);

// wait for the inner app (or its boot banner)
const frame = page.frames().find((f) => f.url().startsWith(URL_));
let ready = null;
for (let i = 0; i < 40; i++) {
  await page.waitForTimeout(500);
  try {
    ready = await frame.evaluate(() => ({
      chip: !!window.CHIP,
      banner: !!document.getElementById('boot-banner'),
      bannerText: document.getElementById('boot-banner')?.textContent.slice(0, 90) || null,
      origin: location.origin,
      overlay: !!document.getElementById('start-overlay')
    }));
  } catch (e) { ready = { error: String(e.message).slice(0, 120) }; }
  if (ready && (ready.chip || ready.banner)) break;
}
console.log('inside sandboxed iframe:', JSON.stringify(ready));

// if the app booted, run the demo and measure the analyser
let meas = null;
if (ready && ready.chip) {
  await frame.evaluate(() => { const b = document.querySelector('#start-demo'); if (b) b.click(); });
  let mode = null;
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(500);
    mode = await frame.evaluate(() => window.CHIP.engine.mode);
    if (mode) break;
  }
  await page.waitForTimeout(3000);
  meas = await frame.evaluate(() => {
    const m = window.CHIP.engine.measure();
    return {
      mode: window.CHIP.engine.mode,
      ctx: window.CHIP.engine.ctx ? window.CHIP.engine.ctx.state : 'yok',
      playerState: window.CHIP.player.state,
      queue: window.CHIP.playlist.items.length,
      rms: Number(m.rms.toFixed(5)), peak: Number(m.peak.toFixed(5)),
      logs: Array.from(document.querySelectorAll('#log-body .log-line')).slice(-10)
        .map((n) => n.textContent.replace(/\s+/g, ' ').trim())
    };
  });
  console.log('audio inside sandboxed iframe:', JSON.stringify(meas, null, 2));
}

console.log('console noise:', logs.length ? logs.slice(0, 4).join('\n  ') : 'none');
await page.screenshot({ path: 'tests/screenshot-sandbox-iframe.png' });
const ok = !!(ready && ready.chip && (!meas || meas.rms > 0.0005));
console.log(ok ? 'SANDBOX IFRAME CHECK: PASS' : 'SANDBOX IFRAME CHECK: FAIL');
await browser.close();
process.exit(ok ? 0 : 1);
