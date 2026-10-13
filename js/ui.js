// ui.js — every panel that is not the audio graph itself: log, track info,
// channel rows, EQ presets, option buttons, format list, ROM inspector output.
import { $, el, fmtTime, fmtBytes, fmtDb, clamp } from './util.js';
import { ENGINE_INFO, FORMAT_CHIPS } from './formats.js';
import { LedMeter } from './viz.js';

export const EQ_PRESETS = [
  { name: 'FLAT',    bass: 0,  mid: 0,  treble: 0  },
  { name: 'A500',    bass: 4,  mid: 1,  treble: -2 },
  { name: 'NES',     bass: 1,  mid: 4,  treble: 2  },
  { name: 'GAMEBOY', bass: -3, mid: 2,  treble: 3  },
  { name: 'C64',     bass: 3,  mid: 2,  treble: 0  },
  { name: 'ARCADE',  bass: 5,  mid: -2, treble: 4  },
  { name: 'ROCK',    bass: 5,  mid: -1, treble: 4  },
  { name: 'JAZZ',    bass: 3,  mid: 2,  treble: 2  },
  { name: 'VOCAL',   bass: -1, mid: 3,  treble: 1  },
  { name: 'LOUD',    bass: 8,  mid: -3, treble: 3  },
  { name: 'LOFI',    bass: -4, mid: -3, treble: -6 },
  { name: 'NIGHT',   bass: 2,  mid: -1, treble: -4 }
];

export class Log {
  constructor(bodyEl, countEl, max = 240) {
    this.body = bodyEl;
    this.countEl = countEl;
    this.max = max;
    this.n = 0;
  }
  push(msg, level = 'info') {
    const t = new Date().toLocaleTimeString('tr-TR', { hour12: false });
    const line = el('div', { class: 'log-line ' + (level === 'info' ? '' : level) }, [
      el('span', { class: 't', text: t + ' ' }),
      el('span', { text: msg })
    ]);
    this.body.append(line);
    while (this.body.children.length > this.max) this.body.firstChild.remove();
    this.body.scrollTop = this.body.scrollHeight;
    this.n++;
    this.countEl.textContent = '(' + this.n + ')';
  }
}

export class UI {
  constructor(engine) {
    this.engine = engine;
    this.log = new Log($('#log-body'), $('#log-count'));
    this.voiceRows = [];
    this.inputRows = [];
    this.soloCh = -1;
    this.muted = new Set();
    this.onChannelChange = null;
    this.onOptionChange = null;
    this.onPlayLength = null;
    this.onSeek = null;
    this.options = {
      playLengthMs: 0,            // 0 = auto (file length or 2:30)
      loopMode: 'off',            // off | one | all | infinite    (queue level)
      fadeMs: 4000,
      multichannel: true
    };
    this._buildStatic();
  }

