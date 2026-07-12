/* ============================================
   MILLO ARCHIVE v11 — api.js
   Worker calls, server state sync, notes, peaks, upload.
   Playlists / favorites / tag overrides / voice links now live
   server-side (KV `state` key) with localStorage as fallback.
============================================ */
import {
  WORKER_URL, KEY_KEY, $,
  TAG_OVERRIDES_KEY, FAVORITES_KEY, PLAYLISTS_KEY,
} from './core.js';

/* ── Write key (the entire auth system — §3.2) ── */
let milloKey = null;
try { milloKey = localStorage.getItem(KEY_KEY); } catch {}
function askKey(){
  const k = prompt('KEY:');
  if (k === null) return false;
  milloKey = k.trim();
  try { localStorage.setItem(KEY_KEY, milloKey); } catch {}
  return true;
}
export function writeHeaders(extra){
  if (milloKey === null) askKey();
  return Object.assign({ 'X-Millo-Key': milloKey || '' }, extra || {});
}
/* POST/DELETE with 401 → clear key, re-prompt once, retry */
export async function apiWrite(path, opts){
  opts = opts || {};
  opts.headers = writeHeaders(opts.headers);
  let res = await fetch(WORKER_URL + path, opts);
  if (res.status === 401) {
    milloKey = null;
    try { localStorage.removeItem(KEY_KEY); } catch {}
    if (askKey()) {
      opts.headers['X-Millo-Key'] = milloKey || '';
      res = await fetch(WORKER_URL + path, opts);
    }
  }
  if (!res.ok) throw new Error('write failed ' + res.status);
  return res;
}

/* ── Sync indicator ── */
function setSync(status){ // 'SYNCED' | 'SYNCING…' | 'OFFLINE' | 'LOCAL'
  const el = $('sync-indicator');
  if (el){ el.textContent = status; el.dataset.state = status; }
}

/* ── Server state (playlists / favorites / tagOverrides / voiceLinks) ── */
export const serverState = { playlists:{}, favorites:[], tagOverrides:{}, voiceLinks:{}, lyrics:{} };
let serverReachable = false;

function readLocal(key, fallback){ try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; } catch { return fallback; } }
function localLegacy(){
  return {
    playlists:    readLocal(PLAYLISTS_KEY, {}),
    favorites:    readLocal(FAVORITES_KEY, []),
    tagOverrides: readLocal(TAG_OVERRIDES_KEY, {}),
    voiceLinks:   {},
    lyrics:       {},
  };
}
function hasData(s){
  return Object.keys(s.playlists||{}).length || (s.favorites||[]).length ||
         Object.keys(s.tagOverrides||{}).length || Object.keys(s.voiceLinks||{}).length ||
         Object.keys(s.lyrics||{}).length;
}

/* Boot: fetch /state; migrate localStorage up once if server is empty (§3.3). */
export async function loadServerState(){
  let remote = null;
  try {
    const res = await fetch(WORKER_URL + '/state');
    if (res.ok) { remote = await res.json(); serverReachable = true; }
  } catch {}

  if (serverReachable && remote && hasData(remote)) {
    Object.assign(serverState, {
      playlists: remote.playlists || {}, favorites: remote.favorites || [],
      tagOverrides: remote.tagOverrides || {}, voiceLinks: remote.voiceLinks || {},
      lyrics: remote.lyrics || {},
    });
    setSync('SYNCED');
  } else {
    // server empty or unreachable → use local legacy data
    Object.assign(serverState, localLegacy());
    if (serverReachable) {
      if (hasData(serverState)) { setSync('SYNCING…'); scheduleStateSync(); } // one-time migration up
      else setSync('SYNCED');
    } else {
      setSync('LOCAL'); // worker not updated yet / offline — keep working from localStorage
    }
  }
}

