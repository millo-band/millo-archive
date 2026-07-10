/* ============================================
   MILLO ARCHIVE v11 — screens/archive.js
   Main grid, cards, stage chips, whats-new, stats,
   search, sort, edit mode / mass edit.
============================================ */
import {
  state, $, isNew, fmtDate, sortGroups, searchGroups, buildGroups,
  TAG_LABEL, TAG_SHORT, STAGE_DITHER, findGroup, showToast, isVoiceNote,
} from '../core.js';
import {
  isFavorite, toggleFavorite, setTagOverride, getPlaylists,
  createPlaylist, addSongToPlaylist, isSongInPlaylist,
} from '../api.js';
import { playTrack, updatePlayerBar, stagePillHTML } from '../player.js';
import { openSongPage } from '../songpage.js';
import { renderPlaylistDetailPage } from './albums.js';

const el = {
  grid:$('tracks-grid'), empty:$('empty-state'), loading:$('loading-state'),
  whatsNew:$('whats-new'), newRow:$('new-tracks-row'),
  headerStats:$('header-stats'),
  sortToggle:$('sort-btn-toggle'), sortLabel:$('sort-label'),
  sortMenu:$('sort-menu'),
  searchBtn:$('search-btn'), searchBar:$('search-bar'),
  searchInput:$('search-input'), searchClear:$('search-clear'),
  editModeBtn:$('edit-mode-btn'), massEditBar:$('mass-edit-bar'),
  massEditCount:$('mass-edit-count'), massEditDone:$('mass-edit-done'),
};

/* ── Dropdowns ── */
function setupDropdown(btn,menu){
  btn.addEventListener('click',e=>{e.stopPropagation();const o=menu.classList.contains('open');closeAllDropdowns();if(!o)menu.classList.add('open');});
}
export function closeAllDropdowns(){document.querySelectorAll('.dropdown-menu').forEach(m=>m.classList.remove('open'));}
document.addEventListener('click',closeAllDropdowns);
setupDropdown(el.sortToggle,el.sortMenu);

document.querySelectorAll('#sort-menu .dropdown-item').forEach(item=>{
  item.addEventListener('click',()=>{
    const s=item.dataset.sort;
    el.sortLabel.textContent=item.textContent.trim();
    document.querySelectorAll('#sort-menu .dropdown-item').forEach(x=>x.classList.toggle('active',x===item));
    el.sortToggle.classList.toggle('active',s!=='newest');
    closeAllDropdowns();
    state.currentSort=s;state.isShuffling=false;$('shuffle-radio-btn').classList.remove('playing');render();
  });
});

/* ── Stage chips (replace the old filter dropdown — §4) ── */
export function setFilter(f){
  state.currentFilter=f;
  document.querySelectorAll('.stage-chip').forEach(c=>c.classList.toggle('active',c.dataset.filter===f));
  render();
}
document.querySelectorAll('.stage-chip').forEach(chip=>{
  chip.addEventListener('click',()=>setFilter(chip.dataset.filter));
});

function filterGroups(groups,filter){
  if(filter==='all')return groups;
  if(filter==='starred')return groups.filter(g=>isFavorite(g.title.toLowerCase()));
  return groups.filter(g=>g.stages.has(filter));
}

/* ── Search ── */
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

/* ── Render ── */
export function render(){
  el.grid.innerHTML='';
  const visible=searchGroups(sortGroups(filterGroups(state.groups,state.currentFilter),state.currentSort),state.searchQuery);
  state.filteredGroups=visible;
  if(!visible.length){el.empty.style.display='block';el.whatsNew.style.display='none';return;}
  el.empty.style.display='none';
  visible.forEach((group,gIdx)=>el.grid.appendChild(buildCard(group,gIdx)));
  if(state.searchQuery)el.whatsNew.style.display='none'; else renderWhatsNew();
  renderStats(); refreshPlayingState();
  import('../core.js').then(m=>m.fillDurations(el.grid));
}

