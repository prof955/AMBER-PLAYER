#!/usr/bin/env python3
"""
tools/make-demo.py — writes two self-made (public domain) demo tunes:

  samples/demo.vgm   Sega Master System PSG log (SN76489)  -> played by libgme
  samples/demo.mod   Amiga ProTracker 4-channel module     -> played by libxmp

They are used as built-in demo/self-test material and as regression fixtures.
No third-party data involved: every byte is generated here.
"""
import base64
import os
import struct

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NUL = bytes([0])
ZEROS = bytes(256)

# ═══════════════════════════════════════════════════════ VGM (SN76489 PSG)
CLOCK_PSG = 3579545          # NTSC Master System / Genesis PSG clock
TICK = 735                   # samples per "row" tick


def psg_write(byte):
    # Every SN76489 register write is one VGM "PSG write" command: 0x50 <data>,
    # where <data> is the raw chip byte (bit7 = latch).  Writing the chip byte
    # bare makes libgme's parser hit "Unknown stream event" and go silent.
    return bytes([0x50, byte & 0xFF])


def psg_tone(ch, freq):
    f = max(1, min(1023, int(round(CLOCK_PSG / (32.0 * freq)))))
    return psg_write(0x80 | (ch << 5) | (f & 0x0F)) + psg_write((f >> 4) & 0x3F)


def psg_vol(ch, vol):        # 0 = loudest, 15 = silent
    return psg_write(0x80 | (ch << 5) | 0x10 | (vol & 0x0F))


def hz(semis):
    return 440.0 * (2 ** (semis / 12.0))


