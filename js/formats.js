// formats.js — format tables + content sniffing (magic bytes, not just extensions).
// Everything the console accepts is routed to one of the two WASM engines:
//   gme -> game-music-emu  (console sound formats: NSF/SPC/GBS/VGM/GYM/HES/KSS/AY/SAP)
//   xmp -> libxmp          (tracker modules: MOD/XM/S3M/IT/669/MED/FAR/... )
// Files "ripped from ROMs" are exactly these formats, so the player eats them directly.

export const ENGINE_INFO = {
  gme: {
    label: 'game-music-emu 0.6.6',
    worklet: 'wasm/gme.worklet.js',
    processor: 'chiptune-gme',
    blurb: 'Konsol ses çipleri: NES/FC, SNES, Game Boy, Genesis/Mega Drive, Master System, ' +
           'Game Gear, PC Engine, MSX, ZX Spectrum, Atari XL/XE, arcade VGM.'
  },
  xmp: {
    label: 'libxmp 4.7.4',
    worklet: 'wasm/xmp.worklet.js',
    processor: 'chiptune-xmp',
    blurb: 'Tracker modülleri: Amiga (MOD/MED/DBM), PC (XM/S3M/IT/669/MTM/STM/FAR/OKT/ULT...).'
  }
};

// extension → hint (used when the magic bytes are inconclusive)
export const EXT_HINT = {
  nsf: 'gme', nsfe: 'gme', spc: 'gme', gbs: 'gme', vgm: 'gme', vgz: 'gme', gym: 'gme',
  hes: 'gme', kss: 'gme', ay: 'gme', sap: 'gme', sgc: 'gme',
  mod: 'xmp', xm: 'xmp', s3m: 'xmp', it: 'xmp', itz: 'xmp', '669': 'xmp', med: 'xmp',
  dbm: 'xmp', far: 'xmp', mtm: 'xmp', stm: 'xmp', okt: 'xmp', ult: 'xmp', mdz: 'xmp',
  'mdl': 'xmp', 's3z': 'xmp', 'xmz': 'xmp', amf: 'xmp', ams: 'xmp', c67: 'xmp', dtm: 'xmp',
  fnk: 'xmp', gdm: 'xmp', hmn: 'xmp', imf: 'xmp', j2b: 'xmp', liq: 'xmp', m15: 'xmp',
  mmd1: 'xmp', mmd3: 'xmp', mtm2: 'xmp', psm: 'xmp', ptm: 'xmp', rtm: 'xmp', stx: 'xmp',
  wow: 'xmp', dsym: 'xmp', mfp: 'xmp', pw: 'xmp', mms: 'xmp', di: 'xmp', umx: 'xmp',
  abk: 'xmp', arch: 'xmp', eureka: 'xmp', krw: 'xmp', lap: 'xmp', p64: 'xmp', sbp: 'xmp',
  titanics: 'xmp', hsc: 'xmp', ast: 'xmp', mp: 'xmp', smp: 'xmp', sfx: 'xmp', tcb: 'xmp'
};

// what physical chip/system each format emulates (shown in the UI)
export const FORMAT_CHIPS = {
  NSF: 'NES APU (2A03) + VRC6/N106/FME-7',
  NSFE: 'NES APU + extended NSF metadata',
  SPC: 'SNES S-SMP (SPC700) + S-DSP',
  GBS: 'Game Boy DMG (LR35902 + APU)',
  VGM: 'Sega PSG / YM2612 / YM2151 / MSM6295 / ...',
  VGZ: 'VGM (gzip)',
  GYM: 'Sega Mega Drive YM2612 + PSG',
  HES: 'PC Engine HuC6280 + PSG',
  KSS: 'MSX / Konami SCC · AY-3-8910',
  AY: 'ZX Spectrum / Amstrad AY-3-8912',
  SAP: 'Atari XL/XE POKEY',
  SGC: 'Sega Master System / Game Gear (SN76489)',
  MOD: 'Amiga Paula (4ch)',
  XM: 'PC tracker (FastTracker II)',
  S3M: 'PC tracker (Scream Tracker 3)',
  IT: 'PC tracker (Impulse Tracker)'
};

// ------------------------------------------------------------------ sniffing
const ascii = (bytes, off, len) => {
  let s = '';
  for (let i = 0; i < len; i++) s += String.fromCharCode(bytes[off + i] || 0);
  return s;
};
const has = (bytes, str, off = 0) => ascii(bytes, off, str.length) === str;

/**
 * Identify a music file from its bytes.
 * @returns {{engine:string, kind:string, system:string, chip:string, conf:string}|null}
 */
