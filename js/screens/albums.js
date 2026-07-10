/**
 * js/screens/albums.js
 * Album workbench: Target sizes, readiness bars, and empty slots.
 */
import { appState, triggerStateSync } from '../api.js';
import { state } from '../main.js';

const STAGE_DITHER = { idea: 'dither-25', demo: 'dither-50', finished: 'dither-75', complete: 'dither-100' };

export function renderAlbumWorkbench(playlistId) {
  const pl = appState.playlists[playlistId];
  if (!pl) return;

  const targetRow = document.getElementById('album-target-row');
  const targetInput = document.getElementById('album-target-input');
  const runtimeInput = document.getElementById('album-target-runtime');
  const readinessContainer = document.getElementById('playlist-readiness');
  const detailBody = document.getElementById('playlist-detail-body');
  
  if (targetRow) targetRow.style.display = 'flex';

  // 1. Setup Target Inputs
  targetInput.value = pl.target || '';
  runtimeInput.value = pl.targetRuntime || '';

  const saveTargets = () => {
    pl.target = parseInt(targetInput.value) || null;
    pl.targetRuntime = runtimeInput.value || null;
    triggerStateSync();
    renderAlbumWorkbench(playlistId); // Re-render to update the bar
  };

  targetInput.onchange = saveTargets;
  runtimeInput.onchange = saveTargets;

  // 2. Readiness Bar
  readinessContainer.innerHTML = '';
  const readinessBar = document.createElement('div');
  readinessBar.className = 'readiness-bar';

  let resolvedTracks = [];

  // Track segments
  pl.tracks.forEach(pt => {
    const t = state.allTracks.find(track => track.filename === pt.filename);
    resolvedTracks.push(t);
    const seg = document.createElement('div');
    seg.className = `readiness-seg ${t ? STAGE_DITHER[t.stage] : 'dither-25'}`;
    readinessBar.appendChild(seg);
  });

  // Empty placeholder segments
  const targetCount = pl.target || 0;
  const currentCount = pl.tracks.length;
  if (targetCount > currentCount) {
    for (let i = 0; i < targetCount - currentCount; i++) {
      const seg = document.createElement('div');
      seg.className = 'readiness-seg readiness-empty';
      readinessBar.appendChild(seg);
    }
  }

  readinessContainer.appendChild(readinessBar);

  // 3. Render track rows (assume standard list rendering logic goes here, identical to your original)
  // ... [Existing track rendering loop] ...

  // 4. Empty Slot Rows (The Nag)
  if (targetCount > currentCount) {
    for (let i = 0; i < targetCount - currentCount; i++) {
      const emptySlot = document.createElement('div');
      emptySlot.className = 'pl-empty-slot';
      emptySlot.innerHTML = `<span class="pl-track-num">${String(currentCount + i + 1).padStart(2, '0')}</span> -- EMPTY SLOT --`;
      detailBody.appendChild(emptySlot);
    }
  }
}

// Generate the mini readiness bars for the grid view
export function renderAlbumGridMiniBar(playlistId, containerElement) {
  const pl = appState.playlists[playlistId];
  if (!pl || !containerElement) return;

  const bar = document.createElement('div');
  bar.className = 'readiness-bar readiness-mini';
  
  pl.tracks.forEach(pt => {
    const t = state.allTracks.find(track => track.filename === pt.filename);
    const seg = document.createElement('div');
    seg.className = `readiness-seg ${t ? STAGE_DITHER[t.stage] : 'dither-25'}`;
    bar.appendChild(seg);
  });

  const targetCount = pl.target || 0;
  if (targetCount > pl.tracks.length) {
    for (let i = 0; i < targetCount - pl.tracks.length; i++) {
      const seg = document.createElement('div');
      seg.className = 'readiness-seg readiness-empty';
      bar.appendChild(seg);
    }
  }

  containerElement.appendChild(bar);
}