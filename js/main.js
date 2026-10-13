// main.js — boot, ingestion (file / drag&drop / URL / ZIP / ROM) and every
// wiring between the console UI and the audio engines.
import { $, $$, el, fmtTime, fmtBytes, fmtDb, clamp, basename, extname } from './util.js';
import { Engine } from './engine.js';
import { renderWav } from './compat.js';
import { Playlist } from './playlist.js';
import { Player } from './player.js';
import { UI, EQ_PRESETS } from './ui.js';
import { Spectrum, Scope } from './viz.js';
import { sniff, scanEmbedded, isZip, isGzip, isPlaylist, ACCEPT_HINT, MUSIC_EXT, ENGINE_INFO } from './formats.js';
import { listZip, extractAll, gunzip } from './zip.js';
import { inspectRom } from './rom.js';
import { DEMO_VGM_B64, DEMO_MOD_B64 } from './demo.js';

const STORE = 'chiptune-console.v1';
const MAX_ZIP_ENTRIES = 64;

// ───────────────────────────────────────────────────────────── instances ────
const engine = new Engine();
const ui = new UI(engine);
const playlist = new Playlist($('#queue-body'), $('#queue-sub'));
const player = new Player(engine, playlist, ui);
const spectrum = new Spectrum($('#spectrum'), $('#spec-scale'), 96);
const scope = new Scope($('#scope'));

// keep the status-bar queue counter in sync with the list
const _render = playlist.render.bind(playlist);
playlist.render = () => {
  _render();
  $('#queue-count').textContent = String(playlist.items.length);
};
playlist.onRemove = () => {};

// exposed immediately: the boot guard, the diagnostics and the tests all look
// for it, and a failure later in this file must not hide it
window.CHIP = { engine, ui, player, playlist, spectrum, scope, ingest, ingestUrl, inspectRom, renderWav, runDiagnostics };

// ──────────────────────────────────────────────────────────── visual loop ───
let lastFrame = 0;
function frame(t) {
  requestAnimationFrame(frame);
  if (t - lastFrame < 33) return;              // ~30 fps is plenty for a CRT
  lastFrame = t;

  const ctx = engine.ctx;
  const active = engine.state === 'running';
  if (ctx && engine.analyser) {
    engine.analyser.getByteFrequencyData(engine.freqData);
    engine.analyser.getFloatTimeDomainData(engine.timeData);
  }
  const nyq = ctx ? ctx.sampleRate / 2 : 22050;
  spectrum.draw(engine.freqData, nyq, active && player.state !== 'STOPPED');
  scope.draw(engine.timeData, active && player.state !== 'STOPPED');

  // dB readout straight from the analyser (post EQ / limiter, real signal)
  const m = engine.measure();
  $('#db-readout').textContent = fmtDb(m.peak) + ' dB';
  const dbActive = m.peak > 0.0015;
  $('#activity-led').classList.toggle('on', dbActive);
  if (player.state !== 'STOPPED') {
    $('#np-levels').textContent = `pk ${fmtDb(m.peak)} · rms ${fmtDb(m.rms)}`;
  }
}
requestAnimationFrame(frame);

setInterval(() => {
  $('#clock').textContent = new Date().toLocaleTimeString('tr-TR', { hour12: false }) + ' UTC+3';
}, 1000);

// ────────────────────────────────────────────────────────── ingestion core ──
function addItem(name, bytes, engineKey, kind, origin) {
  const item = {
    name, bytes, size: bytes.length, engine: engineKey, kind,
    origin, title: null, meta: null, tracks: [], duration: null, error: null
  };
  const it = playlist.add(item);
  ui.log.push(`+ ${name} · ${fmtBytes(bytes.length)} · ${kind} · ${origin}`, 'ok');
  return it;
}

/**
 * Everything funnels through here: raw bytes + a display name.
 * Decides between gzip container / ZIP archive / playlist / chiptune / ROM.
 */
