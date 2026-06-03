/* ============================================
   MILLO ARCHIVE v10 — app.js
============================================ */
(function () {
  'use strict';

  const WORKER_URL        = 'https://millo-worker.millo-manager.workers.dev';
  const NEW_DAYS          = 7;
  const TAG_OVERRIDES_KEY = 'millo-tag-overrides-v1';
  const FAVORITES_KEY     = 'millo-favorites-v1';
  const FOLDERS_KEY       = 'millo-folders-v1';
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

  // ── Folders ────────────────────────────────
  function getFolderData()   { try { return JSON.parse(localStorage.getItem(FOLDERS_KEY)||'{}'); } catch { return {}; } }
  function saveFolderData(d) { localStorage.setItem(FOLDERS_KEY, JSON.stringify(d)); }
  function createFolder(name) {
    const d=getFolderData(), id=Date.now().toString(36);
    d[id]={name, songs:[]}; saveFolderData(d); return id;
  }
  function deleteFolder(id) { const d=getFolderData(); delete d[id]; saveFolderData(d); }
  function toggleSongInFolder(folderId, songKey) {
    const d=getFolderData(); if(!d[folderId])return;
    const idx=d[folderId].songs.indexOf(songKey);
    idx>=0 ? d[folderId].songs.splice(idx,1) : d[folderId].songs.push(songKey);
    saveFolderData(d);
  }
  function isSongInFolder(folderId, songKey) { const d=getFolderData(); return !!(d[folderId]&&d[folderId].songs.includes(songKey)); }

  // ── Tag overrides ──────────────────────────
  function getTagOverrides()        { try { return JSON.parse(localStorage.getItem(TAG_OVERRIDES_KEY)||'{}'); } catch { return {}; } }
  function setTagOverride(fn,stage) { const o=getTagOverrides(); o[fn]=stage; localStorage.setItem(TAG_OVERRIDES_KEY,JSON.stringify(o)); }
  function applyTagOverrides(tracks){ const o=getTagOverrides(); tracks.forEach(t=>{ if(t.filename&&o[t.filename])t.stage=o[t.filename]; }); }

  // ── Notes (KV via worker) ──────────────────
  const notes = {};

  async function loadNotes() {
    try {
      const res = await fetch(WORKER_URL + '/notes');
      if (res.ok) Object.assign(notes, await res.json());
    } catch {}
  }

  let noteSaveTimer = null;
  function scheduleNoteSave(filename, text) {
    clearTimeout(noteSaveTimer);
    el.noteStatus.textContent = '...';
    noteSaveTimer = setTimeout(async () => {
      try {
        await fetch(WORKER_URL + '/notes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename, note: text }),
        });
        if (text.trim()) notes[filename] = text.trim(); else delete notes[filename];
        el.noteStatus.textContent = 'SAVED';
        setTimeout(() => { el.noteStatus.textContent = ''; }, 1800);
      } catch { el.noteStatus.textContent = 'ERROR'; }
    }, 800);
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
    songPageGroup: null,
    currentFolder: null,
  };

  const $ = id => document.getElementById(id);
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
    // player
    playerBar:$('player-bar'), playerFull:$('player-full'),
    playerToggleBtn:$('player-toggle-btn'),
    playerTitleLg:$('player-title-lg'), playerStageLg:$('player-stage-lg'),
    playerFilenameLg:$('player-filename-lg'), playerFavBtn:$('player-fav-btn'),
    playerVersionsList:$('player-versions'), noVersionsMsg:$('no-versions-msg'),
    tabBtnVersions:$('tab-btn-versions'),
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
    miniIconPlay:$('mini-icon-play'), miniIconPause:$('mini-icon-pause'),
    editModeBtn:$('edit-mode-btn'), massEditBar:$('mass-edit-bar'),
    massEditCount:$('mass-edit-count'), massEditDone:$('mass-edit-done'),
    massTagBtns:document.querySelectorAll('.mass-tag-btn'),
    // overlays
    songPage:$('song-page'), songPageTitle:$('song-page-title'), songPageBody:$('song-page-body'),
    foldersPage:$('folders-page'), foldersBody:$('folders-body'),
    folderBreadcrumb:$('folder-breadcrumb'), folderBcName:$('folder-bc-name'),
  };

  // ── Dropdowns ──────────────────────────────
  function setupDropdown(btn, menu) {
    btn.addEventListener('click', e => { e.stopPropagation(); const o=menu.classList.contains('open'); closeAllDropdowns(); if(!o)menu.classList.add('open'); });
  }
  function closeAllDropdowns() { document.querySelectorAll('.dropdown-menu').forEach(m=>m.classList.remove('open')); }
  document.addEventListener('click', closeAllDropdowns);
  setupDropdown(el.filterToggle, el.filterMenu);
  setupDropdown(el.sortToggle, el.sortMenu);

  el.filterItems.forEach(item => {
    item.addEventListener('click', () => {
      const f = item.dataset.filter;
      state.currentFilter = f;
      el.filterLabel.textContent = f==='voice'?'VOICE':f==='starred'?'STARRED':item.textContent.trim().replace(/[^A-Z\s★]/g,'').trim();
      el.filterItems.forEach(x=>x.classList.toggle('active',x===item));
      el.filterToggle.classList.toggle('active', f!=='all');
      closeAllDropdowns(); render();
    });
  });

  el.sortItems.forEach(item => {
    item.addEventListener('click', () => {
      const s = item.dataset.sort;
      el.sortLabel.textContent = item.textContent.trim();
      el.sortItems.forEach(x=>x.classList.toggle('active',x===item));
      el.sortToggle.classList.toggle('active', s!=='newest');
      closeAllDropdowns();
      if(s==='shuffle'){activateShuffle();return;}
      state.currentSort=s; state.isShuffling=false; $('shuffle-radio-btn').classList.remove('playing'); render();
    });
  });

  // ── Search ─────────────────────────────────
  el.searchBtn.addEventListener('click', () => {
    const open = !document.body.classList.contains('search-open');
    document.body.classList.toggle('search-open', open);
    el.searchBtn.classList.toggle('active', open);
    el.searchBar.style.display = open ? 'flex' : 'none';
    if (open) el.searchInput.focus();
    else { el.searchInput.value=''; state.searchQuery=''; render(); }
  });
  el.searchInput.addEventListener('input', () => { state.searchQuery=el.searchInput.value.trim().toLowerCase(); render(); });
  el.searchClear.addEventListener('click', () => { el.searchInput.value=''; state.searchQuery=''; el.searchInput.focus(); render(); });

  // ── Player tabs ────────────────────────────
  document.querySelectorAll('.ptab').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      state.activeTab = tab;
      document.querySelectorAll('.ptab').forEach(b=>b.classList.toggle('active',b===btn));
      document.querySelectorAll('.ptab-panel').forEach(p=>p.classList.toggle('active',p.id===`tab-${tab}`));
    });
  });

  // ── Build groups ───────────────────────────
  function buildGroups(tracks) {
    const map = new Map();
    tracks.forEach(t => {
      if (isVoiceNote(t)) return;
      const key = t.title.toLowerCase();
      if (!map.has(key)) map.set(key,{title:t.title,tracks:[],stages:new Set(),latestDate:'1970-01-01'});
      const g=map.get(key); g.tracks.push(t); g.stages.add(t.stage);
      if((t.uploaded||'')>g.latestDate)g.latestDate=t.uploaded;
    });
    const groups=[];
    for (const g of map.values()) {
      g.tracks.sort((a,b)=>{ const sr=STAGE_RANK[a.stage]-STAGE_RANK[b.stage]; if(sr!==0)return sr; return(b.uploaded||'')>(a.uploaded||'')?1:-1; });
      g.stage=[...g.stages].sort((a,b)=>STAGE_RANK[b]-STAGE_RANK[a])[0];
      g.type=g.tracks.length>1?'group':'single'; groups.push(g);
    }
    return groups;
  }

  function sortGroups(groups,sort) {
    if(sort==='shuffle')return shuffle([...groups]);
    return[...groups].sort((a,b)=>sort==='newest'?(b.latestDate>a.latestDate?1:-1):(a.latestDate>b.latestDate?1:-1));
  }
  function filterGroups(groups,filter) {
    if(filter==='all'||filter==='voice')return groups;
    if(filter==='starred')return groups.filter(g=>isFavorite(g.title.toLowerCase()));
    return groups.filter(g=>g.stages.has(filter));
  }
  function filterByFolder(groups) {
    if(!state.currentFolder)return groups;
    const d=getFolderData(), folder=d[state.currentFolder.id];
    if(!folder)return groups;
    return groups.filter(g=>folder.songs.includes(g.title.toLowerCase()));
  }
  function searchGroups(groups,q) { if(!q)return groups; return groups.filter(g=>g.title.toLowerCase().includes(q)); }

  function shuffle(arr){for(let i=arr.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[arr[i],arr[j]]=[arr[j],arr[i]];}return arr;}
  function isNew(d){return d&&(Date.now()-new Date(d).getTime())<NEW_DAYS*86400000;}
  function fmtSec(s){if(!s||isNaN(s))return'0:00';return`${Math.floor(s/60)}:${(Math.floor(s)%60).toString().padStart(2,'0')}`;}
  function fmtDate(d){return d?d.slice(5):'';}

  // ── Render ─────────────────────────────────
  function render() {
    el.grid.innerHTML=''; el.voiceList.innerHTML='';
    updateFolderBreadcrumb();
    if (state.currentFilter==='voice') {
      el.grid.style.display='none'; el.empty.style.display='none'; el.loading.style.display='none';
      el.voiceList.style.display='block'; el.voiceList.classList.add('visible');
      el.whatsNew.style.display='none'; renderVoiceList(); return;
    }
    el.grid.style.display='grid'; el.voiceList.style.display='none'; el.voiceList.classList.remove('visible');
    const visible=searchGroups(filterByFolder(sortGroups(filterGroups(state.groups,state.currentFilter),state.currentSort)),state.searchQuery);
    state.filteredGroups=visible;
    if(!visible.length){el.empty.style.display='block';return;}
    el.empty.style.display='none';
    visible.forEach((group,gIdx)=>{ el.grid.appendChild(buildCard(group,gIdx)); });
    if (state.searchQuery||state.currentFolder) el.whatsNew.style.display='none'; else renderWhatsNew();
    renderStats(); refreshPlayingState();
  }

  function updateFolderBreadcrumb() {
    if (state.currentFolder) {
      el.folderBreadcrumb.style.display='flex';
      el.folderBcName.textContent=state.currentFolder.name.toUpperCase();
      document.body.classList.add('folder-active');
    } else {
      el.folderBreadcrumb.style.display='none';
      document.body.classList.remove('folder-active');
    }
  }

  function renderVoiceList() {
    const sorted=[...state.voiceTracks].sort((a,b)=>(a.filename||'').localeCompare(b.filename||''));
    if(!sorted.length){el.empty.style.display='block';return;}
    el.empty.style.display='none';
    const hdr=document.createElement('div'); hdr.className='voice-header'; hdr.textContent=`VOICE NOTES — ${sorted.length}`; el.voiceList.appendChild(hdr);
    sorted.forEach((track,i)=>{
      const row=document.createElement('div'); row.className='voice-row'; row.dataset.trackIdx=track._idx;
      const num=document.createElement('span'); num.className='voice-row-num'; num.textContent=String(i+1).padStart(2,'0');
      const title=document.createElement('span'); title.className='voice-row-title'; title.textContent=track.title||track.filename;
      const dur=document.createElement('span'); dur.className='voice-row-dur'; dur.dataset.trackIdx=track._idx;
      row.appendChild(num); row.appendChild(title); row.appendChild(dur);
      row.addEventListener('click',()=>playTrack(track,null)); el.voiceList.appendChild(row);
    });
    refreshPlayingState();
  }

  function buildCard(group,gIdx) {
    const playT=group.tracks[group.tracks.length-1];
    const hasVersions=group.tracks.length>1;
    const fresh=isNew(group.latestDate);
    const card=document.createElement('div');
    card.className='track-card'+(hasVersions?' has-versions':'');
    card.dataset.gIdx=gIdx; card.dataset.trackIdx=playT._idx; card.dataset.filename=playT.filename||'';

    const check=document.createElement('div'); check.className='card-select-check'; card.appendChild(check);

    const body=document.createElement('div'); body.className='card-body';
    const top=document.createElement('div'); top.className='card-top';
    const badges=document.createElement('div'); badges.className='card-badges';
    if(TAG_LABEL[group.stage]){const pill=document.createElement('span');pill.className='tag-pill';pill.textContent=TAG_LABEL[group.stage];badges.appendChild(pill);}
    if(fresh){const nb=document.createElement('span');nb.className='new-badge';nb.textContent='NEW';badges.appendChild(nb);}
    top.appendChild(badges);
    const dot=document.createElement('div'); dot.className='playing-dot'; dot.style.display='none'; top.appendChild(dot);
    body.appendChild(top);
    const titleEl=document.createElement('div'); titleEl.className='card-title'; titleEl.textContent=group.title; body.appendChild(titleEl);
    const footer=document.createElement('div'); footer.className='card-footer';
    const dur=document.createElement('span'); dur.className='card-duration'; dur.dataset.trackIdx=playT._idx; footer.appendChild(dur);

    const viewBtn=document.createElement('button');
    viewBtn.className='view-song-btn';
    viewBtn.textContent=hasVersions?`${group.tracks.length} VER →`:'→';
    viewBtn.setAttribute('aria-label','View song page');
    viewBtn.addEventListener('click',e=>{e.stopPropagation();openSongPage(group);});
    footer.appendChild(viewBtn);

    body.appendChild(footer); card.appendChild(body);

    const star=document.createElement('button');
    star.className='card-star'+(isFavorite(group.title.toLowerCase())?' starred':'');
    star.textContent='★'; star.setAttribute('aria-label','Favourite');
    star.addEventListener('click',e=>{
      e.stopPropagation();
      const nowStarred=toggleFavorite(group.title.toLowerCase());
      star.classList.toggle('starred',nowStarred);
      if(state.playingGroup&&state.playingGroup.title.toLowerCase()===group.title.toLowerCase())
        el.playerFavBtn.classList.toggle('starred',nowStarred);
      if(state.currentFilter==='starred')render();
    });
    card.appendChild(star);
    card.addEventListener('click',()=>{ state.editMode?toggleCardSelection(card,playT.filename):playTrack(playT,group); });
    return card;
  }

  // ── Song Page ───────────────────────────────
  function openSongPage(group) {
    state.songPageGroup=group;
    renderSongPage(group);
    el.songPage.style.display='flex';
    document.body.classList.add('overlay-open');
    history.pushState({song:group.title},'','?song='+encodeURIComponent(group.title));
  }

  function closeSongPage() {
    el.songPage.style.display='none';
    document.body.classList.remove('overlay-open');
    state.songPageGroup=null;
    const url=new URL(window.location); url.searchParams.delete('song');
    history.pushState({},'',url.toString());
  }

  function renderSongPage(group) {
    el.songPageTitle.textContent=group.title.toUpperCase();
    el.songPageBody.innerHTML='';

    const sorted=[...group.tracks].sort((a,b)=>(b.uploaded||'')>(a.uploaded||'')?1:-1);
    const latest=sorted[0];

    // ── Latest Version Hero ──
    const heroSec=document.createElement('div'); heroSec.className='sp-section';
    const heroLbl=document.createElement('div'); heroLbl.className='sp-section-label'; heroLbl.textContent='LATEST VERSION';
    heroSec.appendChild(heroLbl);

    const hero=document.createElement('div'); hero.className='sp-hero';
    const heroTop=document.createElement('div'); heroTop.className='sp-hero-top';

    const playBtn=document.createElement('button'); playBtn.className='sp-play-btn';
    playBtn.innerHTML=`<svg width="22" height="22" viewBox="0 0 16 16"><polygon points="2,1 2,15 14,8" fill="currentColor"/></svg>`;
    playBtn.addEventListener('click',()=>{ playTrack(latest,group); closeSongPage(); });
    heroTop.appendChild(playBtn);

    const heroMeta=document.createElement('div'); heroMeta.className='sp-hero-meta';
    if(latest.stage){ const pill=document.createElement('span'); pill.className='sp-stage-pill'; pill.textContent=TAG_FULL[latest.stage]||latest.stage; heroMeta.appendChild(pill); }
    if(latest.version){ const ver=document.createElement('span'); ver.className='sp-hero-ver'; ver.textContent=`v${latest.version}`; heroMeta.appendChild(ver); }
    const heroDate=document.createElement('span'); heroDate.className='sp-hero-date'; heroDate.textContent=fmtDate(latest.uploaded); heroMeta.appendChild(heroDate);
    const heroDur=document.createElement('span'); heroDur.className='sp-hero-dur'; heroDur.dataset.trackIdx=latest._idx; heroMeta.appendChild(heroDur);
    heroTop.appendChild(heroMeta);
    hero.appendChild(heroTop);

    const heroNote=document.createElement('div');
    heroNote.className='sp-hero-note'+(notes[latest.filename]?'':' empty');
    heroNote.textContent=notes[latest.filename]||'No note yet.';
    hero.appendChild(heroNote);
    heroSec.appendChild(hero);
    el.songPageBody.appendChild(heroSec);

    // ── All Versions ──
    const versSec=document.createElement('div'); versSec.className='sp-section';
    const versLbl=document.createElement('div'); versLbl.className='sp-section-label';
    versLbl.textContent=`ALL VERSIONS — ${sorted.length}`; versSec.appendChild(versLbl);

    sorted.forEach((track,i)=>{
      const row=document.createElement('div');
      row.className='sp-ver-row'+(i===0?' sp-ver-latest':'');
      row.dataset.trackIdx=track._idx;

      const rowTop=document.createElement('div'); rowTop.className='sp-ver-row-top';

      const stagePill=document.createElement('span'); stagePill.className='sp-stage-pill sp-stage-sm';
      stagePill.textContent=TAG_LABEL[track.stage]||'?'; rowTop.appendChild(stagePill);

      if(track.version){ const ver=document.createElement('span'); ver.className='sp-ver-label'; ver.textContent=`v${track.version}`; rowTop.appendChild(ver); }
      const date=document.createElement('span'); date.className='sp-ver-date'; date.textContent=fmtDate(track.uploaded); rowTop.appendChild(date);

      const sp=document.createElement('span'); sp.style.flex='1'; rowTop.appendChild(sp);

      if(i===0){ const lb=document.createElement('span'); lb.className='sp-latest-badge'; lb.textContent='LATEST'; rowTop.appendChild(lb); }

      const dur=document.createElement('span'); dur.className='sp-ver-dur'; dur.dataset.trackIdx=track._idx; rowTop.appendChild(dur);

      row.appendChild(rowTop);

      const noteEl=document.createElement('div');
      noteEl.className='sp-ver-note'+(notes[track.filename]?'':' empty');
      noteEl.textContent=notes[track.filename]||'No note.';
      row.appendChild(noteEl);

      row.addEventListener('click',()=>{ playTrack(track,group); closeSongPage(); });
      versSec.appendChild(row);
    });
    el.songPageBody.appendChild(versSec);

    // ── Folders section ──
    renderSongPageFolders(group);
  }

  function renderSongPageFolders(group) {
    const existing=el.songPageBody.querySelector('.sp-folders-section');
    if(existing)existing.remove();

    const sec=document.createElement('div'); sec.className='sp-section sp-folders-section';
    const lbl=document.createElement('div'); lbl.className='sp-section-label'; lbl.textContent='FOLDERS'; sec.appendChild(lbl);

    const chips=document.createElement('div'); chips.className='sp-folder-chips';
    const folders=getFolderData();
    const songKey=group.title.toLowerCase();

    Object.entries(folders).forEach(([id,folder])=>{
      const chip=document.createElement('button');
      chip.className='sp-folder-chip'+(folder.songs.includes(songKey)?' active':'');
      chip.textContent=folder.name.toUpperCase();
      chip.addEventListener('click',()=>{
        toggleSongInFolder(id,songKey);
        chip.classList.toggle('active',isSongInFolder(id,songKey));
      });
      chips.appendChild(chip);
    });

    const newBtn=document.createElement('button');
    newBtn.className='sp-folder-chip sp-folder-new';
    newBtn.textContent='+ NEW FOLDER';
    newBtn.addEventListener('click',()=>{
      const name=prompt('Folder name:');
      if(!name||!name.trim())return;
      const id=createFolder(name.trim());
      toggleSongInFolder(id,songKey);
      renderSongPageFolders(group);
    });
    chips.appendChild(newBtn);
    sec.appendChild(chips);
    el.songPageBody.appendChild(sec);
  }

  // ── Folders Page ────────────────────────────
  function openFoldersPage() {
    renderFoldersPage();
    el.foldersPage.style.display='flex';
    document.body.classList.add('overlay-open');
  }

  function closeFoldersPage() {
    el.foldersPage.style.display='none';
    document.body.classList.remove('overlay-open');
  }

  function renderFoldersPage() {
    el.foldersBody.innerHTML='';
    const folders=getFolderData();
    const entries=Object.entries(folders);

    if(!entries.length){
      const empty=document.createElement('div'); empty.className='sp-empty';
      empty.innerHTML='NO FOLDERS YET.<br><br>OPEN ANY SONG PAGE AND TAP<br>"+ NEW FOLDER" TO CREATE ONE.';
      el.foldersBody.appendChild(empty); return;
    }

    const grid=document.createElement('div'); grid.className='folder-grid';

    entries.forEach(([id,folder])=>{
      const card=document.createElement('div'); card.className='folder-card';

      const icon=document.createElement('div'); icon.className='folder-card-icon';
      icon.innerHTML=`<svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M3 7h5l3 3h10v11H3V7z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="miter" fill="none"/></svg>`;

      const name=document.createElement('div'); name.className='folder-card-name'; name.textContent=folder.name.toUpperCase();
      const count=document.createElement('div'); count.className='folder-card-count'; count.textContent=`${folder.songs.length} SONG${folder.songs.length!==1?'S':''}`;

      const del=document.createElement('button'); del.className='folder-card-del'; del.textContent='✕'; del.setAttribute('aria-label','Delete');
      del.addEventListener('click',e=>{
        e.stopPropagation();
        if(!confirm(`Delete folder "${folder.name}"?`))return;
        deleteFolder(id);
        if(state.currentFolder&&state.currentFolder.id===id){ state.currentFolder=null; render(); }
        renderFoldersPage();
      });

      card.appendChild(icon); card.appendChild(name); card.appendChild(count); card.appendChild(del);
      card.addEventListener('click',()=>{
        state.currentFolder={id,name:folder.name};
        closeFoldersPage(); render();
      });
      grid.appendChild(card);
    });

    el.foldersBody.appendChild(grid);
  }

  // ── Share ───────────────────────────────────
  async function shareGroup(group) {
    const url=window.location.origin+window.location.pathname+'?song='+encodeURIComponent(group.title);
    if(navigator.share){
      try{ await navigator.share({title:group.title+' — MILLO ARCHIVE',url}); return; }catch{}
    }
    try{ await navigator.clipboard.writeText(url); showShareToast('LINK COPIED ✓'); }
    catch{ showShareToast('COPY FAILED'); }
  }

  function showShareToast(msg) {
    const t=document.createElement('div'); t.className='share-toast'; t.textContent=msg;
    document.body.appendChild(t);
    requestAnimationFrame(()=>t.classList.add('visible'));
    setTimeout(()=>{ t.classList.remove('visible'); setTimeout(()=>t.remove(),350); },2500);
  }

  // ── What's New ─────────────────────────────
  function renderWhatsNew() {
    const sorted=sortGroups(state.groups,'newest').slice(0,5);
    const recent=sorted.filter(g=>isNew(g.latestDate));
    const show=recent.length>0?recent:sorted.slice(0,3);
    el.newRow.innerHTML='';
    if (!show.length) { el.whatsNew.style.display='none'; return; }
    show.forEach(group=>{
      const playT=group.tracks[group.tracks.length-1];
      const chip=document.createElement('div'); chip.className='new-track-chip'; chip.dataset.trackIdx=playT._idx;
      if(isNew(group.latestDate)){const nb=document.createElement('span');nb.className='chip-new-badge';nb.textContent='NEW';chip.appendChild(nb);}
      const title=document.createElement('span'); title.className='chip-title'; title.textContent=group.title; chip.appendChild(title);
      if(TAG_LABEL[group.stage]){const tag=document.createElement('span');tag.className='chip-tag';tag.textContent=TAG_LABEL[group.stage];chip.appendChild(tag);}
      chip.addEventListener('click',()=>playTrack(playT,group)); el.newRow.appendChild(chip);
    });
    el.whatsNew.style.display='block';
  }

  function renderStats() {
    const counts=['demo','finished','complete','idea'].map(s=>`${state.groups.filter(g=>g.stages.has(s)).length}${TAG_SHORT[s]}`);
    el.headerStats.textContent=counts.join(' · ')+` · ${state.voiceTracks.length}V`;
  }

  function refreshPlayingState() {
    const idx=state.playingTrack?state.playingTrack._idx:null;
    document.querySelectorAll('.track-card').forEach(card=>{
      const group=state.filteredGroups[card.dataset.gIdx];
      const active=group&&state.playingGroup&&group.title.toLowerCase()===state.playingGroup.title.toLowerCase();
      card.classList.toggle('playing',!!active);
      const dot=card.querySelector('.playing-dot'); if(dot)dot.style.display=active?'block':'none';
      if(state.editMode)card.classList.toggle('selected',state.selectedFilenames.has(card.dataset.filename));
    });
    document.querySelectorAll('.voice-row').forEach(row=>row.classList.toggle('playing',parseInt(row.dataset.trackIdx)===idx));
    document.querySelectorAll('.new-track-chip').forEach(chip=>{
      const g=state.groups.find(gr=>gr.tracks.some(t=>t._idx===parseInt(chip.dataset.trackIdx)));
      chip.classList.toggle('playing',!!(g&&state.playingGroup&&g.title.toLowerCase()===state.playingGroup.title.toLowerCase()));
    });
    document.querySelectorAll('.pver-row').forEach(row=>row.classList.toggle('active',parseInt(row.dataset.trackIdx)===idx));
    document.querySelectorAll('.sp-ver-row').forEach(row=>row.classList.toggle('sp-playing',parseInt(row.dataset.trackIdx)===idx));
  }

  function loadAllDurations(tracks) {
    tracks.forEach(t=>{
      const probe=new Audio(); probe.preload='metadata'; probe.src=t.file;
      probe.addEventListener('loadedmetadata',()=>{
        const dur=fmtSec(probe.duration);
        document.querySelectorAll(`[data-track-idx="${t._idx}"]`).forEach(node=>{
          if(node.classList.contains('card-duration')||node.classList.contains('version-row-dur')||
             node.classList.contains('voice-row-dur')||node.classList.contains('pver-row-dur')||
             node.classList.contains('sp-ver-dur')||node.classList.contains('sp-hero-dur'))
            node.textContent=dur;
        });
      });
    });
  }

  // ── Player bar update ──────────────────────
  function updatePlayerBar(track, group) {
    if (!track) {
      el.playerTitle.textContent='— SELECT A TRACK —';
      el.playerStage.textContent=''; el.playerStage.style.display='none';
      el.playerTitleLg.textContent='SELECT A TRACK';
      el.playerStageLg.textContent=''; el.playerStageLg.style.display='none';
      el.playerFilenameLg.textContent='';
      el.playerFavBtn.classList.remove('starred');
      el.downloadBtn.style.display='none';
      el.playerNote.value=''; el.playerNote.disabled=true;
      el.playerVersionsList.innerHTML=''; el.noVersionsMsg.style.display='block';
      updateTagEditorState(null); return;
    }

    el.playerTitle.textContent=track.title;
    el.playerStage.textContent=TAG_LABEL[track.stage]||'';
    el.playerStage.style.display=TAG_LABEL[track.stage]?'inline-block':'none';
    el.playerTitleLg.textContent=track.title;
    el.playerStageLg.textContent=TAG_FULL[track.stage]||'';
    el.playerStageLg.style.display=TAG_FULL[track.stage]?'inline-block':'none';
    el.playerFilenameLg.textContent=track.filename||'';

    const favKey=group?group.title.toLowerCase():track.title.toLowerCase();
    el.playerFavBtn.classList.toggle('starred', isFavorite(favKey));

    el.downloadBtn.href=track.file;
    el.downloadBtn.download=track.filename||track.title;
    el.downloadBtn.style.display='flex';

    el.playerNote.disabled=false;
    el.playerNote.value=notes[track.filename]||'';
    el.noteStatus.textContent='';

    el.playerVersionsList.innerHTML='';
    const hasVersions=group&&group.tracks.length>1;
    el.tabBtnVersions.style.display=hasVersions?'':'none';
    el.noVersionsMsg.style.display=hasVersions?'none':'block';

    if (hasVersions) {
      const sorted=[...group.tracks].sort((a,b)=>(b.uploaded||'')>(a.uploaded||'')?1:-1);
      sorted.forEach((t,i)=>{
        const row=document.createElement('div');
        row.className='pver-row'+(t._idx===track._idx?' active':'');
        row.dataset.trackIdx=t._idx;
        const stage=document.createElement('span'); stage.className='pver-row-stage'; stage.textContent=TAG_SHORT[t.stage]||'?';
        const label=document.createElement('span'); label.className='pver-row-label'; label.textContent=t.version?`v${t.version}`:'—';
        const date=document.createElement('span'); date.className='pver-row-date'; date.textContent=fmtDate(t.uploaded);
        const spacer=document.createElement('span'); spacer.className='pver-row-spacer';
        const dur=document.createElement('span'); dur.className='pver-row-dur'; dur.dataset.trackIdx=t._idx;
        const latest=document.createElement('span'); latest.className='pver-row-latest'; latest.textContent=i===0?'LATEST':'';
        row.appendChild(stage); row.appendChild(label); row.appendChild(date);
        row.appendChild(spacer); row.appendChild(latest); row.appendChild(dur);
        row.addEventListener('click',()=>playTrack(t,group));
        el.playerVersionsList.appendChild(row);
      });
    }

    updateTagEditorState(track);
  }

  function updateTagEditorState(track) {
    el.tagEditBtns.forEach(btn=>{
      btn.disabled=!track;
      btn.classList.toggle('active',track&&btn.dataset.stage===track.stage);
    });
  }

  // ── Progress ───────────────────────────────
  function setPlayPauseUI(p) {
    el.iconPlay.style.display=p?'none':'block';
    el.iconPause.style.display=p?'block':'none';
    el.miniIconPlay.style.display=p?'none':'block';
    el.miniIconPause.style.display=p?'block':'none';
  }

  function updateProgress() {
    if (state.scrubbing) return;
    const pos=audio.currentTime, dur=audio.duration||0;
    const pct=dur>0?(pos/dur):0;
    el.progressFill.style.width=`${pct*100}%`;
    el.progressThumb.style.left=`${pct*100}%`;
    el.miniFill.style.width=`${pct*100}%`;
    el.playerTime.textContent=fmtSec(pos);
    el.playerDur.textContent=fmtSec(dur);
  }

  // ── Scrub ──────────────────────────────────
  function getScrubPct(e){const rect=el.progressTrack.getBoundingClientRect();const cx=e.touches?e.touches[0].clientX:e.clientX;return Math.max(0,Math.min(1,(cx-rect.left)/rect.width));}
  function applyScrub(pct){el.progressFill.style.width=`${pct*100}%`;el.progressThumb.style.left=`${pct*100}%`;if(audio.duration)el.playerTime.textContent=fmtSec(pct*audio.duration);}
  el.progressTrack.addEventListener('mousedown',e=>{state.scrubbing=true;applyScrub(getScrubPct(e));});
  el.progressTrack.addEventListener('touchstart',e=>{state.scrubbing=true;applyScrub(getScrubPct(e));},{passive:true});
  document.addEventListener('mousemove',e=>{if(state.scrubbing)applyScrub(getScrubPct(e));});
  document.addEventListener('touchmove',e=>{if(state.scrubbing)applyScrub(getScrubPct(e));},{passive:true});
  function commitScrub(e){if(!state.scrubbing)return;state.scrubbing=false;if(audio.duration)audio.currentTime=getScrubPct(e)*audio.duration;}
  document.addEventListener('mouseup',commitScrub);
  document.addEventListener('touchend',commitScrub);

  // ── Volume ─────────────────────────────────
  function setVolume(v) {
    v=Math.max(0,Math.min(1,v));
    audio.volume=v; el.playerVolume.value=v;
    el.volPct.textContent=Math.round(v*100)+'%';
  }
  el.playerVolume.addEventListener('input',()=>setVolume(parseFloat(el.playerVolume.value)));
  $('vol-down').addEventListener('click',()=>setVolume(audio.volume-0.1));
  $('vol-up').addEventListener('click',  ()=>setVolume(audio.volume+0.1));

  // ── Loop ───────────────────────────────────
  el.btnLoop.addEventListener('click',()=>{
    state.looping=!state.looping; audio.loop=state.looping;
    el.btnLoop.classList.toggle('active',state.looping);
  });

  // ── Notes ──────────────────────────────────
  el.playerNote.addEventListener('input',()=>{
    if(!state.playingTrack)return;
    scheduleNoteSave(state.playingTrack.filename, el.playerNote.value);
  });
  el.playerNote.addEventListener('keydown',e=>e.stopPropagation());

  // ── Player expand / collapse ───────────────
  function setPlayerExpanded(expanded) {
    state.playerExpanded=expanded;
    document.body.classList.toggle('player-expanded',expanded);
  }
  el.playerToggleBtn.addEventListener('click',()=>setPlayerExpanded(!state.playerExpanded));
  el.playerExpandBtn.addEventListener('click',()=>{ if(state.playingTrack)setPlayerExpanded(!state.playerExpanded); });
  $('player-close-btn').addEventListener('click',()=>setPlayerExpanded(false));

  // ── Favourite from player ──────────────────
  el.playerFavBtn.addEventListener('click',()=>{
    if(!state.playingTrack)return;
    const key=state.playingGroup?state.playingGroup.title.toLowerCase():state.playingTrack.title.toLowerCase();
    const nowStarred=toggleFavorite(key);
    el.playerFavBtn.classList.toggle('starred',nowStarred);
    document.querySelectorAll('.card-star').forEach(s=>{
      const card=s.closest('.track-card'); if(!card)return;
      const g=state.filteredGroups[card.dataset.gIdx];
      if(g&&g.title.toLowerCase()===key)s.classList.toggle('starred',nowStarred);
    });
    if(state.currentFilter==='starred')render();
  });

  // ── Tag editing ────────────────────────────
  el.tagEditBtns.forEach(btn=>{
    btn.addEventListener('click',()=>{
      if(!state.playingTrack)return;
      const stage=btn.dataset.stage, track=state.playingTrack, group=state.playingGroup;
      setTagOverride(track.filename,stage); track.stage=stage;
      if(group){group.stages=new Set(group.tracks.map(t=>t.stage));group.stage=[...group.stages].sort((a,b)=>STAGE_RANK[b]-STAGE_RANK[a])[0];}
      updatePlayerBar(track,group); render();
    });
  });

  // ── Edit / mass select ─────────────────────
  el.editModeBtn.addEventListener('click',()=>{
    state.editMode=!state.editMode; state.selectedFilenames.clear();
    el.editModeBtn.classList.toggle('active',state.editMode);
    document.body.classList.toggle('edit-mode',state.editMode);
    el.massEditBar.style.display=state.editMode?'flex':'none';
    updateMassEditCount(); render();
  });
  el.massEditDone.addEventListener('click',()=>{
    state.editMode=false; state.selectedFilenames.clear();
    el.editModeBtn.classList.remove('active'); document.body.classList.remove('edit-mode');
    el.massEditBar.style.display='none'; render();
  });
  el.massTagBtns.forEach(btn=>{
    btn.addEventListener('click',()=>{
      if(!state.selectedFilenames.size)return;
      const stage=btn.dataset.stage;
      state.selectedFilenames.forEach(fn=>{
        setTagOverride(fn,stage);
        const t=state.allTracks.find(t=>t.filename===fn); if(t)t.stage=stage;
      });
      state.groups=buildGroups(state.allTracks.filter(t=>!isVoiceNote(t)));
      state.selectedFilenames.clear(); updateMassEditCount(); render();
    });
  });
  function toggleCardSelection(card,filename){
    if(!filename)return;
    state.selectedFilenames.has(filename)?state.selectedFilenames.delete(filename):state.selectedFilenames.add(filename);
    card.classList.toggle('selected',state.selectedFilenames.has(filename));
    updateMassEditCount();
  }
  function updateMassEditCount(){el.massEditCount.textContent=`${state.selectedFilenames.size} SELECTED`;}

  // ── Swipe on mini strip ────────────────────
  let swipeX=null, swipeY=null;
  el.playerBar.addEventListener('touchstart',e=>{
    if(e.target.closest('.player-full,.player-handle-btn'))return;
    swipeX=e.touches[0].clientX; swipeY=e.touches[0].clientY;
  },{passive:true});
  el.playerBar.addEventListener('touchend',e=>{
    if(swipeX===null)return;
    const dx=e.changedTouches[0].clientX-swipeX, dy=e.changedTouches[0].clientY-swipeY;
    swipeX=null; swipeY=null;
    if(Math.abs(dx)<40||Math.abs(dy)>Math.abs(dx)*0.8)return;
    dx<0?playNext():playPrev();
  },{passive:true});

  // ── Overlay button listeners ────────────────
  $('song-back-btn').addEventListener('click', closeSongPage);
  $('song-share-btn').addEventListener('click', ()=>{ if(state.songPageGroup)shareGroup(state.songPageGroup); });
  $('folders-btn').addEventListener('click', openFoldersPage);
  $('folders-back-btn').addEventListener('click', closeFoldersPage);
  $('new-folder-btn').addEventListener('click', ()=>{
    const name=prompt('Folder name:');
    if(!name||!name.trim())return;
    createFolder(name.trim()); renderFoldersPage();
  });
  $('folder-bc-exit').addEventListener('click', ()=>{ state.currentFolder=null; render(); });

  // ── Keyboard ───────────────────────────────
  document.addEventListener('keydown',e=>{
    if(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA')return;
    if(e.key==='/'){e.preventDefault();if(!document.body.classList.contains('search-open'))el.searchBtn.click();return;}
    if(e.key==='Escape'){
      if(document.body.classList.contains('search-open')){el.searchBtn.click();return;}
      if(state.songPageGroup){closeSongPage();return;}
      if(el.foldersPage.style.display!=='none'){closeFoldersPage();return;}
      if(state.playerExpanded){setPlayerExpanded(false);return;}
      return;
    }
    if(e.code==='Space'){e.preventDefault();togglePlayPause();}
    if(e.code==='ArrowRight')playNext();
    if(e.code==='ArrowLeft')playPrev();
  });

  // ── Playback ───────────────────────────────
  function playTrack(track,group){
    state.playingTrack=track; state.playingGroup=group||findGroup(track);
    audio.src=track.file; audio.loop=state.looping;
    audio.play().catch(()=>{});
    updatePlayerBar(track,state.playingGroup); refreshPlayingState();
    updateMediaSession(track);
  }
  function findGroup(t){return state.groups.find(g=>g.tracks.includes(t))||null;}
  function getFlatTracks(){
    if(state.currentFilter==='voice')return state.voiceTracks;
    const t=[]; state.filteredGroups.forEach(g=>t.push(...g.tracks)); return t;
  }
  function playNext(){
    if(state.isShuffling&&state.shuffleQueue.length>0){const n=state.shuffleQueue.shift();playTrack(n,findGroup(n));return;}
    const flat=getFlatTracks(),idx=flat.indexOf(state.playingTrack);
    if(idx<flat.length-1){const n=flat[idx+1];playTrack(n,findGroup(n));}
  }
  function playPrev(){
    if(audio.currentTime>3){audio.currentTime=0;return;}
    const flat=getFlatTracks(),idx=flat.indexOf(state.playingTrack);
    if(idx>0){const p=flat[idx-1];playTrack(p,findGroup(p));}
  }
  function togglePlayPause(){
    if(!state.playingTrack){const flat=getFlatTracks();if(flat.length)playTrack(flat[0],findGroup(flat[0]));return;}
    state.isPlaying?audio.pause():audio.play().catch(()=>{});
  }
  function activateShuffle(){
    state.isShuffling=true; state.currentSort='shuffle';
    state.shuffleQueue=shuffle([...getFlatTracks()]); render();
    if(state.shuffleQueue.length){const f=state.shuffleQueue.shift();playTrack(f,findGroup(f));}
  }

  audio.addEventListener('play',()=>{state.isPlaying=true;setPlayPauseUI(true);});
  audio.addEventListener('pause',()=>{state.isPlaying=false;setPlayPauseUI(false);});
  audio.addEventListener('ended',()=>{state.isPlaying=false;setPlayPauseUI(false);updateProgress();if(!state.looping)playNext();});
  audio.addEventListener('timeupdate',()=>{ updateProgress(); updateMediaPosition(); });
  audio.addEventListener('loadedmetadata',()=>{ updateProgress(); updateMediaPosition(); });

  el.miniBtnPlay.addEventListener('click',togglePlayPause);
  el.miniBtnPrev.addEventListener('click',playPrev);
  el.miniBtnNext.addEventListener('click',playNext);
  el.btnPlay.addEventListener('click',togglePlayPause);
  el.btnPrev.addEventListener('click',playPrev);
  el.btnNext.addEventListener('click',playNext);

  $('shuffle-radio-btn').addEventListener('click',()=>{
    state.currentFilter='all'; el.filterLabel.textContent='ALL';
    el.filterItems.forEach(x=>x.classList.toggle('active',x.dataset.filter==='all'));
    el.filterToggle.classList.remove('active');
    activateShuffle(); $('shuffle-radio-btn').classList.add('playing');
  });

  // ── Media Session API ──────────────────────
  function makeArtwork(title, stage) {
    try {
      const size=512, canvas=document.createElement('canvas');
      canvas.width=size; canvas.height=size;
      const ctx=canvas.getContext('2d');
      ctx.fillStyle='#FF91AF'; ctx.fillRect(0,0,size,size);
      ctx.strokeStyle='#000'; ctx.lineWidth=10; ctx.strokeRect(18,18,size-36,size-36);
      if(stage){const badge=(TAG_FULL[stage]||stage).toUpperCase();ctx.font='bold 26px monospace';const bw=ctx.measureText(badge).width+28;ctx.fillStyle='#000';ctx.fillRect(36,36,bw,44);ctx.fillStyle='#FF91AF';ctx.textBaseline='middle';ctx.textAlign='left';ctx.fillText(badge,50,58);}
      ctx.fillStyle='#000';ctx.textAlign='center';ctx.textBaseline='alphabetic';ctx.font='bold 52px monospace';ctx.fillText('MILLO',size/2,190);ctx.fillRect(40,210,size-80,4);
      ctx.font='bold 38px monospace';const words=title.toUpperCase().split(' ');let line='',y=292,maxW=size-80;
      for(let i=0;i<words.length;i++){const test=line+(line?' ':'')+words[i];if(ctx.measureText(test).width>maxW&&line){ctx.fillText(line,size/2,y);line=words[i];y+=50;}else{line=test;}}
      if(line)ctx.fillText(line,size/2,y);
      return canvas.toDataURL('image/png');
    } catch { return null; }
  }

  function setupMediaSession() {
    if(!('mediaSession' in navigator))return;
    navigator.mediaSession.setActionHandler('play',()=>audio.play().catch(()=>{}));
    navigator.mediaSession.setActionHandler('pause',()=>audio.pause());
    navigator.mediaSession.setActionHandler('previoustrack',playPrev);
    navigator.mediaSession.setActionHandler('nexttrack',playNext);
    navigator.mediaSession.setActionHandler('seekbackward',null);
    navigator.mediaSession.setActionHandler('seekforward',null);
  }

  function updateMediaSession(track) {
    if(!('mediaSession' in navigator)||!track)return;
    const artwork=makeArtwork(track.title,track.stage);
    navigator.mediaSession.metadata=new MediaMetadata({title:track.title,artist:'MILLO',album:TAG_FULL[track.stage]||'ARCHIVE',artwork:artwork?[{src:artwork,sizes:'512x512',type:'image/png'}]:[]});
  }

  function updateMediaPosition() {
    if(!('mediaSession' in navigator)||!audio.duration)return;
    try{navigator.mediaSession.setPositionState({duration:audio.duration,playbackRate:audio.playbackRate,position:Math.min(audio.currentTime,audio.duration)});}catch{}
  }

  // ── Boot ───────────────────────────────────
  async function init(){
    setupMediaSession();
    updateTagEditorState(null);
    setVolume(1);
    el.downloadBtn.style.display='none';
    el.playerNote.disabled=true;
    el.tabBtnVersions.style.display='none';

    try{
      await Promise.all([
        fetch(WORKER_URL).then(r=>r.json()).then(tracks=>{
          if(!tracks.length){el.loading.style.display='none';el.empty.style.display='block';return;}
          tracks.forEach((t,i)=>t._idx=i);
          applyTagOverrides(tracks);
          state.allTracks=tracks;
          state.voiceTracks=tracks.filter(isVoiceNote);
          const nonVoice=tracks.filter(t=>!isVoiceNote(t));
          if(state.voiceTracks.length)
            el.voiceCountBadge.innerHTML=`<span class="voice-badge">${state.voiceTracks.length}</span>`;
          state.groups=buildGroups(nonVoice);
          state.filteredGroups=sortGroups(state.groups,'newest');
          el.loading.style.display='none';
          render();
          loadAllDurations(tracks);
          // Check URL for shared song link
          const params=new URLSearchParams(window.location.search);
          const songParam=params.get('song');
          if(songParam){
            const group=state.groups.find(g=>g.title.toLowerCase()===decodeURIComponent(songParam).toLowerCase());
            if(group)openSongPage(group);
          }
        }),
        loadNotes(),
      ]);
    }catch(err){
      el.loading.innerHTML=`<span class="loading-text">ERROR: ${err.message}</span>`;
    }
  }

  init();
})();
