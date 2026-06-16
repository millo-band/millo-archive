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
  const VOLUME_KEY        = 'millo-volume-v1';
  const SPEED_KEY         = 'millo-speed-v1';
  const RESUME_KEY        = 'millo-resume-v1';
  const SPEED_STEPS       = [0.5,0.75,1,1.25,1.5,2];
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
    playerListChips:$('player-list-chips'),
    playerNote:$('player-note'), noteStatus:$('note-status'),
    playerVolume:$('player-volume'), volPct:$('vol-pct'),
    playerTitle:$('player-title'), playerStage:$('player-stage'),
    playerExpandBtn:$('player-expand-btn'),
    miniFill:$('player-mini-fill'),
    miniBtnPlay:$('mini-btn-play'), miniBtnPrev:$('mini-btn-prev'), miniBtnNext:$('mini-btn-next'),
    miniIconPlay:$('mini-icon-play'), miniIconPause:$('mini-icon-pause'),
    // Desktop bar duplicates
    deskBtnPlay:$('mini-btn-play2'), deskBtnPrev:$('mini-btn-prev2'), deskBtnNext:$('mini-btn-next2'),
    deskBtnLoop:$('mini-btn-loop'), deskBtnDownload:$('mini-btn-download'),
    deskProgressTrack:$('desktop-progress-track'), deskProgressFill:$('desktop-progress-fill'), deskProgressThumb:$('desktop-progress-thumb'),
    deskTimeCur:$('desktop-time-cur'), deskTimeDur:$('desktop-time-dur'),
    editModeBtn:$('edit-mode-btn'), massEditBar:$('mass-edit-bar'),
    massEditCount:$('mass-edit-count'), massEditDone:$('mass-edit-done'),
    massTagBtns:document.querySelectorAll('.mass-tag-btn'),
    playerShareBtn:$('player-share-btn'),
    playerPlaylistRow:$('player-playlist-row'), playerPlaylistName:$('player-playlist-name'),
    songPage:$('song-page'), songPageTitle:$('song-page-title'), songPageBody:$('song-page-body'),
    playlistsPage:$('playlists-page'), playlistsBody:$('playlists-body'),
    playlistDetailPage:$('playlist-detail-page'),
    playlistDetailTitle:$('playlist-detail-title'), playlistDetailBody:$('playlist-detail-body'),
    playlistStatsBar:$('playlist-stats-bar'),
    playerBackdrop:$('player-backdrop'),
  };

  // ── Dropdowns ──────────────────────────────
  function setupDropdown(btn,menu){
    btn.addEventListener('click',e=>{e.stopPropagation();const o=menu.classList.contains('open');closeAllDropdowns();if(!o)menu.classList.add('open');});
  }
  function closeAllDropdowns(){document.querySelectorAll('.dropdown-menu').forEach(m=>m.classList.remove('open'));}
  document.addEventListener('click',closeAllDropdowns);
  setupDropdown(el.filterToggle,el.filterMenu);
  setupDropdown(el.sortToggle,el.sortMenu);

  el.filterItems.forEach(item=>{
    item.addEventListener('click',()=>{
      const f=item.dataset.filter; state.currentFilter=f;
      el.filterLabel.textContent=f==='voice'?'VOICE':f==='starred'?'STARRED':item.textContent.trim().replace(/[^A-Z\s★]/g,'').trim();
      el.filterItems.forEach(x=>x.classList.toggle('active',x===item));
      el.filterToggle.classList.toggle('active',f!=='all');
      closeAllDropdowns(); render();
    });
  });

  el.sortItems.forEach(item=>{
    item.addEventListener('click',()=>{
      const s=item.dataset.sort;
      el.sortLabel.textContent=item.textContent.trim();
      el.sortItems.forEach(x=>x.classList.toggle('active',x===item));
      el.sortToggle.classList.toggle('active',s!=='newest');
      closeAllDropdowns();
      if(s==='shuffle'){activateShuffle();return;}
      state.currentSort=s;state.isShuffling=false;$('shuffle-radio-btn').classList.remove('playing');render();
    });
  });

  // ── Search ─────────────────────────────────
  el.searchBtn.addEventListener('click',()=>{
    const open=!document.body.classList.contains('search-open');
    document.body.classList.toggle('search-open',open);
    el.searchBtn.classList.toggle('active',open);
    el.searchBar.style.display=open?'flex':'none';
    if(open)el.searchInput.focus();
    else{el.searchInput.value='';state.searchQuery='';render();}
  });
  el.searchInput.addEventListener('input',()=>{state.searchQuery=el.searchInput.value.trim().toLowerCase();render();});
  el.searchClear.addEventListener('click',()=>{el.searchInput.value='';state.searchQuery='';el.searchInput.focus();render();});

  // ── Player tabs ────────────────────────────
  document.querySelectorAll('.ptab').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const tab=btn.dataset.tab;
      state.activeTab=tab;
      document.querySelectorAll('.ptab').forEach(b=>b.classList.toggle('active',b===btn));
      document.querySelectorAll('.ptab-panel').forEach(p=>p.classList.toggle('active',p.id===`tab-${tab}`));
      if(tab==='queue')renderQueueTab();
    });
  });

  // ── Build groups ───────────────────────────
  function buildGroups(tracks){
    const map=new Map();
    tracks.forEach(t=>{
      if(isVoiceNote(t))return;
      const key=t.title.toLowerCase();
      if(!map.has(key))map.set(key,{title:t.title,tracks:[],stages:new Set(),latestDate:'1970-01-01'});
      const g=map.get(key);g.tracks.push(t);g.stages.add(t.stage);
      if((t.uploaded||'')>g.latestDate)g.latestDate=t.uploaded;
    });
    const groups=[];
    for(const g of map.values()){
      g.tracks.sort((a,b)=>{const sr=STAGE_RANK[a.stage]-STAGE_RANK[b.stage];if(sr!==0)return sr;return(b.uploaded||'')>(a.uploaded||'')?1:-1;});
      g.stage=[...g.stages].sort((a,b)=>STAGE_RANK[b]-STAGE_RANK[a])[0];
      g.type=g.tracks.length>1?'group':'single'; groups.push(g);
    }
    return groups;
  }

  function sortGroups(groups,sort){
    if(sort==='shuffle')return shuffle([...groups]);
    return[...groups].sort((a,b)=>sort==='newest'?(b.latestDate>a.latestDate?1:-1):(a.latestDate>b.latestDate?1:-1));
  }
  function filterGroups(groups,filter){
    if(filter==='all'||filter==='voice')return groups;
    if(filter==='starred')return groups.filter(g=>isFavorite(g.title.toLowerCase()));
    return groups.filter(g=>g.stages.has(filter));
  }
  function searchGroups(groups,q){if(!q)return groups;return groups.filter(g=>g.title.toLowerCase().includes(q));}

  function shuffle(arr){for(let i=arr.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[arr[i],arr[j]]=[arr[j],arr[i]];}return arr;}
  function isNew(d){return d&&(Date.now()-new Date(d).getTime())<NEW_DAYS*86400000;}
  function fmtSec(s){if(!s||isNaN(s))return'0:00';return`${Math.floor(s/60)}:${(Math.floor(s)%60).toString().padStart(2,'0')}`;}
  function fmtDate(d){return d?d.slice(5):'';}

  // ── Render ─────────────────────────────────
  function render(){
    el.grid.innerHTML=''; el.voiceList.innerHTML='';
    if(state.currentFilter==='voice'){
      el.grid.style.display='none';el.empty.style.display='none';el.loading.style.display='none';
      el.voiceList.style.display='block';el.voiceList.classList.add('visible');
      el.whatsNew.style.display='none';renderVoiceList();return;
    }
    el.grid.style.display='grid';el.voiceList.style.display='none';el.voiceList.classList.remove('visible');
    const visible=searchGroups(sortGroups(filterGroups(state.groups,state.currentFilter),state.currentSort),state.searchQuery);
    state.filteredGroups=visible;
    if(!visible.length){el.empty.style.display='block';return;}
    el.empty.style.display='none';
    visible.forEach((group,gIdx)=>el.grid.appendChild(buildCard(group,gIdx)));
    if(state.searchQuery)el.whatsNew.style.display='none'; else renderWhatsNew();
    renderStats(); refreshPlayingState();
  }

  function renderVoiceList(){
    const sorted=[...state.voiceTracks].sort((a,b)=>(a.filename||'').localeCompare(b.filename||''));
    if(!sorted.length){el.empty.style.display='block';return;}
    el.empty.style.display='none';
    const hdr=document.createElement('div');hdr.className='voice-header';hdr.textContent=`VOICE NOTES — ${sorted.length}`;el.voiceList.appendChild(hdr);
    sorted.forEach((track,i)=>{
      const row=document.createElement('div');row.className='voice-row';row.dataset.trackIdx=track._idx;
      const num=document.createElement('span');num.className='voice-row-num';num.textContent=String(i+1).padStart(2,'0');
      const title=document.createElement('span');title.className='voice-row-title';title.textContent=track.title||track.filename;
      const dur=document.createElement('span');dur.className='voice-row-dur';dur.dataset.trackIdx=track._idx;
      row.appendChild(num);row.appendChild(title);row.appendChild(dur);
      row.addEventListener('click',()=>playTrack(track,null));el.voiceList.appendChild(row);
    });
    refreshPlayingState();
  }

  function buildCard(group,gIdx){
    const playT=group.tracks[group.tracks.length-1];
    const hasVersions=group.tracks.length>1;
    const fresh=isNew(group.latestDate);
    const card=document.createElement('div');
    card.className='track-card'+(hasVersions?' has-versions':'');
    card.dataset.gIdx=gIdx;card.dataset.trackIdx=playT._idx;card.dataset.filename=playT.filename||'';

    const check=document.createElement('div');check.className='card-select-check';card.appendChild(check);

    const body=document.createElement('div');body.className='card-body';
    const top=document.createElement('div');top.className='card-top';
    const badges=document.createElement('div');badges.className='card-badges';
    if(TAG_LABEL[group.stage]){const pill=document.createElement('span');pill.className='tag-pill';pill.textContent=TAG_LABEL[group.stage];badges.appendChild(pill);}
    if(fresh){const nb=document.createElement('span');nb.className='new-badge';nb.textContent='NEW';badges.appendChild(nb);}
    top.appendChild(badges);
    const dot=document.createElement('div');dot.className='playing-dot';dot.style.display='none';top.appendChild(dot);
    body.appendChild(top);
    const titleEl=document.createElement('div');titleEl.className='card-title';titleEl.textContent=group.title;body.appendChild(titleEl);
    const footer=document.createElement('div');footer.className='card-footer';
    const dur=document.createElement('span');dur.className='card-duration';dur.dataset.trackIdx=playT._idx;footer.appendChild(dur);

    const viewBtn=document.createElement('button');
    viewBtn.className='view-song-btn';
    viewBtn.textContent=hasVersions?`${group.tracks.length} VER →`:'→';
    viewBtn.setAttribute('aria-label','View song page');
    viewBtn.addEventListener('click',e=>{e.stopPropagation();openSongPage(group);});
    footer.appendChild(viewBtn);

    body.appendChild(footer);card.appendChild(body);

    const star=document.createElement('button');
    star.className='card-star'+(isFavorite(group.title.toLowerCase())?' starred':'');
    star.textContent='★';star.setAttribute('aria-label','Favourite');
    star.addEventListener('click',e=>{
      e.stopPropagation();
      const nowStarred=toggleFavorite(group.title.toLowerCase());
      star.classList.toggle('starred',nowStarred);
      if(state.playingGroup&&state.playingGroup.title.toLowerCase()===group.title.toLowerCase())
        el.playerFavBtn.classList.toggle('starred',nowStarred);
      if(state.currentFilter==='starred')render();
    });
    card.appendChild(star);
    card.addEventListener('click',()=>{state.editMode?toggleCardSelection(card,playT.filename):playTrack(playT,group);});
    return card;
  }

  // ── Song Page ───────────────────────────────
  function openSongPage(group){
    state.songPageGroup=group;
    renderSongPage(group);
    el.songPage.style.display='flex';
    document.body.classList.add('overlay-open');
    history.pushState({song:group.title},'','?song='+encodeURIComponent(group.title));
  }

  function closeSongPage(){
    el.songPage.style.display='none';
    document.body.classList.remove('overlay-open');
    state.songPageGroup=null;
    const url=new URL(window.location);url.searchParams.delete('song');
    history.pushState({},'',url.toString());
  }

  const SHARE_SVG=`<svg width="11" height="11" viewBox="0 0 16 16" fill="none"><circle cx="13" cy="3" r="2" stroke="currentColor" stroke-width="1.8"/><circle cx="3" cy="8" r="2" stroke="currentColor" stroke-width="1.8"/><circle cx="13" cy="13" r="2" stroke="currentColor" stroke-width="1.8"/><line x1="5" y1="9" x2="11" y2="12" stroke="currentColor" stroke-width="1.8"/><line x1="11" y1="4" x2="5" y2="7" stroke="currentColor" stroke-width="1.8"/></svg>`;
  const PLAY_SVG=`<svg width="13" height="13" viewBox="0 0 16 16"><polygon points="2,1 2,15 14,8" fill="currentColor"/></svg>`;
  const PAUSE_SVG=`<svg width="13" height="13" viewBox="0 0 16 16"><rect x="2" y="1" width="4" height="14" fill="currentColor"/><rect x="10" y="1" width="4" height="14" fill="currentColor"/></svg>`;

  // Debounced per-version note save (independent of the player note field)
  function saveVersionNote(filename,text,statusEl){
    if(!filename)return;
    clearTimeout(statusEl._t);
    statusEl.textContent='…';
    statusEl._t=setTimeout(async()=>{
      try{
        await fetch(WORKER_URL+'/notes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({filename,note:text})});
        if(text.trim())notes[filename]=text.trim(); else delete notes[filename];
        statusEl.textContent='SAVED';
        if(state.playingTrack&&state.playingTrack.filename===filename&&el.playerNote)el.playerNote.value=text;
        setTimeout(()=>{statusEl.textContent='';},1500);
      }catch{statusEl.textContent='ERROR';}
    },700);
  }

  function refreshSongPagePlaying(){
    if(!el.songPage||el.songPage.style.display==='none')return;
    const idx=state.playingTrack?state.playingTrack._idx:-1;
    el.songPageBody.querySelectorAll('.sp-ver-row').forEach(row=>{
      const active=parseInt(row.dataset.trackIdx)===idx;
      row.classList.toggle('sp-playing',active);
      const pb=row.querySelector('.sp-ver-play');
      if(pb)pb.innerHTML=(active&&state.isPlaying)?PAUSE_SVG:PLAY_SVG;
    });
  }

  function renderSongPage(group){
    el.songPageTitle.textContent=group.title.toUpperCase();
    el.songPageBody.innerHTML='';

    const sorted=[...group.tracks].sort((a,b)=>(b.uploaded||'')>(a.uploaded||'')?1:-1);

    const versSec=document.createElement('div');versSec.className='sp-section';
    const versLbl=document.createElement('div');versLbl.className='sp-section-label';
    versLbl.textContent=`VERSION TIMELINE — ${sorted.length}`;versSec.appendChild(versLbl);

    const timeline=document.createElement('div');timeline.className='sp-timeline';

    sorted.forEach((track,i)=>{
      const row=document.createElement('div');
      row.className='sp-ver-row';
      row.dataset.trackIdx=track._idx;
      row.dataset.filename=track.filename||'';

      const rowTop=document.createElement('div');rowTop.className='sp-ver-row-top';

      const playBtn=document.createElement('button');playBtn.className='sp-ver-play';playBtn.setAttribute('aria-label','Play version');
      playBtn.innerHTML=PLAY_SVG;
      playBtn.addEventListener('click',e=>{
        e.stopPropagation();
        const isCur=state.playingTrack&&state.playingTrack._idx===track._idx;
        if(isCur){ state.isPlaying?audio.pause():audio.play().catch(()=>{}); }
        else { playTrack(track,group); }   // stays on this page
        refreshSongPagePlaying();
      });
      rowTop.appendChild(playBtn);

      const stagePill=document.createElement('span');stagePill.className='sp-stage-pill sp-stage-sm';
      stagePill.textContent=TAG_LABEL[track.stage]||'?';rowTop.appendChild(stagePill);

      const ver=document.createElement('span');ver.className='sp-ver-label';
      ver.textContent=(track.version?`v${track.version}`:'—')+(track.label?` · ${track.label}`:'');
      rowTop.appendChild(ver);

      const date=document.createElement('span');date.className='sp-ver-date';date.textContent=fmtDate(track.uploaded)||'—';rowTop.appendChild(date);

      const sp=document.createElement('span');sp.style.flex='1';rowTop.appendChild(sp);
      if(i===0){const lb=document.createElement('span');lb.className='sp-latest-badge';lb.textContent='LATEST';rowTop.appendChild(lb);}
      const dur=document.createElement('span');dur.className='sp-ver-dur';dur.dataset.trackIdx=track._idx;rowTop.appendChild(dur);

      const shareBtn=document.createElement('button');shareBtn.className='sp-ver-share-btn';shareBtn.setAttribute('aria-label','Share version');
      shareBtn.innerHTML=SHARE_SVG;
      shareBtn.addEventListener('click',e=>{e.stopPropagation();shareTrack(track,group);});
      rowTop.appendChild(shareBtn);
      row.appendChild(rowTop);

      if(track.filename){
        const fn=document.createElement('div');fn.className='sp-ver-filename';fn.textContent=track.filename;row.appendChild(fn);
      }

      const noteWrap=document.createElement('div');noteWrap.className='sp-ver-note-wrap';
      const note=document.createElement('textarea');note.className='sp-ver-note-input';
      note.placeholder='Add a note for this version…';
      note.value=notes[track.filename]||'';
      note.rows=2;
      const status=document.createElement('span');status.className='sp-ver-note-status';
      note.addEventListener('input',()=>saveVersionNote(track.filename,note.value,status));
      note.addEventListener('click',e=>e.stopPropagation());
      noteWrap.appendChild(note);noteWrap.appendChild(status);
      row.appendChild(noteWrap);

      timeline.appendChild(row);
    });

    versSec.appendChild(timeline);
    el.songPageBody.appendChild(versSec);

    renderSongPagePlaylists(group);
    fillDurations(el.songPageBody);
    refreshSongPagePlaying();
  }

  function renderSongPagePlaylists(group){
    const existing=el.songPageBody.querySelector('.sp-playlists-section');
    if(existing)existing.remove();

    const sec=document.createElement('div');sec.className='sp-section sp-playlists-section';
    const lbl=document.createElement('div');lbl.className='sp-section-label';lbl.textContent='ADD TO LIST';sec.appendChild(lbl);

    const chips=document.createElement('div');chips.className='sp-folder-chips';
    const playlists=getPlaylists();
    const songKey=group.title.toLowerCase();
    const latestTrack=[...group.tracks].sort((a,b)=>(b.uploaded||'')>(a.uploaded||'')?1:-1)[0];

    Object.entries(playlists).forEach(([id,pl])=>{
      const inPl=isSongInPlaylist(id,songKey);
      const chip=document.createElement('button');
      chip.className='sp-folder-chip'+(inPl?' active':'');
      chip.textContent=pl.name.toUpperCase();
      chip.addEventListener('click',()=>{
        if(isSongInPlaylist(id,songKey)){
          removeSongFromPlaylist(id,songKey);chip.classList.remove('active');
        } else {
          addSongToPlaylist(id,songKey,latestTrack.filename);chip.classList.add('active');
        }
        if(state.openPlaylistId===id)renderPlaylistDetailPage(id);
      });
      chips.appendChild(chip);
    });

    const newBtn=document.createElement('button');
    newBtn.className='sp-folder-chip sp-folder-new';
    newBtn.textContent='+ NEW LIST';
    newBtn.addEventListener('click',()=>{
      const name=prompt('List name:');
      if(!name||!name.trim())return;
      const id=createPlaylist(name.trim());
      addSongToPlaylist(id,songKey,latestTrack.filename);
      renderSongPagePlaylists(group);
    });
    chips.appendChild(newBtn);
    sec.appendChild(chips);

    if(!Object.keys(playlists).length){
      const hint=document.createElement('div');hint.className='sp-playlist-hint';
      hint.textContent='CREATE A LIST TO BUILD AN ALBUM OR SEQUENCE.';
      sec.appendChild(hint);
    }

    el.songPageBody.appendChild(sec);
  }

  // ── Lists Page (album-style) ─────────────────
  function openPlaylistsPage(){
    renderPlaylistsPage();
    el.playlistsPage.style.display='flex';
    document.body.classList.add('overlay-open');
  }
  function closePlaylistsPage(){
    el.playlistsPage.style.display='none';
    document.body.classList.remove('overlay-open');
  }

  function renderPlaylistsPage(){
    el.playlistsBody.innerHTML='';
    const playlists=getPlaylists();
    const entries=Object.entries(playlists);

    if(!entries.length){
      const empty=document.createElement('div');empty.className='sp-empty';
      empty.innerHTML='NO LISTS YET.<br><br>OPEN ANY SONG AND<br>TAP "+ NEW LIST".';
      el.playlistsBody.appendChild(empty);return;
    }

    const grid=document.createElement('div');grid.className='album-grid';
    entries.forEach(([id,pl])=>{
      const card=document.createElement('div');card.className='album-card';

      // Canvas album art (pixel art seeded from playlist name)
      const canvasId=`album-art-${id}`;
      const canvas=document.createElement('canvas');
      canvas.id=canvasId; canvas.className='album-art-canvas';
      canvas.width=64; canvas.height=64;
      card.appendChild(canvas);

      const info=document.createElement('div');info.className='album-card-info';
      const name=document.createElement('div');name.className='album-card-name';name.textContent=pl.name.toUpperCase();
      const count=document.createElement('div');count.className='album-card-count';
      count.textContent=`${pl.tracks.length} TRACK${pl.tracks.length!==1?'S':''}`;
      info.appendChild(name);info.appendChild(count);
      card.appendChild(info);

      const del=document.createElement('button');del.className='album-card-del';del.textContent='✕';
      del.addEventListener('click',e=>{
        e.stopPropagation();
        if(!confirm(`Delete "${pl.name}"?`))return;
        deletePlaylist(id);
        if(state.activePlaylistId===id){state.activePlaylistId=null;state.playlistQueue=[];updatePlayerPlaylistBadge();}
        renderPlaylistsPage();
      });
      card.appendChild(del);

      card.addEventListener('click',()=>openPlaylistDetailPage(id));
      grid.appendChild(card);
      // Generate art after appended to DOM
      generatePixelArt(canvasId, pl.name);
    });
    el.playlistsBody.appendChild(grid);
  }

  // ── Playlist Detail Page ─────────────────────
  function openPlaylistDetailPage(id){
    state.openPlaylistId=id;
    renderPlaylistDetailPage(id);
    el.playlistDetailPage.style.display='flex';
    el.playlistsPage.style.display='none';
    document.body.classList.add('overlay-open');
  }
  function closePlaylistDetailPage(){
    el.playlistDetailPage.style.display='none';
    if(el.playlistStatsBar)el.playlistStatsBar.style.display='none';
    state.openPlaylistId=null;
    document.body.classList.remove('overlay-open');
  }
  function goBackToPlaylistsList(){
    el.playlistDetailPage.style.display='none';
    state.openPlaylistId=null;
    renderPlaylistsPage();
    el.playlistsPage.style.display='flex';
  }

  function renderPlaylistDetailPage(id){
    const playlists=getPlaylists();
    const pl=playlists[id];
    if(!pl)return;

    el.playlistDetailTitle.textContent=pl.name.toUpperCase();
    el.playlistDetailBody.innerHTML='';

    // Build the big pixel art cover specific to this list
    generatePixelArt('pl-detail-canvas', pl.name);

    const statsBar=$('playlist-stats-bar');
    const statsCount=$('playlist-stats-count');
    const statsDur=$('playlist-stats-dur');
    if(statsBar){
      if(pl.tracks.length){
        statsBar.style.display='flex';
        statsCount.textContent=`${pl.tracks.length} TRACK${pl.tracks.length!==1?'S':''}`;
        statsDur.textContent='...';
        const trackObjs=pl.tracks.map(pt=>state.allTracks.find(t=>t.filename===pt.filename)).filter(Boolean);
        let total=0,loaded=0;
        if(!trackObjs.length){statsDur.textContent='—';}
        else{
          trackObjs.forEach(t=>{
            const p=new Audio();p.preload='metadata';p.src=t.file;
            p.addEventListener('loadedmetadata',()=>{
              total+=p.duration;loaded++;
              if(loaded===trackObjs.length){
                const m=Math.floor(total/60),s=Math.floor(total%60);
                statsDur.textContent=`${m}:${s.toString().padStart(2,'0')}`;
              }
            });
          });
        }
      } else {
        statsBar.style.display='none';
      }
    }

    if(!pl.tracks.length){
      const empty=document.createElement('div');empty.className='sp-empty';
      empty.innerHTML='NO SONGS YET.<br><br>OPEN ANY SONG PAGE AND<br>ADD IT TO THIS LIST.';
      el.playlistDetailBody.appendChild(empty);return;
    }

    pl.tracks.forEach((pt,idx)=>{
      const group=state.groups.find(g=>g.title.toLowerCase()===pt.songKey);
      if(!group)return;

      const resolvedTrack=state.allTracks.find(t=>t.filename===pt.filename)
        ||[...group.tracks].sort((a,b)=>(b.uploaded||'')>(a.uploaded||'')?1:-1)[0];

      const isPlaying=state.activePlaylistId===id&&state.playingTrack&&state.playingTrack.filename===resolvedTrack.filename;

      const row=document.createElement('div');
      row.className='pl-track-row'+(isPlaying?' pl-playing':'');
      row.dataset.songKey=pt.songKey;
      row.dataset.idx=idx;

      const num=document.createElement('div');num.className='pl-track-num';
      if(isPlaying){num.innerHTML=`<span class="pl-playing-dot"></span>`;}
      else{num.textContent=String(idx+1).padStart(2,'0');}
      row.appendChild(num);

      const handle=document.createElement('div');handle.className='pl-drag-handle';
      handle.innerHTML=`<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><line x1="2" y1="4" x2="12" y2="4" stroke="currentColor" stroke-width="1.8" stroke-linecap="square"/><line x1="2" y1="7" x2="12" y2="7" stroke="currentColor" stroke-width="1.8" stroke-linecap="square"/><line x1="2" y1="10" x2="12" y2="10" stroke="currentColor" stroke-width="1.8" stroke-linecap="square"/></svg>`;
      row.appendChild(handle);

      const info=document.createElement('div');info.className='pl-track-info';
      const titleEl=document.createElement('div');titleEl.className='pl-track-title';titleEl.textContent=group.title;
      info.appendChild(titleEl);

      const verWrap=document.createElement('div');verWrap.className='pl-ver-wrap';
      const stageLabel=TAG_LABEL[resolvedTrack.stage]||'?';
      const verLabel=[resolvedTrack.version?`v${resolvedTrack.version}`:'',resolvedTrack.label||''].filter(Boolean).join(' · ');
      const trigger=document.createElement('button');trigger.className='pl-ver-trigger';
      trigger.textContent=[stageLabel,verLabel].filter(Boolean).join(' · ');

      const opts=document.createElement('div');opts.className='pl-ver-opts';
      const sortedVers=[...group.tracks].sort((a,b)=>(b.uploaded||'')>(a.uploaded||'')?1:-1);
      sortedVers.forEach((t,vi)=>{
        const opt=document.createElement('button');opt.className='pl-ver-opt'+(t.filename===pt.filename?' active':'');
        const sl=TAG_LABEL[t.stage]||'?';
        const vl=[t.version?`v${t.version}`:'',t.label||''].filter(Boolean).join(' · ');
        const dl=fmtDate(t.uploaded);
        const parts=[sl,vl,dl].filter(Boolean);
        if(vi===0)parts.push('← LATEST');
        opt.textContent=parts.join('  ');
        const durSpan=document.createElement('span');durSpan.className='pl-ver-opt-dur';durSpan.dataset.trackIdx=t._idx;opt.appendChild(durSpan);
        opt.addEventListener('click',e=>{
          e.stopPropagation();
          setTrackVersion(id,pt.songKey,t.filename);
          if(state.activePlaylistId===id){
            const pIdx=state.playlistQueue.findIndex(q=>q._idx===resolvedTrack._idx);
            if(pIdx>=0)state.playlistQueue[pIdx]=t;
          }
          renderPlaylistDetailPage(id);
        });
        opts.appendChild(opt);
      });

      trigger.addEventListener('click',e=>{
        e.stopPropagation();
        const isOpen=opts.classList.contains('open');
        document.querySelectorAll('.pl-ver-opts.open').forEach(o=>o.classList.remove('open'));
        document.querySelectorAll('.pl-ver-trigger.open').forEach(o=>o.classList.remove('open'));
        if(!isOpen){opts.classList.add('open');trigger.classList.add('open');}
      });
      verWrap.appendChild(trigger);verWrap.appendChild(opts);
      info.appendChild(verWrap);
      row.appendChild(info);

      const rmBtn=document.createElement('button');rmBtn.className='pl-track-remove';rmBtn.textContent='✕';
      rmBtn.addEventListener('click',e=>{
        e.stopPropagation();
        removeSongFromPlaylist(id,pt.songKey);
        renderPlaylistDetailPage(id);
      });
      row.appendChild(rmBtn);

      row.addEventListener('click',()=>playFromPlaylist(id,resolvedTrack.filename));
      el.playlistDetailBody.appendChild(row);
    });

    const hint=document.createElement('div');hint.className='pl-add-hint';
    hint.textContent='TO ADD SONGS — OPEN A SONG PAGE AND TAP THIS LIST\'S NAME.';
    el.playlistDetailBody.appendChild(hint);

    setupPlaylistDragDrop(el.playlistDetailBody, id);
  }

  // ── Drag and Drop ────────────────────────────
  function setupPlaylistDragDrop(container, playlistId) {
    const rows=[...container.querySelectorAll('.pl-track-row[data-idx]')];
    if(!rows.length)return;

    rows.forEach(row=>{
      row.setAttribute('draggable','true');
      row.addEventListener('dragstart',e=>{
        e.dataTransfer.effectAllowed='move';
        e.dataTransfer.setData('text/plain',row.dataset.idx);
        setTimeout(()=>row.classList.add('pl-dragging'),0);
      });
      row.addEventListener('dragend',()=>{
        row.classList.remove('pl-dragging');
        rows.forEach(r=>r.classList.remove('pl-drop-above','pl-drop-below'));
      });
      row.addEventListener('dragover',e=>{
        e.preventDefault();
        const fromIdx=parseInt(e.dataTransfer.getData('text/plain')||'-1');
        if(fromIdx<0)return;
        const toIdx=parseInt(row.dataset.idx);
        rows.forEach(r=>r.classList.remove('pl-drop-above','pl-drop-below'));
        if(fromIdx!==toIdx)row.classList.add(fromIdx<toIdx?'pl-drop-below':'pl-drop-above');
      });
      row.addEventListener('dragleave',e=>{
        if(!row.contains(e.relatedTarget))row.classList.remove('pl-drop-above','pl-drop-below');
      });
      row.addEventListener('drop',e=>{
        e.preventDefault();
        const fromIdx=parseInt(e.dataTransfer.getData('text/plain'));
        const toIdx=parseInt(row.dataset.idx);
        rows.forEach(r=>r.classList.remove('pl-drop-above','pl-drop-below'));
        if(!isNaN(fromIdx)&&fromIdx!==toIdx){
          reorderPlaylistTrack(playlistId,fromIdx,toIdx);
          renderPlaylistDetailPage(playlistId);
        }
      });
    });

    let touch={active:false,startIdx:-1,startY:0,curY:0,el:null,rowH:60};
    rows.forEach(row=>{
      const handle=row.querySelector('.pl-drag-handle');
      if(!handle)return;
      handle.addEventListener('touchstart',e=>{
        e.stopPropagation();
        const t=e.touches[0];
        touch={active:true,startIdx:parseInt(row.dataset.idx),startY:t.clientY,curY:t.clientY,el:row,rowH:row.offsetHeight||60};
        row.classList.add('pl-dragging');
      },{passive:true});
    });
    container.addEventListener('touchmove',e=>{
      if(!touch.active)return;
      touch.curY=e.touches[0].clientY;
      const dy=touch.curY-touch.startY;
      touch.el.style.transform=`translateY(${dy}px)`;touch.el.style.zIndex='20';
      const newIdx=Math.max(0,Math.min(rows.length-1,touch.startIdx+Math.round(dy/touch.rowH)));
      rows.forEach(r=>r.classList.remove('pl-drop-above','pl-drop-below'));
      if(newIdx!==touch.startIdx){const target=rows.find(r=>parseInt(r.dataset.idx)===newIdx);if(target)target.classList.add(newIdx>touch.startIdx?'pl-drop-below':'pl-drop-above');}
      e.preventDefault();
    },{passive:false});
    container.addEventListener('touchend',()=>{
      if(!touch.active)return;
      const dy=touch.curY-touch.startY;
      const newIdx=Math.max(0,Math.min(rows.length-1,touch.startIdx+Math.round(dy/touch.rowH)));
      touch.el.style.transform='';touch.el.style.zIndex='';touch.el.classList.remove('pl-dragging');
      rows.forEach(r=>r.classList.remove('pl-drop-above','pl-drop-below'));
      touch.active=false;
      if(newIdx!==touch.startIdx){reorderPlaylistTrack(playlistId,touch.startIdx,newIdx);renderPlaylistDetailPage(playlistId);}
    });
  }

  // ── Queue Tab ────────────────────────────────
  function renderQueueTab(){
    const listEl=$('player-queue-list');
    if(!listEl)return;
    listEl.innerHTML='';

    let upNext=[];
    if(state.activePlaylistId&&state.playlistQueue.length){
      const idx=state.playlistQueue.findIndex(t=>t._idx===state.playingTrack?._idx);
      upNext=idx>=0?state.playlistQueue.slice(idx+1):[];
    } else {
      const flat=getFlatTracks();
      const idx=flat.indexOf(state.playingTrack);
      upNext=idx>=0?flat.slice(idx+1,idx+21):flat.slice(0,20);
    }

    if(!upNext.length){
      const empty=document.createElement('div');
      empty.className='queue-empty';
      empty.textContent=state.activePlaylistId?'END OF LIST':'END OF QUEUE';
      listEl.appendChild(empty);return;
    }

    upNext.forEach((track,i)=>{
      const row=document.createElement('div');row.className='queue-row';
      const num=document.createElement('span');num.className='queue-row-num';num.textContent=String(i+1).padStart(2,'0');
      const title=document.createElement('span');title.className='queue-row-title';title.textContent=track.title;
      const stage=document.createElement('span');stage.className='queue-row-stage';stage.textContent=TAG_LABEL[track.stage]||'';
      row.appendChild(num);row.appendChild(title);row.appendChild(stage);
      row.addEventListener('click',()=>playTrack(track,findGroup(track)));
      listEl.appendChild(row);
    });
  }

  // ── Playlist Playback ────────────────────────
  function playFromPlaylist(playlistId, startFilename){
    const playlists=getPlaylists();
    const pl=playlists[playlistId];
    if(!pl||!pl.tracks.length)return;

    const queue=pl.tracks
      .map(pt=>state.allTracks.find(t=>t.filename===pt.filename)||
               [...(state.groups.find(g=>g.title.toLowerCase()===pt.songKey)?.tracks||[])].sort((a,b)=>(b.uploaded||'')>(a.uploaded||'')?1:-1)[0])
      .filter(Boolean);

    state.activePlaylistId=playlistId;
    state.playlistQueue=queue;
    updatePlayerPlaylistBadge();

    const startIdx=startFilename?queue.findIndex(t=>t.filename===startFilename):0;
    const startTrack=queue[Math.max(0,startIdx)];
    if(startTrack)playTrack(startTrack,findGroup(startTrack));
  }

  function updatePlayerPlaylistBadge(){
    const pl=state.activePlaylistId?getPlaylists()[state.activePlaylistId]:null;
    if(pl){
      el.playerPlaylistRow.style.display='flex';
      el.playerPlaylistName.textContent=pl.name.toUpperCase();
    } else {
      el.playerPlaylistRow.style.display='none';
    }
  }

  // ── Share ───────────────────────────────────
  async function shareGroup(group){
    const url=window.location.origin+window.location.pathname+'?song='+encodeURIComponent(group.title);
    if(navigator.share){try{await navigator.share({title:group.title+' — MILLO ARCHIVE',url});return;}catch{}}
    try{await navigator.clipboard.writeText(url);showShareToast('LINK COPIED ✓');}
    catch{showShareToast('COPY FAILED');}
  }

  async function shareTrack(track,group){
    const g=group||findGroup(track);
    const base=window.location.origin+window.location.pathname;
    const url=g
      ?base+'?song='+encodeURIComponent(g.title)+'&track='+encodeURIComponent(track.filename)
      :base+'?track='+encodeURIComponent(track.filename);
    if(navigator.share){try{await navigator.share({title:track.title+' — MILLO ARCHIVE',url});return;}catch{}}
    try{await navigator.clipboard.writeText(url);showShareToast('LINK COPIED ✓');}
    catch{showShareToast('COPY FAILED');}
  }

  function showShareToast(msg){
    const t=document.createElement('div');t.className='share-toast';t.textContent=msg;
    document.body.appendChild(t);
    requestAnimationFrame(()=>t.classList.add('visible'));
    setTimeout(()=>{t.classList.remove('visible');setTimeout(()=>t.remove(),350);},2500);
  }

  // ── What's New ─────────────────────────────
  function renderWhatsNew(){
    const sorted=sortGroups(state.groups,'newest').slice(0,5);
    const recent=sorted.filter(g=>isNew(g.latestDate));
    const show=recent.length>0?recent:sorted.slice(0,3);
    el.newRow.innerHTML='';
    if(!show.length){el.whatsNew.style.display='none';return;}
    show.forEach(group=>{
      const playT=group.tracks[group.tracks.length-1];
      const chip=document.createElement('div');chip.className='new-track-chip';chip.dataset.trackIdx=playT._idx;
      if(isNew(group.latestDate)){const nb=document.createElement('span');nb.className='chip-new-badge';nb.textContent='NEW';chip.appendChild(nb);}
      const title=document.createElement('span');title.className='chip-title';title.textContent=group.title;chip.appendChild(title);
      if(TAG_LABEL[group.stage]){const tag=document.createElement('span');tag.className='chip-tag';tag.textContent=TAG_LABEL[group.stage];chip.appendChild(tag);}
      chip.addEventListener('click',()=>playTrack(playT,group));el.newRow.appendChild(chip);
    });
    el.whatsNew.style.display='block';
  }

  function renderStats(){
    const counts=['demo','finished','complete','idea'].map(s=>`${state.groups.filter(g=>g.stages.has(s)).length}${TAG_SHORT[s]}`);
    el.headerStats.textContent=counts.join(' · ')+` · ${state.voiceTracks.length}V`;
  }

  function refreshPlayingState(){
    const idx=state.playingTrack?state.playingTrack._idx:null;
    document.querySelectorAll('.track-card').forEach(card=>{
      const group=state.filteredGroups[card.dataset.gIdx];
      const active=group&&state.playingGroup&&group.title.toLowerCase()===state.playingGroup.title.toLowerCase();
      card.classList.toggle('playing',!!active);
      const dot=card.querySelector('.playing-dot');if(dot)dot.style.display=active?'block':'none';
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

  const durCache={};
  const DUR_CLASSES=['card-duration','voice-row-dur','pver-row-dur','sp-ver-dur','sp-hero-dur','pl-ver-opt-dur'];
  function applyDurToNode(node,dur){ if(DUR_CLASSES.some(c=>node.classList.contains(c)))node.textContent=dur; }
  function fillDurations(root){
    (root||document).querySelectorAll('[data-track-idx]').forEach(node=>{
      const d=durCache[node.dataset.trackIdx];
      if(d)applyDurToNode(node,d);
    });
  }
  function loadAllDurations(tracks){
    tracks.forEach(t=>{
      if(durCache[t._idx]){ document.querySelectorAll(`[data-track-idx="${t._idx}"]`).forEach(n=>applyDurToNode(n,durCache[t._idx])); return; }
      const probe=new Audio();probe.preload='metadata';probe.src=t.file;
      probe.addEventListener('loadedmetadata',()=>{
        const dur=fmtSec(probe.duration);
        durCache[t._idx]=dur;
        document.querySelectorAll(`[data-track-idx="${t._idx}"]`).forEach(node=>applyDurToNode(node,dur));
      });
    });
  }

  // ── 50-Algorithm Procedural 1-Bit Art Generator ──────────────────
  function generatePixelArt(canvasId, seedString) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    const size = 64;
    canvas.width = size;
    canvas.height = size;

    ctx.fillStyle = '#FF91AF';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#000000';

    let hash = 0;
    for (let i = 0; i < seedString.length; i++) hash = seedString.charCodeAt(i) + ((hash << 5) - hash);
    function random() { const x = Math.sin(hash++) * 10000; return x - Math.floor(x); }

    const artType = Math.floor(random() * 50);

    for (let x = 0; x < size; x++) {
      for (let y = 0; y < size; y++) {
        let nx=(x-32)/32, ny=(y-32)/32;
        let ax=Math.abs(nx), ay=Math.abs(ny);
        let r=Math.sqrt(nx*nx+ny*ny), a=Math.atan2(ny,nx);
        let draw=false;

        switch (artType) {
          case 0:  draw = nx*nx*2+ny*ny*8<1&&r>0.15; break;
          case 1:  draw = ny>ax-0.2+Math.sin(nx*15)*0.1; break;
          case 2:  draw = (ax<0.1&&ny>0)||(nx*nx+(ny+0.3)**2<0.3); break;
          case 3:  draw = (x%16<14)&&(y%16<14); break;
          case 4:  draw = (nx+0.5)**2+ny**2<0.1||(nx-0.5)**2+ny**2<0.1||(ny>-0.1&&ny<0&&ax<0.5); break;
          case 5:  draw = Math.abs(Math.sin(ny*10)-nx)<0.1||Math.abs(Math.sin(ny*10+3.14)-nx)<0.1||(y%8<2&&ax<0.8); break;
          case 6:  draw = ax<0.4&&ny>-0.6&&!(nx>0.2&&nx<0.3&&ay<0.05); break;
          case 7:  draw = ((nx+0.3)**2+(ny+0.3)**2<0.1)||(random()<0.05)||(ny>0.6&&Math.sin(nx*10)>0); break;
          case 8:  draw = ny>0.1&&(x%12<10)&&(y%8<6)&&random()<0.8; break;
          case 9:  draw = r<0.7&&!(ny<0&&Math.abs(ax-0.3)<0.1)&&!(ny>0.3&&ax<0.2); break;
          case 10: draw = ny>Math.sin(nx*10)*0.3; break;
          case 11: draw = Math.sin(nx*20)*Math.sin(ny*20)>0; break;
          case 12: draw = ny>ax&&(y%6<4); break;
          case 13: draw = ax<0.05&&ny>-0.8&&ny<0.6||(ax<0.3&&Math.abs(ny-0.5)<0.05); break;
          case 14: draw = ny<0.5-nx*nx&&ny>-0.6&&ax<0.6&&r>0.2; break;
          case 15: draw = r<0.5+0.2*Math.sin(a*5)&&r>0.1; break;
          case 16: draw = r<0.3||Math.sin(a*12)>0.8; break;
          case 17: draw = r<0.5&&(nx-0.2)**2+(ny-0.2)**2>0.4; break;
          case 18: draw = r<0.3||(nx-0.3)**2+(ny+0.1)**2<0.2||(nx+0.3)**2+(ny+0.2)**2<0.2; break;
          case 19: draw = Math.abs(nx-Math.sin(ny*15)*0.1-ny*0.2)<0.05; break;
          case 20: draw = (nx*nx+ny*ny-0.3)**3-nx*nx*ny*ny*ny<0; break;
          case 21: draw = (x+y)%10<2&&random()<0.5; break;
          case 22: draw = (r%0.2<0.05)||(Math.abs(Math.sin(a*4))<0.1); break;
          case 23: draw = Math.sin(r*30)>0; break;
          case 24: draw = Math.sin(r*30-a*3)>0; break;
          case 25: draw = (x%4===0||y%4===0)&&random()>0.2; break;
          case 26: draw = ny>0&&(Math.sin(nx/ny*10)>0||Math.sin(1/ny*5)>0); break;
          case 27: draw = ny>0&&y%4<3&&nx*10-Math.floor(nx*10)<0.8&&random()>0.3; break;
          case 28: draw = ax<0.6&&ay<0.4&&!(ay<0.1&&Math.abs(ax-0.3)<0.1); break;
          case 29: draw = r<0.7&&r>0.1&&Math.sin(r*40)>-0.5; break;
          case 30: draw = (nx*nx+ny*ny*16<0.2)||(nx*nx*2+(ny+0.2)**2*2<0.1); break;
          case 31: draw = nx+ny>0&&(x%8<7)&&(y%8<7); break;
          case 32: draw = ax<ay+0.1&&ay<0.7; break;
          case 33: draw = ax<0.6&&Math.abs(ny-Math.sin(nx*5)*0.2)<0.3; break;
          case 34: draw = ax<0.5&&ay<0.5&&ax>0.05&&ay>0.05; break;
          case 35: draw = ax+ay<0.6&&r>0.1; break;
          case 36: draw = ax<0.6&&ay<0.4&&(Math.abs(nx-ny)<0.05||Math.abs(nx+ny)<0.05); break;
          case 37: draw = ax<0.6&&ay<0.4&&ax>0.05; break;
          case 38: draw = (ax<0.3&&ny>-0.4&&ny<0.4)||(nx>0.3&&nx<0.5&&ay<0.2&&Math.abs(nx-0.4)>0.05); break;
          case 39: draw = ((nx-0.4)**2+ny**2<0.05)||((nx+0.4)**2+ny**2<0.05)||(ay<0.02&&ax<0.4); break;
          case 40: draw = ay<ax&&ax<0.6; break;
          case 41: draw = r<0.6&&Math.cos(a*5)>0.5; break;
          case 42: draw = r<0.3||(Math.abs(ny-nx*0.5)<0.05&&ax<0.6); break;
          case 43: draw = ay<0.4&&Math.sin(nx*Math.sin(nx*50)*50)>0; break;
          case 44: draw = (ax<0.4&&ay<0.6)&&!(ax<0.3&&ay<0.5&&ny<0)||(ax<0.1&&ny<-0.6&&ny>-0.7); break;
          case 45: draw = ax<0.5&&ay<0.5&&!(nx>0.1&&nx<0.4&&ny<-0.2); break;
          case 46: draw = ax<0.5&&ny>0&&ny<0.5-Math.abs(Math.sin(nx*10)*0.2); break;
          case 47: draw = ax<0.05&&ay<0.5||(r>0.4&&r<0.5&&ny>0)||(ay<0.05&&ax<0.3); break;
          case 48: draw = ax<0.4&&ay<0.4&&r>0.1; break;
          case 49: draw = (nx*nx+ny*ny*2<0.3)&&!(Math.abs(ax-0.2)<0.1&&ny<0.1&&ny>-0.1); break;
        }

        if (draw) ctx.fillRect(x, y, 1, 1);
        else if (random() < 0.03) ctx.fillRect(x, y, 1, 1);
      }
    }
    return canvas.toDataURL('image/png');
  }

  // ── Player bar update ──────────────────────
  function updatePlayerBar(track,group){
    if(!track){
      el.playerTitle.textContent='— SELECT A TRACK —';
      el.playerStage.textContent='';el.playerStage.style.display='none';
      el.playerTitleLg.textContent='SELECT A TRACK';
      el.playerStageLg.textContent='';el.playerStageLg.style.display='none';
      el.playerFilenameLg.textContent='';
      el.playerFavBtn.classList.remove('starred');
      el.downloadBtn.style.display='none';
      if(el.playerShareBtn)el.playerShareBtn.style.display='none';
      el.playerNote.value='';el.playerNote.disabled=true;
      el.playerVersionsList.innerHTML='';
      if(el.tabBtnVersions)el.tabBtnVersions.style.display='none';
      if(el.playerListChips)el.playerListChips.innerHTML='';
      updatePlayerArtwork(null);
      updateTagEditorState(null);return;
    }
    el.playerTitle.textContent=track.title;
    el.playerStage.textContent=TAG_LABEL[track.stage]||'';
    el.playerStage.style.display=TAG_LABEL[track.stage]?'inline-block':'none';
    el.playerTitleLg.textContent=track.title;
    const stageText=[TAG_FULL[track.stage]||'',track.version?`v${track.version}`:'',track.label||''].filter(Boolean).join(' · ');
    el.playerStageLg.textContent=stageText;
    el.playerStageLg.style.display=stageText?'inline-block':'none';
    el.playerFilenameLg.textContent=track.filename||'';
    const favKey=group?group.title.toLowerCase():track.title.toLowerCase();
    el.playerFavBtn.classList.toggle('starred',isFavorite(favKey));
    el.downloadBtn.href=track.file;
    el.downloadBtn.download=track.filename||track.title;
    el.downloadBtn.style.display='flex';
    if(el.deskBtnDownload){el.deskBtnDownload.href=track.file;el.deskBtnDownload.download=track.filename||track.title;}
    if(el.playerShareBtn)el.playerShareBtn.style.display='flex';
    el.playerNote.disabled=false;
    el.playerNote.value=notes[track.filename]||'';
    el.noteStatus.textContent='';

    // Artwork
    updatePlayerArtwork(track);

    // List Editor Chips
    if (el.playerListChips) {
      el.playerListChips.innerHTML = '';
      const playlists = getPlaylists();
      const songKey = group.title.toLowerCase();
      
      Object.entries(playlists).forEach(([id, pl]) => {
        const inPl = isSongInPlaylist(id, songKey);
        const chip = document.createElement('button');
        chip.className = 'tag-edit-btn pl-add-chip' + (inPl ? ' active' : '');
        chip.textContent = pl.name.toUpperCase();
        chip.addEventListener('click', () => {
          if (isSongInPlaylist(id, songKey)) {
            removeSongFromPlaylist(id, songKey);
            chip.classList.remove('active');
          } else {
            addSongToPlaylist(id, songKey, track.filename);
            chip.classList.add('active');
          }
          if(state.openPlaylistId === id) renderPlaylistDetailPage(id);
        });
        el.playerListChips.appendChild(chip);
      });
      
      const newBtn = document.createElement('button');
      newBtn.className = 'tag-edit-btn pl-add-chip pl-new-chip';
      newBtn.textContent = '+ NEW';
      newBtn.addEventListener('click', () => {
        const name = prompt('List name:');
        if(!name || !name.trim()) return;
        const id = createPlaylist(name.trim());
        addSongToPlaylist(id, songKey, track.filename);
        updatePlayerBar(state.playingTrack, state.playingGroup);
        if(state.openPlaylistId === id) renderPlaylistDetailPage(id);
      });
      el.playerListChips.appendChild(newBtn);
    }

    // Versions tab
    el.playerVersionsList.innerHTML='';
    const hasVersions=group&&group.tracks.length>1;
    if(el.tabBtnVersions)el.tabBtnVersions.style.display=hasVersions?'':'none';
    if(el.noVersionsMsg)el.noVersionsMsg.style.display=hasVersions?'none':'';

    if(hasVersions){
      const sorted=[...group.tracks].sort((a,b)=>(b.uploaded||'')>(a.uploaded||'')?1:-1);
      sorted.forEach((t,i)=>{
        const row=document.createElement('div');
        row.className='pver-row'+(t._idx===track._idx?' active':'');
        row.dataset.trackIdx=t._idx;
        const stage=document.createElement('span');stage.className='pver-row-stage';stage.textContent=TAG_SHORT[t.stage]||'?';
        const label=document.createElement('span');label.className='pver-row-label';
        label.textContent=(t.version?`v${t.version}`:'—')+(t.label?` · ${t.label}`:'');
        const date=document.createElement('span');date.className='pver-row-date';date.textContent=fmtDate(t.uploaded);
        const spacer=document.createElement('span');spacer.className='pver-row-spacer';
        const dur=document.createElement('span');dur.className='pver-row-dur';dur.dataset.trackIdx=t._idx;
        const latest=document.createElement('span');latest.className='pver-row-latest';latest.textContent=i===0?'LATEST':'';
        row.appendChild(stage);row.appendChild(label);row.appendChild(date);
        row.appendChild(spacer);row.appendChild(latest);row.appendChild(dur);
        row.addEventListener('click',()=>playTrack(t,group));
        el.playerVersionsList.appendChild(row);
      });
    }
    updateTagEditorState(track);
  }

  function updateTagEditorState(track){
    el.tagEditBtns.forEach(btn=>{btn.disabled=!track;btn.classList.toggle('active',track&&btn.dataset.stage===track.stage);});
  }

  // ── Pixel Art Artwork ──────────────────────
  function updatePlayerArtwork(track) {
    const artCanvas=$('player-art-canvas');
    const miniCanvas=$('mini-art-canvas');

    if(!track){
      if(artCanvas){const ctx=artCanvas.getContext('2d');ctx.fillStyle='#FF91AF';ctx.fillRect(0,0,64,64);}
      if(miniCanvas){const ctx=miniCanvas.getContext('2d');ctx.fillStyle='#FF91AF';ctx.fillRect(0,0,64,64);}
      return;
    }

    if(artCanvas){
      generatePixelArt('player-art-canvas', track.title);
      track.artDataUrl=artCanvas.toDataURL('image/png');
    }
    if(miniCanvas){
      generatePixelArt('mini-art-canvas', track.title);
    }
  }

  // ── Progress ───────────────────────────────
  function setPlayPauseUI(p){
    el.iconPlay.style.display=p?'none':'block';el.iconPause.style.display=p?'block':'none';
    el.miniIconPlay.style.display=p?'none':'block';el.miniIconPause.style.display=p?'block':'none';
    // Desktop bar play/pause icons
    const dp=el.deskBtnPlay;if(dp){dp.querySelector('.mini-icon-play2').style.display=p?'none':'block';dp.querySelector('.mini-icon-pause2').style.display=p?'block':'none';}
    refreshSongPagePlaying();
  }
  function updateProgress(){
    if(state.scrubbing)return;
    const pos=audio.currentTime,dur=audio.duration||0,pct=dur>0?(pos/dur):0;
    el.progressFill.style.width=`${pct*100}%`;el.progressThumb.style.left=`${pct*100}%`;
    el.miniFill.style.width=`${pct*100}%`;
    el.playerTime.textContent=fmtSec(pos);el.playerDur.textContent=fmtSec(dur);
    // Desktop bar scrubber + times
    if(el.deskProgressFill){el.deskProgressFill.style.width=`${pct*100}%`;}
    if(el.deskProgressThumb){el.deskProgressThumb.style.left=`${pct*100}%`;}
    if(el.deskTimeCur){el.deskTimeCur.textContent=fmtSec(pos);}
    if(el.deskTimeDur){el.deskTimeDur.textContent=fmtSec(dur);}
  }

  // ── Scrub ──────────────────────────────────
  function getScrubPct(e){const rect=el.progressTrack.getBoundingClientRect();const cx=e.touches?e.touches[0].clientX:e.clientX;return Math.max(0,Math.min(1,(cx-rect.left)/rect.width));}
  function applyScrub(pct){el.progressFill.style.width=`${pct*100}%`;el.progressThumb.style.left=`${pct*100}%`;if(audio.duration)el.playerTime.textContent=fmtSec(pct*audio.duration);}
  el.progressTrack.addEventListener('mousedown',e=>{state.scrubbing=true;applyScrub(getScrubPct(e));});
  el.progressTrack.addEventListener('touchstart',e=>{state.scrubbing=true;applyScrub(getScrubPct(e));},{passive:true});
  document.addEventListener('mousemove',e=>{if(state.scrubbing)applyScrub(getScrubPct(e));});
  document.addEventListener('touchmove',e=>{if(state.scrubbing)applyScrub(getScrubPct(e));},{passive:true});
  function commitScrub(e){if(!state.scrubbing)return;state.scrubbing=false;if(audio.duration)audio.currentTime=getScrubPct(e)*audio.duration;}
  document.addEventListener('mouseup',commitScrub);document.addEventListener('touchend',commitScrub);

  // ── Volume ─────────────────────────────────
  const miniVolSlider=$('mini-vol-slider');
  function setVolume(v,persist){v=Math.max(0,Math.min(1,v));audio.volume=v;el.playerVolume.value=v;el.volPct.textContent=Math.round(v*100)+'%';if(miniVolSlider)miniVolSlider.value=v;if(persist!==false){try{localStorage.setItem(VOLUME_KEY,String(v));}catch{}}}
  el.playerVolume.addEventListener('input',()=>setVolume(parseFloat(el.playerVolume.value)));
  if(miniVolSlider)miniVolSlider.addEventListener('input',()=>setVolume(parseFloat(miniVolSlider.value)));
  $('vol-down').addEventListener('click',()=>setVolume(audio.volume-0.1));
  $('vol-up').addEventListener('click',()=>setVolume(audio.volume+0.1));

  // ── Playback speed (pitch-preserved — for working on parts) ──
  function setSpeed(rate,persist){
    rate=parseFloat(rate)||1;
    audio.playbackRate=rate;
    try{audio.preservesPitch=audio.mozPreservesPitch=audio.webkitPreservesPitch=true;}catch{}
    document.querySelectorAll('.speed-btn').forEach(b=>b.classList.toggle('active',parseFloat(b.dataset.speed)===rate));
    if(persist!==false){try{localStorage.setItem(SPEED_KEY,String(rate));}catch{}}
    updateMediaPosition();
  }
  document.querySelectorAll('.speed-btn').forEach(b=>b.addEventListener('click',()=>setSpeed(b.dataset.speed)));
  function cycleSpeed(dir){
    const cur=audio.playbackRate||1;
    let i=SPEED_STEPS.indexOf(SPEED_STEPS.reduce((a,b)=>Math.abs(b-cur)<Math.abs(a-cur)?b:a,SPEED_STEPS[0]));
    i=Math.max(0,Math.min(SPEED_STEPS.length-1,i+dir));
    setSpeed(SPEED_STEPS[i]);
  }

  // ── Loop ───────────────────────────────────
  el.btnLoop.addEventListener('click',()=>{state.looping=!state.looping;audio.loop=state.looping;el.btnLoop.classList.toggle('active',state.looping);if(el.deskBtnLoop)el.deskBtnLoop.classList.toggle('active',state.looping);});

  // ── Notes ──────────────────────────────────
  el.playerNote.addEventListener('input',()=>{if(!state.playingTrack)return;scheduleNoteSave(state.playingTrack.filename,el.playerNote.value);});
  el.playerNote.addEventListener('keydown',e=>e.stopPropagation());

  // ── Player expand / collapse ───────────────
  function setPlayerExpanded(expanded){
    state.playerExpanded=expanded;
    document.body.classList.toggle('player-expanded',expanded);
  }

  // Bind the entire mini strip to expand, except when clicking a control button or slider
  if (el.playerExpandBtn) {
    el.playerExpandBtn.addEventListener('click', (e) => {
      if (!state.playingTrack) return;
      if (e.target.closest('.mini-ctrl') || e.target.closest('.desktop-scrub-zone') || e.target.tagName === 'INPUT') return;
      setPlayerExpanded(!state.playerExpanded);
    });
  }

  $('player-close-btn').addEventListener('click',()=>setPlayerExpanded(false));
  if($('player-close-btn2'))$('player-close-btn2').addEventListener('click',()=>setPlayerExpanded(false));

  // Backdrop click closes modal on desktop
  if(el.playerBackdrop){
    el.playerBackdrop.addEventListener('click',()=>setPlayerExpanded(false));
  }

  // ── Share from player ──────────────────────
  if($('player-share-btn')){
    $('player-share-btn').addEventListener('click',()=>{
      if(!state.playingTrack)return;
      shareTrack(state.playingTrack,state.playingGroup);
    });
  }
  
  const miniBtnShare = $('mini-btn-share');
  if(miniBtnShare) {
    miniBtnShare.addEventListener('click', () => {
      if(!state.playingTrack) return;
      shareTrack(state.playingTrack, state.playingGroup);
    });
  }

  // ── Favourite from player ──────────────────
  el.playerFavBtn.addEventListener('click',()=>{
    if(!state.playingTrack)return;
    const key=state.playingGroup?state.playingGroup.title.toLowerCase():state.playingTrack.title.toLowerCase();
    const nowStarred=toggleFavorite(key);
    el.playerFavBtn.classList.toggle('starred',nowStarred);
    document.querySelectorAll('.card-star').forEach(s=>{
      const card=s.closest('.track-card');if(!card)return;
      const g=state.filteredGroups[card.dataset.gIdx];
      if(g&&g.title.toLowerCase()===key)s.classList.toggle('starred',nowStarred);
    });
    if(state.currentFilter==='starred')render();
  });

  // ── Tag editing ────────────────────────────
  el.tagEditBtns.forEach(btn=>{
    btn.addEventListener('click',()=>{
      if(!state.playingTrack)return;
      const stage=btn.dataset.stage,track=state.playingTrack,group=state.playingGroup;
      setTagOverride(track.filename,stage);track.stage=stage;
      if(group){group.stages=new Set(group.tracks.map(t=>t.stage));group.stage=[...group.stages].sort((a,b)=>STAGE_RANK[b]-STAGE_RANK[a])[0];}
      updatePlayerBar(track,group);render();
    });
  });

  // ── Edit / mass select ─────────────────────
  el.editModeBtn.addEventListener('click',()=>{
    state.editMode=!state.editMode;state.selectedFilenames.clear();
    el.editModeBtn.classList.toggle('active',state.editMode);
    document.body.classList.toggle('edit-mode',state.editMode);
    el.massEditBar.style.display=state.editMode?'flex':'none';
    updateMassEditCount();render();
  });
  el.massEditDone.addEventListener('click',()=>{
    state.editMode=false;state.selectedFilenames.clear();
    el.editModeBtn.classList.remove('active');document.body.classList.remove('edit-mode');
    el.massEditBar.style.display='none';render();
  });
  el.massTagBtns.forEach(btn=>{
    btn.addEventListener('click',()=>{
      if(!state.selectedFilenames.size)return;
      const stage=btn.dataset.stage;
      state.selectedFilenames.forEach(fn=>{setTagOverride(fn,stage);const t=state.allTracks.find(t=>t.filename===fn);if(t)t.stage=stage;});
      state.groups=buildGroups(state.allTracks.filter(t=>!isVoiceNote(t)));
      state.selectedFilenames.clear();updateMassEditCount();render();
    });
  });
  // ── Bulk add selected songs to a list ──────
  const massListBtn = $('mass-list-btn');
  const massListMenu = $('mass-list-menu');
  function bulkAddToPlaylist(playlistId){
    if(!state.selectedFilenames.size)return 0;
    let added=0;
    state.selectedFilenames.forEach(fn=>{
      const t=state.allTracks.find(t=>t.filename===fn);if(!t)return;
      const g=findGroup(t);
      const songKey=(g?g.title:t.title).toLowerCase();
      if(!isSongInPlaylist(playlistId,songKey)){addSongToPlaylist(playlistId,songKey,fn);added++;}
    });
    if(state.openPlaylistId===playlistId)renderPlaylistDetailPage(playlistId);
    return added;
  }
  function renderMassListMenu(){
    if(!massListMenu)return;
    massListMenu.innerHTML='';
    const playlists=getPlaylists();
    const entries=Object.entries(playlists);
    if(!entries.length){
      const empty=document.createElement('div');
      empty.className='dropdown-item';empty.style.opacity='0.4';empty.textContent='NO LISTS YET';
      massListMenu.appendChild(empty);
    }
    entries.forEach(([id,pl])=>{
      const item=document.createElement('button');
      item.className='dropdown-item';
      item.textContent=pl.name.toUpperCase();
      item.addEventListener('click',()=>{
        const n=bulkAddToPlaylist(id);
        closeAllDropdowns();
        showShareToast(n?`ADDED ${n} TO ${pl.name.toUpperCase()}`:'ALREADY IN LIST');
      });
      massListMenu.appendChild(item);
    });
    const newItem=document.createElement('button');
    newItem.className='dropdown-item dropdown-item-voice';
    newItem.textContent='+ NEW LIST';
    newItem.addEventListener('click',()=>{
      closeAllDropdowns();
      const name=prompt('List name:');if(!name||!name.trim())return;
      const id=createPlaylist(name.trim());
      const n=bulkAddToPlaylist(id);
      showShareToast(`ADDED ${n} TO ${name.trim().toUpperCase()}`);
    });
    massListMenu.appendChild(newItem);
  }
  if(massListBtn&&massListMenu){
    massListBtn.addEventListener('click',e=>{
      e.stopPropagation();
      if(!state.selectedFilenames.size){showShareToast('SELECT SONGS FIRST');return;}
      const o=massListMenu.classList.contains('open');
      closeAllDropdowns();
      if(!o){renderMassListMenu();massListMenu.classList.add('open');}
    });
  }

  function toggleCardSelection(card,filename){
    if(!filename)return;
    state.selectedFilenames.has(filename)?state.selectedFilenames.delete(filename):state.selectedFilenames.add(filename);
    card.classList.toggle('selected',state.selectedFilenames.has(filename));
    updateMassEditCount();
  }
  function updateMassEditCount(){el.massEditCount.textContent=`${state.selectedFilenames.size} SELECTED`;}

  // ── Swipe gestures ──────────────────────────
  let swipeX=null,swipeY=null;

  el.playerBar.addEventListener('touchstart',e=>{
    if(e.target.closest('.player-full,.player-handle-btn'))return;
    swipeX=e.touches[0].clientX;swipeY=e.touches[0].clientY;
  },{passive:true});
  el.playerBar.addEventListener('touchend',e=>{
    if(swipeX===null)return;
    const dx=e.changedTouches[0].clientX-swipeX,dy=e.changedTouches[0].clientY-swipeY;
    swipeX=null;swipeY=null;
    if(Math.abs(dy)>Math.abs(dx)&&Math.abs(dy)>44){
      if(dy<0&&!state.playerExpanded)setPlayerExpanded(true);
      return;
    }
    if(Math.abs(dx)<40||Math.abs(dy)>Math.abs(dx)*0.8)return;
    dx<0?playNext():playPrev();
  },{passive:true});

  let handleStartY=null,handleDidSwipe=false;
  el.playerToggleBtn.addEventListener('touchstart',e=>{handleStartY=e.touches[0].clientY;handleDidSwipe=false;},{passive:true});
  el.playerToggleBtn.addEventListener('touchend',e=>{
    if(handleStartY===null)return;
    const dy=e.changedTouches[0].clientY-handleStartY;handleStartY=null;
    if(Math.abs(dy)>44){
      handleDidSwipe=true;
      if(dy>0&&state.playerExpanded)setPlayerExpanded(false);
      else if(dy<0&&!state.playerExpanded)setPlayerExpanded(true);
    }
  },{passive:true});
  el.playerToggleBtn.addEventListener('click',()=>{
    if(handleDidSwipe){handleDidSwipe=false;return;}
    setPlayerExpanded(!state.playerExpanded);
  });

  // ── Button listeners ───────────────────────
  $('song-back-btn').addEventListener('click',closeSongPage);
  $('song-share-btn').addEventListener('click',()=>{if(state.songPageGroup)shareGroup(state.songPageGroup);});
  $('playlists-btn').addEventListener('click',openPlaylistsPage);
  $('playlists-back-btn').addEventListener('click',closePlaylistsPage);
  $('new-playlist-btn').addEventListener('click',()=>{
    const name=prompt('List name:');if(!name||!name.trim())return;
    createPlaylist(name.trim());renderPlaylistsPage();
  });
  $('playlist-detail-back-btn').addEventListener('click',goBackToPlaylistsList);
  $('playlist-play-all-btn').addEventListener('click',()=>{if(state.openPlaylistId)playFromPlaylist(state.openPlaylistId,null);});

  document.addEventListener('click',()=>{
    document.querySelectorAll('.pl-ver-opts.open').forEach(o=>o.classList.remove('open'));
    document.querySelectorAll('.pl-ver-trigger.open').forEach(o=>o.classList.remove('open'));
  });

  // ── Keyboard ───────────────────────────────
  document.addEventListener('keydown',e=>{
    if(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA')return;
    if(e.key==='/'){e.preventDefault();if(!document.body.classList.contains('search-open'))el.searchBtn.click();return;}
    if(e.key==='Escape'){
      if(document.body.classList.contains('search-open')){el.searchBtn.click();return;}
      if(state.songPageGroup){closeSongPage();return;}
      if(el.playlistDetailPage.style.display!=='none'){goBackToPlaylistsList();return;}
      if(el.playlistsPage.style.display!=='none'){closePlaylistsPage();return;}
      if(state.playerExpanded){setPlayerExpanded(false);return;}
      return;
    }
    if(e.code==='Space'){e.preventDefault();togglePlayPause();return;}
    // Shift+Arrows or , / .  → seek within the current track
    if((e.shiftKey&&e.code==='ArrowRight')||e.key==='.'){if(audio.duration){audio.currentTime=Math.min(audio.duration,audio.currentTime+5);}return;}
    if((e.shiftKey&&e.code==='ArrowLeft')||e.key===','){if(audio.duration){audio.currentTime=Math.max(0,audio.currentTime-5);}return;}
    if(e.code==='ArrowRight'){playNext();return;}
    if(e.code==='ArrowLeft'){playPrev();return;}
    if(e.code==='ArrowUp'){e.preventDefault();setVolume(audio.volume+0.05);return;}
    if(e.code==='ArrowDown'){e.preventDefault();setVolume(audio.volume-0.05);return;}
    if(e.key==='['){cycleSpeed(-1);return;}
    if(e.key===']'){cycleSpeed(1);return;}
    if(e.key==='l'||e.key==='L'){el.btnLoop.click();return;}
  });

  // ── Playback ───────────────────────────────
  function playTrack(track,group,opts){
    opts=opts||{};
    state.playingTrack=track;state.playingGroup=group||findGroup(track);
    audio.src=track.file;audio.loop=state.looping;
    setSpeed(audio.playbackRate||1,false);   // re-apply rate + preservesPitch on new src
    if(opts.seek){audio.addEventListener('loadedmetadata',function s(){audio.currentTime=Math.min(opts.seek,(audio.duration||opts.seek));audio.removeEventListener('loadedmetadata',s);});}
    if(opts.noPlay){state.isPlaying=false;setPlayPauseUI(false);}
    else audio.play().catch(()=>{});
    saveResume();
    updatePlayerBar(track,state.playingGroup);refreshPlayingState();
    refreshSongPagePlaying();
    updateMediaSession(track);
    renderQueueTab();
    if(state.openPlaylistId){
      setTimeout(()=>{
        const bd=$('playlist-detail-body');
        const sy=bd?bd.scrollTop:0;
        renderPlaylistDetailPage(state.openPlaylistId);
        if(bd)bd.scrollTop=sy;
      },0);
    }
  }
  function findGroup(t){return state.groups.find(g=>g.tracks.includes(t))||null;}
  function getFlatTracks(){
    if(state.currentFilter==='voice')return state.voiceTracks;
    const t=[];state.filteredGroups.forEach(g=>t.push(...g.tracks));return t;
  }
  function playNext(){
    if(state.activePlaylistId&&state.playlistQueue.length){
      const idx=state.playlistQueue.findIndex(t=>t._idx===state.playingTrack?._idx);
      if(idx>=0&&idx<state.playlistQueue.length-1){const n=state.playlistQueue[idx+1];playTrack(n,findGroup(n));return;}
      if(idx===state.playlistQueue.length-1)return;
    }
    if(state.isShuffling&&state.shuffleQueue.length>0){const n=state.shuffleQueue.shift();playTrack(n,findGroup(n));return;}
    const flat=getFlatTracks(),idx=flat.indexOf(state.playingTrack);
    if(idx<flat.length-1){const n=flat[idx+1];playTrack(n,findGroup(n));}
  }
  function playPrev(){
    if(audio.currentTime>3){audio.currentTime=0;return;}
    if(state.activePlaylistId&&state.playlistQueue.length){
      const idx=state.playlistQueue.findIndex(t=>t._idx===state.playingTrack?._idx);
      if(idx>0){const p=state.playlistQueue[idx-1];playTrack(p,findGroup(p));return;}
      if(idx===0)return;
    }
    const flat=getFlatTracks(),idx=flat.indexOf(state.playingTrack);
    if(idx>0){const p=flat[idx-1];playTrack(p,findGroup(p));}
  }
  function togglePlayPause(){
    if(!state.playingTrack){const flat=getFlatTracks();if(flat.length)playTrack(flat[0],findGroup(flat[0]));return;}
    state.isPlaying?audio.pause():audio.play().catch(()=>{});
  }
  function activateShuffle(){
    state.activePlaylistId=null;state.playlistQueue=[];updatePlayerPlaylistBadge();
    state.isShuffling=true;state.currentSort='shuffle';
    state.shuffleQueue=shuffle([...getFlatTracks()]);render();
    if(state.shuffleQueue.length){const f=state.shuffleQueue.shift();playTrack(f,findGroup(f));}
  }

  audio.addEventListener('play',()=>{state.isPlaying=true;setPlayPauseUI(true);});
  audio.addEventListener('pause',()=>{state.isPlaying=false;setPlayPauseUI(false);});
  audio.addEventListener('ended',()=>{state.isPlaying=false;setPlayPauseUI(false);updateProgress();if(!state.looping)playNext();});
  // ── Resume (remember last track + position across reloads) ──
  let _lastResumeSave=0;
  function saveResume(){
    const t=state.playingTrack;if(!t)return;
    try{localStorage.setItem(RESUME_KEY,JSON.stringify({f:t.filename,t:Math.floor(audio.currentTime||0)}));}catch{}
  }
  window.addEventListener('beforeunload',saveResume);
  audio.addEventListener('pause',saveResume);
  audio.addEventListener('timeupdate',()=>{updateProgress();updateMediaPosition();
    const now=Date.now();if(now-_lastResumeSave>4000){_lastResumeSave=now;saveResume();}});
  audio.addEventListener('loadedmetadata',()=>{updateProgress();updateMediaPosition();});

  el.miniBtnPlay.addEventListener('click',togglePlayPause);
  el.miniBtnPrev.addEventListener('click',playPrev);
  el.miniBtnNext.addEventListener('click',playNext);
  // Desktop bar transport
  if(el.deskBtnPlay){el.deskBtnPlay.addEventListener('click',togglePlayPause);}
  if(el.deskBtnPrev){el.deskBtnPrev.addEventListener('click',playPrev);}
  if(el.deskBtnNext){el.deskBtnNext.addEventListener('click',playNext);}
  if(el.deskBtnLoop){el.deskBtnLoop.addEventListener('click',()=>{state.looping=!state.looping;audio.loop=state.looping;el.btnLoop.classList.toggle('active',state.looping);el.deskBtnLoop.classList.toggle('active',state.looping);});}
  // Desktop scrubber
  if(el.deskProgressTrack){
    function getDeskScrubPct(e){const r=el.deskProgressTrack.getBoundingClientRect();const cx=e.touches?e.touches[0].clientX:e.clientX;return Math.max(0,Math.min(1,(cx-r.left)/r.width));}
    el.deskProgressTrack.addEventListener('mousedown',e=>{state.scrubbing=true;const p=getDeskScrubPct(e);el.deskProgressFill.style.width=`${p*100}%`;el.deskProgressThumb.style.left=`${p*100}%`;if(audio.duration)el.deskTimeCur.textContent=fmtSec(p*audio.duration);});
    document.addEventListener('mousemove',e=>{if(state.scrubbing&&el.deskProgressFill){const p=getDeskScrubPct(e);el.deskProgressFill.style.width=`${p*100}%`;el.deskProgressThumb.style.left=`${p*100}%`;if(audio.duration)el.deskTimeCur.textContent=fmtSec(p*audio.duration);}});
  }
  el.btnPlay.addEventListener('click',togglePlayPause);
  el.btnPrev.addEventListener('click',playPrev);
  el.btnNext.addEventListener('click',playNext);

  $('shuffle-radio-btn').addEventListener('click',()=>{
    state.currentFilter='all';el.filterLabel.textContent='ALL';
    el.filterItems.forEach(x=>x.classList.toggle('active',x.dataset.filter==='all'));
    el.filterToggle.classList.remove('active');
    activateShuffle();$('shuffle-radio-btn').classList.add('playing');
  });

  // ── Media Session API ──────────────────────
  function setupMediaSession(){
    if(!('mediaSession' in navigator))return;
    navigator.mediaSession.setActionHandler('play',()=>audio.play().catch(()=>{}));
    navigator.mediaSession.setActionHandler('pause',()=>audio.pause());
    navigator.mediaSession.setActionHandler('previoustrack',playPrev);
    navigator.mediaSession.setActionHandler('nexttrack',playNext);
    navigator.mediaSession.setActionHandler('seekbackward',null);
    navigator.mediaSession.setActionHandler('seekforward',null);
  }
  function updateMediaSession(track){
    if(!('mediaSession' in navigator)||!track)return;
    const artwork=track.artDataUrl||'';
    navigator.mediaSession.metadata=new MediaMetadata({
      title:track.title,artist:'MILLO',album:TAG_FULL[track.stage]||'ARCHIVE',
      artwork:artwork?[{src:artwork,sizes:'64x64',type:'image/png'}]:[],
    });
  }
  function updateMediaPosition(){
    if(!('mediaSession' in navigator)||!audio.duration)return;
    try{navigator.mediaSession.setPositionState({duration:audio.duration,playbackRate:audio.playbackRate,position:Math.min(audio.currentTime,audio.duration)});}catch{}
  }

  // ── Boot ───────────────────────────────────
  async function init(){
    setupMediaSession();updateTagEditorState(null);
    let _v=parseFloat(localStorage.getItem(VOLUME_KEY));setVolume(isNaN(_v)?1:_v,false);
    setSpeed(parseFloat(localStorage.getItem(SPEED_KEY))||1,false);
    el.downloadBtn.style.display='none';el.playerNote.disabled=true;
    if(el.tabBtnVersions)el.tabBtnVersions.style.display='none';
    try{
      await Promise.all([
        fetch(WORKER_URL).then(r=>r.json()).then(tracks=>{
          if(!tracks.length){el.loading.style.display='none';el.empty.style.display='block';return;}
          tracks.forEach((t,i)=>t._idx=i);
          applyTagOverrides(tracks);
          state.allTracks=tracks;
          state.voiceTracks=tracks.filter(isVoiceNote);
          const nonVoice=tracks.filter(t=>!isVoiceNote(t));
          if(state.voiceTracks.length)el.voiceCountBadge.innerHTML=`<span class="voice-badge">${state.voiceTracks.length}</span>`;
          state.groups=buildGroups(nonVoice);
          state.filteredGroups=sortGroups(state.groups,'newest');
          el.loading.style.display='none';
          render();loadAllDurations(tracks);
          const params=new URLSearchParams(window.location.search);
          const songParam=params.get('song');
          const trackParam=params.get('track');
          if(songParam){
            const group=state.groups.find(g=>g.title.toLowerCase()===decodeURIComponent(songParam).toLowerCase());
            if(group){
              if(trackParam){
                const track=group.tracks.find(t=>t.filename===decodeURIComponent(trackParam));
                if(track){playTrack(track,group);setPlayerExpanded(true);}
                else openSongPage(group);
              } else { openSongPage(group); }
            }
          } else if(trackParam){
            const track=state.allTracks.find(t=>t.filename===decodeURIComponent(trackParam));
            if(track){playTrack(track,findGroup(track));setPlayerExpanded(true);}
          } else {
            // Resume last session — cue the track paused, ready to hit play.
            try{
              const r=JSON.parse(localStorage.getItem(RESUME_KEY)||'null');
              if(r&&r.f){const track=state.allTracks.find(t=>t.filename===r.f);
                if(track)playTrack(track,findGroup(track),{noPlay:true,seek:r.t||0});}
            }catch{}
          }
        }),
        loadNotes(),
      ]);
    }catch(err){el.loading.innerHTML=`<span class="loading-text">ERROR: ${err.message}</span>`;}
  }

  init();
})();