async function ingest(name, bytes, origin = 'FILE', depth = 0) {
  if (depth > 3) { ui.log.push('arşiv iç içe çok derin: ' + name, 'err'); return null; }

  // .m3u playlists ---------------------------------------------------------
  if (isPlaylist(bytes, name)) {
    const text = new TextDecoder().decode(bytes).split(/\r?\n/)
      .map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
    ui.log.push(`m3u listesi: ${text.length} satır`, 'info');
    let first = null;
    for (const line of text.slice(0, 50)) {
      if (!/^https?:/i.test(line)) { ui.log.push(`  atlandı (yerel yol): ${line}`, 'warn'); continue; }
      const it = await ingestUrl(line, origin);
      if (it && !first) first = it;
    }
    return first;
  }

  // gzip container (.vgz / .gz) --------------------------------------------
  // libgme is built without zlib, so a .vgz has to be opened here and the raw
  // VGM handed to the engine (same for any other gzipped chiptune).
  if (isGzip(bytes)) {
    try {
      const raw = await gunzip(bytes);
      ui.log.push(`gzip açıldı: ${name} · ${fmtBytes(bytes.length)} → ${fmtBytes(raw.length)}`);
      const inner = /\.vgz$/i.test(name) ? name.replace(/\.vgz$/i, '.vgm')
        : /\.gz$/i.test(name) ? (name.replace(/\.gz$/i, '') || name + '.bin')
        : name + '.bin';
      const it = await ingest(inner, raw, origin, depth + 1);
      if (it) { it.name = name; playlist.render(); }   // keep the name the user knows
      return it;
    } catch (e) {
      ui.log.push('gzip açılamadı (' + name + '): ' + (e.message || e), 'err');
      ui.log.push('tarayıcı DecompressionStream desteklemiyor olabilir (Chrome 80+/Firefox 113+/Safari 16.4+)', 'warn');
      return null;
    }
  }

  // zip archive ------------------------------------------------------------
  if (isZip(bytes)) {
    let entries;
    try { entries = listZip(bytes); } catch (e) { ui.log.push('ZIP hatası: ' + e.message, 'err'); return null; }
    const music = entries.filter((e) => !e.name.endsWith('/') && MUSIC_EXT.has(extname(e.name)));
    const roms = entries.filter((e) => !e.name.endsWith('/') && ['nes', 'smc', 'sfc', 'gb', 'gbc', 'gba', 'md', 'gen', 'sms', 'gg', 'a26', 'n64', 'z64'].includes(extname(e.name)));
    ui.log.push(`ZIP: ${entries.length} girdi · ${music.length} müzik · ${roms.length} ROM`, 'info');
    if (!music.length && !roms.length) {
      ui.log.push('ZIP içinde desteklenen chiptune ya da bilinen ROM yok.', 'warn');
      ui.log.push('aranan uzantılar: ' + ACCEPT_HINT, 'info');
      return null;
    }
    const picked = music.slice(0, MAX_ZIP_ENTRIES);
    if (music.length > picked.length) ui.log.push(`ilk ${MAX_ZIP_ENTRIES} müzik dosyası alındı`, 'warn');
    let first = null;
    const extracted = await extractAll(bytes, (n) => MUSIC_EXT.has(extname(n)));
    for (const e of extracted) {
      if (e.error) { ui.log.push('  çıkarılamadı: ' + e.name, 'err'); continue; }
      const it = await ingest(basename(e.name), e.data, 'ZIP', depth + 1);
      if (it && !first) first = it;
    }
    if (!music.length && roms.length) {
      ui.log.push('ZIP içindeki ilk ROM inceleniyor: ' + roms[0].name, 'warn');
      const e = roms[0];
      const all = await extractAll(bytes, (n) => n === e.name);
      if (all[0] && !all[0].error) await ingest(basename(e.name), all[0].data, 'ZIP', depth + 1);
    }
    return first;
  }

  // chiptune / tracker music ----------------------------------------------
  const info = sniff(bytes, name);
  if (info) return addItem(name, bytes, info.engine, info.kind, origin);

  // embedded chiptune inside ROM / binary container -----------------------
  const embedded = scanEmbedded(bytes);
  if (embedded) {
    const ext = embedded.info.kind.toLowerCase();
    const cleanName = name.replace(/\.[a-z0-9]+$/i, '') + '.' + ext;
    ui.log.push('ROM içinden gömülü ' + embedded.info.kind + ' müziği çıkarıldı (konum: 0x' + embedded.offset.toString(16).toUpperCase() + ')', 'ok');
    return addItem(cleanName, embedded.bytes, embedded.info.engine, embedded.info.kind, origin);
  }

  // console ROM -> inspector (no audio to extract, say so honestly) --------
  const rom = inspectRom(bytes, name);
  if (rom) {
    ui.setRom({
      platform: rom.platform,
      system: rom.system,
      details: Object.fromEntries(rom.fields || []),
      steps: [].concat(rom.notes || [], rom.path || [])
    }, name);
    ui.log.push(`ROM tanındı: ${rom.platform} — ${rom.system}`, 'warn');
    ui.log.push('Bu bir oyun ROM\'u: müzik, oyunun ses kodunun içinde. Sağdaki ROM INSPECTOR panelinde çıkarma yolu yazıyor.', 'info');
    return null;
  }

  ui.log.push(`tanınmayan dosya: ${name} (${fmtBytes(bytes.length)})`, 'err');
  ui.log.push('kabul edilen uzantılar: ' + ACCEPT_HINT, 'info');
  return null;
}

