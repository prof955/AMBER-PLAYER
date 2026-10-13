// tests/file-open-check.mjs — reproduces the exact mistake users make:
// double-clicking index.html so it opens as file:///.../index.html
//
//   node tests/file-open-check.mjs
//
// Expected: the page must NOT stay silently dead. The boot guard has to show a
// full-screen amber banner explaining that file:// blocks modules/WASM, and
// point at the working URL. The HTTP-served version must NOT show that banner.
import { chromium } from 'playwright';

const FILE_URL = 'file:///home/user/chiptune-console/index.html';
const HTTP_URL = process.argv[2] || 'http://127.0.0.1:8088/';

const browser = await chromium.launch({ args: ['--no-sandbox'] });

// ── 1. opened straight from disk ─────────────────────────────────────────
{
  const page = await browser.newPage();
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 120)); });
  await page.goto(FILE_URL, { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  const r = await page.evaluate(() => {
    const b = document.getElementById('boot-banner');
    return {
      banner: !!b,
      text: b ? b.textContent.replace(/\s+/g, ' ').slice(0, 260) : null,
      chip: !!window.CHIP,
      hasTestButton: !!document.querySelector('#btn-open-selftest'),
      testLabel: document.querySelector('#btn-open-selftest')?.textContent,
      hasHelp: !!document.querySelector('#btn-help')
    };
  });
  console.log('file:// open →', JSON.stringify(r, null, 2));
  console.log('  console errors (expected: module/CORS blocks):', errs.length ? errs[0] : 'none');
  console.log('  VERDICT:', r.banner && !r.chip ? 'PASS — user is told exactly what is wrong'
    : 'FAIL — page stays silently dead');
  await page.screenshot({ path: 'tests/screenshot-file-url.png' });
}

// ── 2. served over HTTP (the correct way) ────────────────────────────────
{
  const page = await browser.newPage();
  await page.goto(HTTP_URL, { waitUntil: 'load' });
  await page.evaluate(() => { try { localStorage.removeItem('chiptune-console.seen'); } catch (e) {} });
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(1500);
  const first = await page.evaluate(() => ({
    banner: !!document.getElementById('boot-banner'),
    overlay: !!document.getElementById('start-overlay'),
    demoBtn: document.getElementById('start-demo')?.textContent,
    chip: !!window.CHIP
  }));
  console.log('http:// first visit →', JSON.stringify(first));
  // dismiss, then check YARDIM brings it back on demand
  await page.click('#start-close');
  await page.waitForTimeout(300);
  const gone = await page.evaluate(() => !document.getElementById('start-overlay'));
  await page.click('#btn-help');
  await page.waitForTimeout(300);
  const back = await page.evaluate(() => !!document.getElementById('start-overlay'));
  console.log('  overlay dismissible:', gone, '· YARDIM reopens it:', back);
  console.log('  VERDICT:', !first.banner && first.overlay && first.chip && gone && back
    ? 'PASS — overlay on first visit, no banner, YARDIM works' : 'FAIL');
  // and the demo button label the user asked about
  const labels = await page.evaluate(() => ({
    demo: document.querySelector('#btn-open-selftest').textContent,
    diag: document.querySelector('#btn-diag').textContent,
    help: document.querySelector('#btn-help').textContent
  }));
  console.log('  button labels:', JSON.stringify(labels));
  await page.screenshot({ path: 'tests/screenshot-http-first-run.png' });
}

await browser.close();
