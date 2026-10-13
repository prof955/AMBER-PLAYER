// viz.js — canvas rendering for the spectrum analyser and the oscilloscope.
// All values come from a real AnalyserNode (no fake/simulated data).

const AMBER = '#ffb000';
const AMBER_DIM = 'rgba(255,176,0,0.30)';
const AMBER_FAINT = 'rgba(255,176,0,0.14)';
const HOT = '#ff8a3c';

function fit(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const r = canvas.getBoundingClientRect();
  const w = Math.max(16, Math.floor(r.width * dpr));
  const h = Math.max(16, Math.floor(r.height * dpr));
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  return { w, h, dpr };
}

export class Spectrum {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {HTMLElement} labelsEl  container that receives the frequency ticks
   * @param {number} bars           number of bars
   */
  constructor(canvas, labelsEl, bars = 96) {
    this.canvas = canvas;
    this.labelsEl = labelsEl;
    this.bars = bars;
    this.peaks = new Float32Array(bars);
    this.levels = new Float32Array(bars);
    this.minHz = 30;
    this.maxHz = 18000;
    this.labelMarks = [];
  }

  /** map bar index -> frequency (log scale) */
  barHz(i, nyquist) {
    const f = this.minHz * Math.pow(this.maxHz / this.minHz, i / (this.bars - 1));
    return Math.min(f, nyquist);
  }

  buildLabels(nyquist) {
    if (!this.labelsEl) return;
    this.labelsEl.innerHTML = '';
    const marks = [30, 50, 100, 200, 300, 500, 1000, 2000, 3000, 5000, 10000, 15000];
    const fmt = (f) => f >= 1000 ? (f / 1000) + 'k' : String(f);
    for (const f of marks) {
      if (f > nyquist) continue;
      const t = Math.log(f / this.minHz) / Math.log(this.maxHz / this.minHz);
      const s = document.createElement('span');
      s.textContent = fmt(f);
      s.style.left = (t * 100).toFixed(2) + '%';
      this.labelsEl.append(s);
    }
  }

  draw(freqData, nyquist, active = true) {
    const { w, h, dpr } = fit(this.canvas);
    const ctx = this.canvas.getContext('2d');
    ctx.clearRect(0, 0, w, h);

    // background grid
    ctx.strokeStyle = AMBER_FAINT;
    ctx.lineWidth = Math.max(1, Math.floor(dpr / 2));
    for (let i = 0; i <= 10; i++) {
      const x = Math.round((i / 10) * w) + 0.5;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let i = 1; i < 4; i++) {
      const y = Math.round((i / 4) * h) + 0.5;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    if (!freqData || !active) {
      this.peaks.fill(0);
      ctx.fillStyle = 'rgba(255,176,0,0.30)';
      ctx.font = `${Math.round(14 * dpr)}px ${getComputedStyle(document.body).fontFamily || 'monospace'}`;
      ctx.textAlign = 'center';
      ctx.fillText('STANDBY — SES BEKLENİYOR', w / 2, h / 2);
      ctx.textAlign = 'left';
      return;
    }

    const bins = freqData.length;
    const bw = w / this.bars;
    const binHz = nyquist / bins;
    for (let i = 0; i < this.bars; i++) {
      const f0 = this.barHz(i, nyquist);
      const f1 = this.barHz(i + 1, nyquist);
      let b0 = Math.max(0, Math.floor(f0 / binHz));
      let b1 = Math.max(b0 + 1, Math.ceil(f1 / binHz));
      b1 = Math.min(b1, bins);
      let sum = 0, n = 0;
      for (let b = b0; b < b1; b++) { sum += freqData[b]; n++; }
      const v = n ? (sum / n) / 255 : 0;                 // 0..1
      const lvl = Math.pow(v, 0.82);
      this.levels[i] = lvl;
      this.peaks[i] = Math.max(lvl, this.peaks[i] - 0.012);
      const x = i * bw;
      const bh = Math.max(1, lvl * (h - 4));
      // bar
      ctx.fillStyle = lvl > 0.92 ? HOT : AMBER;
      ctx.globalAlpha = 0.92;
      ctx.fillRect(x + bw * 0.15, h - bh - 1, Math.max(1, bw * 0.7), bh);
      ctx.globalAlpha = 1;
      // peak hold
      if (this.peaks[i] > 0.02) {
        ctx.fillStyle = '#ffd478';
        ctx.fillRect(x + bw * 0.15, h - this.peaks[i] * (h - 4) - 3, Math.max(1, bw * 0.7), Math.max(1, dpr));
      }
    }
  }
}

export class Scope {
  constructor(canvas) { this.canvas = canvas; }

  draw(timeData, active = true) {
    const { w, h, dpr } = fit(this.canvas);
    const ctx = this.canvas.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = AMBER_FAINT; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, h / 2 + 0.5); ctx.lineTo(w, h / 2 + 0.5); ctx.stroke();
    if (!timeData || !active) return;

    // find a zero crossing so the trace looks stable
    let start = 0;
    const mid = timeData.length >> 1;
    for (let i = 0; i < mid; i++) if (timeData[i] <= 0 && timeData[i + 1] > 0) { start = i; break; }
    const len = Math.min(timeData.length - start, mid);
    const step = Math.max(1, Math.floor(len / w));
    ctx.beginPath();
    ctx.strokeStyle = AMBER;
    ctx.lineWidth = Math.max(1, dpr);
    ctx.shadowColor = 'rgba(255,176,0,.65)';
    ctx.shadowBlur = 4 * dpr;
    for (let x = 0; x < w; x++) {
      const idx = start + x * step;
      const v = timeData[idx] || 0;
      const y = h / 2 - v * (h / 2 - 2);
      x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
}

/** LED-style channel meter: a DOM bar + peak marker driven by real levels. */
export class LedMeter {
  constructor(container, segments = 24) {
    this.wrap = container;
    this.fill = document.createElement('div');
    this.fill.className = 'fill';
    this.peak = document.createElement('div');
    this.peak.className = 'peak';
    this.wrap.append(this.fill, this.peak);
    this.segments = segments;
    this.value = 0;
    this.peakV = 0;
  }

  set(v, instant = false) {
    const target = Math.max(0, Math.min(1, v));
    this.value = instant ? target : this.value + (target - this.value) * (target > this.value ? 0.55 : 0.14);
    this.peakV = Math.max(this.value, this.peakV - 0.012);
    this.fill.style.transform = `scaleX(${this.value.toFixed(4)})`;
    this.fill.style.filter = this.value > 0.97 ? 'hue-rotate(-28deg) brightness(1.25)' : 'none';
    this.peak.style.left = (this.peakV * 100).toFixed(2) + '%';
    this.peak.style.opacity = this.peakV > 0.02 ? '0.85' : '0';
  }

  toBlocks() {  // fallback: block characters for the compact input-channel rows
    const on = Math.round(this.value * this.segments);
    return on;
  }
}