async function ingestFiles(fileList) {
  const files = Array.from(fileList || []);
  if (!files.length) return null;
  let first = null;
  for (const f of files) {
    ui.log.push(`dosya: ${f.name} · ${fmtBytes(f.size)}`);
    try {
      const buf = new Uint8Array(await f.arrayBuffer());
      const it = await ingest(f.name, buf, 'FILE');
      if (it && !first) first = it;
    } catch (e) {
      ui.log.push('okunamadı: ' + f.name + ' (' + (e.message || e) + ')', 'err');
    }
  }
  if (first) {
    await engine.init().catch((e) => ui.log.push('ses motoru: ' + e.message, 'err'));
    if (!playlist.current) await player.activate(first, 0);
  }
  if (files.length > 1) ui.log.push(`${files.length} dosya işlendi, ${playlist.items.length} öğe kuyrukta`, 'ok');
  return first;
}

async function ingestUrl(url, origin = 'URL') {
  if (!/^https?:/i.test(url)) url = 'https://' + url.replace(/^\/+/, '');
  ui.log.push('indiriliyor: ' + url);
  try {
    const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
    if (!res.ok) { ui.log.push(`HTTP ${res.status} ${res.statusText}`, 'err'); return null; }
    const buf = new Uint8Array(await res.arrayBuffer());
    const name = basename(url) || 'tune.bin';
    ui.log.push(`indirildi: ${name} · ${fmtBytes(buf.length)}`, 'ok');
    $('#source-label').textContent = 'URL';
    return await ingest(name, buf, origin);
  } catch (e) {
    ui.log.push('indirme başarısız: ' + (e.message || e), 'err');
    ui.log.push('CORS: karşı sunucu bu sayfaya izin vermiyorsa (Access-Control-Allow-Origin yok) tarayıcı indirmeyi engeller. ' +
                'Dosyayı indirip pencereye bırakmak her zaman çalışır.', 'warn');
    return null;
  }
}

// ─────────────────────────────────────────────────────────────── controls ───
$('#btn-open-file').addEventListener('click', () => $('#file-input').click());
$('#btn-open-zip').addEventListener('click', () => $('#zip-input').click());
$('#btn-open-rom').addEventListener('click', () => $('#rom-input').click());
$('#file-input').addEventListener('change', (e) => ingestFiles(e.target.files));
$('#zip-input').addEventListener('change', (e) => ingestFiles(e.target.files));
$('#rom-input').addEventListener('change', (e) => ingestFiles(e.target.files));

$('#url-load').addEventListener('click', async () => {
  const url = $('#url-input').value.trim();
  if (!url) { ui.log.push('URL alanı boş', 'warn'); return; }
  const it = await ingestUrl(url);
  if (it) {
    await engine.init().catch((e) => ui.log.push('ses motoru: ' + e.message, 'err'));
    if (!playlist.current) await player.activate(it, 0);
  }
});
$('#url-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#url-load').click(); });

// drag & drop
let dragDepth = 0;
window.addEventListener('dragenter', (e) => {
  if (!e.dataTransfer) return;
  dragDepth++;
  $('#drop-overlay').hidden = false;
  e.preventDefault();
});
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('dragleave', () => {
  if (--dragDepth <= 0) { dragDepth = 0; $('#drop-overlay').hidden = true; }
});
window.addEventListener('drop', async (e) => {
  e.preventDefault();
  dragDepth = 0;
  $('#drop-overlay').hidden = true;
  if (e.dataTransfer.files && e.dataTransfer.files.length) {
    $('#chip-input').textContent = 'INPUT: ' + (e.dataTransfer.files.length > 1 ? 'BATCH' : 'FILE');
    await ingestFiles(e.dataTransfer.files);
  } else {
    const url = e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('text/uri-list');
    if (url) { $('#url-input').value = url; $('#url-load').click(); }
  }
});

