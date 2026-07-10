/**
 * js/screens/voice.js
 * Renders the voice notes tab.
 */
import { state } from '../main.js';

export function renderVoiceList() {
  const voiceList = document.getElementById('voice-list');
  if (!voiceList) return;
  voiceList.innerHTML = '';

  const sorted = [...state.voiceTracks].sort((a, b) => (a.filename || '').localeCompare(b.filename || ''));

  if (!sorted.length) {
    voiceList.innerHTML = '<div class="sp-empty" style="padding:60px 20px; text-align:center; opacity:0.5;">NO VOICE NOTES FOUND.</div>';
    return;
  }

  const hdr = document.createElement('div');
  hdr.className = 'voice-header';
  hdr.textContent = `VOICE NOTES — ${sorted.length}`;
  voiceList.appendChild(hdr);

  sorted.forEach((track, i) => {
    const row = document.createElement('div');
    row.className = 'voice-row';
    row.innerHTML = `
      <span class="voice-row-num">${String(i+1).padStart(2, '0')}</span>
      <span class="voice-row-title">${track.title || track.filename}</span>
    `;
    
    // We will wire this up to the player next!
    row.addEventListener('click', () => console.log('Playing voice note:', track.title));
    voiceList.appendChild(row);
  });
}