/* Debounced whole-state sync. Mirrors to localStorage as the fallback copy. */
let syncTimer = null, syncFailed = false;
export function scheduleStateSync(){
  mirrorLocal();
  if (!serverReachable) { setSync('LOCAL'); return; }
  setSync('SYNCING…');
  clearTimeout(syncTimer);
  syncTimer = setTimeout(async () => {
    try {
      await apiWrite('/state', {
        method:'POST', headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify(serverState),
      });
      syncFailed = false; setSync('SYNCED');
    } catch {
      syncFailed = true; setSync('OFFLINE'); // keep working from memory; retried on next change
    }
  }, 1000);
}
function mirrorLocal(){
  try {
    localStorage.setItem(PLAYLISTS_KEY, JSON.stringify(serverState.playlists));
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(serverState.favorites));
    localStorage.setItem(TAG_OVERRIDES_KEY, JSON.stringify(serverState.tagOverrides));
  } catch {}
}

/* ── Favorites ── */
export function getFavorites(){ return new Set(serverState.favorites); }
export function isFavorite(key){ return serverState.favorites.includes(key); }
export function toggleFavorite(key){
  const i = serverState.favorites.indexOf(key);
  if (i >= 0) serverState.favorites.splice(i, 1); else serverState.favorites.push(key);
  scheduleStateSync();
  return i < 0;
}

/* ── Playlists (ALBUMS) ── */
export function getPlaylists(){ return serverState.playlists; }
function saved(){ scheduleStateSync(); }

export function createPlaylist(name){
  const id = Date.now().toString(36);
  serverState.playlists[id] = { name, tracks:[], target:null, targetRuntime:null };
  saved(); return id;
}
export function deletePlaylist(id){ delete serverState.playlists[id]; saved(); }
export function addSongToPlaylist(playlistId, songKey, filename){
  const pl = serverState.playlists[playlistId]; if(!pl) return;
  if(!pl.tracks.find(t=>t.songKey===songKey)) pl.tracks.push({ songKey, filename });
  saved();
}
export function removeSongFromPlaylist(playlistId, songKey){
  const pl = serverState.playlists[playlistId]; if(!pl) return;
  pl.tracks = pl.tracks.filter(t=>t.songKey!==songKey);
  saved();
}
export function isSongInPlaylist(playlistId, songKey){
  const pl = serverState.playlists[playlistId];
  return !!(pl && pl.tracks.some(t=>t.songKey===songKey));
}
export function setTrackVersion(playlistId, songKey, filename){
  const pl = serverState.playlists[playlistId]; if(!pl) return;
  const t = pl.tracks.find(t=>t.songKey===songKey);
  if(t){ t.filename = filename; saved(); }
}
export function reorderPlaylistTrack(playlistId, fromIdx, toIdx){
  const pl = serverState.playlists[playlistId]; if(!pl) return;
  const [item] = pl.tracks.splice(fromIdx, 1); pl.tracks.splice(toIdx, 0, item);
  saved();
}
export function setPlaylistTarget(playlistId, target){
  const pl = serverState.playlists[playlistId]; if(!pl) return;
  pl.target = target; saved();
}
export function setPlaylistTargetRuntime(playlistId, seconds){
  const pl = serverState.playlists[playlistId]; if(!pl) return;
  pl.targetRuntime = seconds; saved();
}

/* ── Tag overrides ── */
export function getTagOverrides(){ return serverState.tagOverrides; }
export function setTagOverride(fn, stage){ serverState.tagOverrides[fn] = stage; saved(); }
export function applyTagOverrides(tracks){
  const o = serverState.tagOverrides;
  tracks.forEach(t=>{ if(t.filename && o[t.filename]) t.stage = o[t.filename]; });
}

/* ── Voice → song links (§6.5) ── */
export function getVoiceLinks(){ return serverState.voiceLinks; }
export function setVoiceLink(voiceFilename, songKey){
  if (songKey) serverState.voiceLinks[voiceFilename] = songKey;
  else delete serverState.voiceLinks[voiceFilename];
  saved();
}