// transport
$('#btn-play').addEventListener('click', () => player.toggle());
$('#btn-stop').addEventListener('click', async () => { await player.stop(); });
$('#btn-prev').addEventListener('click', () => player.prev());
$('#btn-next').addEventListener('click', () => player.next(false));
$('#btn-mute').addEventListener('click', () => {
  const v = Number($('#master-vol').value);
  const muted = v > 0;
  if (muted) { state.lastVol = v; $('#master-vol').value = '0'; }
  else $('#master-vol').value = String(state.lastVol ?? 80);
  ui.syncEqLabels();
  $('#btn-mute').classList.toggle('on', muted);
  $('#btn-mute').textContent = muted ? 'MUTE' : 'VOL';
  ui.log.push(muted ? 'çıkış susturuldu' : 'çıkış açıldı');
  save();
});
$('#btn-shuffle2').addEventListener('click', () => toggleShuffle());
$('#btn-shuffle').addEventListener('click', () => toggleShuffle());
function toggleShuffle() {
  player.shuffle = !player.shuffle;
  $('#btn-shuffle2').classList.toggle('on', player.shuffle);
  $('#btn-shuffle').classList.toggle('on', player.shuffle);
  ui.log.push('shuffle: ' + (player.shuffle ? 'AÇIK' : 'KAPALI'));
}
const REPEAT_CYCLE = [
  { mode: 'off', label: 'REP', text: 'kapalı' },
  { mode: 'all', label: 'REP∀', text: 'tüm kuyruk' },
  { mode: 'one', label: 'REP1', text: 'tek parça' }
];
$('#btn-repeat').addEventListener('click', () => {
  const i = REPEAT_CYCLE.findIndex((r) => r.mode === player.repeat);
  const next = REPEAT_CYCLE[(i + 1) % REPEAT_CYCLE.length];
  player.repeat = next.mode;
  $('#btn-repeat').textContent = next.label;
  $('#btn-repeat').classList.toggle('on', next.mode !== 'off');
  ui.log.push('tekrar: ' + next.text);
});
$('#btn-clear').addEventListener('click', () => { playlist.clear(); ui.log.push('kuyruk temizlendi'); });
$('#btn-save').addEventListener('click', () => {
  const m3u = playlist.toM3U();
  const blob = new Blob([m3u], { type: 'audio/x-mpegurl' });
  const a = el('a', { href: URL.createObjectURL(blob), download: 'chiptune-console.m3u' });
  document.body.append(a);
  a.click();
  a.remove();
  ui.log.push(`playlist kaydedildi: chiptune-console.m3u (${playlist.items.length} öğe)`, 'ok');
});

