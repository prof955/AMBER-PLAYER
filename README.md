# CHIPTUNE CONSOLE v1.0

Tarayıcıda çalışan, amber fosforlu bir **konsol stili chiptune çalar**. İçinde iki gerçek
emülatör var — [game-music-emu (libgme)](https://github.com/libgme/game-music-emu) ve
[libxmp](https://github.com/libxmp/libxmp) — ikisi de WebAssembly'ye derlenmiş halde
depoda duruyor, yani **sunucu yok, kurulum yok, CDN yok**: sayfa açılır, dosya bırakılır, müzik çalar.

Uygulama tamamen statik olduğu için GitHub Pages'te (veya herhangi bir statik barındırmada)
olduğu gibi çalışır.

---

## Ne yapar

- **Konsol ses formatları** (libgme): `NSF` `NSFE` `SPC` `GBS` `VGM` `VGZ` `GYM` `HES` `KSS` `AY` `SAP` `SGC`
  → NES/Famicom, SNES, Game Boy, Mega Drive/Genesis, Master System/Game Gear, PC Engine, MSX,
  ZX Spectrum/Amstrad, Atari XL/XE, arcade VGM.
- **Tracker modülleri** (libxmp): `MOD` `XM` `S3M` `IT` `669` `MED` `DBM` `FAR` `MTM` `STM` `OKT` `ULT` ve
  libxmp'nin desteklediği diğer tüm formatlar → Amiga (Paula 4 kanal) ve PC modülleri.
- **Dosya / sürükle-bırak / URL / ZIP / ROM** girişlerinin hepsi:
  - `FETCH` alanına URL yaz (CORS izni olan sunucular; değilse dosyayı indirip bırak),
  - `.zip` rip arşivlerini olduğu gibi bırak → içindeki tüm chiptune'lar kuyruğa eklenir,
  - `.vgz` / `.gz` gzip konteynerleri açılır,
  - `.m3u` listelerindeki URL'ler sırayla indirilir,
  - **oyun ROM'u** bıraktığında ROM INSPECTOR platformu imzasından tanır (iNES, SNES LoROM/HiROM,
    DMG/CGB, GBA, `SEGA` header, `TMR SEGA`, N64 byte order, ADF…) ve müziği çıkarmanın
    gerçek yolunu yazar (aşağıya bak).
- **Gerçek zamanlı görselleştirme**: 4096'lık FFT spektrum analizörü (30 Hz–20 kHz log eksen),
  osiloskop, dB okuması, kanal başına LED VU metreler — hepsi AnalyserNode'dan gelen gerçek sinyal.
- **Gerçek ses işleme**: 3 bantlı EQ (low-shelf / peaking / high-shelf) + 12 hazır preset,
  master volume, limiter (DynamicsCompressor), fade-out, tempo (0.5×–2×), seek.
- **Kanal kontrolü**: çok kanallı modda her ses ayrı: tıkla = mute, çift tıkla = solo
  (libgme çok kanallı çıkışı ve libxmp kanal mute'u).
- **Çalma listesi**: kuyruk, önceki/sonraki, shuffle, tekrar (kapalı / tüm kuyruk / tek parça),
  `.m3u` olarak dışa aktarma (VLC/foobar2000/OpenMPT ile de çalışır).
- **Subtune desteği**: NSF/SPC/GBS gibi çok parçalı dosyalarda parça listesi + süreleri, tek tıkla geçiş.
- **PLAYER EVENT LOG**: yükleme, motor sürümü, subtune, mute/solo, seek, hatalar ve
  tracker modüllerinde akan notalar (`CH03 C-4 v48 i02`).
- **SELF TEST** düğmesi: bu depoda üretilmiş iki minik demo (VGM + MOD) yüklenip çıkış seviyesi
  ölçülür — tarayıcıda zincirin gerçekten çalıştığını kanıtlar.

Klavye: `Space` çal/duraklat · `S` durdur · `N`/`P` sonraki/önceki · `M` sessiz ·
`←`/`→` 5 sn sar (Shift ile 30 sn) · `↑`/`↓` ses.

---

## ROM'dan müzik meselesi (dürüst kısım)

Bir **oyun ROM'u** müzik dosyası değildir: müzik, oyunun kendi ses kodunun ve örnek tablolarının
içindedir. ROM'un içinden ses çıkarmak, o kodun **nerede başladığını bilmek** demektir — ROM bunu
işaretlemez. Bu yüzden hiçbir tarayıcı aracı "şu ROM'u bırak, müzik çalsın" sihrini yapamaz;
bu konsol da yapmıyormuş gibi davranmaz. Onun yerine şunu yapar:

1. **ROM INSPECTOR**: ROM'u başlık baytlarından gerçekten tanır (platform, mapper, PRG/CHR boyutu,
   bölge, başlık…), ve *o platform için* doğru çıkarma yolunu yazar.
2. **Rip dosyalarını birinci sınıf vatandaş yapar**: oyun müziğinin dağıtım biçimi zaten
   `NSF/NSFE/SPC/GBS/VGM/VGZ/GYM/HES/KSS/AY/SAP` dosyalarıdır. Bunları çalar — subtune listesi,
   loop bilgisi, süreleri dahil. `.zip` rip arşivleri tek hamlede kuyruğa girer.

Pratik yollar (panelde de yazar):

| ROM | Nasıl müziğe çevrilir | Sonuç |
|---|---|---|
| NES / Famicom | 6502 müzik rutinlerini bulan NSF ripper (veya hazır NSF/NSFE arşivi) | `NSF`, `NSFE` |
| SNES | Emülatörde müzik çalarken **SPC dump** (Snes9x / bsnes / Mesen-S) | `SPC` |
| Game Boy / GBC | GBS ripper veya hazır GBS arşivi | `GBS` |
| Mega Drive / Genesis | Emülatörde **VGM logging** (Genesis Plus GX, Fusion + in_vgm) | `VGM`, `VGZ` |
| Master System / GG | VGM logging veya vgmrips paketleri | `VGM`, `VGZ`, `SGC` |
| Game Boy Advance | GSF zinciri (bu konsol GSF çalıştırmaz) | — |
| Amiga | Diskteki modülü çıkar (veya ModLand arşivi) | `MOD`, `MED`, `DBM` |
| PC Engine / MSX / ZX | Hazır rip (HES / KSS / AY) | `HES`, `KSS`, `AY` |

Yani "ROM'dan müzik" pratikte **rip dosyası oynatmak**tır; konsolun yaptığı iş bunu olabildiğince
kolay ve şık hale getirmek: ROM'u inceler, ne olduğunu söyler, doğru dosyayı nereden alacağını ve
nasıl üreteceğini gösterir, gelen dosyayı da tüm özellikleriyle çalar.

---

## Yerel olarak çalıştırma

```bash
cd chiptune-console
python3 tools/serve.py 8088        # CORS'lu küçük sunucu (önerilen)
# tarayıcı: http://localhost:8088
```

`python3 -m http.server` de olur ama **CORS başlığı göndermez**: konsolu sandbox'lı bir
iframe içinde (canlı önizlemeler, doküman demoları) çalıştıracaksanız tarayıcı modül
dosyalarını `origin: null` ile CORS kontrolünden geçirir ve düz http.server bunu reddeder.
`tools/serve.py` `Access-Control-Allow-Origin: *` ve doğru `application/wasm` MIME'ı
gönderir — GitHub Pages de aynısını yaptığı için davranış birebir aynı olur.

`file://` ile açma — tarayıcı ES modüllerini ve WASM indirmeyi engeller; sayfa bunu
tam ekran bir uyarıyla söyler (çalışması için HTTP gerekir).
Masaüstü Chrome / Edge / Firefox / Safari (AudioWorklet destekleyen sürümler) gerekir.

## GitHub Pages'e koyma

Depo kökünde her şey zaten statik:

1. Dosyaları bir GitHub deposuna push et (`.nojekyll` işi kolaylaştırır, Jekyll beklemesin).
2. **Settings → Pages → Source: Deploy from a branch → `main` / `(root)`**.
3. Yayın adresi: `https://<kullanıcı>.github.io/<depo>/`.

İstersen hazır iş akışı da var: `.github/workflows/pages.yml` (Settings → Pages → Source:
**GitHub Actions** seçilirse her push'ta yayınlar).

Sıfırdan push:

```bash
cd chiptune-console
git init && git add -A && git commit -m "CHIPTUNE CONSOLE v1.0"
git branch -M main
git remote add origin https://github.com/<kullanıcı>/<depo>.git
git push -u origin main
```

Sonra **Settings → Pages → Source: Deploy from a branch → main / (root)** → yayın adresi
`https://<kullanıcı>.github.io/<depo>/`.

GitHub Pages her dosyaya `Access-Control-Allow-Origin: *` gönderir ve gerçek bir tarayıcı
sekmesi güvenli bağlam (`https`) olduğu için orada **AudioWorklet yolu** da aktiftir: ses
doğrudan çalar (sandbox'lı önizlemede devreye giren uyumluluk moduna gerek kalmaz).

Tüm yollar göreli (`wasm/gme.wasm`, `css/console.css`, `js/main.js`), bu yüzden alt dizinde
(`/depo/`) sorunsuz çalışır.

---

## Mimari

```
index.html            konsol düzeni (tüm paneller)
css/console.css       amber CRT teması (harici font/görsel yok)
js/main.js            boot + dosya/URL/ZIP/ROM girişleri + tüm düğme bağlantıları
js/engine.js          AudioContext, worklet yükleme + yedek yol seçimi, EQ/limiter/analyser, telemetri
js/compat.js          uyumluluk modu (ana iş parçacığı motoru) + WAV offline render + WAV kodlayıcı
js/player.js          transport durum makinesi (kuyruk → motor → paneller)
js/playlist.js        kuyruk modeli + liste görünümü + .m3u çıktısı
js/ui.js              olmayan-ses panelleri: log, kanal satırları, EQ presetleri, ayarlar
js/viz.js             spektrum / osiloskop / LED metre çizimi (canvas)
js/formats.js         uzantı + sihirli bayt tabloları, format sniffing
js/zip.js             ZIP okuma (stored + deflate) ve gzip açma (DecompressionStream)
js/rom.js             ROM INSPECTOR: platform tanıma + çıkarma rehberi
js/demo.js            self-test için gömülü demo (bu depoda üretildi)
wasm/gme.worklet.js   libgme AudioWorklet (adapter + processor, ~27 KB)
wasm/gme.wasm         libgme derlemesi (~273 KB)
wasm/xmp.worklet.js   libxmp AudioWorklet (adapter + processor, ~26 KB)
wasm/xmp.wasm         libxmp derlemesi (~497 KB)
tools/src/*           C/C++ köprüleri (gme_wasm.cpp, xmp_wasm.c)
tools/worklet/*       adapter + paylaşılan AudioWorkletProcessor
tools/build-wasm.sh   libgme + libxmp → wasm derleme betiği
tools/make-demo.py    demo VGM/MOD üreteci (tüm baytlar kendi kodumuz)
tests/*               Node VM motor testleri + Playwright tarayıcı testleri
tests/fixtures/*      testlerin kullandığı minik örnek dosyalar (NSF/XM/IT, ~8 KB)
samples/*             demo.vgm / demo.mod
```

Ses yolu: `[worklet: emülatör WASM] → inputGain → EQ (bass/mid/treble) → masterGain →
limiter → AnalyserNode → çıkış`. Metadata okuma ayrı bir worklet düğümünde yapılır,
böylece listeyi gezerken çalan parça hiç bozulmaz.

Motor tarafında (worklet içi) ring buffer 1024 kare, fade `playMs` sonrası başlar,
`repeat one` parçayı yerinde baştan başlatır, kuyruk mantığı (sıradaki/tekrar/shuffle)
ana iş parçacığında çalışır.

---

## Testler

```bash
node tests/node-engine-test.mjs     # 8 motor senaryosu: rms/peak ölçümü (libgme + libxmp)
node tests/end-policy.mjs           # 9 kontrol: fade sonu, repeat one, infinite, seek
node tests/browser-check.mjs        # gerçek Chromium: sayfa + tarayıcı içi WASM + DOM akışı
node tests/compat-check.mjs         # uyumluluk modu: yedek motor + transport + WAV çıktısının doğrulanması
node tests/wasm-probe.mjs           # tek motoru doğrudan sayfada çalıştırıp çıkış ölçer
```

`browser-check.mjs` ekran görüntüsünü `tests/screenshot.png` olarak kaydeder.
AudioWorklet'in hiç çözülmediği ortamlarda (bazı sandbox/headless kabukları) bile
motorun sayfa içinde çalıştığını doğrular; Node testleri ise worklet hattını uçtan uca ölçer.

## WASM'ı yeniden derleme

```bash
git clone https://github.com/emscripten-core/emsdk.git && cd emsdk
./emsdk install latest && ./emsdk activate latest && source ./emsdk_env.sh
cd .. && bash chiptune-console/tools/build-wasm.sh          # tam derleme
bash chiptune-console/tools/build-wasm.sh --quick           # sadece JS'i yeniden birleştir
```

Betik, kaynak depolarını ilk çalıştırmada `vendor-src/` içine klonlar (bu dizin ile
`build-wasm/` ve `emsdk/` depoda tutulmaz: birlikte ~1.9 GB / ~25.000 dosya ederler,
her derlemede yeniden üretilirler) (libgme `cmake` + `emmake`,
libxmp `emcmake`), köprüleri derler ve `wasm/*.worklet.js` dosyalarını üretir.
`-sSINGLE_FILE=0` kullanılır: `.wasm` ayrı dosya olarak servis edilir (tarayıcıda `SINGLE_FILE`
gömülü kodlaması bozuk çözülebiliyor ve ayrı dosya daha küçük + önbelleklenebilir oluyor).

## Uyumluluk modu (AudioWorklet yoksa da çalar)

Bazı ortamlar `audioWorklet.addModule()` çağrısını hiç yanıtlamaz: çok eski tarayıcılar,
kısıtlı iframe'ler/webview'ler, sandbox'lı önizlemeler. Konsol bunu fark eder ve
**uyumluluk moduna** geçer (`js/compat.js`): aynı WASM motoru bu kez ana iş parçacığında
çalışır, üretilen bloklar `AudioBufferSource` ile ileriye zamanlanır ve **aynı EQ/limiter/
analyser zincirine** girer. Yani ses, metreler, spektrum, EQ, tempo, seek çalışmaya devam eder;
durum çubuğunda `AUDIO: RUNNING · WORKLET` yerine `· COMPAT` yazar.

Ana iş parçacığında çalıştığı için çok ağır modüllerde (32 kanallı IT gibi) nadiren tıkanma
olabilir; worklet yolu olan tarayıcılarda otomatik olarak o kullanılır.

## WAV dışa aktarma

`SAVE .WAV`: çalan parçayı **offline** olarak yeniden render eder (44.1 kHz / 16-bit stereo),
sonuna fade ekler ve indirir. Ses donanımına hiç dokunmaz — sessiz bir ortamda da, çalarken de
kullanılabilir. Süre `PLAYBACK OPTIONS → PLAY LENGTH` ayarından gelir (AUTO ise dosyanın süresi
ya da 2:30, tavan 10 dakika).

## Bilinen sınırlar

- Platform ses kartına bağlı olarak tarayıcı ilk tıklamaya kadar sesi askıya alır (autoplay politikası).
- Çok uzun/loopsuz olmayan modüllerde süre tahmini libxmp'den gelir; loop'lu modüllerde
  AUTO çalma süresi 2:30 + fade uygular (PLAYBACK OPTIONS'tan değiştirilebilir).
- `GYM`, `SGC` gibi formatlar libgme'nin desteklediği sürümle sınırlıdır.
- ROM'lardan otomatik ses çıkarma yapılmaz (yukarıdaki açıklama).
- `DecompressionStream` gerektiren ZIP/gzip yolu: Chrome/Edge 80+, Firefox 113+, Safari 16.4+.

## Lisanslar

Kendi kodumuz ve demo dosyaları: **MIT** (`LICENSE`).
Derlenmiş WASM ikilileri üçüncü taraf kütüphaneler içerir:

- **game-music-emu 0.6.6** — LGPL-2.1 (`wasm/gme.wasm`, `wasm/gme.worklet.js`)
- **libxmp 4.7.4** — MIT (`wasm/xmp.wasm`, `wasm/xmp.worklet.js`)

Ayrıntılar ve LGPL uyum notları (kaynak kaynağı, yeniden bağlama): `NOTICE.md`.
