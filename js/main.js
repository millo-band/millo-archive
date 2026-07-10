/**
 * js/main.js
 * App bootstrap, global state, and Phase 2 routing.
 */
import { bootDataLayer, appState } from './api.js';
import { setupArchive, renderArchive } from './screens/archive.js';
import { renderVault } from './screens/vault.js';
import { renderVoiceList } from './screens/voice.js';
import { setupUpload } from './upload.js';

const WORKER_URL = 'https://millo-worker.millo-manager.workers.dev';
export const audio = document.getElementById('audio-player');

// Shared mutable state
export const state = {
  allTracks: [],
  groups: [],
  filteredGroups: [],
  voiceTracks: [],
  playingTrack: null,
  playingGroup: null,
  isPlaying: false,
  activeTab: 'archive',
  currentFilter: 'all',
  currentSort: 'newest',
  searchQuery: ''
};

const STAGE_RANK = { idea: 0, demo: 1, finished: 2, complete: 3 };

function isVoiceNote(t) { return t.filename && /voice/i.test(t.filename); }

function buildGroups(tracks) {
  const map = new Map();
  tracks.forEach(t => {
    if (isVoiceNote(t)) return;
    const key = t.title.toLowerCase();
    if (!map.has(key)) map.set(key, { title: t.title, tracks: [], stages: new Set(), latestDate: '1970-01-01' });
    const g = map.get(key);
    g.tracks.push(t);
    g.stages.add(t.stage);
    if ((t.uploaded || '') > g.latestDate) g.latestDate = t.uploaded;
  });
  
  const groups = [];
  for (const g of map.values()) {
    g.tracks.sort((a, b) => {
      const sr = STAGE_RANK[a.stage] - STAGE_RANK[b.stage];
      if (sr !== 0) return sr;
      return (b.uploaded || '') > (a.uploaded || '') ? 1 : -1;
    });
    g.stage = [...g.stages].sort((a, b) => STAGE_RANK[b] - STAGE_RANK[a])[0];
    g.type = g.tracks.length > 1 ? 'group' : 'single';
    groups.push(g);
  }
  return groups;
}

// ── PHASE 2: BOTTOM TAB ROUTING ──
function handleHashChange() {
  const hash = window.location.hash.replace('#', '') || 'archive';
  state.activeTab = hash;
  document.body.dataset.screen = hash;

  // Update Tab Bar UI
  document.querySelectorAll('.tabbar-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.screen === hash);
  });

  // Update Screens
  document.querySelectorAll('.screen').forEach(screen => {
    screen.classList.toggle('active', screen.id === `screen-${hash}`);
  });

  // Controls visibility
  const isArchive = hash === 'archive';
  document.getElementById('controls-bar').style.display = isArchive ? 'flex' : 'none';
  document.getElementById('stage-chips-bar').style.display = isArchive ? 'flex' : 'none';

  // Actively render the requested screen
  if (hash === 'archive') renderArchive();
  else if (hash === 'vault') renderVault();
  else if (hash === 'voice') renderVoiceList();
  // Albums will be wired up once we port the grid view over!
}

window.addEventListener('hashchange', handleHashChange);
document.querySelectorAll('.tabbar-btn').forEach(btn => {
  btn.addEventListener('click', () => { window.location.hash = btn.dataset.screen; });
});

// ── BOOT ──
async function init() {
  await bootDataLayer();
  
  try {
    const res = await fetch(WORKER_URL);
    const tracks = await res.json();
    
    tracks.forEach((t, i) => t._idx = i);
    
    // Apply server tag overrides
    tracks.forEach(t => {
      if (t.filename && appState.tagOverrides[t.filename]) {
        t.stage = appState.tagOverrides[t.filename];
      }
    });

    state.allTracks = tracks;
    state.voiceTracks = tracks.filter(isVoiceNote);
    const nonVoice = tracks.filter(t => !isVoiceNote(t));
    
    state.groups = buildGroups(nonVoice);
    state.filteredGroups = state.groups;
    
    document.getElementById('loading-state').style.display = 'none';
    
    // Initialize components
    setupArchive();
    setupUpload();
    handleHashChange(); // Trigger initial render

  } catch (err) {
    document.getElementById('loading-state').innerHTML = `<span class="loading-text">ERROR: ${err.message}</span>`;
  }
}

init();