/* ── Lyrics (song-level: shared across all versions, keyed by songKey) ── */
export function getLyrics(songKey){ return (serverState.lyrics && serverState.lyrics[songKey]) || ''; }
export function setLyrics(songKey, text){
  if (!serverState.lyrics) serverState.lyrics = {};
  const t = (text || '').replace(/\s+$/, '');
  if (t) serverState.lyrics[songKey] = t;
  else delete serverState.lyrics[songKey];
  saved();
}

/* ── Notes (notes2: { general, timed:[{t,text,created}] } per filename) ── */
export const notes = {};
export async function loadNotes(){
  try {
    const res = await fetch(WORKER_URL + '/notes');
    if (res.ok) {
      const data = await res.json();
      // normalize (legacy plain strings from an un-updated worker)
      for (const [fn, v] of Object.entries(data)) {
        notes[fn] = typeof v === 'string' ? { general: v, timed: [] } : { general: v.general || '', timed: v.timed || [] };
      }
    }
  } catch {}
}
export function noteFor(filename){
  if (!notes[filename]) notes[filename] = { general:'', timed:[] };
  return notes[filename];
}
const noteTimers = {};
export function saveNote(filename, statusEl){
  if (!filename) return;
  const entry = noteFor(filename);
  if (statusEl) statusEl.textContent = '…';
  clearTimeout(noteTimers[filename]);
  noteTimers[filename] = setTimeout(async () => {
    try {
      await apiWrite('/notes', {
        method:'POST', headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ filename, general: entry.general, timed: entry.timed }),
      });
      if (statusEl){ statusEl.textContent = 'SAVED'; setTimeout(()=>{ statusEl.textContent=''; }, 1800); }
    } catch { if (statusEl) statusEl.textContent = 'ERROR'; }
  }, 800);
}

/* ── Waveform peaks ── */
const peaksCache = {};
export async function getPeaks(filename){
  if (filename in peaksCache) return peaksCache[filename];
  try {
    const res = await fetch(WORKER_URL + '/peaks?f=' + encodeURIComponent(filename));
    if (res.ok) {
      const p = await res.json();
      // only accept a genuine quantized-peaks array — an un-updated worker falls
      // through to the track listing (array of objects), which must NOT poison the waveform
      const valid = Array.isArray(p) && p.length && p.every(n => typeof n === 'number');
      peaksCache[filename] = valid ? p : null;
      return peaksCache[filename];
    }
  } catch {}
  peaksCache[filename] = null;
  return null;
}
export function cachePeaks(filename, peaks){ peaksCache[filename] = peaks; }
export async function postPeaks(filename, peaks){
  cachePeaks(filename, peaks);
  try {
    await apiWrite('/peaks', {
      method:'POST', headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ filename, peaks }),
    });
  } catch {}
}

/* ── Upload (XHR — fetch can't report upload progress) ── */
export function uploadFile(file, onProgress){
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', WORKER_URL + '/upload');
    const headers = writeHeaders({
      'X-Filename': encodeURIComponent(file.name),
      'Content-Type': file.type || 'application/octet-stream',
    });
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.addEventListener('progress', e => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
    });
    xhr.addEventListener('load', () => {
      if (xhr.status === 401) {
        milloKey = null;
        try { localStorage.removeItem(KEY_KEY); } catch {}
        reject(new Error('KEY REJECTED'));
      }
      else if (xhr.status >= 200 && xhr.status < 300) {
        let data; try { data = JSON.parse(xhr.responseText); } catch { data = null; }
        // Old worker has no /upload route → falls through to the track listing (an array).
        // Detect that so we surface a clear "redeploy" error instead of corrupting state.
        if (!data || Array.isArray(data) || !data.filename) {
          reject(new Error('WORKER OUTDATED — redeploy worker.js'));
        } else resolve(data);
      }
      else reject(new Error('upload failed ' + xhr.status));
    });
    xhr.addEventListener('error', () => reject(new Error('network error')));
    xhr.send(file);
  });
}
