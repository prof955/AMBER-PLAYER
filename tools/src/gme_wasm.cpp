// ============================================================================
//  gme_wasm.cpp — C bridge: libgme (game-music-emu) -> WebAssembly
//  Part of "Chiptune Console"  (https://github.com/<you>/chiptune-console)
//
//  libgme (Blargg's Game_Music_Emu) is LGPL-2.1.  This bridge only *links*
//  against it and is distributed under the same project license (MIT) with
//  the LGPL obligations documented in NOTICE.md.
//
//  The bridge is intentionally small and "C-like": every entry point is
//  EMSCRIPTEN_KEEPALIVE and takes/returns plain values.  Strings are
//  returned as pointers into a static scratch buffer that the JS side copies
//  immediately (UTF8ToString).
// ============================================================================
#include <emscripten.h>
#include <cstdlib>
#include <cstring>
#include <string>
#include <vector>

#include "gme.h"

#define API extern "C" EMSCRIPTEN_KEEPALIVE

// ------------------------------------------------------------------ state ---
static Music_Emu*        g_emu       = nullptr;   // playback instance
static Music_Emu*        g_scan      = nullptr;   // temp instance used for metadata scans
static int               g_rate      = 48000;
static int               g_multichan = 0;         // 1 = per-voice stereo pairs
static std::vector<short> g_pcm;                  // render buffer
static std::string       g_scratch;               // returned-string scratch

static const char* RET(const std::string& s) { g_scratch = s; return g_scratch.c_str(); }

static void json_escape(std::string& out, const char* s)
{
    if (!s) return;
    for (const unsigned char* p = (const unsigned char*)s; *p; ++p) {
        switch (*p) {
            case '"':  out += "\\\""; break;
            case '\\': out += "\\\\"; break;
            case '\n': out += "\\n";  break;
            case '\r': out += "\\r";  break;
            case '\t': out += "\\t";  break;
            default:
                if (*p < 0x20) { char b[8]; snprintf(b, sizeof b, "\\u%04x", *p); out += b; }
                else out += (char)*p;
        }
    }
}

// ---------------------------------------------------------------- queries ---
API const char* gme2_version() { return "game-music-emu 0.6.6"; }

// Diagnostics: libgme's own warning for the loaded file + last play error.
static std::string g_lastError;
API const char* gme2_warning() { if (!g_emu) return ""; const char* w = gme_warning(g_emu); return w ? w : ""; }
API const char* gme2_last_error() { return g_lastError.c_str(); }

// Channels the *playback* instance renders per sample frame (2 = stereo).
API int gme2_out_channels() { return (g_emu && g_multichan) ? gme_voice_count(g_emu) * 2 : 2; }

// ------------------------------------------------------------- life cycle ---
// Returns NULL on success, otherwise a (copyable) error/status message.
API const char* gme2_open(const unsigned char* data, int size, int rate, int multichannel)
{
    if (g_emu) { gme_delete(g_emu); g_emu = nullptr; }
    g_rate = rate;
    g_multichan = multichannel ? 1 : 0;

    gme_err_t err = gme_open_data(data, size, &g_emu, rate);
    if (err) { g_emu = nullptr; return RET(std::string("gme_open_data: ") + err); }

    // Multi-channel (per-voice output) needs the type specific constructor.
    // g_multichan is only ever set when the *emulator* really reports multichannel,
    // otherwise gme_play() would write 8 stereo pairs into a 2-channel buffer.
    if (multichannel) {
        Music_Emu* mc = gme_new_emu_multi_channel(gme_type(g_emu), rate);
        if (mc) {
            gme_err_t e2 = gme_load_data(mc, data, size);
            if (!e2 && gme_multi_channel(mc)) {
                gme_delete(g_emu);
                g_emu = mc;
                g_multichan = 1;
            } else {
                gme_delete(mc);                 // fall back to the plain instance
            }
        }
    }
    gme_ignore_silence(g_emu, 1);
    return nullptr;
}

API void gme2_close()
{
    if (g_emu)  { gme_delete(g_emu);  g_emu  = nullptr; }
    if (g_scan) { gme_delete(g_scan); g_scan = nullptr; }
}

// ------------------------------------------------------------- information --
API int gme2_track_count() { return g_emu ? gme_track_count(g_emu) : 0; }

API const char* gme2_system() { return g_emu ? gme_type_system(gme_type(g_emu)) : ""; }
API const char* gme2_extension() { return g_emu ? gme_type_extension(gme_type(g_emu)) : ""; }
API int gme2_multitrack() { return g_emu ? gme_type_multitrack(gme_type(g_emu)) : 0; }
API int gme2_is_multichannel() { return g_multichan && g_emu && gme_multi_channel(g_emu) ? 1 : 0; }

