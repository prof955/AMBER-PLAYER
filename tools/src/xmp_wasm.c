// ============================================================================
//  xmp_wasm.c — C bridge: libxmp -> WebAssembly
//  Part of "Chiptune Console"
//
//  libxmp is MIT licensed.  Provides playback for tracker modules
//  (MOD / S3M / XM / IT / 669 / MED ...), i.e. the "Amiga / demoscene" side.
// ============================================================================
#include <emscripten.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>

#include "xmp.h"

#ifdef __cplusplus
#define API extern "C" EMSCRIPTEN_KEEPALIVE
#else
#define API EMSCRIPTEN_KEEPALIVE
#endif

static xmp_context g_ctx  = NULL;
static unsigned char* g_moddata = NULL;   // libxmp keeps a pointer into the module data
static int         g_rate = 48000;
static short*      g_pcm  = NULL;
static int         g_pcm_frames = 0;
static char        g_scratch[16384];
static char        g_err[256] = "";

static const char* say(const char* s) { snprintf(g_scratch, sizeof g_scratch, "%s", s ? s : ""); return g_scratch; }

API const char* xmp2_version() { return "libxmp " XMP_VERSION; }

API const char* xmp2_last_error() { return g_err; }

// ------------------------------------------------------------------- open ---
API int xmp2_open(const unsigned char* data, int size, int rate)
{
    if (g_ctx) { xmp_end_player(g_ctx); xmp_release_module(g_ctx); xmp_free_context(g_ctx); g_ctx = NULL; }
    if (g_moddata) { free(g_moddata); g_moddata = NULL; }
    g_err[0] = 0;
    g_rate = rate;

    g_ctx = xmp_create_context();
    if (!g_ctx) return snprintf(g_err, sizeof g_err, "xmp_create_context() failed"), -1;

    // The module buffer must outlive the player: libxmp references it for sample
    // data (and for names/instrument metadata), so keep our own copy.
    g_moddata = (unsigned char*)malloc((size_t)size);
    if (!g_moddata) { snprintf(g_err, sizeof g_err, "out of memory (%d bytes)", size); return -6; }
    memcpy(g_moddata, data, (size_t)size);

    int rc = xmp_load_module_from_memory(g_ctx, g_moddata, size);
    if (rc != 0) {
        xmp_free_context(g_ctx); g_ctx = NULL;
        free(g_moddata); g_moddata = NULL;
        snprintf(g_err, sizeof g_err, "xmp_load_module_from_memory: %d", rc);
        return rc;
    }
    rc = xmp_start_player(g_ctx, rate, 0);          // 0 = signed 16-bit stereo
    if (rc != 0) {
        xmp_release_module(g_ctx); xmp_free_context(g_ctx); g_ctx = NULL;
        snprintf(g_err, sizeof g_err, "xmp_start_player: %d", rc);
        return rc;
    }
    xmp_set_player(g_ctx, XMP_PLAYER_MODE, XMP_MODE_AUTO);
    xmp_set_player(g_ctx, XMP_PLAYER_INTERP, XMP_INTERP_SPLINE);
    // Default channel pan (slightly narrowed, classic MOD-ish feel)
    xmp_set_player(g_ctx, XMP_PLAYER_DEFPAN, 60);
    return 0;
}

API void xmp2_close()
{
    if (g_ctx) {
        xmp_end_player(g_ctx);
        xmp_release_module(g_ctx);
        xmp_free_context(g_ctx);
        g_ctx = NULL;
    }
    if (g_moddata) { free(g_moddata); g_moddata = NULL; }
}

API short* xmp2_buf() { return g_pcm; }

static int ensure_pcm(int frames)
{
    if (frames <= g_pcm_frames && g_pcm) return 0;
    short* p = (short*)realloc(g_pcm, (size_t)frames * 2 * sizeof(short));
    if (!p) return -1;
    g_pcm = p; g_pcm_frames = frames;
    return 0;
}

// ---------------------------------------------------------------- render ----
// Renders `frames` stereo frames.  Returns 1 when the module reached its end.
API int xmp2_play(int frames)
{
    if (!g_ctx || frames <= 0) return 1;
    if (ensure_pcm(frames)) return 1;
    int rc = xmp_play_buffer(g_ctx, g_pcm, frames * 2 * (int)sizeof(short), 0);
    if (rc == 0) return 0;
    if (rc == -XMP_END) return 1;
    snprintf(g_err, sizeof g_err, "xmp_play_buffer: %d", rc);
    return 1;
}

// Peak of the buffer rendered by the last xmp2_play() call (measured in C, so
// the JS side never has to guess about heap views).
API int xmp2_last_peak()
{
    int pk = 0;
    for (int i = 0; i < g_pcm_frames * 2; ++i) {
        int v = g_pcm[i];
        if (v < 0) v = -v;
        if (v > pk) pk = v;
    }
    return pk;
}

