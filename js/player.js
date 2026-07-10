/**
 * js/player.js
 * Core playback, A/B compare, and utility disclosure logic.
 */
import { audio, state } from './main.js';
import { loadPeaks, drawWaveform, resizeCanvas } from './waveform.js';

let currentPeaks = null;

// The UI Elements
const waveCanvas = document.getElementById('wave-canvas');
const playerFull = document.getElementById('player-full');
const utilToggle = document.getElementById('util-toggle');
const utilBody = document.getElementById('util-body');
const abSwitchWrap = document.getElementById('ab-switch-wrap');
const abSwitchBtn = document.getElementById('ab-switch');

// ── UTIL DISCLOSURE (§5.4) ──
if (utilToggle && utilBody) {
  // Load saved state
  const utilOpen = localStorage.getItem('millo-util-open') === 'true';
  utilBody.style.display = utilOpen ? 'block' : 'none';
  utilToggle.textContent = utilOpen ? 'UTIL ▾' : 'UTIL ▸';

  utilToggle.addEventListener('click', () => {
    const isHidden = utilBody.style.display === 'none';
    utilBody.style.display = isHidden ? 'block' : 'none';
    utilToggle.textContent = isHidden ? 'UTIL ▾' : 'UTIL ▸';
    localStorage.setItem('millo-util-open', isHidden);
  });
}

// ── WAVEFORM INTEGRATION ──
export async function loadTrackIntoPlayer(track) {
  if (!track) return;
  
  audio.src = track.file;
  audio.load();

  // Resize canvas for sharp pixels
  resizeCanvas(waveCanvas);

  // Trigger peak loading in the background
  currentPeaks = null; // Clear old peaks while loading
  renderPlaybackState(); // Fallback flat bar initially

  currentPeaks = await loadPeaks(track.filename, track.file);
  renderPlaybackState(); // Re-render with real waveform
}

export function renderPlaybackState() {
  const progressPct = audio.duration ? (audio.currentTime / audio.duration) : 0;
  
  if (currentPeaks && waveCanvas) {
    drawWaveform(waveCanvas, currentPeaks, progressPct);
  } else {
    // Legacy fallback styling just in case decode fails
    const ctx = waveCanvas.getContext('2d');
    ctx.clearRect(0, 0, waveCanvas.width, waveCanvas.height);
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--ink');
    ctx.fillRect(0, waveCanvas.height / 2 - 2, waveCanvas.width * progressPct, 4);
  }

  document.getElementById('player-time').textContent = fmtSec(audio.currentTime);
  document.getElementById('player-dur').textContent = fmtSec(audio.duration || 0);
}

// Update loop for smooth scrubbing
audio.addEventListener('timeupdate', renderPlaybackState);

// Waveform click-to-seek
waveCanvas.addEventListener('click', (e) => {
  const rect = waveCanvas.getBoundingClientRect();
  const pct = (e.clientX - rect.left) / rect.width;
  if (audio.duration) {
    audio.currentTime = pct * audio.duration;
    renderPlaybackState();
  }
});

// ── A/B COMPARE (§5.3) ──
let abState = { a: null, b: null, active: 'a' };

export function assignAB(slot, track) {
  abState[slot] = track;
  if (abState.a && abState.b) {
    abSwitchWrap.style.display = 'flex';
  }
}

abSwitchBtn.addEventListener('click', flipAB);

export function flipAB() {
  if (!abState.a || !abState.b) return;
  
  const currentTime = audio.currentTime;
  const wasPlaying = !audio.paused;
  
  abState.active = abState.active === 'a' ? 'b' : 'a';
  abSwitchBtn.parentElement.classList.toggle('b', abState.active === 'b');
  
  const newTrack = abState[abState.active];
  
  // Swap source seamlessly
  audio.src = newTrack.file;
  audio.load();
  
  audio.addEventListener('loadedmetadata', function onLoaded() {
    audio.currentTime = Math.min(currentTime, audio.duration);
    if (wasPlaying) audio.play();
    audio.removeEventListener('loadedmetadata', onLoaded);
  });
}

// Keybind listener from the global space
document.addEventListener('keydown', (e) => {
  if (e.key === 'x' || e.key === 'X') {
    if (document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
      flipAB();
    }
  }
});

function fmtSec(s) {
  if (!s || isNaN(s)) return '0:00';
  return `${Math.floor(s / 60)}:${(Math.floor(s) % 60).toString().padStart(2, '0')}`;
}