// WAV export — rendered offline with the same WASM engines, so it works on
// every host, even where AudioWorklet is blocked (and it never disturbs what
// is playing right now).
$('#btn-save-wav').addEventListener('click', async () => {
  const item = playlist.current;
  if (!item || !item.bytes) { ui.log.push('önce bir parça yükle (FILE / URL / TEST)', 'warn'); return; }
  const t = (item.tracks || [])[player.trackIndex] || {};
  const optMs = ui.options.playLengthMs;
  let seconds = optMs > 0 ? optMs / 1000 : (t.length > 0 ? t.length / 1000 : 60);
  if (seconds > 600) { seconds = 600; ui.log.push('WAV çıktısı 10 dakikayla sınırlandı', 'warn'); }
  const fade = Math.min(ui.options.fadeMs / 1000, seconds / 4);
  const btn = $('#btn-save-wav');
  btn.disabled = true;
  btn.textContent = 'RENDER…';
  ui.log.push(`WAV: ${item.name} · ${fmtTime(seconds * 1000)} · ${fade ? fade + 's fade' : 'fade yok'} (offline render)`);
  try {
    let last = -1;
    const bytes = await renderWav({
      engineKey: item.engine,
      bytes: item.bytes,
      seconds,
      track: player.trackIndex,
      fadeSeconds: fade,
      onProgress: (p) => {
        const pct = Math.floor(p * 10) * 10;
        if (pct > last) { last = pct; ui.log.push(`  … %${pct} (${fmtTime(p * seconds * 1000)})`); }
      }
    });
    const name = (item.name || 'chiptune').replace(/\.[a-z0-9]+$/i, '') + '.wav';
    const a = el('a', { href: URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' })), download: name });
    document.body.append(a);
    a.click();
    a.remove();
    ui.log.push(`WAV hazır: ${name} · ${fmtBytes(bytes.length)} · 44.1 kHz / 16-bit stereo`, 'ok');
  } catch (e) {
    ui.log.push('WAV hatası: ' + (e.message || e), 'err');
  } finally {
    btn.disabled = false;
    btn.textContent = 'SAVE .WAV';
  }
});

// timeline
const seek = $('#seek');
seek.addEventListener('input', () => { seek.dataset.dragging = '1'; });
seek.addEventListener('change', async () => {
  delete seek.dataset.dragging;
  if (!player.totalMs) { ui.log.push('bu parça için uzunluk bilgisi yok — sarılamıyor', 'warn'); return; }
  const ms = (Number(seek.value) / 1000) * player.totalMs;
  await player.seek(ms);
  ui.log.push('konum: ' + fmtTime(ms));
});
(function timeline() {
  const box = $('#seek-ticks');
  for (let i = 0; i <= 20; i++) {
    const t = el('i');
    t.style.left = (i * 5) + '%';
    t.className = i % 5 === 0 ? 'major' : '';
    box.append(t);
  }
  // playhead + loop-point marker, both driven by player state
  const markers = $('#seek-markers');
  const pos = el('i', { class: 'pos' });
  const loop = el('i', { class: 'loop', title: 'loop noktası' });
  loop.hidden = true;
  markers.append(pos, loop);
  window.__timeline = { pos, loop };
})();

// master volume + EQ
$('#master-vol').addEventListener('input', () => { ui.syncEqLabels(); save(); });
['#eq-bass', '#eq-mid', '#eq-treble'].forEach((sel) => $(sel).addEventListener('input', () => { ui.syncEqLabels(); save(); }));
const _applyEqPreset = ui.applyEqPreset.bind(ui);
ui.applyEqPreset = (p) => { _applyEqPreset(p); save(); };
$('#opt-tempo').addEventListener('input', () => {
  const f = Number($('#opt-tempo').value);
  $('#opt-tempo-v').textContent = f.toFixed(2) + 'x';
  player.setTempo(f);
  save();
});

// playback options (worked out by ui.js, we just react)
let prevOpts = { ...ui.options };
ui.onOptionChange = (opts) => {
  save();
  const changed = ['playLengthMs', 'loopMode', 'fadeMs'].filter((k) => prevOpts[k] !== opts[k]);
  prevOpts = { ...opts };
  if (!changed.length) return;                       // EQ / volume changes arrive here too
  ui.log.push(`ayarlar: uzunluk=${opts.playLengthMs === 0 ? 'AUTO' : opts.playLengthMs === -1 ? '∞' : fmtTime(opts.playLengthMs)} · ` +
              `loop=${opts.loopMode} · fade=${opts.fadeMs / 1000}s`);
  if (player.state === 'PLAYING' && playlist.current) {
    const was = player.posMs;
    player.startTrack(player.trackIndex).then(() => {
      if (was > 1000) player.seek(was);
    });
  }
};
ui.onChannelChange = () => {};

// routing readout
function renderRouting(meta) {
  const box = $('#routing-chips');
  box.innerHTML = '';
  const chips = [];
  if (meta && meta.voices && meta.voices.length) chips.push(meta.voices.slice(0, 6).join(' · ') + (meta.voices.length > 6 ? ' …' : ''));
  chips.push('EQ (BASS/MID/TREBLE)');
  chips.push('LIMITER');
  chips.push('ANALYSER 4096 FFT');
  for (const c of chips) box.append(el('span', { class: 'chip', text: c }));
  if (engine.playMeta) {
    const mode = engine.playMeta.multichannel ? 'PER-VOICE MIXER' : 'STEREO BUS';
    const b = el('button', { class: 'btn tiny' + (engine.playMeta.multichannel ? ' on' : ''), text: mode, title: 'ses yolu modu' });
    b.addEventListener('click', async () => {
      ui.options.multichannel = !ui.options.multichannel;
      ui.log.push('ses yolu: ' + (ui.options.multichannel ? 'per-voice mixer (kanal gain/meter)' : 'stereo bus'));
      const cur = playlist.current;
      if (cur) { const was = player.posMs; await player.activate(cur, player.trackIndex); if (was > 1000) player.seek(was); }
      save();
    });
    box.append(b);
  }
}

// self test: proves the whole chain with a file generated in this repo
$('#btn-open-selftest').addEventListener('click', async () => {
  try {
    const vgm = Uint8Array.from(atob(DEMO_VGM_B64), (c) => c.charCodeAt(0));
    const mod = Uint8Array.from(atob(DEMO_MOD_B64), (c) => c.charCodeAt(0));
    ui.log.push('SELF TEST: bu depoda üretilmiş iki demo dosyası yükleniyor…', 'info');
    const a = addItem('demo-intro.vgm', vgm, 'gme', 'VGM', 'DEMO');
    addItem('demo-tracker.mod', mod, 'xmp', 'MOD', 'DEMO');
    await engine.init();
    await player.activate(a, 0);
    watchForSilence();
    setTimeout(() => {
      const m = engine.measure();
      if (m.peak > 0.002) ui.log.push(`SELF TEST OK — çıkış seviyesi ${fmtDb(m.peak)} dB (worklet + wasm + EQ zinciri çalışıyor)`, 'ok');
      else ui.log.push('SELF TEST: çıkış sessiz görünüyor — tarayıcı sekmesi arka planda ya da ses cihazı kapalı olabilir', 'warn');
    }, 2500);
  } catch (e) {
    ui.log.push('self test hatası: ' + (e.message || e), 'err');
  }
});

// keyboard
window.addEventListener('keydown', (e) => {
  const t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
  switch (e.key) {
    case ' ': e.preventDefault(); player.toggle(); break;
    case 'ArrowRight': player.seek(player.posMs + (e.shiftKey ? 30000 : 5000)); break;
    case 'ArrowLeft': player.seek(player.posMs - (e.shiftKey ? 30000 : 5000)); break;
    case 'ArrowUp': e.preventDefault(); adjustVol(+5); break;
    case 'ArrowDown': e.preventDefault(); adjustVol(-5); break;
    case 'n': $('#btn-next').click(); break;
    case 'p': $('#btn-prev').click(); break;
    case 's': $('#btn-stop').click(); break;
    case 'm': $('#btn-mute').click(); break;
    default: break;
  }
});
function adjustVol(d) {
  const v = clamp(Number($('#master-vol').value) + d, 0, 100);
  $('#master-vol').value = String(v);
  ui.syncEqLabels();
  ui.log.push('ses: ' + v + '%');
  save();
}

// first user gesture unlocks the AudioContext (browser autoplay policy)
const unlock = async () => {
  try { await engine.init(); } catch (e) { /* reported through engine events */ }
};
window.addEventListener('pointerdown', unlock, { once: true });
window.addEventListener('keydown', unlock, { once: true });

// ─────────────────────────────────────────────────────────────── diagnosis ──
let lastDiag = 0;

/** Full health check: prints a checklist into the player event log. */
async function runDiagnostics(lite = false) {
  const L = (m, lvl) => ui.log.push(m, lvl || 'info');
  L('╔══ TANI (teşhis) başladı ══', 'ok');

  // the check plays the demos, so remember what the user was listening to
  const resume = player.state === 'PLAYING' && playlist.current
    ? { item: playlist.current, track: player.trackIndex, pos: player.posMs }
    : null;

  // 1. sayfa / ortam
  L(`sayfa: ${location.origin}${location.pathname}${location.hash}`);
  L(`ortam: ${isSecureContext ? 'güvenli bağlam' : 'güvensiz bağlam'} · ` +
    `crossOriginIsolated=${typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated} · iframe=${window.top !== window.self}`);
  L(`tarayıcı: ${(navigator.userAgent || '').slice(0, 120)}`);

  // 2. içerik politikası / eval
  let evalOk = true;
  try { (0, eval)('1'); } catch (e) { evalOk = false; }
  L(`CSP eval: ${evalOk ? 'izni var' : 'YOK — uyumluluk motoru artık ES modül kullanıyor, sorun değil'}`);

  // 3. Web Audio / AudioWorklet
  const AC = window.AudioContext || window.webkitAudioContext;
  L(`Web Audio API: ${AC ? 'var' : 'YOK (tarayıcı çok eski)'}` +
    `${AC ? ' · AudioWorklet: ' + (('audioWorklet' in AC.prototype) ? 'var' : 'yok') : ''}`);

  // 4. motor dosyaları (gerçekten iniyor mu?)
  for (const f of ['wasm/gme.wasm', 'wasm/xmp.wasm', 'wasm/gme.compat.js', 'wasm/xmp.compat.js']) {
    try {
      const r = await fetch(f, { cache: 'no-store' });
      const b = await r.arrayBuffer();
      L(`  ${f}: HTTP ${r.status} · ${fmtBytes(b.byteLength)}`, r.ok ? 'info' : 'err');
    } catch (e) {
      L(`  ${f}: İNDİRİLEMEDİ (${e.message})`, 'err');
    }
  }

  // 5. ses bağlamı + seçilen yol
  try {
    const ctx = await engine.init();
    L(`AudioContext: ${ctx.state} · ${ctx.sampleRate} Hz · baseLatency ${(ctx.baseLatency * 1000).toFixed(1)} ms · ` +
      `çıkış kanalı ${ctx.destination.maxChannelCount} · zincir: ${engine.mode || '(henüz seçilmedi)'}` +
      `${engine.compat && engine.compat.loadRoute ? ' (' + engine.compat.loadRoute + ')' : ''}`);
    if (ctx.state !== 'running') {
      L('AudioContext ASKIDA — sayfaya bir kez tıkla (tarayıcı otomatik ses politikası).', 'warn');
    }
  } catch (e) {
    L('AudioContext kurulamadı: ' + (e.message || e), 'err');
  }

  // 6. gömülü demo çözülüyor mu
  const vgm = Uint8Array.from(atob(DEMO_VGM_B64), (c) => c.charCodeAt(0));
  const mod = Uint8Array.from(atob(DEMO_MOD_B64), (c) => c.charCodeAt(0));
  L(`gömülü demo: VGM ${fmtBytes(vgm.length)} · MOD ${fmtBytes(mod.length)} (ağ gerektirmez)`);

  if (lite) { L('╚══ TANI bitti (kısa) ══', 'ok'); return; }

  // 7. motorları gerçekten çalıştır: iki demo sırayla yüklenip 2'şer sn çalınır
  let loudest = 0;
  for (const [label, bytes, name] of [['libgme (VGM)', vgm, 'tani.vgm'], ['libxmp (MOD)', mod, 'tani.mod']]) {
    try {
      const t0 = performance.now();
      const res = await engine.load(bytes, name, name.endsWith('.vgm') ? 'gme' : 'xmp', { multichannel: true });
      L(`  ${label}: yüklendi — ${res.meta.system || '?'} · ${res.channels} kanal · ${(performance.now() - t0).toFixed(0)} ms`, 'ok');
      await engine.play(0, { playMs: 2000, loop: 'off', fadeMs: 0, master: 1 });
      await new Promise((r) => setTimeout(r, 1400));
      const m = engine.measure();
      loudest = Math.max(loudest, m.peak);
      L(`  ${label}: çıkış ölçümü peak=${fmtDb(m.peak)} dB rms=${fmtDb(m.rms)} dB ${m.peak > 0.002 ? '→ SES VAR' : '→ SESSİZ'}`, m.peak > 0.002 ? 'ok' : 'warn');
      await engine.stop();
    } catch (e) {
      L(`  ${label}: HATA — ${e.message || e}`, 'err');
    }
  }

  // 8. sonuç (ölçülen en yüksek seviyeye göre karar verilir)
  const silent = loudest <= 0.002;
  if (engine.mode === 'compat') {
    L('ses yolu: UYUMLULUK MODU (AudioWorklet bu ortamda yok/engelli). Ses yine de duyulmalı — duyulmuyorsa aşağıdaki listeye bak.', 'warn');
  } else if (engine.mode === 'worklet') {
    L('ses yolu: AudioWorklet (tercih edilen, düşük gecikme).', 'ok');
  }
  if (silent) {
    L('ÖLÇÜM SESSİZ — sırayla dene: 1) sayfaya bir kez tıkla 2) sekme sessiz olabilir: sekme simgesine sağ tık → Sesi aç ' +
      '3) sistem çıkışı açık mı 4) önizleme iframe’i sesi engelliyorsa ↗ ile yeni sekmede aç ' +
      '5) her durumda çalışan yol: SAVE .WAV ile indirip dinle.', 'warn');
  } else {
    L(`SONUÇ: zincir ÇALIŞIYOR (WASM + ses yolu + EQ/analyser, ölçülen tepe ${fmtDb(loudest)} dB).`, 'ok');
  }

  // hand playback back to whatever the user was listening to
  if (resume && playlist.current === resume.item) {
    try {
      await player.startTrack(resume.track);
      if (resume.pos > 1000) await player.seek(resume.pos);
      L('dinlediğin parça kaldığı yerden devam ediyor.', 'ok');
    } catch (e) { /* ignore */ }
  }
  L('╚══ TANI bitti ══', 'ok');
}

$('#btn-diag').addEventListener('click', () => {
  if (Date.now() - lastDiag < 5000) return;
  lastDiag = Date.now();
  runDiagnostics().catch((e) => ui.log.push('tanı hatası: ' + (e.message || e), 'err'));
});

/** If playback runs but the analyser stays silent, say exactly what to check. */
let silenceTimer = null;
function watchForSilence() {
  clearTimeout(silenceTimer);
  silenceTimer = setTimeout(async () => {
    if (player.state !== 'PLAYING') return;
    let loudest = 0;
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 200));
      const m = engine.measure();
      loudest = Math.max(loudest, m.peak);
    }
    if (player.state !== 'PLAYING' || loudest > 0.002) return;
    ui.log.push('SES DUYULMUYOR: çıkış 2 sn boyunca tamamen sessiz.', 'warn');
    ui.log.push('• sayfaya bir kez tıkla (tarayıcı otomatik ses politikası) · ' +
                '• sekmeyi susturmuş olabilirsin (sekme simgesi → Sesi aç) · ' +
                '• önizleme iframe’i sesi engelliyorsa ↗ ile yeni sekmede aç · ' +
                '• her durumda çalışır: SAVE .WAV ile indirip dinle · ' +
                '• ayrıntı için TANI düğmesi.', 'warn');
  }, 3000);
}