export function sniff(bytes, name = '') {
  const b = bytes, n = bytes.length;
  if (n < 16) return null;
  const ext = (name.split('.').pop() || '').toLowerCase();

  const mk = (engine, kind, system, conf = 'magic') => ({
    engine, kind, system, conf, chip: FORMAT_CHIPS[kind] || ''
  });

  // ---- console sound formats (game-music-emu) ----
  if (has(b, 'NESM', 0) && b[4] === 0x1a) return mk('gme', 'NSF', 'Nintendo NES / Famicom');
  if (has(b, 'NSFE', 0)) return mk('gme', 'NSFE', 'Nintendo NES / Famicom');
  if (has(b, 'SNES-SPC700 Sound File Data', 0)) return mk('gme', 'SPC', 'Super Nintendo (S-SMP)');
  if (has(b, 'GBS', 0)) return mk('gme', 'GBS', 'Nintendo Game Boy');
  if (has(b, 'Vgm ', 0)) {
    const ver = ((b[8] << 24) | (b[9] << 16) | (b[10] << 8) | b[11]) >>> 0;
    return mk('gme', 'VGM', 'Sega / arcade VGM log', 'magic v' + ((ver >> 8) & 0xff) + '.' + (ver & 0xff));
  }
  if (b[0] === 0x1f && b[1] === 0x8b) return mk('gme', 'VGZ', 'VGM (gzip konteyner)');
  if (has(b, 'GYMX', 0)) return mk('gme', 'GYM', 'Sega Mega Drive / Genesis');
  if (has(b, 'HESM', 0)) return mk('gme', 'HES', 'NEC PC Engine / TurboGrafx-16');
  if (has(b, 'KSSX', 0)) return mk('gme', 'KSS', 'MSX / Konami SCC');
  if (has(b, 'ZXAYEMUL', 0)) return mk('gme', 'AY', 'ZX Spectrum / Amstrad CPC');
  if (has(b, 'SAP\r', 0)) return mk('gme', 'SAP', 'Atari XL / XE (POKEY)');
  if (has(b, 'SGC', 0)) return mk('gme', 'SGC', 'Sega Master System / Game Gear');

  // ---- tracker modules (libxmp) ----
  if (has(b, 'Extended Module: ', 0)) return mk('xmp', 'XM', 'PC Tracker (FastTracker 2)');
  if (has(b, 'IMPM', 0)) return mk('xmp', 'IT', 'PC Tracker (Impulse Tracker)');
  if (has(b, 'SCRM', 44)) return mk('xmp', 'S3M', 'PC Tracker (Scream Tracker 3)');
  if (has(b, 'if', 0) || has(b, 'JN', 1080)) return mk('xmp', '669', 'Composer 669');
  if (has(b, 'MMD0') || has(b, 'MMD1') || has(b, 'MMD2') || has(b, 'MMD3')) return mk('xmp', 'MED', 'Amiga OctaMED');
  if (has(b, 'DBM0')) return mk('xmp', 'DBM', 'Amiga DigiBooster Pro');
  if (has(b, 'FAR\xfe')) return mk('xmp', 'FAR', 'Farandole Composer');
  if (has(b, 'MTM', 0)) return mk('xmp', 'MTM', 'MultiTracker');
  if (has(b, '!Scream!', 0)) return mk('xmp', 'STM', 'Scream Tracker 2');
  if (has(b, 'OKTASONG', 0)) return mk('xmp', 'OKT', 'Amiga Oktalyzer');
  if (has(b, 'MAS_UTrack', 0)) return mk('xmp', 'ULT', 'UltraTracker');
  if (has(b, 'DSMF', 0)) return mk('xmp', 'DSYM', 'Digital Symphony');
  if (has(b, 'Amiga MOD', 0)) return mk('xmp', 'MOD', 'Amiga ProTracker');

  // classic 31-instrument MOD signature at 1080
  const modSig = ascii(b, 1080, 4);
  if (/^(M\.K\.|M!K!|M&K!|N\.T\.|FLT4|FLT8|FLT[0-9]|4CHN|6CHN|8CHN|2CHN|CD81|OCTA|OKTA|TDZ[0-9]|FA0[0-9]|EXO[0-9]|\d\dCH|\d\dCN)/.test(modSig)) {
    return mk('xmp', 'MOD', 'Amiga ProTracker / klonu', 'sig ' + modSig.trim());
  }
  // heuristics: MOD files have no proper magic — check the sample area layout
  if (['mod', 'xm', 'it', 's3m', 'med', 'dbm'].includes(ext) && EXT_HINT[ext]) {
    // last fallback: trust the extension, libxmp will validate
    const kind = ext.toUpperCase();
    return mk(EXT_HINT[ext], kind, kind === 'MOD' ? 'Amiga (muhtemel)' : 'Tracker', 'extension');
  }
  if (EXT_HINT[ext]) return mk(EXT_HINT[ext], ext.toUpperCase(), 'Tracker / konsol ses dosyası', 'extension');
  return null;
}

