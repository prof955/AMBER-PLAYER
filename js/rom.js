// rom.js — ROM INSPECTOR.
//
// A game ROM is a program image, not a music file: the music lives inside the
// game's own sound code and sample tables. This module identifies the platform
// from the real header bytes and then tells the user, honestly, which tool path
// turns *that* ROM into a chiptune file the console can play. Nothing here
// pretends to extract audio that is not there.
import { u8, str } from './util.js';

const NES_LOGO = 'NES\x1a';
const GB_LOGO = [0xce, 0xed, 0x66, 0x66, 0xcc, 0x0d, 0x00, 0x0b, 0x03, 0x73, 0x00, 0x83, 0x00, 0x0c, 0x00, 0x0d];
const GBA_LOGO = [0x24, 0xff, 0xae, 0x51, 0x69, 0x9a, 0xa2, 0x21, 0x3d, 0x84, 0x82, 0x0a];
const N64_MAGIC = [[0x80, 0x37, 0x12, 0x40, 'z64 (big endian)'], [0x37, 0x80, 0x40, 0x12, 'v64 (byteswapped)'],
                   [0x40, 0x12, 0x37, 0x80, 'n64 (little endian)']];

const GEN_SYSTEMS = {
  0x00: 'Sega Master System', 0x01: 'Sega Master System', 0x02: 'Sega Master System',
  0x03: 'Sega Game Gear', 0x04: 'Sega Game Gear', 0x05: 'Sega Game Gear'
};

const romHex = (b) => '0x' + b.toString(16).toUpperCase().padStart(2, '0');

/**
 * @returns {null|{platform, system, fields:[[k,v]], notes:string[], path:string[]}}
 */
