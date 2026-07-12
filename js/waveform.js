/* ============================================
   MILLO ARCHIVE v11 — waveform.js
   1-bit quantized pixel waveform scrubber (§5.1).
   ~200 bars, 8 height levels, ink-only rendering.
   Played = solid ink · unplayed = 50% dither · no peaks = flat bar.
============================================ */
import { getPeaks, postPeaks, cachePeaks } from './api.js';

const BUCKETS = 200;
const instances = [];

/* Deterministic placeholder waveform from the filename — so a track ALWAYS shows a
   waveform instantly, even before (or without) a real decode. Real decoded peaks
   replace this the moment they're available. Stable per-file, natural-looking envelope. */
export function synthPeaks(seed) {
  let h = 2166136261;
  const s = String(seed || '');
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  const rand = () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 1000) / 1000; };
  const out = new Array(BUCKETS);
  for (let i = 0; i < BUCKETS; i++) {
    const t = i / BUCKETS;
    // fade in/out envelope + a couple of slow swells so it reads like a real track
    const env = Math.sin(Math.PI * t) * (0.55 + 0.45 * Math.sin(t * 7 + rand() * 2));
    const jitter = 0.35 + rand() * 0.65;
    out[i] = Math.max(1, Math.min(7, Math.round(Math.abs(env) * jitter * 7)));
  }
  return out;
}

