/**
 * js/notes.js
 * Timestamped notes log and waveform flags.
 */
import { audio, state } from './main.js';
import { appState } from './api.js';

const WORKER_URL = 'https://millo-worker.millo-manager.workers.dev';

// UI Elements
const noteInputRow = document.getElementById('note-input-row');
const noteInput = document.getElementById('note-input');
const noteAddTime = document.getElementById('note-add-time');
const noteAddBtn = document.getElementById('note-add-btn');
const noteLog = document.getElementById('note-log');
const waveFlags = document.getElementById('wave-flags');

let capturedTime = 0;
let trackNotes = { general: '', timed: [] };

export async function loadTrackNotes(filename) {
  try {
    const res = await fetch(`${WORKER_URL}/notes`);
    const allNotes = await res.json();
    trackNotes = allNotes[filename] || { general: '', timed: [] };
    renderNoteLog();
  } catch (err) {
    console.error('Failed to load notes', err);
    trackNotes = { general: '', timed: [] };
  }
}

async function saveTrackNotes(filename) {
  let key = localStorage.getItem('millo-key') || '';
  try {
    await fetch(`${WORKER_URL}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Millo-Key': key },
      body: JSON.stringify({
        filename,
        general: document.getElementById('player-note').value,
        timed: trackNotes.timed
      })
    });
  } catch (err) {
    console.error('Note save failed', err);
  }
}

// Format seconds into M:SS
function fmtSec(s) {
  return `${Math.floor(s / 60)}:${(Math.floor(s) % 60).toString().padStart(2, '0')}`;
}

// Enter note creation mode
export function triggerNoteCapture() {
  if (!state.playingTrack || !audio.duration) return;
  
  capturedTime = audio.currentTime;
  noteAddTime.textContent = fmtSec(capturedTime);
  noteInputRow.classList.add('armed');
  noteInput.focus();
  
  // Switch to NOTES tab if not open
  document.querySelector('[data-tab="notes"]').click();
}

// Global N shortcut
document.addEventListener('keydown', (e) => {
  if (e.key === 'n' || e.key === 'N') {
    if (document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
      e.preventDefault();
      triggerNoteCapture();
    }
  }
  
  // Cancel on Escape
  if (e.key === 'Escape' && noteInputRow.classList.contains('armed')) {
    noteInputRow.classList.remove('armed');
    noteInput.value = '';
    noteInput.blur();
  }
});

noteAddBtn.addEventListener('click', triggerNoteCapture);

noteInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    const text = noteInput.value.trim();
    if (text && state.playingTrack) {
      trackNotes.timed.push({
        t: capturedTime,
        text: text,
        created: new Date().toISOString()
      });
      trackNotes.timed.sort((a, b) => a.t - b.t);
      
      saveTrackNotes(state.playingTrack.filename);
      renderNoteLog();
    }
    
    // Reset input
    noteInput.value = '';
    noteInputRow.classList.remove('armed');
    noteInput.blur();
  }
});

function renderNoteLog() {
  noteLog.innerHTML = '';
  if (waveFlags) waveFlags.innerHTML = '';
  
  const duration = audio.duration || 1;

  trackNotes.timed.forEach((n, idx) => {
    // 1. Terminal Log Line
    const line = document.createElement('div');
    line.className = 'note-log-line';
    
    const timeBtn = document.createElement('button');
    timeBtn.className = 'note-log-time';
    timeBtn.textContent = `[${fmtSec(n.t)}]`;
    timeBtn.addEventListener('click', () => { audio.currentTime = n.t; });
    
    const textSpan = document.createElement('span');
    textSpan.className = 'note-log-text';
    textSpan.textContent = n.text;
    
    const delBtn = document.createElement('button');
    delBtn.className = 'note-log-del';
    delBtn.textContent = '✕';
    delBtn.addEventListener('click', () => {
      trackNotes.timed.splice(idx, 1);
      saveTrackNotes(state.playingTrack.filename);
      renderNoteLog();
    });

    line.appendChild(timeBtn);
    line.appendChild(textSpan);
    line.appendChild(delBtn);
    noteLog.appendChild(line);

    // 2. Waveform Flag ▼
    if (waveFlags) {
      const pct = (n.t / duration) * 100;
      const flag = document.createElement('button');
      flag.className = 'wave-flag';
      flag.style.left = `${pct}%`;
      flag.textContent = '▼';
      flag.title = n.text;
      flag.addEventListener('click', (e) => {
        e.stopPropagation();
        audio.currentTime = n.t;
        
        // Flash the log line
        line.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        line.classList.add('flash');
        setTimeout(() => line.classList.remove('flash'), 1000);
      });
      waveFlags.appendChild(flag);
    }
  });
}