// ───────────────────────────────────────────────── first-run quick start ──
function showQuickStart(force) {
  if (document.getElementById('start-overlay')) return;
  let seen = false;
  try { seen = !!localStorage.getItem('chiptune-console.seen'); } catch (e) { /* private mode */ }
  if (seen && !force) return;
  const li = (n, s) => el('div', { class: 'start-row' }, [
    el('b', { text: n + ' ' }), el('span', { text: s })
  ]);
  const close = () => {
    box.remove();
    try { localStorage.setItem('chiptune-console.seen', '1'); } catch (e) { /* ignore */ }
  };
  const demo = el('button', { class: 'btn', id: 'start-demo', text: 'DEMOYU ÇAL (VGM + MOD)' });
  const open = el('button', { class: 'btn', id: 'start-open', text: 'KENDİ DOSYAMI AÇ' });
  const shut = el('button', { class: 'btn tiny', id: 'start-close', text: 'KAPAT' });
  const box = el('div', { id: 'start-overlay' }, [
    el('div', { class: 'start-card' }, [
      el('div', { class: 'start-title', text: 'CHIPTUNE CONSOLE — NASIL DENENİR' }),
      li('1)', 'DEMOYU ÇAL: bu depoda üretilmiş iki demo yüklenir, çalar ve ses yolunu kendisi test eder.'),
      li('2)', 'Kendi dosyanı bırak: NSF · NSFE · SPC · GBS · VGM · VGZ · GYM · HES · KSS · AY · SAP · MOD · XM · S3M · IT …'),
      li('3)', 'ZIP rip arşivi, .m3u listesi veya oyun ROM’u da pencereye bırakılabilir (ROM INSPECTOR yol gösterir).'),
      li('4)', 'Üstteki URL alanına doğrudan rip bağlantısı yapıştırabilirsin.'),
      li('5)', 'Önizlemede ses duyamıyorsan: ↗ ile yeni sekmede aç ya da SAVE .WAV ile indirip dinle.'),
      el('div', { class: 'start-actions' }, [demo, open, shut])
    ])
  ]);
  document.body.append(box);
  demo.addEventListener('click', () => { close(); $('#btn-open-selftest').click(); watchForSilence(); });
  open.addEventListener('click', () => { close(); $('#btn-open-file').click(); });
  shut.addEventListener('click', close);
}