def build_vgm():
    # Game Gear stereo routing.  The Sms_Apu routes a voice to outputs[select]
    # where select = (bit_i) | (bit_{i+4} << 1): 0 = off, 1 = right, 2 = left,
    # 3 = centre.  blargg's Vgm_Emu leaves every voice on "centre" by default,
    # which is a dead end unless a GG stereo command appears in the stream, so
    # the demo writes one explicitly (0xFF = all four voices to centre/both).
    STEREO = int(os.environ.get('VGM_STEREO', '0xFF'), 0)
    data = bytearray()
    data.extend(bytes([0x4F, STEREO]))
    total = 0

    def wait(samples):
        nonlocal total
        samples = int(samples)
        while samples > 0:
            n = min(65535, samples)
            data.extend(b'\x61' + struct.pack('<H', n))
            total += n
            samples -= n

    for ch in range(4):                       # all voices silent at start
        data.extend(psg_vol(ch, 15))
    wait(TICK)

    lead = [0, 4, 7, 12, 7, 4, 0, -5]
    bass = [-24, -24, -17, -17, -12, -12, -17, -17]
    loop_at = None
    rows = 64

    for row in range(rows):
        if row == 16:
            loop_at = len(data)
        st = row % 8
        bar = row // 8
        if st == 0:
            data.extend(bytes([0x4F, STEREO]))

        ln = lead[(row + bar) % len(lead)]
        data.extend(psg_tone(0, hz(ln + 12)))
        data.extend(psg_vol(0, min(14, 4 + st)))
        data.extend(psg_tone(1, hz(lead[(row * 3) % len(lead)] + 7)))
        data.extend(psg_vol(1, 8 if st % 2 else 13))
        if st % 4 == 0:
            data.extend(psg_tone(2, hz(bass[(row // 4) % len(bass)])))
            data.extend(psg_vol(2, 2))
        if st % 4 == 3:
            data.extend(psg_vol(2, 15))
        if st in (0, 4):                      # noise "drum"
            data.extend(psg_vol(3, 4))
            wait(TICK)
            data.extend(psg_vol(3, 15))
        wait(TICK * (2 if st in (1, 5) else 3))

    data.extend(b'\x66')                      # end of sound data

    header = bytearray(0x40)
    header[0x00:0x04] = b'Vgm '
    header[0x08:0x0C] = struct.pack('<I', 0x150)             # version 1.50
    header[0x0C:0x10] = struct.pack('<I', CLOCK_PSG)         # SN76489 clock
    header[0x18:0x1C] = struct.pack('<I', total)             # total samples
    if loop_at is not None:
        header[0x1C:0x20] = struct.pack('<I', (0x40 + loop_at) - 0x1C)   # rel. to 0x1C
        header[0x20:0x24] = struct.pack('<I', total - 16 * TICK * 3)     # loop length guess
    header[0x24:0x28] = struct.pack('<I', 60)                # frame rate (logging)
    header[0x28:0x2A] = struct.pack('<H', 0x0009)            # LFSR feedback
    header[0x2A] = 16                                        # LFSR width
    header[0x2B] = 0                                         # flags
    out = bytearray(header) + data
    out[0x04:0x08] = struct.pack('<I', len(out) - 4)         # EOF offset (rel. to 0x04)
    return bytes(out)


# ═══════════════════════════════════════════════════════ MOD (ProTracker)
PERIODS = {'C': 428, 'C#': 404, 'D': 381, 'D#': 360, 'E': 339, 'F': 320,
           'F#': 302, 'G': 285, 'G#': 269, 'A': 254, 'A#': 240, 'B': 226}


def period(note, octave=3):
    p = PERIODS[note]
    if octave < 3:
        p *= 2 ** (3 - octave)
    elif octave > 3:
        p = max(113, p // (2 ** (octave - 3)))
    return int(p)


def square_sample(length=32, duty=0.5, amp=118):
    out = bytearray()
    for i in range(length):
        v = amp if (i / length) < duty else -amp
        out.append((v + 128) & 0xFF)
    return bytes(out)


def saw_sample(length=32, amp=110):
    out = bytearray()
    for i in range(length):
        v = int(((i / length) * 2 - 1) * amp) + 128
        out.append(max(0, min(255, v)))
    return bytes(out)


def noise_sample(length=64, seed=0x1234):
    s, out = seed, bytearray()
    for _ in range(length):
        s = (s * 1103515245 + 12345) & 0x7FFFFFFF
        out.append((s >> 15) & 0xFF)
    return bytes(out)


def build_mod():
    samples = [
        ('SQUARE', square_sample(32, 0.5, 118), 64),
        ('SAW', saw_sample(32, 110), 58),
        ('BASS', square_sample(32, 0.25, 127), 64),
        ('NOISE', noise_sample(64), 46),
    ]
    rows, nchan, npat = 64, 4, 2

    def cell(per, smp, effect=0x00, param=0x00):
        # MOD cell: byte0 = [sample_hi][period_hi], byte2 = [sample_lo][effect]
        return bytes([(smp & 0xF0) | ((per >> 8) & 0x0F),
                      per & 0xFF,
                      ((smp & 0x0F) << 4) | (effect & 0x0F),
                      param & 0xFF])

    melody = [('A', 3), ('C#', 3), ('E', 3), ('A', 3), ('G', 3), ('E', 3), ('C#', 3), ('E', 3)]
    bassline = ['A', 'A', 'F', 'F', 'C', 'C', 'G', 'G']

    patterns = []
    for p in range(npat):
        pat = bytearray()
        for r in range(rows):
            cells = [b'\x00\x00\x00\x00'] * nchan
            n = melody[(r + p * 3) % len(melody)]
            cells[0] = cell(period(n[0], n[1]), 1)
            if r % 2 == 0:
                hn = melody[(r * 2 + 4 + p) % len(melody)]
                cells[1] = cell(period(hn[0], hn[1] + 1), 2)
            if r % 4 == 0:
                bn = bassline[((r // 4) + p) % len(bassline)]
                cells[2] = cell(period(bn, 2), 3)
            if r % 8 in (0, 3, 6):
                vol = 60 if r % 8 == 0 else 42
                cells[3] = cell(period('C', 5) // 2, 4, 0x0C, vol)
            for c in cells:
                pat.extend(c)
        patterns.append(bytes(pat))

    out = bytearray()
    out.extend((b'CHIPTUNE CONSOLE DEMO' + ZEROS)[:20])

    sample_data = bytearray()
    for name, data, vol in samples:
        out.extend((name.encode() + ZEROS)[:22])
        out.extend(struct.pack('>H', len(data) // 2))    # length (words)
        out.append(0)                                    # finetune
        out.append(vol)                                  # volume
        out.extend(struct.pack('>H', 0))                 # loop start (words)
        out.extend(struct.pack('>H', len(data) // 2))    # loop length (words)
        sample_data.extend(data)

    for _ in range(len(samples), 31):                    # unused instruments
        out.extend(ZEROS[:22])
        out.extend(struct.pack('>H', 0))                 # length
        out.append(0)                                    # finetune
        out.append(0)                                    # volume
        out.extend(struct.pack('>H', 0))                 # loop start
        out.extend(struct.pack('>H', 1))                 # loop length (must be > 1)

    out.append(npat * 2)                                 # song length (32 rows/pattern)
    out.append(127)                                      # restart position
    order = [p for p in range(npat) for _ in range(64 // 8 * 4)]   # 4x per pattern
    out.extend(bytes((order + [0] * 128)[:128]))
    out.extend(b'M.K.')
    for p in patterns:
        out.extend(p)
    out.extend(sample_data)
    return bytes(out)


def main():
    vgm, mod = build_vgm(), build_mod()
    os.makedirs(os.path.join(ROOT, 'samples'), exist_ok=True)
    open(os.path.join(ROOT, 'samples/demo.vgm'), 'wb').write(vgm)
    open(os.path.join(ROOT, 'samples/demo.mod'), 'wb').write(mod)
    b64 = base64.b64encode(vgm).decode()
    b64m = base64.b64encode(mod).decode()
    open(os.path.join(ROOT, 'js/demo.js'), 'w').write(
        '// js/demo.js — built-in demo tunes, generated by tools/make-demo.py\n'
        '// Both are 100% self-generated (public domain) and drive the SELF TEST\n'
        '// button, so the console can prove both engines work without any file.\n'
        'export const DEMO_VGM_B64 = "' + b64 + '";\n'
        'export const DEMO_VGM_NAME = "chiptune-console-demo.vgm";\n'
        'export const DEMO_MOD_B64 = "' + b64m + '";\n'
        'export const DEMO_MOD_NAME = "chiptune-console-demo.mod";\n')
    print('samples/demo.vgm %7d bytes' % len(vgm))
    print('samples/demo.mod %7d bytes  (M.K. at %d)' % (len(mod), mod.find(b'M.K.')))
    print('js/demo.js       base64 %d + %d chars' % (len(b64), len(b64m)))


if __name__ == '__main__':
    main()