  // ------------------------------------------------------------- static UI
  _buildStatic() {
    // EQ presets
    const box = $('#eq-presets');
    box.innerHTML = '';
    EQ_PRESETS.forEach((p) => {
      box.append(el('button', {
        class: 'btn tiny', text: p.name, 'data-eq': p.name,
        onclick: () => this.applyEqPreset(p)
      }));
    });

    // playback option buttons
    const mk = (host, list, key, fmt) => {
      const el0 = $(host);
      el0.innerHTML = '';
      list.forEach((o) => {
        const b = el('button', { class: 'btn tiny', text: o.label, 'data-v': String(o.v) });
        b.onclick = () => {
          this.options[key] = o.v;
          this._markActive(host, o.v);
          this.onOptionChange && this.onOptionChange(this.options);
          this.log.push(`${key} = ${o.label}`);
        };
        el0.append(b);
      });
      this._markActive(host, this.options[key]);
    };
    mk('#opt-playlength', [
      { label: 'AUTO', v: 0 }, { label: '30s', v: 30000 }, { label: '60s', v: 60000 },
      { label: '90s', v: 90000 }, { label: "2'30", v: 150000 }, { label: "5'00", v: 300000 },
      { label: '∞', v: -1 }
    ], 'playLengthMs');
    mk('#opt-loop', [
      { label: 'OFF', v: 'off' }, { label: 'ONE', v: 'one' }, { label: 'ALL', v: 'all' }, { label: '∞', v: 'infinite' }
    ], 'loopMode');
    mk('#opt-fade', [
      { label: '0s', v: 0 }, { label: '2s', v: 2000 }, { label: '4s', v: 4000 }, { label: '8s', v: 8000 }
    ], 'fadeMs');

    // formats panel
    const nb = $('#formats-body');
    const rows = [
      ['NES / Famicom', 'NSF · NSFE', '2A03 APU (+VRC6/N106/FME-7)'],
      ['Super Nintendo', 'SPC', 'S-SMP (SPC700) + S-DSP'],
      ['Game Boy', 'GBS', 'DMG APU (4 kanal)'],
      ['Mega Drive / Genesis', 'VGM · VGZ · GYM', 'YM2612 + SN76489 PSG'],
      ['Master System / GG', 'VGM · VGZ · SGC', 'SN76489'],
      ['PC Engine / TG-16', 'HES', 'HuC6280 + PSG'],
      ['MSX / Konami', 'KSS', 'AY-3-8910 + SCC'],
      ['ZX Spectrum / CPC', 'AY', 'AY-3-8912'],
      ['Atari XL / XE', 'SAP', 'POKEY'],
      ['Arcade / çoklu çip', 'VGM · VGZ', 'YM2151 · OKIM6295 · MSM5205 ...'],
      ['Amiga (tracker)', 'MOD · MED · DBM', 'Paula 4 kanal'],
      ['PC (tracker)', 'XM · S3M · IT · 669 · MTM · FAR · OKT · ULT ...', 'libxmp 4.7.4']
    ];
    rows.forEach(([sys, fmt, chip]) => nb.append(el('div', { class: 'fmt-line' }, [
      el('b', { text: sys + ' ' }), el('span', { text: fmt + ' — ' + chip })
    ])));
    $('#fmt-sub').textContent = '2 MOTOR · 11 KONSOL AİLESİ';

    // voice/input channel placeholders until a file is loaded
    this.buildChannels(8, ['V1', 'V2', 'V3', 'V4', 'V5', 'V6', 'V7', 'V8']);
  }

  _markActive(host, value) {
    const root = $(host);
    Array.from(root.children).forEach((b) => {
      b.classList.toggle('on', b.getAttribute('data-v') === String(value));
    });
  }

  markOption(key, value) {
    this.options[key] = value;
    if (key === 'playLengthMs') this._markActive('#opt-playlength', value);
    if (key === 'loopMode') this._markActive('#opt-loop', value);
    if (key === 'fadeMs') this._markActive('#opt-fade', value);
  }

  // ------------------------------------------------------------- channels
  buildChannels(count, names, multichannel = true) {
    count = clamp(count || 0, 1, 32);
    const vbox = $('#voice-list');
    const ibox = $('#input-channels');
    vbox.innerHTML = ''; ibox.innerHTML = '';
    this.voiceRows = []; this.inputRows = [];

    for (let i = 0; i < count; i++) {
      const nm = names[i] || ('V' + (i + 1));
      const wrap = el('div', { class: 'meter' });
      const row = el('div', { class: 'vrow', 'data-ch': i }, [
        el('span', { class: 'name', text: nm, title: nm }),
        wrap,
        el('span', { class: 'lvl', text: '0.0' })
      ]);
      const meter = new LedMeter(wrap);
      wrap.addEventListener('click', () => this.toggleChannel(i));
      wrap.addEventListener('dblclick', (e) => { e.preventDefault(); this.soloChannel(i); });
      vbox.append(row);
      this.voiceRows.push({ row, meter, name: nm, lvl: row.querySelector('.lvl') });
    }

    // compact "INPUT CHANNELS" rows for the right column
    const shown = Math.min(count, 8);
    for (let i = 0; i < shown; i++) {
      const blocks = el('div', { class: 'blocks' });
      const segs = [];
      for (let s = 0; s < 8; s++) { const b = el('i'); blocks.append(b); segs.push(b); }
      const row = el('div', { class: 'irow' }, [
        el('span', { class: 'ch', text: 'IN ' + (i + 1) }),
        blocks,
        el('span', { class: 'num', text: '+0.0' })
      ]);
      row.style.cursor = 'pointer';
      row.addEventListener('click', () => this.toggleChannel(i));
      ibox.append(row);
      this.inputRows.push({ row, segs, num: row.querySelector('.num') });
    }
    $('#inputs-sub').textContent = `${count} kanal${multichannel ? ' · per-voice' : ' · stereo bus'}`;
    $('#voices-sub').textContent = multichannel ? '(PER-VOICE)' : '(STEREO BUS)';
  }

