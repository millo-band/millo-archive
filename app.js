/* ============================================
   MILLO ARCHIVE v10 — app.js
============================================ */
(function () {
  'use strict';

  const WORKER_URL        = 'https://millo-worker.millo-manager.workers.dev';
  const NEW_DAYS          = 7;
  const TAG_OVERRIDES_KEY = 'millo-tag-overrides-v1';
  const FAVORITES_KEY     = 'millo-favorites-v1';
  const PLAYLISTS_KEY     = 'millo-playlists-v1';
  const audio             = document.getElementById('audio-player');

  function isVoiceNote(t) { return t.filename && /voice/i.test(t.filename); }

  const TAG_LABEL  = { idea:'IDEA', demo:'DEMO', finished:'FIN', complete:'COMP' };
  const TAG_SHORT  = { idea:'I', demo:'D', finished:'F', complete:'C' };
  const TAG_FULL   = { idea:'IDEA', demo:'DEMO', finished:'FINISHED', complete:'COMPLETE' };
  const STAGE_RANK = { idea:0, demo:1, finished:2, complete:3 };

  // ── Favorites ──────────────────────────────
  function getFavorites()      { try { return new Set(JSON.parse(localStorage.getItem(FAVORITES_KEY)||'[]')); } catch { return new Set(); } }
  function saveFavorites(s)    { localStorage.setItem(FAVORITES_KEY, JSON.stringify([...s])); }
  function isFavorite(key)     { return getFavorites().has(key); }
  function toggleFavorite(key) { const f=getFavorites(); f.has(key)?f.delete(key):f.add(key); saveFavorites(f); return f.has(key); }

  // ── Playlists ───────────────────────────────
  function getPlaylists()    { try { return JSON.parse(localStorage.getItem(PLAYLISTS_KEY)||'{}'); } catch { return {}; } }
  function savePlaylists(d)  { localStorage.setItem(PLAYLISTS_KEY, JSON.stringify(d)); }

  function createPlaylist(name) {
    const d=getPlaylists(), id=Date.now().toString(36);
    d[id]={name, tracks:[]}; savePlaylists(d); return id;
  }
  function deletePlaylist(id) { const d=getPlaylists(); delete d[id]; savePlaylists(d); }

  function addSongToPlaylist(playlistId, songKey, filename) {
    const d=getPlaylists(); if(!d[playlistId])return;
    if(!d[playlistId].tracks.find(t=>t.songKey===songKey))
      d[playlistId].tracks.push({songKey, filename});
    savePlaylists(d);
  }
  function removeSongFromPlaylist(playlistId, songKey) {
    const d=getPlaylists(); if(!d[playlistId])return;
    d[playlistId].tracks=d[playlistId].tracks.filter(t=>t.songKey!==songKey);
    savePlaylists(d);
  }
  function isSongInPlaylist(playlistId, songKey) {
    const d=getPlaylists(); return !!(d[playlistId]&&d[playlistId].tracks.some(t=>t.songKey===songKey));
  }
  function setTrackVersion(playlistId, songKey, filename) {
    const d=getPlaylists(); if(!d[playlistId])return;
    const t=d[playlistId].tracks.find(t=>t.songKey===songKey);
    if(t){t.filename=filename; savePlaylists(d);}
  }
  function reorderPlaylistTrack(playlistId, fromIdx, toIdx) {
    const d=getPlaylists(); if(!d[playlistId])return;
    const arr=d[playlistId].tracks;
    const [item]=arr.splice(fromIdx,1); arr.splice(toIdx,0,item);
    savePlaylists(d);
  }

  // ── Tag overrides ──────────────────────────
  function getTagOverrides()        { try { return JSON.parse(localStorage.getItem(TAG_OVERRIDES_KEY)||'{}'); } catch { return {}; } }
  function setTagOverride(fn,stage) { const o=getTagOverrides(); o[fn]=stage; localStorage.setItem(TAG_OVERRIDES_KEY,JSON.stringify(o)); }
  function applyTagOverrides(tracks){ const o=getTagOverrides(); tracks.forEach(t=>{ if(t.filename&&o[t.filename])t.stage=o[t.filename]; }); }

  // ── Notes (KV via worker) ──────────────────
  const notes = {};
  async function loadNotes() {
    try { const res=await fetch(WORKER_URL+'/notes'); if(res.ok)Object.assign(notes,await res.json()); } catch {}
  }

  let noteSaveTimer=null;
  function scheduleNoteSave(filename, text) {
    clearTimeout(noteSaveTimer);
    el.noteStatus.textContent='...';
    noteSaveTimer=setTimeout(async()=>{
      try {
        await fetch(WORKER_URL+'/notes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({filename,note:text})});
        if(text.trim())notes[filename]=text.trim(); else delete notes[filename];
        el.noteStatus.textContent='SAVED';
        setTimeout(()=>{el.noteStatus.textContent='';},1800);
      } catch{el.noteStatus.textContent='ERROR';}
    },800);
  }

  // ── State ──────────────────────────────────
  const state = {
    allTracks:[], groups:[], filteredGroups:[], voiceTracks:[],
    shuffleQueue:[], currentFilter:'all', currentSort:'newest',
    isShuffling:false, playingTrack:null, playingGroup:null,
    isPlaying:false, scrubbing:false,
    playerExpanded:false, looping:false, activeTab:'notes',
    editMode:false, selectedFilenames:new Set(),
    searchQuery:'',
    songPageGroup:null,
    activePlaylistId:null,
    playlistQueue:[],
    openPlaylistId:null,
  };

  const $ = id=>document.getElementById(id);
  const el = {
    grid:$('tracks-grid'), empty:$('empty-state'), loading:$('loading-state'),
    whatsNew:$('whats-new'), newRow:$('new-tracks-row'),
    headerStats:$('header-stats'),
    voiceList:$('voice-list'), voiceCountBadge:$('voice-count-badge'),
    filterToggle:$('filter-btn-toggle'), filterLabel:$('filter-label'),
    filterMenu:$('filter-menu'), filterItems:document.querySelectorAll('#filter-menu .dropdown-item'),
    sortToggle:$('sort-btn-toggle'), sortLabel:$('sort-label'),
    sortMenu:$('sort-menu'), sortItems:document.querySelectorAll('#sort-menu .dropdown-item'),
    searchBtn:$('search-btn'), searchBar:$('search-bar'),
    searchInput:$('search-input'), searchClear:$('search-clear'),
    playerBar:$('player-bar'), playerFull:$('player-full'),
    playerToggleBtn:$('player-toggle-btn'),
    playerTitleLg:$('player-title-lg'), playerStageLg:$('player-stage-lg'),
    playerFilenameLg:$('player-filename-lg'), playerFavBtn:$('player-fav-btn'),
    playerVersionsList:$('player-versions'), noVersionsMsg:$('no-versions-msg'),
    tabBtnVersions:$('tab-btn-versions'), tabBtnQueue:$('tab-btn-queue'),
    playerQueueList:$('player-queue-list'),
    progressTrack:$('player-progress-track'),
    progressFill:$('player-progress-fill'), progressThumb:$('player-progress-thumb'),
    playerTime:$('player-time'), playerDur:$('player-dur'),
    btnPlay:$('btn-play'), btnPrev:$('btn-prev'), btnNext:$('btn-next'), btnLoop:$('btn-loop'),
    iconPlay:$('icon-play'), iconPause:$('icon-pause'),
    downloadBtn:$('download-btn'),
    tagEditBtns:document.querySelectorAll('.tag-edit-btn'),
    playerNote:$('player-note'), noteStatus:$('note-status'),
    playerVolume:$('player-volume'), volPct:$('vol-pct'),
    playerTitle:$('player-title'), playerStage:$('player-stage'),
    playerExpandBtn:$('player-expand-btn'),
    miniFill:$('player-mini-fill'),
    miniBtnPlay:$('mini-btn-play'), miniBtnPrev:$('mini-btn-prev'), miniBtnNext:$('mini-btn-next'),