export function inspectRom(bytes, name = '') {
  const ext = (name.split('.').pop() || '').toLowerCase();

  // ── NES / Famicom (iNES / NES 2.0) ────────────────────────────────────
  if (str(bytes, 0, 4) === NES_LOGO) {
    const prg = bytes[4] * 16, chr = bytes[5] * 8;
    const mapper = (bytes[7] & 0xf0) | (bytes[6] >> 4);
    const nes2 = (bytes[7] & 0x0c) === 0x08;
    return {
      platform: 'NES / Famicom',
      system: 'Nintendo Entertainment System',
      fields: [
        ['HEADER', nes2 ? 'iNES (NES 2.0)' : 'iNES 1.0'],
        ['PRG ROM', prg + ' KB'],
        ['CHR ROM', chr ? chr + ' KB' : 'CHR RAM'],
        ['MAPPER', '#' + mapper],
        ['MIRRORING', (bytes[6] & 8) ? 'four-screen' : (bytes[6] & 1 ? 'vertical' : 'horizontal')],
        ['BATTERY', (bytes[6] & 2) ? 'var' : 'yok'],
        ['SIZE', (bytes.length / 1024).toFixed(0) + ' KB']
      ],
      notes: [
        'NSF çıkarmak için 6502 kodundaki müzik rutinlerini (başlatma + kare başına çağrı) bulmak ve NSF başlığına yazmak gerekir — ROM bu bilgiyi işaretlemez.',
        'Hazır NSF/NSFE dosyalarını buraya bırakabilirsin: bu konsol NSF\'i doğrudan çalar ve tüm subtune\'ları listeler.'
      ],
      path: [
        'ROM → NSF: müzik rutinlerinin adreslerini bulan bir ripper gerekir (NSFImport + NES emülatör debugger, veya hazır rip arşivleri).',
        'Alternatif: emülatörde "sound test" / kayıt ile WAV al, sonra VGM loglayan bir emülatörle VGM üret.',
        'Amacın oyunun müziğini dinlemekse en hızlı yol: NSF/NSFE rip dosyasını indirip bu konsola bırakmak.'
      ]
    };
  }

  // ── Game Boy / Game Boy Color ─────────────────────────────────────────
  if (GB_LOGO.every((v, i) => bytes[0x104 + i] === v)) {
    const title = str(bytes, 0x134, 16).replace(/\0.*$/, '');
    const cgb = bytes[0x143];
    return {
      platform: 'Game Boy',
      system: cgb === 0xC0 ? 'Game Boy Color (CGB only)' : cgb === 0x80 ? 'Game Boy Color' : 'Game Boy (DMG)',
      fields: [
        ['TITLE', title || '(yok)'],
        ['CART TYPE', romHex(bytes[0x147])],
        ['ROM SIZE', (32 << bytes[0x148]) + ' KB'],
        ['SGB', (bytes[0x146] === 0x03) ? 'evet' : 'hayır'],
        ['SIZE', (bytes.length / 1024).toFixed(0) + ' KB']
      ],
      notes: [
        'GB ses motoru ROM kodunun içinde: 4 kanal (2 square + wave + noise) rutinleri oyunun kendi kodu.',
        'GBS çıkarmak için ses motorunun init/play rutin adresleri gerekir (hazır GBS rip\'leri bu işi yapmış olur).'
      ],
      path: [
        'GB → GBS: gbs ripper araçları veya hazır GBS arşivleri (konsol GBS\'i doğrudan çalar).',
        'Emülatörde müzik kaydet → WAV; istersen VGM loglayan emülatör kullan.'
      ]
    };
  }

  // ── GBA ───────────────────────────────────────────────────────────────
  if (GBA_LOGO.every((v, i) => bytes[4 + i] === v)) {
    return {
      platform: 'Game Boy Advance',
      system: 'Nintendo GBA (ARM7 + Sound PWM)',
      fields: [['TITLE', str(bytes, 0xA0, 12).replace(/\0.*$/, '') || '(yok)'],
               ['GAME CODE', str(bytes, 0xAC, 4)],
               ['SIZE', (bytes.length / 1048576).toFixed(1) + ' MB']],
      notes: ['GBA müziği oyunun ARM kodunda + örnek bankalarında; GSF rip\'i ayrı bir çalışma gerektirir.',
              'Bu konsol GSF çalıştırmaz (libgme GBA sesini emüle etmez).'],
      path: ['GBA → GSF (ek alet zinciri) veya emülatörde müzik kaydı (WAV).',
             'Basit yol: oyunun müziğinin VGM/WAV kaydını dinle.']
    };
  }

  // ── SNES (LoROM / HiROM heuristics) ───────────────────────────────────
  for (const base of [0x7FC0, 0xFFC0]) {
    if (bytes.length > base + 32) {
      const title = str(bytes, base, 21).replace(/\0.*$/, '').trim();
      const mapMode = bytes[base + 0x15];
      const romSizeKb = 1 << bytes[base + 0x17];
      const country = bytes[base + 0x19];
      const okMap = mapMode <= 0x0F;
      const okSize = bytes[base + 0x17] >= 0x05 && bytes[base + 0x17] <= 0x0D;
      const okCountry = country <= 0x0E;
      if (title.length >= 3 && okMap && okSize && okCountry) {
        return {
          platform: 'Super Nintendo',
          system: 'SNES / Super Famicom (S-SMP + S-DSP)',
          fields: [
            ['HEADER', base === 0x7FC0 ? 'LoROM' : 'HiROM (veya ikinci yarı)'],
            ['TITLE', title || '(yok)'],
            ['ROM SIZE', romSizeKb + ' KB'],
            ['MAP MODE', romHex(mapMode)],
            ['SIZE', (bytes.length / 1024).toFixed(0) + ' KB']
          ],
          notes: [
            'SNES müziği S-SMP co-processor\'ının kendi hafızasında çalar; SPC dump = o çipin 64 KB RAM + DSP register anlık görüntüsü.',
            'Yani ROM\'dan ses çıkarmak yerine emülatörden "SPC kaydet" yapmak en doğru yoldur.'
          ],
          path: [
            'SNES → SPC: emülatörde (Snes9x, bsnes, Mesen-S) müzik çalarken "SPC dump/kaydet" → .spc (konsol çalar, subtune ve loop bilgisi dahil).',
            'Alternatif: hazır SPC rip arşivlerini bırak (SNESmusic.org gibi).'
          ]
        };
      }
    }
  }

  // ── Mega Drive / Genesis ──────────────────────────────────────────────
  if (str(bytes, 0x100, 4) === 'SEGA') {
    const cons = str(bytes, 0x120, 16).trim();
    const region = str(bytes, 0x1F0, 3);
    return {
      platform: 'Mega Drive / Genesis',
      system: 'Sega Mega Drive / Genesis (YM2612 + SN76489)',
      fields: [
        ['DOMESTIC NAME', str(bytes, 0x150, 48).replace(/\0.*$/, '').trim() || '(yok)'],
        ['CONSOLE', cons || '(yok)'],
        ['REGION', region || '(yok)'],
        ['SIZE', (bytes.length / 1048576).toFixed(2) + ' MB']
      ],
      notes: [
        'Mega Drive müziği YM2612 (FM 6 kanal) + PSG ile oyun kodundan sürülür.',
        'VGM log, FM/PSG yazımlarının zaman damgalı kaydıdır — ROM yerine bunu çalarız (birebir aynı ses).'
      ],
      path: [
        'MD → VGM: emülatörde VGM logging (Genesis Plus GX / Fusion + in_vgm) veya VGMPlay ile kaydet.',
        'Hazır VGM/VGZ paketleri (vgmrips.net) doğrudan bu konsolda çalar.'
      ]
    };
  }

  // ── Master System / Game Gear (TMR SEGA header) ───────────────────────
  if (str(bytes, 0x7FF0, 8) === 'TMR SEGA') {
    const code = bytes[0x7FFF];
    const region = code >> 4;
    return {
      platform: 'Master System / Game Gear',
      system: GEN_SYSTEMS[region] || 'Sega 8-bit (SN76489)',
      fields: [['HEADER', 'TMR SEGA @ 0x7FF0'], ['REGION BYTE', romHex(code)],
               ['SIZE', (bytes.length / 1024).toFixed(0) + ' KB']],
      notes: ['SN76489 PSG tek çip; VGM log olarak arşivlenir.', 'Bu konsol VGM/VGZ/SGC dosyalarını doğrudan çalar.'],
      path: ['8-bit Sega → VGM: emülatör VGM logging veya hazır vgmrips paketleri.']
    };
  }

  // ── N64 ───────────────────────────────────────────────────────────────
  const n64 = N64_MAGIC.find((m) => m.slice(0, 4).every((v, i) => bytes[i] === v));
  if (n64) {
    return {
      platform: 'Nintendo 64',
      system: 'N64 (RSP + RDP ses bankaları)',
      fields: [['BYTE ORDER', n64[4]], ['SIZE', (bytes.length / 1048576).toFixed(1) + ' MB']],
      notes: ['N64 sesi ROM\'a gömülü ses bankaları (RSP mikro kodu) ile çalınır.',
              'USF/miniUSF rip\'leri bu bankaları + RSP kodunu taşır; bu konsol USF çalıştırmaz.'],
      path: ['N64 → USF (ek araçlar) veya emülatör müzik kaydı (WAV).']
    };
  }

  // ── Amiga disket imajı ────────────────────────────────────────────────
  if (str(bytes, 0, 3) === 'DOS' && bytes.length >= 512) {
    const sigs = ['DOS' + String.fromCharCode(bytes[3])];
    return {
      platform: 'Amiga disk',
      system: 'Amiga (Paula 4 kanal) — ADF imajı',
      fields: [['IMZALAR', sigs.join(' ')], ['SIZE', (bytes.length / 1024).toFixed(0) + ' KB'],
               ['BOOT BLOCK', 'OK']],
      notes: ['Bir ADF oyun/demo diski, içindeki müzik modülleri (MOD/EXOT/ProTracker) ayrı dosyalardır.',
              'Bu konsol ADF\'i açmaz ama içinden çıkarılmış .mod/.med/.dbm dosyalarını çalar.'],
      path: ['ADF → modüller: Amiga tarafında rip araçları (örn. exotica/ModLand arşivleri) veya diskten dosya çıkaran araçlar.',
             'Pratik yol: modül dosyasını indir (ModLand) → buraya bırak.']
    };
  }
  if (ext === 'adf') {
    return { platform: 'Amiga disk', system: 'Amiga ADF', fields: [['SIZE', (bytes.length / 1024).toFixed(0) + ' KB']],
             notes: ['ADF içindeki modülleri çıkarmak gerekir.'], path: ['Modülü çıkar → .mod/.med/.dbm olarak bırak.'] };
  }

  // ── Atari 2600 (no header) ────────────────────────────────────────────
  if (ext === 'a26' || ext === 'bin') {
    return {
      platform: ext === 'a26' ? 'Atari 2600' : 'Belirsiz ROM',
      system: ext === 'a26' ? 'Atari VCS (TIA, 2 kanal)' : 'Bilinmeyen platform',
      fields: [['SIZE', (bytes.length / 1024).toFixed(0) + ' KB'], ['HEADER', 'yok (imza bulunamadı)']],
      notes: [ext === 'a26' ? 'TIA çok kısıtlı bir ses çipidir; müzik yerine efektler çalar.' : 'Bilinen bir ROM imzası yok.'],
      path: ['VGM/WAV log al, ya da oyunun müziğini içeren rip dosyasını kullan.']
    };
  }

  return null;
}
