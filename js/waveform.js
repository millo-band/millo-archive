/**
 * js/waveform.js
 * 1-bit quantized waveform generator and scrubber
 */
const BUCKETS = 200;
const LEVELS = 8;
const PEAK_CACHE = new Map(); // In-memory fallback
const WORKER_URL = 'https://millo-worker.millo-manager.workers.dev';

// Gets exact --ink color from CSS for current theme
function getInkColor() {
  return getComputedStyle(document.documentElement).getPropertyValue('--ink').trim() || '#0a0a0a';
}

export async function loadPeaks(filename, audioUrl) {
  if (PEAK_CACHE.has(filename)) return PEAK_CACHE.get(filename);

  try {
    // 1. Try to fetch cached peaks from the worker
    const res = await fetch(`${WORKER_URL}/peaks?f=${encodeURIComponent(filename)}`);
    if (res.ok) {
      const data = await res.json();
      if (data && data.length) {
        PEAK_CACHE.set(filename, data);
        return data;
      }
    }

    // 2. Generate peaks if missing (Web Audio API)
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const response = await fetch(audioUrl);
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    const channelData = audioBuffer.getChannelData(0); // Use left channel

    const step = Math.ceil(channelData.length / BUCKETS);
    const peaks = [];
    
    for (let i = 0; i < BUCKETS; i++) {
      let max = 0;
      for (let j = 0; j < step; j++) {
        const datum = channelData[(i * step) + j];
        if (datum !== undefined && Math.abs(datum) > max) {
          max = Math.abs(datum);
        }
      }
      // Quantize 0 to 7
      peaks.push(Math.min(LEVELS - 1, Math.floor(max * LEVELS * 1.5))); 
    }

    PEAK_CACHE.set(filename, peaks);

    // 3. Post to worker in background so we don't block
    let key = localStorage.getItem('millo-key') || '';
    fetch(`${WORKER_URL}/peaks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Millo-Key': key },
      body: JSON.stringify({ filename, peaks })
    }).catch(console.error);

    return peaks;
  } catch (err) {
    console.error('Peak generation failed, falling back to flat bar.', err);
    return null; // Null triggers flat bar fallback
  }
}

export function drawWaveform(canvas, peaks, progressPct) {
  if (!canvas || !peaks) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  
  ctx.clearRect(0, 0, w, h);
  
  const barWidth = 3;
  const gap = 1;
  const totalBarW = barWidth + gap;
  const barCount = Math.floor(w / totalBarW);
  
  // Resample peaks to fit canvas width
  const resampled = [];
  for (let i = 0; i < barCount; i++) {
    const origIdx = Math.floor((i / barCount) * peaks.length);
    resampled.push(peaks[origIdx] || 1);
  }

  const ink = getInkColor();
  const maxBarH = h;
  const levelH = maxBarH / LEVELS;

  resampled.forEach((peakLevel, i) => {
    const x = i * totalBarW;
    const barH = Math.max(1, peakLevel * levelH);
    const y = (h - barH) / 2; // Center vertically
    const isPlayed = (i / barCount) <= progressPct;

    ctx.fillStyle = ink;

    if (isPlayed) {
      // Solid ink for played region
      ctx.fillRect(x, y, barWidth, barH);
    } else {
      // 50% dither for unplayed region
      for (let px = 0; px < barWidth; px++) {
        for (let py = 0; py < barH; py++) {
          if ((x + px + Math.floor(y) + py) % 2 === 0) {
            ctx.fillRect(x + px, y + py, 1, 1);
          }
        }
      }
    }
  });
}

// Resizes canvas to fit container properly for sharp pixel rendering
export function resizeCanvas(canvas) {
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = rect.width;
  // Let CSS dictate height, match internal resolution
  canvas.height = rect.height || 54; 
}