export class Waveform {
  constructor(canvas, opts) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.opts = opts || {};           // { onSeek(pct), onPreview(pct), flagsEl }
    this.peaks = null;                // [0-7 × 200] or null → flat bar
    this.progress = 0;                // 0..1
    this.flags = [];                  // [{t, text}]
    this.duration = 0;
    this.scrubbing = false;
    instances.push(this);
    this._bindScrub();
    // re-render on resize (canvas is CSS-sized)
    if (window.ResizeObserver) new ResizeObserver(() => this.render()).observe(canvas);
  }

  setPeaks(peaks, provisional) {
    this.peaks = Array.isArray(peaks) && peaks.length ? peaks : null;
    this.provisional = !!provisional;   // synthetic placeholder → render a touch lighter
    this.render();
  }

  setProgress(pct) {
    if (this.scrubbing) return;
    pct = Math.max(0, Math.min(1, pct || 0));
    // quantize redraws to bar resolution so we don't repaint 60×/sec for nothing
    if (Math.abs(pct - this.progress) < 0.004 && pct !== 0 && pct !== 1) return;
    this.progress = pct;
    this.render();
  }

  setFlags(flags, duration) {
    this.flags = flags || [];
    this.duration = duration || 0;
    this._renderFlags();
  }

  ink() {
    // resolved --ink via the canvas's computed color (canvas has color:var(--ink))
    return getComputedStyle(this.canvas).color || '#000';
  }

  render() {
    const c = this.canvas, ctx = this.ctx;
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth, h = c.clientHeight;
    if (!w || !h) return;
    if (c.width !== w * dpr || c.height !== h * dpr) { c.width = w * dpr; c.height = h * dpr; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = this.ink();

    if (!this.peaks) { this._renderFlatBar(w, h); return; }

    // bars: 3px wide + 1px gap, chunky pixels
    const step = 4, barW = 3;
    const bars = Math.max(10, Math.floor(w / step));
    const playedX = this.progress * w;

    for (let i = 0; i < bars; i++) {
      const x = i * step;
      const peak = this.peaks[Math.floor(i / bars * this.peaks.length)] || 0;
      const level = Math.max(1, peak + 1);                       // 1..8 so silence still shows a nub
      const barH = Math.round(level / 8 * (h - 2));
      const y = Math.round((h - barH) / 2);
      if (x + barW <= playedX) {
        ctx.globalAlpha = this.provisional ? 0.62 : 1;   // provisional placeholder reads lighter
        ctx.fillRect(x, y, barW, barH);
      } else {
        // unplayed: 50% dither — 2px checkerboard cells inside the bar
        ctx.globalAlpha = 1;
        for (let py = 0; py < barH; py += 2) {
          for (let px = 0; px < barW; px += 2) {
            if (((px >> 1) + ((y + py) >> 1)) % 2 === 0) {
              ctx.fillRect(x + px, y + py, 2, Math.min(2, barH - py));
            }
          }
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  /* fallback while peaks are missing/computing — playback never blocks */
  _renderFlatBar(w, h) {
    const ctx = this.ctx;
    const barH = 6, y = Math.round((h - barH) / 2);
    ctx.globalAlpha = 0.25;
    ctx.fillRect(0, y, w, barH);
    ctx.globalAlpha = 1;
    ctx.fillRect(0, y, Math.round(this.progress * w), barH);
    // square thumb
    const tx = Math.max(0, Math.min(w - 4, Math.round(this.progress * w) - 2));
    ctx.fillRect(tx, y - 4, 4, barH + 8);
  }

  _renderFlags() {
    const holder = this.opts.flagsEl;
    if (!holder) return;
    holder.innerHTML = '';
    if (!this.duration || !this.flags.length) return;
    this.flags.forEach(f => {
      const m = document.createElement('button');
      m.className = 'wave-flag';
      m.textContent = '▼';
      m.style.left = Math.max(0, Math.min(100, f.t / this.duration * 100)) + '%';
      m.title = f.text;
      m.addEventListener('click', e => {
        e.stopPropagation();
        if (this.opts.onFlagClick) this.opts.onFlagClick(f);
      });
      holder.appendChild(m);
    });
  }

  _pct(e) {
    const rect = this.canvas.getBoundingClientRect();
    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    return Math.max(0, Math.min(1, (cx - rect.left) / rect.width));
  }

  _bindScrub() {
    const start = e => {
      this.scrubbing = true;
      const p = this._pct(e);
      this.progress = p; this.render();
      if (this.opts.onPreview) this.opts.onPreview(p);
    };
    const move = e => {
      if (!this.scrubbing) return;
      const p = this._pct(e);
      this.progress = p; this.render();
      if (this.opts.onPreview) this.opts.onPreview(p);
    };
    const end = e => {
      if (!this.scrubbing) return;
      this.scrubbing = false;
      if (this.opts.onSeek) this.opts.onSeek(this.progress);
    };
    this.canvas.addEventListener('mousedown', start);
    this.canvas.addEventListener('touchstart', start, { passive: true });
    document.addEventListener('mousemove', move);
    document.addEventListener('touchmove', move, { passive: true });
    document.addEventListener('mouseup', end);
    document.addEventListener('touchend', end);
  }
}

/* theme toggled → ink color changed → repaint every canvas */
export function rerenderAllWaveforms() { instances.forEach(w => w.render()); }

/* ── Peaks pipeline (§5.1) ───────────────────
   first play with no cached peaks: fetch → decode → 200 buckets → 0-7 → POST.
   decode failure (huge WAVs, odd codecs) → flat bar forever, no error surfaced. */
const computing = new Set();
const failed = new Set();

export async function ensurePeaks(track, onReady) {
  if (!track || !track.filename || failed.has(track.filename)) return;
  const cached = await getPeaks(track.filename);
  if (cached) { onReady(cached); return; }
  if (computing.has(track.filename)) return;
  computing.add(track.filename);
  try {
    const buf = await fetch(track.file).then(r => r.arrayBuffer());
    const actx = new (window.AudioContext || window.webkitAudioContext)();
    const decoded = await actx.decodeAudioData(buf);
    const data = decoded.getChannelData(0);
    const bucketSize = Math.max(1, Math.floor(data.length / BUCKETS));
    const raw = new Array(BUCKETS).fill(0);
    for (let i = 0; i < BUCKETS; i++) {
      let max = 0;
      const startI = i * bucketSize, endI = Math.min(data.length, startI + bucketSize);
      // stride through the bucket — max-abs amplitude, sampled for speed
      const stride = Math.max(1, Math.floor((endI - startI) / 500));
      for (let j = startI; j < endI; j += stride) { const v = Math.abs(data[j]); if (v > max) max = v; }
      raw[i] = max;
    }
    actx.close();
    const overall = Math.max(0.001, ...raw);
    const peaks = raw.map(v => Math.min(7, Math.round(v / overall * 7)));
    cachePeaks(track.filename, peaks);
    onReady(peaks);            // render immediately…
    postPeaks(track.filename, peaks); // …then persist in the background
  } catch {
    failed.add(track.filename); // flat bar forever
  } finally {
    computing.delete(track.filename);
  }
}