export function isZip(bytes) {
  return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b &&
    (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07);
}

export function isGzip(bytes) {
  return bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}

export function isPlaylist(bytes, name) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  if (ext === 'm3u' || ext === 'm3u8') return true;
  const head = ascii(bytes, 0, 16).trim();
  return /^#EXTM3U/i.test(head);
}

// ------------------------------------------------------- ROM (game image) ID
// Console *game* ROMs (not the extracted music). Used by the ROM INSPECTOR,
// which explains what the file is and how to get playable music out of it.
export function detectRom(bytes, name = '') {
  const b = bytes, n = bytes.length, ext = (name.split('.').pop() || '').toLowerCase();
  const r = (platform, system, details, steps) => ({ platform, system, details, steps });

  if (has(b, 'NESM', 0) && b[4] === 0x1a) return null; // that is an NSF, not a ROM

  if (b[0] === 0x4e && b[1] === 0x45 && b[2] === 0x53 && b[3] === 0x1a) {
    const prg = b[4] * 16, chr = b[5] * 8;
    const mapper = (b[6] >> 4) | (b[7] & 0xf0);
    return r('NES / Famicom', 'Nintendo Entertainment System', {
      'HEADER': 'iNES',
      'FORMAT': 'PRG ' + prg + ' KB · CHR ' + chr + ' KB',
      'MAPPER': '#' + mapper,
      'MIRRORING': (b[6] & 8) ? 'four-screen' : (b[6] & 1 ? 'vertical' : 'horizontal'),
      'BATTERY': (b[6] & 2) ? 'yes' : 'no',
      'SIZE': (n / 1024).toFixed(0) + ' KB'
    }, [
      'Oyun ROM’u = oynanabilir program; müzik ayrı bir ses dosyası olarak gömülüdür.',
      'NSF’e çevirmek gerekir: 6502 kodunun müzik rutinlerini (INIT/PLAY) bulup NSF başlığına yazmak gerekir.',
      'Pratik yol: hazır NSF rip’i indir (Zophar/DOMO/VGMRips arşivleri) ve buraya bırak — NSF doğrudan çalar.',
      'Alternatif: emülatörde ROM’u açıp kayıt/log al (VGM ya da WAV) → VGM’i bu konsol doğrudan oynatır.'
    ]);
  }

  // Game Boy / Game Boy Color: Nintendo logo at 0x104, title at 0x134
  const gbLogo = [0xce, 0xed, 0x66, 0x66, 0xcc, 0x0d, 0x00, 0x0b, 0x03, 0x73, 0x00, 0x83, 0x00, 0x0c, 0x00, 0x0d];
  if (gbLogo.every((v, i) => b[0x104 + i] === v)) {
    const title = ascii(b, 0x134, 16).replace(/\0.*$/, '');
    const cgb = b[0x143];
    return r('Game Boy', 'Nintendo DMG / CGB', {
      'TITLE': title || '(yok)',
      'MODEL': cgb === 0x80 ? 'Game Boy Color (CGB)' : cgb === 0xc0 ? 'GBC only' : 'Game Boy (DMG)',
      'CART TYPE': '0x' + (b[0x147] || 0).toString(16).padStart(2, '0'),
      'ROM SIZE': (32 << (b[0x148] || 0)) + ' KB',
      'SIZE': (n / 1024).toFixed(0) + ' KB'
    }, [
      'GB müziği GBS formatına rip edilir (başlık + ses rutinleri).',
      'Hazır GBS rip’i indirip buraya bırakabilirsin; GBS doğrudan çalar.',
      'Alternatif: emülatörde kayıt al → VGM’e çevir → buraya bırak.'
    ]);
  }

  // Game Boy Advance: logo at 0x04
  const gbaLogo = [0x24, 0xff, 0xae, 0x51, 0x69, 0x9a, 0xa2, 0x21];
  if (gbaLogo.every((v, i) => b[4 + i] === v)) {
    return r('Game Boy Advance', 'Nintendo AGB', {
      'TITLE': ascii(b, 0xa0, 12).replace(/\0.*$/, '') || '(yok)',
      'GAME CODE': ascii(b, 0xac, 4),
      'SIZE': (n / 1024).toFixed(0) + ' KB'
    }, [
      'GBA müziği MP2K (Sappy) motoruyla çalar; şarkı verisi ROM içinde tablolardadır.',
      'Pratik yol: hazır GBA rip’i (GBS/“soundfont rips”) ya da emülatörde kayıt → WAV/VGM.',
      'Bu konsol GBS/VGM/SPC gibi ses formatlarını doğrudan oynatır.'
    ]);
  }

  // SNES: title + checksum at 0x7FC0 (LoROM) or 0xFFC0 (HiROM)
  for (const base of [0x7fc0, 0xffc0]) {
    if (n > base + 64) {
      const txt = ascii(b, base, 21);
      const printable = txt.split('').filter((c) => c >= ' ' && c < 0x7f).length;
      if (printable >= 15 && txt.trim().length >= 3) {
        const csum = b[base + 0x1e] | (b[base + 0x1f] << 8);
        const comp = b[base + 0x1c] | (b[base + 0x1d] << 8);
        return r('Super Nintendo', 'SNES / Super Famicom', {
          'TITLE': txt.trim(),
          'HEADER': base === 0x7fc0 ? 'LoROM (@0x7FC0)' : 'HiROM (@0xFFC0)',
          'MAP MODE': '0x' + (b[base + 0x15] || 0).toString(16),
          'CHECKSUM': '0x' + csum.toString(16).padStart(4, '0') + (csum === (comp ^ 0xffff) ? ' ✓' : ' ✗'),
          'SIZE': (n / 1024).toFixed(0) + ' KB'
        }, [
          'SNES müziği SPC dosyası olarak çıkarılır (64 KB APU RAM dump’ı).',
          'Emülatörde oyunu açıp “Save SPC/Dump SPC” yap (Snes9x: File ▶ Save SPC Data).',
          'Çıkan .spc dosyasını buraya bırak — S-SMP ses çipi birebir çalar.'
        ]);
      }
    }
  }

  // Mega Drive / Genesis: "SEGA" at 0x100, system name at 0x120
  if (has(b, 'SEGA', 0x100) || has(b, 'SEGA', 0x180)) {
    return r('Mega Drive / Genesis', 'Sega 16-bit', {
      'SYSTEM': ascii(b, 0x120, 16).replace(/\0.*$/, '').trim(),
      'REGION': ascii(b, 0x1f0, 3),
      'SIZE': (n / 1024).toFixed(0) + ' KB',
      'DETECT': has(b, 'SEGA', 0x100) ? '@0x100' : '@0x180'
    }, [
      'Mega Drive müziği YM2612 (+SN76489) ile çalar; log’u GYM ya da VGM olarak alınır.',
      'Emülatörde VGM log kaydı aç (Fusion/Genesis Plus GX/Kega Fusion: “VGM logging”), oyunun ses menüsünde çal.',
      'Oluşan .vgm / .vgz dosyasını buraya bırak — konsol doğrudan oynatır.'
    ]);
  }

  // Master System / Game Gear
  if (has(b, 'TMR SEGA', 0x7ff0)) {
    return r('Master System / Game Gear', 'Sega 8-bit', {
      'HEADER': 'TMR SEGA @0x7FF0',
      'CHECKSUM': '0x' + ((b[0x7ffa] | (b[0x7ffb] << 8)) & 0xffff).toString(16),
      'SIZE': (n / 1024).toFixed(0) + ' KB'
    }, [
      'Ses çipi SN76489 PSG. VGM log ile birebir saklanabilir.',
      'Emülatörde VGM kaydı al → .vgm/.vgz dosyasını buraya bırak.'
    ]);
  }

  // N64
  const n64 = [[0x80, 0x37, 0x12, 0x40, 'z64 (big endian)'], [0x37, 0x80, 0x40, 0x12, 'v64 (byteswapped)'], [0x40, 0x12, 0x37, 0x80, 'n64 (little endian)']]
    .find((m) => m.slice(0, 4).every((v, i) => b[i] === v));
  if (n64) {
    return r('Nintendo 64', 'N64', { 'BYTE ORDER': n64[4], 'SIZE': (n / 1048576).toFixed(1) + ' MB' }, [
      'N64 müziği USF/miniUSF olarak rip edilir (RSP-bank tabanlı).',
      'Emülatör kaydı alıp WAV/VGM’e çevirmek de mümkündür.',
      'Bu konsol USF’i çalıştırmaz; NSF/SPC/GBS/VGM/MOD ailelerini çalar.'
    ]);
  }

  if (ext === 'a26') return r('Atari 2600', 'Atari VCS', { 'SIZE': (n / 1024).toFixed(0) + ' KB' }, [
    'Ses çipi: TIA (2 kanal). Müzik log’u VGM olarak alınabilir.'
  ]);

  return null;
}

