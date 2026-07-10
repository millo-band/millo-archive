/**
 * js/api.js
 * Handles Worker communication, state syncing, and the Phase 1 localStorage migration.
 */

const WORKER_URL = 'https://millo-worker.millo-manager.workers.dev';

// In-memory state (source of truth for the app during runtime)
export const appState = {
  playlists: {},
  favorites: [],
  tagOverrides: {},
  voiceLinks: {},
  updated: null
};

// State sync indicator element
const syncIndicator = document.getElementById('sync-indicator');

function updateSyncUI(status) {
  if (!syncIndicator) return;
  syncIndicator.textContent = status;
  syncIndicator.dataset.state = status;
}

// Ensure we have an auth key for writes
function getAuthKey() {
  let key = localStorage.getItem('millo-key');
  if (!key) {
    key = prompt('KEY:');
    if (key) localStorage.setItem('millo-key', key);
  }
  return key;
}

function clearAuthKey() {
  localStorage.removeItem('millo-key');
}

// Core fetch wrapper for writes
async function fetchAPI(endpoint, options = {}) {
  const isWrite = ['POST', 'DELETE'].includes(options.method);
  const headers = { ...options.headers };
  
  if (isWrite) {
    headers['X-Millo-Key'] = getAuthKey();
  }

  const res = await fetch(`${WORKER_URL}${endpoint}`, { ...options, headers });
  
  if (res.status === 401 && isWrite) {
    clearAuthKey();
    alert('Unauthorized. Key cleared. Please retry to enter new key.');
    throw new Error('Unauthorized');
  }
  
  return res;
}

// ── PHASE 1: BOOT & AUTO-MIGRATION ──
export async function bootDataLayer() {
  updateSyncUI('SYNCING...');
  try {
    const res = await fetchAPI('/state');
    const serverState = await res.json();

    // Check for legacy local data
    const localPlaylists = JSON.parse(localStorage.getItem('millo-playlists-v1') || 'null');
    const localFavorites = JSON.parse(localStorage.getItem('millo-favorites-v1') || 'null');
    const localOverrides = JSON.parse(localStorage.getItem('millo-tag-overrides-v1') || 'null');
    const hasLocalData = localPlaylists || localFavorites || localOverrides;

    // If server is empty but we have local data, migrate it up!
    if (Object.keys(serverState).length === 0 && hasLocalData) {
      console.log('Migrating local data to server...');
      appState.playlists = localPlaylists || {};
      appState.favorites = localFavorites || [];
      appState.tagOverrides = localOverrides || {};
      appState.voiceLinks = {};
      
      await triggerStateSync(true); // Force immediate sync
    } else {
      // Use server as source of truth
      appState.playlists = serverState.playlists || {};
      appState.favorites = serverState.favorites || [];
      appState.tagOverrides = serverState.tagOverrides || {};
      appState.voiceLinks = serverState.voiceLinks || {};
      appState.updated = serverState.updated || null;
    }
    
    updateSyncUI('SYNCED');
  } catch (err) {
    console.error('Boot sync failed, using offline fallback.', err);
    updateSyncUI('OFFLINE');
    // Fallback to local storage if offline
    appState.playlists = JSON.parse(localStorage.getItem('millo-playlists-v1') || '{}');
    appState.favorites = JSON.parse(localStorage.getItem('millo-favorites-v1') || '[]');
    appState.tagOverrides = JSON.parse(localStorage.getItem('millo-tag-overrides-v1') || '{}');
  }
}

// ── DEBOUNCED STATE SYNC ──
let syncTimeout = null;

export async function triggerStateSync(immediate = false) {
  // Always update the local fallback immediately just in case
  localStorage.setItem('millo-playlists-v1', JSON.stringify(appState.playlists));
  localStorage.setItem('millo-favorites-v1', JSON.stringify(appState.favorites));
  localStorage.setItem('millo-tag-overrides-v1', JSON.stringify(appState.tagOverrides));

  updateSyncUI('SYNCING...');

  const doSync = async () => {
    try {
      const payload = {
        playlists: appState.playlists,
        favorites: appState.favorites,
        tagOverrides: appState.tagOverrides,
        voiceLinks: appState.voiceLinks
      };
      
      await fetchAPI('/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      updateSyncUI('SYNCED');
    } catch (err) {
      console.error('State sync failed', err);
      updateSyncUI('OFFLINE');
    }
  };

  if (immediate) {
    await doSync();
  } else {
    clearTimeout(syncTimeout);
    syncTimeout = setTimeout(doSync, 1000); // 1s debounce
  }
}

// ── UPLOAD DRIVER ──
export function uploadFile(file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${WORKER_URL}/upload`);
    xhr.setRequestHeader('X-Millo-Key', getAuthKey());
    xhr.setRequestHeader('X-Filename', encodeURIComponent(file.name));
    xhr.setRequestHeader('Content-Type', file.type || 'audio/mpeg');

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status === 401) {
        clearAuthKey();
        reject(new Error('Unauthorized'));
        return;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        reject(new Error(`Upload failed: ${xhr.status}`));
      }
    };

    xhr.onerror = () => reject(new Error('XHR Network Error'));
    xhr.send(file);
  });
}