  channelGain(i) { return this.muted.has(i) ? 0 : 1; }

  toggleChannel(i) {
    if (this.muted.has(i)) this.muted.delete(i); else this.muted.add(i);
    this.applyChannelState();
    this.log.push(`kanal ${i + 1} ${this.muted.has(i) ? 'MUTE' : 'UNMUTE'}`);
  }

  soloChannel(i) {
    const soloing = !(this.soloCh === i);
    this.soloCh = soloing ? i : -1;
    this.muted.clear();
    if (soloing) for (let c = 0; c < this.voiceRows.length; c++) if (c !== i) this.muted.add(c);
    this.applyChannelState();
    this.log.push(soloing ? `SOLO kanal ${i + 1}` : 'SOLO kapalı');
  }

  applyChannelState() {
    const n = this.voiceRows.length;
    for (let i = 0; i < n; i++) {
      const on = !this.muted.has(i);
      if (this.voiceRows[i]) this.voiceRows[i].row.classList.toggle('muted', !on);
      this.engine.setChannel(i, on ? 1 : 0);
      if (this.onChannelChange) this.onChannelChange(i, on ? 1 : 0);
    }
  }

  unmuteAll() {
    this.muted.clear(); this.soloCh = -1;
    this.applyChannelState();
  }

  // ------------------------------------------------------------- panels
  setTrackInfo(item) {
    const m = (item && item.meta) || {};
    const t = (item && item.tracks && item.tracks[item.trackIndex || 0]) || {};
    const set = (id, v) => { $(id).textContent = v || '—'; $(id).title = v || ''; };
    set('#ti-title', t.title || m.title);
    set('#ti-game', m.game || t.game);
    set('#ti-author', m.author || t.author);
    set('#ti-system', m.system || (item && item.system));
    set('#ti-copyright', m.copyright || t.copyright);
    set('#ti-dumper', m.dumper);
    set('#ti-comment', [m.comment, t.comment].filter(Boolean).join(' / '));
    $('#track-format').textContent = item ? `${item.kind} · ${ENGINE_INFO[item.engine].label}` : '—';
    $('#source-label').textContent = item ? item.kind : 'NONE';
    $('#engine-name').textContent = item ? ENGINE_INFO[item.engine].label : '—';
    $('#fx-engine').textContent = item ? item.engine : '—';
    $('#fx-format').textContent = item ? item.kind : '—';
    $('#fx-mode').textContent = m.multichannel ? 'per-voice mixer' : (item ? 'stereo bus' : '—');
    $('#fx-rate').textContent = this.engine.ctx ? (this.engine.ctx.sampleRate / 1000).toFixed(1) + ' kHz' : '—';
    $('#fx-latency').textContent = this.engine.ctx ? (this.engine.ctx.baseLatency * 1000).toFixed(1) + ' ms' : '—';
    if (m.tracker) $('#track-format').textContent = `${item.kind} · ${m.tracker} · ${m.channels}ch/${m.patterns}pat`;
  }

  setTracklist(item, onPick) {
    const box = $('#tracklist-body');
    box.innerHTML = '';
    const tracks = (item && item.tracks) || [];
    $('#tl-sub').textContent = tracks.length ? `${tracks.length} subtune` : '—';
    if (!tracks.length) {
      box.append(el('div', { class: 'empty', text: '— tek parça (subtrack yok) —' }));
      return;
    }
    tracks.forEach((t) => {
      const row = el('div', {
        class: 'tlitem' + (item.trackIndex === t.index ? ' active' : ''),
        onclick: () => onPick(t.index)
      }, [
        el('span', { class: 'n', text: String(t.index + 1).padStart(2, '0') }),
        el('span', { class: 't', text: t.title || ('subtrack ' + (t.index + 1)), title: t.title || '' }),
        el('span', { class: 'd', text: t.length > 0 ? fmtTime(t.length) : (t.loop ? 'loop' : '--:--') })
      ]);
      box.append(row);
    });
    const act = box.querySelector('.tlitem.active');
    if (act) act.scrollIntoView({ block: 'nearest' });
  }

