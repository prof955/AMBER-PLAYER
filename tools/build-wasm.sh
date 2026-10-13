#!/usr/bin/env bash
# ============================================================================
#  build-wasm.sh — rebuilds wasm/gme.worklet.js and wasm/xmp.worklet.js
#
#  Requirements: emscripten SDK (emcc on PATH or EMSDK env), cmake, git, make
#
#    git clone https://github.com/emscripten-core/emsdk.git && cd emsdk
#    ./emsdk install latest && ./emsdk activate latest && source ./emsdk_env.sh
#
#  Usage:  ./tools/build-wasm.sh        (from the repository root)
# ============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD="$ROOT/build-wasm"
VENDOR="$ROOT/vendor-src"
OUT="$ROOT/wasm"
mkdir -p "$BUILD" "$VENDOR" "$OUT"

QUICK=0
[ "${1:-}" = "--quick" ] && QUICK=1

emit_bundles() { # emit_bundles <gme|xmp> — worklet bundle + ES-module compat bundle
  local key="$1"
  cat "$OUT/$key.js" "$ROOT/tools/worklet/$key.adapter.js" "$ROOT/tools/worklet/processor.tail.js" > "$OUT/$key.worklet.js"
  cat "$OUT/$key.js" "$ROOT/tools/worklet/$key.adapter.js" "$ROOT/tools/worklet/compat.tail.js"    > "$OUT/$key.compat.js"
}

if [ "$QUICK" = "1" ]; then
  # only re-concatenate core + adapter + tail (C sources unchanged)
  emit_bundles gme
  emit_bundles xmp
  echo "==> quick rebuild (js only)"; ls -la "$OUT"; exit 0
fi

command -v emcc >/dev/null || { echo "emcc not found — source the emsdk environment first"; exit 1; }
JOBS="$(nproc 2>/dev/null || echo 2)"

# --------------------------------------------------------------- fetch libs -
fetch() { # fetch <url> <dir>
  [ -d "$VENDOR/$2/.git" ] || git clone --depth 1 "$1" "$VENDOR/$2"
  git -C "$VENDOR/$2" pull --ff-only >/dev/null 2>&1 || true
}
fetch https://github.com/libgme/game-music-emu.git game-music-emu
fetch https://github.com/libxmp/libxmp.git libxmp

COMMON_FLAGS=(
  -O3
  -sMODULARIZE=1 -sEXPORT_ES6=0
  -sSINGLE_FILE=0                 # real .wasm next to the loader (see README):
                                 # the SINGLE_FILE string encoding decodes to a
                                 # truncated module in Chrome, and a fetched
                                 # .wasm is smaller + cacheable on GitHub Pages
  -sENVIRONMENT=worklet
  -sALLOW_MEMORY_GROWTH=0     # fixed heap -> works on every browser (no toResizableBuffer())
  -sINITIAL_MEMORY=32MB       # enough for the emulator + the loaded file
  -sEXPORTED_RUNTIME_METHODS=HEAPU8,HEAP16,UTF8ToString,stringToUTF8,lengthBytesUTF8
  -sDISABLE_EXCEPTION_CATCHING=1
  -sFILESYSTEM=0
  --no-entry
)

# ---------------------------------------------------------------- libgme -----
echo "==> building libgme"
mkdir -p "$BUILD/gme" && cd "$BUILD/gme"
emcmake cmake "$VENDOR/game-music-emu" \
  -DCMAKE_BUILD_TYPE=Release \
  -DBUILD_SHARED_LIBS=OFF \
  -DENABLE_UBSAN=OFF \
  >/dev/null
emmake make -j"$JOBS" >/dev/null
em++ "${COMMON_FLAGS[@]}" -std=c++14 \
  -I"$VENDOR/game-music-emu/gme" \
  "$BUILD/gme/gme/libgme.a" \
  "$ROOT/tools/src/gme_wasm.cpp" \
  -sEXPORTED_FUNCTIONS=_malloc,_free,_gme2_version,_gme2_warning,_gme2_last_error,_gme2_open,_gme2_close,_gme2_track_count,_gme2_system,_gme2_extension,_gme2_multitrack,_gme2_is_multichannel,_gme2_voice_count,_gme2_voice_name,_gme2_track_info,_gme2_identify,_gme2_start_track,_gme2_seek,_gme2_tell,_gme2_track_ended,_gme2_set_tempo,_gme2_mute_voice,_gme2_mute_voices,_gme2_set_equalizer,_gme2_set_stereo_depth,_gme2_enable_accuracy,_gme2_last_peak,_gme2_buf,_gme2_play,_gme2_out_channels \
  -o "$OUT/gme.js"
emit_bundles gme

C_FLAGS=()
for f in "${COMMON_FLAGS[@]}"; do [ "$f" = "-sDISABLE_EXCEPTION_CATCHING=1" ] || C_FLAGS+=("$f"); done

# ---------------------------------------------------------------- libxmp -----
echo "==> building libxmp"
mkdir -p "$BUILD/xmp" && cd "$BUILD/xmp"
emcmake cmake "$VENDOR/libxmp" \
  -DCMAKE_BUILD_TYPE=Release \
  -DBUILD_SHARED_LIBS=OFF \
  -DBUILD_STATIC=ON \
  -DBUILD_LITE=OFF \
  -DBUILD_TESTS=OFF >/dev/null
emmake make -j"$JOBS" >/dev/null
emcc "${C_FLAGS[@]}" \
  -I"$VENDOR/libxmp/include" \
  "$BUILD/xmp/libxmp.a" \
  "$ROOT/tools/src/xmp_wasm.c" \
  -sEXPORTED_FUNCTIONS=_malloc,_free,_xmp2_version,_xmp2_last_error,_xmp2_open,_xmp2_close,_xmp2_last_peak,_xmp2_buf,_xmp2_play,_xmp2_module_info,_xmp2_frame_info,_xmp2_channel_count,_xmp2_seek,_xmp2_set_tempo,_xmp2_set_volume,_xmp2_mute,_xmp2_restart,_xmp2_format_list \
  -o "$OUT/xmp.js"
emit_bundles xmp

echo "==> done"
ls -la "$OUT"