export const ACCEPT_HINT = 'nsf nsfe spc gbs vgm vgz gym hes kss ay sap sgc mod xm s3m it 669 med dbm far mtm stm okt ult zip gz m3u';

/** extensions that are real chiptune/tracker music (what a ZIP is scanned for) */
export const MUSIC_EXT = new Set([
  ...'nsf nsfe spc gbs vgm vgz gym hes kss ay sap sgc'.split(' '),
  ...'mod xm s3m it itz mdz s3z xmz 669 med dbm far mtm stm okt ult amf ams c67 dtm fnk gdm hmn imf j2b liq m15 mmd1 mmd3 mtm2 psm ptm rtm stx wow dsym mfp mms umx'.split(' ')
]);

/**
 * Scans a byte array (such as a ROM or container file) for embedded chiptune
 * headers (NSF, SPC, GBS, VGM, GYM, HES, KSS, XM, IT, S3M, MOD).
 * Returns { offset, bytes, info } or null if no embedded chiptune was found.
 */
export function scanEmbedded(bytes) {
  if (!bytes || bytes.length < 32) return null;
  const b = bytes;
  const len = b.length;

  // Search signatures
  const sigs = [
    { sig: [0x4e, 0x45, 0x53, 0x4d, 0x1a], kind: 'NSF' },          // NESM\x1a
    { sig: [0x4e, 0x53, 0x46, 0x45], kind: 'NSFE' },               // NSFE
    { sig: [0x53, 0x4e, 0x45, 0x53, 0x2d, 0x53, 0x50, 0x43, 0x37, 0x30, 0x30], kind: 'SPC' }, // SNES-SPC700
    { sig: [0x47, 0x42, 0x53, 0x01], kind: 'GBS' },                // GBS\x01
    { sig: [0x56, 0x67, 0x6d, 0x20], kind: 'VGM' },                // Vgm
    { sig: [0x47, 0x59, 0x4d, 0x58], kind: 'GYM' },                // GYMX
    { sig: [0x48, 0x45, 0x53, 0x4d], kind: 'HES' },                // HESM
    { sig: [0x4b, 0x53, 0x53, 0x58], kind: 'KSS' },                // KSSX
    { sig: [0x45, 0x78, 0x74, 0x65, 0x6e, 0x64, 0x65, 0x64, 0x20, 0x4d, 0x6f, 0x64, 0x75, 0x6c, 0x65, 0x3a, 0x20], kind: 'XM' }, // Extended Module:
    { sig: [0x49, 0x4d, 0x50, 0x4d], kind: 'IT' }                  // IMPM
  ];

  for (const item of sigs) {
    const s = item.sig;
    const sLen = s.length;
    for (let i = 1; i <= len - sLen; i++) {
      let match = true;
      for (let k = 0; k < sLen; k++) {
        if (b[i + k] !== s[k]) { match = false; break; }
      }
      if (match) {
        const sub = b.subarray(i);
        const info = sniff(sub, 'embedded.' + item.kind.toLowerCase());
        if (info) return { offset: i, bytes: sub, info };
      }
    }
  }

  // Check for S3M (SCRM at offset +44)
  for (let i = 1; i <= len - 48; i++) {
    if (b[i + 44] === 0x53 && b[i + 45] === 0x43 && b[i + 46] === 0x52 && b[i + 47] === 0x4d) {
      const sub = b.subarray(i);
      const info = sniff(sub, 'embedded.s3m');
      if (info) return { offset: i, bytes: sub, info };
    }
  }

  // Check for classic MOD signatures at offset +1080
  const modRegex = /^(M\.K\.|M!K!|M&K!|N\.T\.|FLT4|FLT8|4CHN|6CHN|8CHN|2CHN|CD81|OCTA|OKTA|\d\dCH|\d\dCN)/;
  for (let i = 1; i <= len - 1084; i++) {
    if (b[i + 1080] === 0x4d && (b[i + 1081] === 0x2e || b[i + 1081] === 0x21 || b[i + 1081] === 0x26)) {
      const sig = ascii(b, i + 1080, 4);
      if (modRegex.test(sig)) {
        const sub = b.subarray(i);
        const info = sniff(sub, 'embedded.mod');
        if (info) return { offset: i, bytes: sub, info };
      }
    }
  }

  return null;
}