  setRom(info, filename) {
    const panel = $('#panel-rom');
    const body = $('#rom-body');
    if (!info) { panel.hidden = true; return; }
    panel.hidden = false;
    $('#rom-sub').textContent = info.platform;
    body.innerHTML = '';
    body.append(el('div', { class: 'field' }, [
      el('span', { class: 'k', text: 'DOSYA' }), el('span', { class: 'v', text: filename })
    ]));
    for (const [k, v] of Object.entries(info.details || {})) {
      body.append(el('div', { class: 'field' }, [
        el('span', { class: 'k', text: k }), el('span', { class: 'v', text: String(v) })
      ]));
    }
    body.append(el('div', { class: 'note', text: info.system }));
    if (info.steps) {
      const ul = el('ul', { class: 'steps' });
      info.steps.forEach((s) => ul.append(el('li', { text: s })));
      body.append(ul);
    }
    this.log.push(`ROM incelendi: ${info.platform} (${info.system})`, 'warn');
  }

  setPlaybackStatus({ posMs, totalMs, state, pattern, row, bpm, speed, speedFactor, trackLabel }) {
    $('#pos-time').textContent = fmtTime(posMs);
    $('#total-time').textContent = totalMs ? fmtTime(totalMs) : '--:--';
    $('#pos-status').textContent = state;
    if (pattern != null) $('#np-pattern').textContent = `${pattern}/${row} · ${bpm} BPM · ${speed} spd`;
    if (trackLabel != null) $('#np-track').textContent = trackLabel;
    if (speedFactor != null) $('#np-levels').textContent = speedFactor.toFixed(2) + 'x';
  }

  setMeters(data) {
    const levels = data.levels || null;
    for (let i = 0; i < this.voiceRows.length; i++) {
      let v = 0;
      if (levels && levels[i] != null) v = levels[i];
      else if (this.voiceRows.length >= 2) v = (i === 0 ? data.peakL : i === 1 ? data.peakR : 0) || 0;
      const muted = this.muted.has(i);
      this.voiceRows[i].meter.set(muted ? 0 : v);
      this.voiceRows[i].lvl.textContent = (v * 100).toFixed(0).padStart(3, ' ');
      const ir = this.inputRows[i];
      if (ir) {
        const on = Math.round(clamp(v, 0, 1) * 8);
        ir.segs.forEach((s, k) => {
          s.className = muted ? '' : (k < on ? (k >= 7 ? 'hot' : 'on') : '');
        });
        const db = v > 0.001 ? 20 * Math.log10(v) : -Infinity;
        ir.num.textContent = (muted ? '--' : (isFinite(db) ? (db >= 0 ? '+' : '') + db.toFixed(1) : '-∞'));
      }
    }
    const led = $('#activity-led');
    const active = (data.peakL || 0) > 0.004 || (data.peakR || 0) > 0.004;
    led.classList.toggle('on', active);
  }

  setSpectrumSub(text) { $('#spec-sub').textContent = text; }
  setScopeSub(text) { $('#scope-sub').textContent = text; }

  applyEqPreset(p) {
    $('#eq-bass').value = p.bass; $('#eq-mid').value = p.mid; $('#eq-treble').value = p.treble;
    this.syncEqLabels();
    this.onOptionChange && this.onOptionChange(this.options);
    Array.from($('#eq-presets').children).forEach((b) => b.classList.toggle('on', b.getAttribute('data-eq') === p.name));
    this.log.push(`EQ preset: ${p.name} (B${p.bass >= 0 ? '+' : ''}${p.bass} M${p.mid >= 0 ? '+' : ''}${p.mid} T${p.treble >= 0 ? '+' : ''}${p.treble})`);
  }

  syncEqLabels() {
    const v = (id, key) => {
      const n = Number($(id).value);
      $(id + '-v').textContent = (key === 'x' ? n.toFixed(2) + 'x' : (n > 0 ? '+' : '') + n);
      return n;
    };
    const bass = v('#eq-bass'), mid = v('#eq-mid'), treble = v('#eq-treble');
    this.engine.setEq(bass, mid, treble);
    const vol = Number($('#master-vol').value);
    $('#master-vol-v').textContent = String(vol);
    this.engine._vol = vol / 100;
    this.engine.setMaster(vol / 100);
    return { bass, mid, treble, vol };
  }
}