showQuickStart(false);                    // first visit in this browser: explain how to try it
const helpBtn = $('#btn-help');           // optional: older cached HTML may not have it
if (helpBtn) helpBtn.addEventListener('click', () => showQuickStart(true));

// ─────────────────────────────────────────────────────────────── settings ──
const state = { lastVol: 80 };
function save() {
  try {
    localStorage.setItem(STORE, JSON.stringify({
      vol: Number($('#master-vol').value),
      bass: Number($('#eq-bass').value),
      mid: Number($('#eq-mid').value),
      treble: Number($('#eq-treble').value),
      tempo: Number($('#opt-tempo').value),
      playLengthMs: ui.options.playLengthMs,
      loopMode: ui.options.loopMode,
      fadeMs: ui.options.fadeMs,
      multichannel: ui.options.multichannel
    }));
  } catch (e) { /* private mode */ }
}
function load() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(STORE) || 'null'); } catch (e) { s = null; }
  if (!s) { ui.syncEqLabels(); return; }
  if (s.vol != null) $('#master-vol').value = String(s.vol);
  if (s.bass != null) $('#eq-bass').value = String(s.bass);
  if (s.mid != null) $('#eq-mid').value = String(s.mid);
  if (s.treble != null) $('#eq-treble').value = String(s.treble);
  if (s.tempo != null) { $('#opt-tempo').value = String(s.tempo); $('#opt-tempo-v').textContent = Number(s.tempo).toFixed(2) + 'x'; }
  if (s.playLengthMs != null) ui.markOption('playLengthMs', s.playLengthMs);
  if (s.loopMode != null) ui.markOption('loopMode', s.loopMode);
  if (s.fadeMs != null) ui.markOption('fadeMs', s.fadeMs);
  if (s.multichannel != null) ui.options.multichannel = s.multichannel;
  ui.syncEqLabels();
}

