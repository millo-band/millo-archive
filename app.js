/* ============================================
   MILLO ARCHIVE v10 — app.js
============================================ */
(function () {
  'use strict';

  const WORKER_URL        = 'https://millo-worker.millo-manager.workers.dev';
  const NEW_DAYS          = 7;
  const TAG_OVERRIDES_KEY = 'millo-tag-overrides-v1';
  const FAVORITES_KEY     = 'millo-favorites-v1';
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
    isPlaying:false, openDrawerId:null, scrubbing:false,
    playerExpanded:false, looping:false, activeTab:'notes',
    editMode:false, selectedFilenames:new Set(),
    searchQuery:'',
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
    // player - expanded
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
    // player - mini strip
    playerTitle:$('player-title'), playerStage:$('player-stage'),
    playerExpandBtn:$('player-expand-btn'),
    miniFill:$('player-mini-fill'),
    miniBtnPlay:$('mini-btn-play'), miniBtnPrev:$('mini-btn-prev'), miniBtnNext:$('mini-btn-next'),
    miniIconPlay:$('mini-icon-play'), miniIconPause:$('mini-icon-pause'),
    // edit mode
    editModeBtn:$('edit-mode-btn'), massEditBar:$('mass-edit-bar'),
    massEditCount:$('mass-edit-count'), massEditDone:$('mass-edit-done'),
    massTagBtns:document.querySelectorAll('.mass-tag-btn'),
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
  document.addEventListener('keydown', e => {
    if (e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA') return;
    if (e.key==='/'){ e.preventDefault(); if(!document.body.classList.contains('search-open'))el.searchBtn.click(); }
    if (e.key==='Escape'&&document.body.classList.contains('search-open')) el.searchBtn.click();
  });

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
  function searchGroups(groups,q) { if(!q)return groups; return groups.filter(g=>g.title.toLowerCase().includes(q)); }

  function shuffle(arr){for(let i=arr.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[arr[i],arr[j]]=[arr[j],arr[i]];}return arr;}
  function isNew(d){return d&&(Date.now()-new Date(d).getTime())<NEW_DAYS*86400000;}
  function fmtSec(s){if(!s||isNaN(s))return'0:00';return`${Math.floor(s/60)}:${(Math.floor(s)%60).toString().padStart(2,'0')}`;}
  function fmtDate(d){return d?d.slice(5):'';}

  // ── Render ─────────────────────────────────
  function render() {
    el.grid.innerHTML=''; el.voiceList.innerHTML=''; state.openDrawerId=null;
    if (state.currentFilter==='voice') {
      el.grid.style.display='none'; el.empty.style.display='none'; el.loading.style.display='none';
      el.voiceList.style.display='block'; el.voiceList.classList.add('visible');
      el.whatsNew.style.display='none'; renderVoiceList(); return;
    }
    el.grid.style.display='grid'; el.voiceList.style.display='none'; el.voiceList.classList.remove('visible');
    const visible=searchGroups(sortGroups(filterGroups(state.groups,state.currentFilter),state.currentSort),state.searchQuery);
    state.filteredGroups=visible;
    if(!visible.length){el.empty.style.display='block';return;}
    el.empty.style.display='none';
    visible.forEach((group,gIdx)=>{ el.grid.appendChild(buildCard(group,gIdx)); if(group.type==='group')el.grid.appendChild(buildDrawer(group,gIdx)); });
    if (state.searchQuery) el.whatsNew.style.display='none'; else renderWhatsNew();
    renderStats(); refreshPlayingState();
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
    if(hasVersions){
      const vBtn=document.createElement('button'); vBtn.className='version-count-btn'; vBtn.textContent=`${group.tracks.length} VER`;
      vBtn.addEventListener('click',e=>{e.stopPropagation();toggleDrawer(gIdx);}); footer.appendChild(vBtn);
    }
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

  function buildDrawer(group,gIdx) {
    const drawer=document.createElement('div'); drawer.className='version-drawer'; drawer.id=`drawer-${gIdx}`;
    const hdr=document.createElement('div'); hdr.className='drawer-header'; hdr.textContent=`ALL VERSIONS — ${group.title.toUpperCase()}`; drawer.appendChild(hdr);
    const sorted=[...group.tracks].sort((a,b)=>(b.uploaded||'')>(a.uploaded||'')?1:-1);
    sorted.forEach((track,i)=>{
      const row=document.createElement('div'); row.className='version-row'; row.dataset.trackIdx=track._idx;
      const stageTag=document.createElement('span'); stageTag.className='version-row-stage'; stageTag.textContent=TAG_SHORT[track.stage]||'?';
      const label=document.createElement('span'); label.className='version-row-label'; label.textContent=track.version?`v${track.version}`:'';
      const dateEl=document.createElement('span'); dateEl.className='version-row-date'; dateEl.textContent=fmtDate(track.uploaded);
      const spacer=document.createElement('span'); spacer.className='version-row-spacer';
      const durEl=document.createElement('span'); durEl.className='version-row-dur'; durEl.dataset.trackIdx=track._idx;
      row.appendChild(stageTag); row.appendChild(label); row.appendChild(dateEl); row.appendChild(spacer);
      if(i===0){const lb=document.createElement('span');lb.textContent='LATEST';lb.style.cssText='font-family:Press Start 2P,monospace;font-size:6px;opacity:0.5;flex-shrink:0';row.appendChild(lb);}
      row.appendChild(durEl);
      row.addEventListener('click',()=>playTrack(track,group)); drawer.appendChild(row);
    });
    return drawer;
  }

  function toggleDrawer(gIdx) {
    if(state.openDrawerId!==null&&state.openDrawerId!==gIdx){const p=$(`drawer-${state.openDrawerId}`);if(p)p.classList.remove('open');}
    const drawer=$(`drawer-${gIdx}`); if(!drawer)return;
    const opening=!drawer.classList.contains('open');
    drawer.classList.toggle('open',opening); state.openDrawerId=opening?gIdx:null;
    if(opening)drawer.scrollIntoView({behavior:'smooth',block:'nearest'});
  }

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
    document.querySelectorAll('.version-row').forEach(row=>row.classList.toggle('playing',parseInt(row.dataset.trackIdx)===idx));
    document.querySelectorAll('.voice-row').forEach(row=>row.classList.toggle('playing',parseInt(row.dataset.trackIdx)===idx));
    document.querySelectorAll('.new-track-chip').forEach(chip=>{
      const g=state.groups.find(gr=>gr.tracks.some(t=>t._idx===parseInt(chip.dataset.trackIdx)));
      chip.classList.toggle('playing',!!(g&&state.playingGroup&&g.title.toLowerCase()===state.playingGroup.title.toLowerCase()));
    });
    // Version rows in player
    document.querySelectorAll('.pver-row').forEach(row=>row.classList.toggle('active',parseInt(row.dataset.trackIdx)===idx));
  }

  function loadAllDurations(tracks) {
    tracks.forEach(t=>{
      const probe=new Audio(); probe.preload='metadata'; probe.src=t.file;
      probe.addEventListener('loadedmetadata',()=>{
        const dur=fmtSec(probe.duration);
        document.querySelectorAll(`[data-track-idx="${t._idx}"]`).forEach(node=>{
          if(node.classList.contains('card-duration')||node.classList.contains('version-row-dur')||node.classList.contains('voice-row-dur')||node.classList.contains('pver-row-dur'))
            node.textContent=dur;
        });
      });
    });
  }

  // ── Procedural 1-Bit Pixel Art Generator ──────────────────
  function generatePixelArt(canvasId, seedString) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    
    const size = 64; 
    canvas.width = size;
    canvas.height = size;
    
    ctx.fillStyle = '#FF91AF'; // Pink background
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#000000'; // Black pixels

    let hash = 0;
    for (let i = 0; i < seedString.length; i++) {
      hash = seedString.charCodeAt(i) + ((hash << 5) - hash);
    }

    function random() {
      const x = Math.sin(hash++) * 10000;
      return x - Math.floor(x);
    }

    const artType = Math.floor(random() * 4);

    if (artType === 0) {
      // Mirrored Emblem / Sigil
      const halfWidth = size / 2;
      const ringRad = Math.floor(random() * 8) + 16;
      if (random() > 0.3) {
        for (let angle = 0; angle < 360; angle += 1) {
          const rads = angle * Math.PI / 180;
          const px = Math.round(32 + Math.cos(rads) * ringRad);
          const py = Math.round(32 + Math.sin(rads) * ringRad);
          if ((px + py) % 2 === 0) {
            ctx.fillRect(px, py, 1, 1);
          }
        }
      }
      for (let x = 6; x < halfWidth; x++) {
        for (let y = 6; y < size - 6; y++) {
          const val = Math.sin(x * 0.3) * Math.cos(y * 0.3);
          if (val > 0.1 && (random() < 0.45)) {
            ctx.fillRect(x, y, 1, 1);
            ctx.fillRect(size - 1 - x, y, 1, 1);
          }
        }
      }
      ctx.fillRect(30, 30, 4, 4);
    } else if (artType === 1) {
      // Shaded Retro Planet Sphere
      const radius = 22;
      const cx = 32, cy = 32;
      const lx = 20, ly = 20;

      for (let x = 0; x < size; x++) {
        for (let y = 0; y < size; y++) {
          const dx = x - cx;
          const dy = y - cy;
          const dist = Math.sqrt(dx*dx + dy*dy);
          if (dist < radius) {
            const dlx = x - lx;
            const dly = y - ly;
            const lightDist = Math.sqrt(dlx*dlx + dly*dly);

            if (lightDist < 12) {
              // Highlight (leave pink)
            } else if (lightDist < 20) {
              if (x % 3 === 0 && y % 3 === 0) ctx.fillRect(x, y, 1, 1);
            } else if (lightDist < 28) {
              if ((x + y) % 2 === 0) ctx.fillRect(x, y, 1, 1);
            } else if (lightDist < 36) {
              if ((x + y) % 2 === 0 || x % 2 === 0) ctx.fillRect(x, y, 1, 1);
            } else {
              ctx.fillRect(x, y, 1, 1);
            }
          } else if (dist >= radius && dist < radius + 1) {
            ctx.fillRect(x, y, 1, 1);
          }
        }
      }
    } else if (artType === 2) {
      // Mirrored Cyber Mask
      const halfWidth = size / 2;
      for (let x = 8; x < halfWidth; x++) {
        const widthLimit = Math.sin(((x - 8) / 24) * Math.PI) * 22 + 8;
        for (let y = 12; y < size - 12; y++) {
          const isEye = (y > 22 && y < 28 && x > 14 && x < 20);
          const isMouth = (y > 40 && y < 46 && x > 18 && x < 26);
          if (isEye) {
            if (y === 23 || y === 27 || x === 15 || x === 19) {
              ctx.fillRect(x, y, 1, 1);
              ctx.fillRect(size - 1 - x, y, 1, 1);
            }
            continue;
          }
          if (isMouth) {
            if (x % 2 === 0 || y % 2 === 0) {
              ctx.fillRect(x, y, 1, 1);
              ctx.fillRect(size - 1 - x, y, 1, 1);
            }
            continue;
          }
          const noiseVal = random();
          if (noiseVal < 0.52 && y < widthLimit + 24) {
            if ((x + y) % 2 === 0 || noiseVal < 0.25) {
              ctx.fillRect(x, y, 1, 1);
              ctx.fillRect(size - 1 - x, y, 1, 1);
            }
          }
        }
      }
    } else {
      // Waveform Landscape
      const waveAmp1 = 6 + random() * 10;
      const waveFreq1 = 0.05 + random() * 0.05;
      const waveAmp2 = 3 + random() * 6;
      const waveFreq2 = 0.1 + random() * 0.1;

      for (let x = 0; x < size; x++) {
        const waveY = Math.round(38 + Math.sin(x * waveFreq1) * waveAmp1 + Math.cos(x * waveFreq2) * waveAmp2);
        for (let y = 0; y < size; y++) {
          if (y > waveY) {
            const ditherPct = (y - waveY) / (size - waveY);
            if (ditherPct > 0.6 || (x + y) % 2 === 0 || (y % 4 === 0 && x % 2 === 0)) {
              ctx.fillRect(x, y, 1, 1);
            }
          } else {
            const ditherPct = y / waveY;
            if (ditherPct < 0.3) {
              if (random() < 0.02) ctx.fillRect(x, y, 1, 1);
            } else if (ditherPct < 0.6) {
              if (x % 4 === 0 && y % 4 === 0) ctx.fillRect(x, y, 1, 1);
            } else {
              if ((x + y) % 2 === 0 && random() < 0.5) ctx.fillRect(x, y, 1, 1);
            }
          }
        }
        ctx.fillRect(x, waveY, 1, 1);
      }
    }

    return canvas.toDataURL('image/png');
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
      $('mini-art-canvas').style.display = 'none';
      $('player-art-panel').style.display = 'none';
      updateTagEditorState(null); return;
    }

    // Mini strip
    el.playerTitle.textContent=track.title;
    el.playerStage.textContent=TAG_LABEL[track.stage]||'';
    el.playerStage.style.display=TAG_LABEL[track.stage]?'inline-block':'none';

    // Canvas procedural 1-bit rendering
    $('mini-art-canvas').style.display = 'block';
    generatePixelArt('mini-art-canvas', track.title);
    $('player-art-panel').style.display = 'flex';
    const dataUrl = generatePixelArt('player-art-canvas', track.title);
    
    // Cache the dataURL on the track object so lockscreen mediaSession can display it instantly
    track.artDataUrl = dataUrl;

    // Expanded info
    el.playerTitleLg.textContent=track.title;
    el.playerStageLg.textContent=TAG_FULL[track.stage]||'';
    el.playerStageLg.style.display=TAG_FULL[track.stage]?'inline-block':'none';
    el.playerFilenameLg.textContent=track.filename||'';

    // Favourite
    const favKey=group?group.title.toLowerCase():track.title.toLowerCase();
    el.playerFavBtn.classList.toggle('starred', isFavorite(favKey));

    // Download
    el.downloadBtn.href=track.file;
    el.downloadBtn.download=track.filename||track.title;
    el.downloadBtn.style.display='flex';

    // Note
    el.playerNote.disabled=false;
    el.playerNote.value=notes[track.filename]||'';
    el.noteStatus.textContent='';

    // Versions tab
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
  el.playerExpandBtn.addEventListener('click',(e)=>{ 
    if(e.target.closest('#mini-btn-prev, #mini-btn-play, #mini-btn-next')) return;
    if(state.playingTrack) setPlayerExpanded(!state.playerExpanded); 
  });
  $('player-close-btn').addEventListener('click',()=>setPlayerExpanded(false));

  // ── Favourite from player ──────────────────
  el.playerFavBtn.addEventListener('click',()=>{
    if(!state.playingTrack)return;
    const key=state.playingGroup?state.playingGroup.title.toLowerCase():state.playingTrack.title.toLowerCase();
    const nowStarred=toggleFavorite(key);
    el.playerFavBtn.classList.toggle('starred',nowStarred);
    // sync card star
    document.querySelectorAll('.card-star').forEach(s=>{
      const card=s.closest('.track-card');
      if(!card)return;
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
  audio.addEventListener('timeupdate', () => { updateProgress(); updateMediaPosition(); });
  audio.addEventListener('loadedmetadata', () => { updateProgress(); updateMediaPosition(); });

  // Mini strip controls
  el.miniBtnPlay.addEventListener('click',togglePlayPause);
  el.miniBtnPrev.addEventListener('click',playPrev);
  el.miniBtnNext.addEventListener('click',playNext);

  // Full controls (same buttons, same IDs)
  el.btnPlay.addEventListener('click',togglePlayPause);
  el.btnPrev.addEventListener('click',playPrev);
  el.btnNext.addEventListener('click',playNext);

  $('shuffle-radio-btn').addEventListener('click',()=>{
    state.currentFilter='all'; el.filterLabel.textContent='ALL';
    el.filterItems.forEach(x=>x.classList.toggle('active',x.dataset.filter==='all'));
    el.filterToggle.classList.remove('active');
    activateShuffle(); $('shuffle-radio-btn').classList.add('playing');
  });

  document.addEventListener('keydown',e=>{
    if(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA')return;
    if(e.code==='Space'){e.preventDefault();togglePlayPause();}
    if(e.code==='ArrowRight')playNext();
    if(e.code==='ArrowLeft')playPrev();
    if(e.code==='Escape'&&state.playerExpanded)setPlayerExpanded(false);
  });

  // ── Media Session API (lock screen controls) ─
  function setupMediaSession() {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.setActionHandler('play',          () => audio.play().catch(()=>{}));
    navigator.mediaSession.setActionHandler('pause',         () => audio.pause());
    navigator.mediaSession.setActionHandler('previoustrack', playPrev);
    navigator.mediaSession.setActionHandler('nexttrack',     playNext);
    navigator.mediaSession.setActionHandler('seekbackward',  null);
    navigator.mediaSession.setActionHandler('seekforward',   null);
  }

  function updateMediaSession(track) {
    if (!('mediaSession' in navigator) || !track) return;
    const lockscreenArt = track.artDataUrl || '';
    navigator.mediaSession.metadata = new MediaMetadata({
      title:  track.title,
      artist: 'MILLO',
      album:  TAG_FULL[track.stage] || 'ARCHIVE',
      artwork: lockscreenArt ? [{ src: lockscreenArt, sizes: '64x64', type: 'image/png' }] : [],
    });
  }

  function updateMediaPosition() {
    if (!('mediaSession' in navigator) || !audio.duration) return;
    try {
      navigator.mediaSession.setPositionState({
        duration:     audio.duration,
        playbackRate: audio.playbackRate,
        position:     Math.min(audio.currentTime, audio.duration),
      });
    } catch {}
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
        }),
        loadNotes(),
      ]);
    }catch(err){
      el.loading.innerHTML=`<span class="loading-text">ERROR: ${err.message}</span>`;
    }
  }

  init();
})();