export function buildCard(group,gIdx){
  const playT=group.tracks[group.tracks.length-1];
  const hasVersions=group.tracks.length>1;
  const fresh=isNew(group.latestDate);
  const card=document.createElement('div');
  card.className='track-card'+(hasVersions?' has-versions':'');
  card.dataset.gIdx=gIdx;card.dataset.trackIdx=playT._idx;card.dataset.filename=playT.filename||'';

  // 4px dither stage strip — stage scannable by texture alone (§2.2/§6.1)
  const strip=document.createElement('div');
  strip.className='card-stage-strip '+(STAGE_DITHER[group.stage]||'');
  card.appendChild(strip);

  const check=document.createElement('div');check.className='card-select-check';card.appendChild(check);

  const body=document.createElement('div');body.className='card-body';
  const top=document.createElement('div');top.className='card-top';
  const badges=document.createElement('div');badges.className='card-badges';
  if(TAG_LABEL[group.stage]){
    const pill=document.createElement('span');pill.className='tag-pill';
    pill.innerHTML=`<span class="dither-swatch ${STAGE_DITHER[group.stage]||''}"></span>${TAG_LABEL[group.stage]}`;
    badges.appendChild(pill);
  }
  if(fresh){const nb=document.createElement('span');nb.className='new-badge';nb.textContent='NEW';badges.appendChild(nb);}
  top.appendChild(badges);
  const dot=document.createElement('div');dot.className='playing-dot';dot.style.display='none';top.appendChild(dot);
  body.appendChild(top);
  const titleEl=document.createElement('div');titleEl.className='card-title';titleEl.textContent=group.title;body.appendChild(titleEl);

  // second metadata line (§6.1): `3 VER · TOUCHED 2026-05-12`
  const meta=document.createElement('div');meta.className='card-meta';
  const parts=[];
  if(group.tracks.length>1)parts.push(`${group.tracks.length} VER`);
  if(group.latestDate&&group.latestDate!=='1970-01-01')parts.push(`TOUCHED ${group.latestDate}`);
  meta.textContent=parts.join(' · ');
  if(parts.length)body.appendChild(meta);

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
      $('player-fav-btn').classList.toggle('starred',nowStarred);
    if(state.currentFilter==='starred')render();
  });
  card.appendChild(star);
  card.addEventListener('click',()=>{state.editMode?toggleCardSelection(card,playT.filename):playTrack(playT,group);});
  return card;
}

/* ── What's New ── */
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

export function refreshPlayingState(){
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

/* ── Edit mode / mass edit ── */
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
document.querySelectorAll('.mass-tag-btn').forEach(btn=>{
  btn.addEventListener('click',()=>{
    if(!state.selectedFilenames.size)return;
    const stage=btn.dataset.stage;
    state.selectedFilenames.forEach(fn=>{setTagOverride(fn,stage);const t=state.allTracks.find(t=>t.filename===fn);if(t)t.stage=stage;});
    state.groups=buildGroups(state.allTracks.filter(t=>!isVoiceNote(t)));
    state.selectedFilenames.clear();updateMassEditCount();render();
  });
});

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
    empty.className='dropdown-item';empty.style.opacity='0.4';empty.textContent='NO ALBUMS YET';
    massListMenu.appendChild(empty);
  }
  entries.forEach(([id,pl])=>{
    const item=document.createElement('button');
    item.className='dropdown-item';
    item.textContent=pl.name.toUpperCase();
    item.addEventListener('click',()=>{
      const n=bulkAddToPlaylist(id);
      closeAllDropdowns();
      showToast(n?`ADDED ${n} TO ${pl.name.toUpperCase()}`:'ALREADY IN ALBUM');
    });
    massListMenu.appendChild(item);
  });
  const newItem=document.createElement('button');
  newItem.className='dropdown-item dropdown-item-voice';
  newItem.textContent='+ NEW ALBUM';
  newItem.addEventListener('click',()=>{
    closeAllDropdowns();
    const name=prompt('Album name:');if(!name||!name.trim())return;
    const id=createPlaylist(name.trim());
    const n=bulkAddToPlaylist(id);
    showToast(`ADDED ${n} TO ${name.trim().toUpperCase()}`);
  });
  massListMenu.appendChild(newItem);
}
if(massListBtn&&massListMenu){
  massListBtn.addEventListener('click',e=>{
    e.stopPropagation();
    if(!state.selectedFilenames.size){showToast('SELECT SONGS FIRST');return;}
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