// ------------------------------------------------------------ information ---
// Sanitise a C string into a fixed buffer (JSON-safe, printable ASCII).
static void json_str(char* dst, int cap, const char* src, int len)
{
    int n = 0;
    for (int i = 0; src && i < len && src[i] && n < cap - 1; ++i) {
        unsigned char c = (unsigned char)src[i];
        if (c == '"' || c == '\\') { dst[n++] = '\''; }
        else if (c >= 0x20 && c < 0x7f) { dst[n++] = (char)c; }
        else if (c >= 0x80) { dst[n++] = (char)c; }        // latin-1 module names
        else dst[n++] = ' ';
    }
    dst[n] = 0;
}

API const char* xmp2_module_info()
{
    if (!g_ctx) return "{}";
    struct xmp_module_info mi;
    memset(&mi, 0, sizeof mi);
    xmp_get_module_info(g_ctx, &mi);
    if (!mi.mod) return "{}";

    char name[XMP_NAME_SIZE + 4], type[XMP_NAME_SIZE + 4];
    json_str(name, sizeof name, mi.mod->name, XMP_NAME_SIZE);
    json_str(type, sizeof type, mi.mod->type, XMP_NAME_SIZE);

    snprintf(g_scratch, sizeof g_scratch,
             "{\"name\":\"%s\",\"type\":\"%s\",\"channels\":%d,\"patterns\":%d,"
             "\"instruments\":%d,\"samples\":%d,\"length\":%d,\"bpm\":%d,\"speed\":%d,"
             "\"sequences\":%d,\"max_channels\":%d,\"voices\":%d}",
             name, type, mi.mod->chn, mi.mod->pat,
             mi.mod->ins, mi.mod->smp, mi.mod->len, mi.mod->bpm, mi.mod->spd,
             mi.num_sequences, XMP_MAX_CHANNELS,
             xmp_get_player(g_ctx, XMP_PLAYER_VOICES));
    return g_scratch;
}

// Playback position / state, plus a compact per-channel activity array used
// by the channel meters (tracker style meters driven by *real* frame data).
API const char* xmp2_frame_info()
{
    if (!g_ctx) return "{}";
    struct xmp_frame_info fi;
    memset(&fi, 0, sizeof fi);
    xmp_get_frame_info(g_ctx, &fi);

    char* o = g_scratch;
    int   n = 0;
    n += snprintf(o + n, sizeof g_scratch - n,
                  "{\"pos\":%d,\"pattern\":%d,\"row\":%d,\"rows\":%d,\"frame\":%d,"
                  "\"speed\":%d,\"bpm\":%d,\"time\":%d,\"total_time\":%d,"
                  "\"volume\":%d,\"loop_count\":%d,\"sequence\":%d,"
                  "\"tempo_factor\":%.3f,\"channels\":[",
                  fi.pos, fi.pattern, fi.row, fi.num_rows, fi.frame,
                  fi.speed, fi.bpm, fi.time, fi.total_time,
                  fi.volume, fi.loop_count, fi.sequence,
                  xmp_get_tempo_factor(g_ctx));

    for (int c = 0; c < fi.virt_channels && n < (int)sizeof g_scratch - 64; ++c) {
        struct xmp_channel_info* ci = &fi.channel_info[c];
        n += snprintf(o + n, sizeof g_scratch - n, "%s[%d,%d,%d,%d]",
                      c ? "," : "",
                      ci->note, ci->volume, ci->pan, ci->instrument);
    }
    n += snprintf(o + n, sizeof g_scratch - n, "],\"virt_used\":%d,\"virt_channels\":%d}",
                  fi.virt_used, fi.virt_channels);
    return o;
}

API int xmp2_channel_count()
{
    if (!g_ctx) return 0;
    struct xmp_module_info mi;
    xmp_get_module_info(g_ctx, &mi);
    return mi.mod ? mi.mod->chn : 0;
}

// ------------------------------------------------------------- transport ----
API int xmp2_seek(int msec)
{
    if (!g_ctx) return -1;
    int rc = xmp_seek_time(g_ctx, msec);
    return rc == 0 ? 0 : -1;
}

API void xmp2_set_tempo(double factor)
{
    if (g_ctx && factor > 0.05 && factor < 8.0) xmp_set_tempo_factor(g_ctx, factor);
}

API void xmp2_set_volume(int vol)   // 0..200 (100 = default)
{
    if (g_ctx) xmp_set_player(g_ctx, XMP_PLAYER_VOLUME, vol);
}

API int xmp2_mute(int channel, int mute)     // channel < 0 => all channels
{
    if (!g_ctx) return -1;
    if (channel >= 0) return xmp_channel_mute(g_ctx, channel, mute);
    int n = xmp2_channel_count();
    for (int c = 0; c < n; ++c) xmp_channel_mute(g_ctx, c, mute);
    return 0;
}

API int xmp2_restart()
{
    if (!g_ctx) return -1;
    xmp_restart_module(g_ctx);
    return 0;
}

// Comma separated list of every module format this build can load.
API const char* xmp2_format_list()
{
    const char* const* l = xmp_get_format_list();
    char* o = g_scratch;
    int   n = 0;
    o[0] = 0;
    for (; *l && n < (int)sizeof g_scratch - 16; ++l)
        n += snprintf(o + n, sizeof g_scratch - n, "%s%s", n ? "," : "", *l);
    return o;
}