// ───────────────────────────────────────────────────────────────── boot ────
ui.log.push('CHIPTUNE CONSOLE v1.0 — game-music-emu 0.6.6 + libxmp 4.7.4 (WASM)', 'ok');
ui.log.push(`uygulama yüklendi: ${location.origin === 'null' ? location.href : location.origin} · ` +
  `WEB AUDIO + WASM hazır · rehber: YARDIM · tanı: TANI`, 'info');
ui.log.push('konsol ses formatları: NSF · NSFE · SPC · GBS · VGM · VGZ · GYM · HES · KSS · AY · SAP · SGC', 'info');
ui.log.push('tracker modülleri: MOD · XM · S3M · IT · 669 · MED · DBM · FAR · MTM · OKT · ULT ve daha fazlası', 'info');
ui.log.push('başlamak için dosya bırak, FILE/ZIP/ROM düğmelerini ya da URL alanını kullan', 'info');
ui.log.push('SELF TEST: dahili demo ile zinciri test et · TANI: tarayıcı/ses/motor teşhisi', 'info');
ui.log.push('ses duyulmuyorsa: ↗ ile yeni sekmede aç veya SAVE .WAV ile indir (bu sandbox önizlemesi susturulmuş olabilir)', 'warn');
ui.setSpectrumSub('FFT 4096 · LOG 30 Hz – 20 kHz');
ui.setScopeSub('2048 samples');
spectrum.buildLabels(engine.ctx ? engine.ctx.sampleRate / 2 : 22050);
$('#total-time').textContent = '--:--';

// last boot steps: a failure here must not stop an otherwise working console
try {
  load();
  renderRouting(null);
} catch (e) {
  ui.log.push('başlangıç uyarısı: ' + (e.message || e), 'warn');
}