API int gme2_voice_count() { return g_emu ? gme_voice_count(g_emu) : 0; }

API const char* gme2_voice_name(int i)
{
    if (!g_emu || i < 0 || i >= gme_voice_count(g_emu)) return "";
    return gme_voice_name(g_emu, i);
}

// Track metadata as a JSON object.  Uses a throw-away emulator so that it can
// be called for *any* track without disturbing playback.
// opts: bit0 = fill loop info (slower for some formats)
API const char* gme2_track_info(int track)
{
    if (!g_emu) return "{}";
    gme_info_t* info = nullptr;
    if (gme_track_info(g_emu, &info, track)) return "{}";

    std::string o = "{";
    char b[64];
    snprintf(b, sizeof b, "\"length\":%d,\"intro\":%d,\"loop\":%d,", info->length, info->intro_length, info->loop_length);
    o += b;
    o += "\"song\":\"";        json_escape(o, info->song);       o += "\",";
    o += "\"game\":\"";        json_escape(o, info->game);       o += "\",";
    o += "\"author\":\"";      json_escape(o, info->author);     o += "\",";
    o += "\"copyright\":\"";   json_escape(o, info->copyright);  o += "\",";
    o += "\"comment\":\"";     json_escape(o, info->comment);    o += "\",";
    o += "\"dumper\":\"";      json_escape(o, info->dumper);     o += "\",";
    o += "\"system\":\"";      json_escape(o, info->system);     o += "\",";
    o += "\"track_count\":";
    snprintf(b, sizeof b, "%d", gme_track_count(g_emu));
    o += b;
    o += "}";
    gme_free_info(info);
    return RET(o);
}

// Cheap format sniffing on a raw header (see gme_identify_header).
API const char* gme2_identify(const unsigned char* header, int len)
{
    char buf[64];
    int n = len < (int)sizeof buf - 1 ? len : (int)sizeof buf - 1;
    memcpy(buf, header, n);
    buf[n] = 0;
    const char* id = gme_identify_header(buf);
    return id ? id : "";
}

// ------------------------------------------------------------- transport ----
API int gme2_start_track(int index)
{
    if (!g_emu) return -1;
    gme_err_t err = gme_start_track(g_emu, index);
    return err ? -1 : 0;
}

API int gme2_seek(int msec)
{
    if (!g_emu) return -1;
    return gme_seek(g_emu, msec) ? -1 : 0;
}

API int gme2_tell() { return g_emu ? gme_tell(g_emu) : 0; }
API int gme2_track_ended() { return g_emu ? gme_track_ended(g_emu) : 1; }

API void gme2_set_tempo(double t) { if (g_emu) gme_set_tempo(g_emu, t); }

API void gme2_mute_voice(int index, int mute) { if (g_emu) gme_mute_voice(g_emu, index, mute); }
API void gme2_mute_voices(int mask) { if (g_emu) gme_mute_voices(g_emu, mask); }

API void gme2_set_equalizer(double treble, double bass)
{
    if (!g_emu) return;
    gme_equalizer_t eq;
    memset(&eq, 0, sizeof eq);
    eq.treble = treble;
    eq.bass   = bass;
    gme_set_equalizer(g_emu, &eq);
}

API void gme2_set_stereo_depth(double d) { if (g_emu) gme_set_stereo_depth(g_emu, d); }
API void gme2_enable_accuracy(int on)    { if (g_emu) gme_enable_accuracy(g_emu, on); }

// Peak of the last rendered block, measured in C.
API int gme2_last_peak()
{
    int pk = 0;
    for (size_t i = 0; i < g_pcm.size(); ++i) {
        int v = g_pcm[i];
        if (v < 0) v = -v;
        if (v > pk) pk = v;
    }
    return pk;
}

// Pointer to the interleaved int16 render buffer (frames * out_channels * 2 bytes)
API short* gme2_buf() { return g_pcm.empty() ? nullptr : g_pcm.data(); }

// Render `frames` sample frames.  Returns 1 when the track reported "ended".
API int gme2_play(int frames)
{
    if (!g_emu || frames <= 0) return 1;
    int chans = g_multichan ? gme_voice_count(g_emu) * 2 : 2;
    size_t need = (size_t)frames * chans;
    if (g_pcm.size() < need) g_pcm.resize(need);
    gme_err_t err = gme_play(g_emu, (int)need, g_pcm.data());
    if (err) { g_lastError = err; return 1; }
    g_lastError.clear();
    return gme_track_ended(g_emu) ? 1 : 0;
}
