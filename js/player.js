/* ============================================
   MILLO ARCHIVE v11 — player.js
   Playback, floating player, waveform scrubber, timed notes,
   A/B compare, volume/speed/loop, media session, resume.
============================================ */
import {
  state, audio, $, fmtSec, fmtDate, shuffle, findGroup,
  TAG_LABEL, TAG_SHORT, TAG_FULL, STAGE_RANK, STAGE_DITHER,
  VOLUME_KEY, SPEED_KEY, RESUME_KEY, UTIL_KEY, SPEED_STEPS,
  buildGroups, showToast,
} from './core.js';
import {
  notes, noteFor, saveNote, getPlaylists, createPlaylist, addSongToPlaylist,
  removeSongFromPlaylist, isSongInPlaylist, isFavorite, toggleFavorite, setTagOverride,
} from './api.js';
import { generatePixelArt } from './art.js';
import { Waveform, ensurePeaks } from './waveform.js';
import { render, refreshPlayingState } from './screens/archive.js';
import { renderPlaylistDetailPage } from './screens/albums.js';
import { refreshSongPagePlaying } from './songpage.js';

const el = {
  playerBar:$('player-bar'),
  playerToggleBtn:$('player-toggle-btn'),
  playerTitleLg:$('player-title-lg'), playerStageLg:$('player-stage-lg'),
  playerFilenameLg:$('player-filename-lg'), playerFavBtn:$('player-fav-btn'),
  playerVersionsList:$('player-versions'), noVersionsMsg:$('no-versions-msg'),
  tabBtnVersions:$('tab-btn-versions'),
  playerTime:$('player-time'), playerDur:$('player-dur'),
  btnPlay:$('btn-play'), btnPrev:$('btn-prev'), btnNext:$('btn-next'), btnLoop:$('btn-loop'),
  iconPlay:$('icon-play'), iconPause:$('icon-pause'),
  downloadBtn:$('download-btn'),
  playerListChips:$('player-list-chips'),
  playerNote:$('player-note'), noteStatus:$('note-status'),
  playerVolume:$('player-volume'), volPct:$('vol-pct'),
  playerTitle:$('player-title'), playerStage:$('player-stage'),
  playerExpandBtn:$('player-expand-btn'),
  miniFill:$('player-mini-fill'),
  miniBtnPlay:$('mini-btn-play'), miniBtnPrev:$('mini-btn-prev'), miniBtnNext:$('mini-btn-next'),
  miniIconPlay:$('mini-icon-play'), miniIconPause:$('mini-icon-pause'),
  deskBtnPlay:$('mini-btn-play2'), deskBtnPrev:$('mini-btn-prev2'), deskBtnNext:$('mini-btn-next2'),
  deskBtnLoop:$('mini-btn-loop'), deskBtnDownload:$('mini-btn-download'),
  deskTimeCur:$('desktop-time-cur'), deskTimeDur:$('desktop-time-dur'),
  playerShareBtn:$('player-share-btn'),
  playerPlaylistRow:$('player-playlist-row'), playerPlaylistName:$('player-playlist-name'),
  playerBackdrop:$('player-backdrop'),
  noteLog:$('note-log'), noteAddBtn:$('note-add-btn'), noteAddTime:$('note-add-time'),
  noteInputRow:$('note-input-row'), noteInput:$('note-input'),
  abWrap:$('ab-switch-wrap'), abSwitch:$('ab-switch'),
  utilToggle:$('util-toggle'), utilBody:$('util-body'),
};

/* ── Waveforms (expanded player + desktop bar) ── */
function seekPct(pct){ if(audio.duration) audio.currentTime = pct * audio.duration; }
function previewPct(pct){ if(audio.duration) el.playerTime.textContent = fmtSec(pct * audio.duration); }

export const wave = new Waveform($('wave-canvas'), {
  flagsEl: $('wave-flags'),
  onSeek: seekPct, onPreview: previewPct,
  onFlagClick: f => { if(audio.duration){ audio.currentTime = f.t; highlightLogLine(f.t); } },
});
export const deskWave = new Waveform($('desktop-wave-canvas'), {
  onSeek: seekPct,
  onPreview: pct => { if(audio.duration && el.deskTimeCur) el.deskTimeCur.textContent = fmtSec(pct * audio.duration); },
});

function loadPeaksFor(track){
  wave.setPeaks(null); deskWave.setPeaks(null);
  ensurePeaks(track, peaks => {
    if(state.playingTrack && state.playingTrack.filename === track.filename){
      wave.setPeaks(peaks); deskWave.setPeaks(peaks);
    }
  });
}

/* ── Share ── */
export async function shareGroup(group){
  const url=window.location.origin+window.location.pathname+'?song='+encodeURIComponent(group.title);
  if(navigator.share){try{await navigator.share({title:group.title+' — MILLO ARCHIVE',url});return;}catch{}}
  try{await navigator.clipboard.writeText(url);showToast('LINK COPIED ✓');}
  catch{showToast('COPY FAILED');}
}
export async function shareTrack(track,group){
  const g=group||findGroup(track);
  const base=window.location.origin+window.location.pathname;
  const url=g
    ?base+'?song='+encodeURIComponent(g.title)+'&track='+encodeURIComponent(track.filename)
    :base+'?track='+encodeURIComponent(track.filename);
  if(navigator.share){try{await navigator.share({title:track.title+' — MILLO ARCHIVE',url});return;}catch{}}
  try{await navigator.clipboard.writeText(url);showToast('LINK COPIED ✓');}
  catch{showToast('COPY FAILED');}
}

/* ── Helpers ── */
export function stagePillHTML(stage, cls){
  const label = TAG_LABEL[stage] || '?';
  return `<span class="${cls||'tag-pill'}"><span class="dither-swatch ${STAGE_DITHER[stage]||''}"></span>${label}</span>`;
}

export function getFlatTracks(){
  if(state.activeScreen==='voice')return state.voiceTracks;
  const t=[];state.filteredGroups.forEach(g=>t.push(...g.tracks));return t;
}

/* ── Player bar update ── */
export function updatePlayerBar(track,group){
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
    if(el.noteLog)el.noteLog.innerHTML='';
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
  el.playerNote.value=noteFor(track.filename).general||'';
  el.noteStatus.textContent='';
  renderNoteLog();
  updateNoteFlags();

  updatePlayerArtwork(track);

  // List (album) chips
  if (el.playerListChips) {
    el.playerListChips.innerHTML = '';
    const playlists = getPlaylists();
    const songKey = (group?group.title:track.title).toLowerCase();

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
      const name = prompt('Album name:');
      if(!name || !name.trim()) return;
      const id = createPlaylist(name.trim());
      addSongToPlaylist(id, songKey, track.filename);
      updatePlayerBar(state.playingTrack, state.playingGroup);
      if(state.openPlaylistId === id) renderPlaylistDetailPage(id);
    });
    el.playerListChips.appendChild(newBtn);
  }

  renderVersionsTab(track, group);
  updateTagEditorState(track);
  refreshABUI();
}

function renderVersionsTab(track, group){
  el.playerVersionsList.innerHTML='';
  const hasVersions=group&&group.tracks.length>1;
  if(el.tabBtnVersions)el.tabBtnVersions.style.display=hasVersions?'':'none';
  if(el.noVersionsMsg)el.noVersionsMsg.style.display=hasVersions?'none':'';
  if(!hasVersions)return;

  const sorted=[...group.tracks].sort((a,b)=>(b.uploaded||'')>(a.uploaded||'')?1:-1);
  sorted.forEach((t,i)=>{
    const row=document.createElement('div');
    row.className='pver-row'+(t._idx===track._idx?' active':'');
    row.dataset.trackIdx=t._idx;
    const stage=document.createElement('span');stage.className='pver-row-stage';
    stage.innerHTML=`<span class="dither-swatch ${STAGE_DITHER[t.stage]||''}"></span>${TAG_SHORT[t.stage]||'?'}`;
    const label=document.createElement('span');label.className='pver-row-label';
    label.textContent=(t.version?`v${t.version}`:'—')+(t.label?` · ${t.label}`:'');
    const date=document.createElement('span');date.className='pver-row-date';date.textContent=fmtDate(t.uploaded);
    const spacer=document.createElement('span');spacer.className='pver-row-spacer';
    const dur=document.createElement('span');dur.className='pver-row-dur';dur.dataset.trackIdx=t._idx;
    const latest=document.createElement('span');latest.className='pver-row-latest';latest.textContent=i===0?'LATEST':'';
    row.appendChild(stage);row.appendChild(label);row.appendChild(date);
    row.appendChild(spacer);row.appendChild(latest);row.appendChild(dur);
    // A/B assignment (§5.3)
    row.appendChild(buildABButtons(t));
    row.addEventListener('click',()=>playTrack(t,group));
    el.playerVersionsList.appendChild(row);
  });
}

export function updateTagEditorState(track){
  document.querySelectorAll('.tag-edit-btn[data-stage]').forEach(btn=>{
    btn.disabled=!track;
    btn.classList.toggle('active',!!(track&&btn.dataset.stage===track.stage));
  });
}

/* ── Pixel art ── */
export function updatePlayerArtwork(track) {
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

/* ── Progress ── */
function setPlayPauseUI(p){
  el.iconPlay.style.display=p?'none':'block';el.iconPause.style.display=p?'block':'none';
  el.miniIconPlay.style.display=p?'none':'block';el.miniIconPause.style.display=p?'block':'none';
  const dp=el.deskBtnPlay;if(dp){dp.querySelector('.mini-icon-play2').style.display=p?'none':'block';dp.querySelector('.mini-icon-pause2').style.display=p?'block':'none';}
  refreshSongPagePlaying();
}
function updateProgress(){
  if(state.scrubbing)return;
  const pos=audio.currentTime,dur=audio.duration||0,pct=dur>0?(pos/dur):0;
  wave.setProgress(pct); deskWave.setProgress(pct);
  el.miniFill.style.width=`${pct*100}%`;
  el.playerTime.textContent=fmtSec(pos);el.playerDur.textContent=fmtSec(dur);
  if(el.deskTimeCur){el.deskTimeCur.textContent=fmtSec(pos);}
  if(el.deskTimeDur){el.deskTimeDur.textContent=fmtSec(dur);}
  updateNoteAddTime();
}

/* ── Volume ── */
const miniVolSlider=$('mini-vol-slider');
export function setVolume(v,persist){v=Math.max(0,Math.min(1,v));audio.volume=v;el.playerVolume.value=v;el.volPct.textContent=Math.round(v*100)+'%';if(miniVolSlider)miniVolSlider.value=v;if(persist!==false){try{localStorage.setItem(VOLUME_KEY,String(v));}catch{}}}
el.playerVolume.addEventListener('input',()=>setVolume(parseFloat(el.playerVolume.value)));
if(miniVolSlider)miniVolSlider.addEventListener('input',()=>setVolume(parseFloat(miniVolSlider.value)));
$('vol-down').addEventListener('click',()=>setVolume(audio.volume-0.1));
$('vol-up').addEventListener('click',()=>setVolume(audio.volume+0.1));

/* ── Speed (pitch-preserved) ── */
export function setSpeed(rate,persist){
  rate=parseFloat(rate)||1;
  audio.playbackRate=rate;
  try{audio.preservesPitch=audio.mozPreservesPitch=audio.webkitPreservesPitch=true;}catch{}
  document.querySelectorAll('.speed-btn').forEach(b=>b.classList.toggle('active',parseFloat(b.dataset.speed)===rate));
  if(persist!==false){try{localStorage.setItem(SPEED_KEY,String(rate));}catch{}}
  updateMediaPosition();
}
document.querySelectorAll('.speed-btn').forEach(b=>b.addEventListener('click',()=>setSpeed(b.dataset.speed)));
export function cycleSpeed(dir){
  const cur=audio.playbackRate||1;
  let i=SPEED_STEPS.indexOf(SPEED_STEPS.reduce((a,b)=>Math.abs(b-cur)<Math.abs(a-cur)?b:a,SPEED_STEPS[0]));
  i=Math.max(0,Math.min(SPEED_STEPS.length-1,i+dir));
  setSpeed(SPEED_STEPS[i]);
}

/* ── Loop ── */
export function toggleLoop(){
  state.looping=!state.looping;audio.loop=state.looping;
  el.btnLoop.classList.toggle('active',state.looping);
  if(el.deskBtnLoop)el.deskBtnLoop.classList.toggle('active',state.looping);
}
el.btnLoop.addEventListener('click',toggleLoop);
if(el.deskBtnLoop)el.deskBtnLoop.addEventListener('click',toggleLoop);

/* ── UTIL disclosure (§5.4) ── */
function setUtilOpen(open){
  if(el.utilBody)el.utilBody.style.display=open?'block':'none';
  if(el.utilToggle)el.utilToggle.textContent=open?'UTIL ▾':'UTIL ▸';
  try{localStorage.setItem(UTIL_KEY,open?'1':'0');}catch{}
}
if(el.utilToggle){
  el.utilToggle.addEventListener('click',()=>{
    const open=el.utilBody.style.display==='none';
    setUtilOpen(open);
  });
}

/* ── General note ── */
el.playerNote.addEventListener('input',()=>{
  if(!state.playingTrack)return;
  const entry=noteFor(state.playingTrack.filename);
  entry.general=el.playerNote.value.trim();
  saveNote(state.playingTrack.filename,el.noteStatus);
});
el.playerNote.addEventListener('keydown',e=>e.stopPropagation());

/* ── Timed notes (§5.2) ── */
export function renderNoteLog(){
  if(!el.noteLog)return;
  el.noteLog.innerHTML='';
  const track=state.playingTrack;
  if(!track)return;
  const entry=noteFor(track.filename);
  const sorted=[...entry.timed].sort((a,b)=>a.t-b.t);
  sorted.forEach(n=>{
    const line=document.createElement('div');line.className='note-log-line';line.dataset.t=n.t;
    const ts=document.createElement('button');ts.className='note-log-time';ts.textContent=`[${fmtSec(n.t)}]`;
    ts.addEventListener('click',()=>{if(audio.duration)audio.currentTime=Math.min(n.t,audio.duration);});
    const txt=document.createElement('span');txt.className='note-log-text';txt.textContent=n.text;
    const del=document.createElement('button');del.className='note-log-del';del.textContent='✕';
    del.addEventListener('click',()=>{
      entry.timed=entry.timed.filter(x=>x!==n);
      saveNote(track.filename,el.noteStatus);
      renderNoteLog();updateNoteFlags();
    });
    line.appendChild(ts);line.appendChild(txt);line.appendChild(del);
    el.noteLog.appendChild(line);
  });
}
function highlightLogLine(t){
  // flag tapped → jump to NOTES tab + flash the matching line
  switchTab('notes');
  const line=el.noteLog&&el.noteLog.querySelector(`.note-log-line[data-t="${t}"]`);
  if(line){line.classList.add('flash');line.scrollIntoView({block:'nearest'});setTimeout(()=>line.classList.remove('flash'),1600);}
}
function updateNoteFlags(){
  const track=state.playingTrack;
  if(!track){wave.setFlags([],0);return;}
  wave.setFlags(noteFor(track.filename).timed, audio.duration||0);
}
export function updateNoteAddTime(){
  if(!el.noteAddTime)return;
  // frozen while typing — capture-at-press, don't drift (§5.2)
  if(state.noteDraftTime!==null)return;
  el.noteAddTime.textContent=fmtSec(audio.currentTime||0);
}
export function startTimedNote(){
  if(!state.playingTrack)return;
  if(!state.playerExpanded)setPlayerExpanded(true);
  switchTab('notes');
  state.noteDraftTime=audio.currentTime||0;
  el.noteAddTime.textContent=fmtSec(state.noteDraftTime);
  el.noteInputRow.classList.add('armed');
  el.noteInput.value='';
  setTimeout(()=>el.noteInput.focus(),50);
}
function commitTimedNote(){
  const track=state.playingTrack;
  const text=el.noteInput.value.trim();
  if(track&&text&&state.noteDraftTime!==null){
    const entry=noteFor(track.filename);
    entry.timed.push({t:state.noteDraftTime,text,created:new Date().toISOString()});
    saveNote(track.filename,el.noteStatus);
    renderNoteLog();updateNoteFlags();
  }
  cancelTimedNote();
}
function cancelTimedNote(){
  state.noteDraftTime=null;
  el.noteInputRow.classList.remove('armed');
  el.noteInput.value='';
  el.noteInput.blur();
  updateNoteAddTime();
}
if(el.noteAddBtn)el.noteAddBtn.addEventListener('click',startTimedNote);
if(el.noteInput){
  el.noteInput.addEventListener('keydown',e=>{
    e.stopPropagation();
    if(e.key==='Enter'){e.preventDefault();commitTimedNote();}
    if(e.key==='Escape'){e.preventDefault();cancelTimedNote();}
  });
}

/* ── A/B version compare (§5.3) ── */
export function buildABButtons(track){
  const wrap=document.createElement('span');
  wrap.className='ab-assign';
  wrap.dataset.filename=track.filename||'';
  ['A','B'].forEach(slot=>{
    const b=document.createElement('button');
    b.className='ab-assign-btn';
    b.dataset.slot=slot;
    const key=slot==='A'?'abA':'abB';
    b.textContent=slot;
    b.classList.toggle('active',state[key]===track.filename);
    b.addEventListener('click',e=>{
      e.stopPropagation();
      assignAB(slot,track.filename);
    });
    wrap.appendChild(b);
  });
  return wrap;
}
export function assignAB(slot,filename){
  const key=slot==='A'?'abA':'abB';
  const other=slot==='A'?'abB':'abA';
  state[key]=state[key]===filename?null:filename;
  if(state[other]===filename)state[other]=null; // one slot per version
  refreshABUI();
  // refresh assignment buttons everywhere (player VERSIONS tab + song page rows)
  document.querySelectorAll('.ab-assign').forEach(w=>{
    const fn=w.dataset.filename;
    w.querySelectorAll('.ab-assign-btn').forEach(b=>{
      const k=b.dataset.slot==='A'?'abA':'abB';
      b.classList.toggle('active',state[k]===fn);
    });
  });
}
export function refreshABUI(){
  const armed=state.abA&&state.abB&&state.abA!==state.abB;
  if(el.abWrap)el.abWrap.style.display=armed?'flex':'none';
  if(armed&&el.abSwitch){
    const onB=state.playingTrack&&state.playingTrack.filename===state.abB;
    el.abSwitch.classList.toggle('b',!!onB);
  }
}
export function flipAB(){
  if(!(state.abA&&state.abB))return;
  const targetFn=state.playingTrack&&state.playingTrack.filename===state.abA?state.abB:state.abA;
  const target=state.allTracks.find(t=>t.filename===targetFn);
  if(!target)return;
  const t=audio.currentTime||0;
  const wasPlaying=state.isPlaying;
  playTrack(target,findGroup(target),{seek:t,noPlay:!wasPlaying,keepAB:true});
  refreshABUI();
}
if(el.abSwitch)el.abSwitch.addEventListener('click',flipAB);

/* ── Player expand / collapse ── */
export function setPlayerExpanded(expanded){
  state.playerExpanded=expanded;
  document.body.classList.toggle('player-expanded',expanded);
  if(expanded){requestAnimationFrame(()=>{wave.render();updateNoteFlags();});}
}
if (el.playerExpandBtn) {
  el.playerExpandBtn.addEventListener('click', (e) => {
    if (!state.playingTrack) return;
    if (e.target.closest('.mini-ctrl') || e.target.closest('.desktop-scrub-zone') || e.target.tagName === 'INPUT') return;
    setPlayerExpanded(!state.playerExpanded);
  });
}
$('player-close-btn').addEventListener('click',()=>setPlayerExpanded(false));
if($('player-close-btn2'))$('player-close-btn2').addEventListener('click',()=>setPlayerExpanded(false));
if(el.playerBackdrop){el.playerBackdrop.addEventListener('click',()=>setPlayerExpanded(false));}

/* ── Tabs ── */
export function switchTab(tab){
  state.activeTab=tab;
  document.querySelectorAll('.ptab').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
  document.querySelectorAll('.ptab-panel').forEach(p=>p.classList.toggle('active',p.id===`tab-${tab}`));
  if(tab==='queue')renderQueueTab();
}
document.querySelectorAll('.ptab').forEach(btn=>{
  btn.addEventListener('click',()=>switchTab(btn.dataset.tab));
});

/* ── Share / fav from player ── */
if(el.playerShareBtn){
  el.playerShareBtn.addEventListener('click',()=>{
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

/* ── Tag editing from player ── */
document.querySelectorAll('.tag-edit-btn[data-stage]').forEach(btn=>{
  btn.addEventListener('click',()=>{
    if(!state.playingTrack)return;
    const stage=btn.dataset.stage,track=state.playingTrack,group=state.playingGroup;
    setTagOverride(track.filename,stage);track.stage=stage;
    if(group){group.stages=new Set(group.tracks.map(t=>t.stage));group.stage=[...group.stages].sort((a,b)=>STAGE_RANK[b]-STAGE_RANK[a])[0];}
    updatePlayerBar(track,group);render();
  });
});

/* ── Swipe gestures ── */
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

/* ── Queue tab ── */
export function renderQueueTab(){
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
    empty.textContent=state.activePlaylistId?'END OF ALBUM':'END OF QUEUE';
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

/* ── Playlist (album) playback ── */
export function playFromPlaylist(playlistId, startFilename){
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
export function updatePlayerPlaylistBadge(){
  const pl=state.activePlaylistId?getPlaylists()[state.activePlaylistId]:null;
  if(pl){
    el.playerPlaylistRow.style.display='flex';
    el.playerPlaylistName.textContent=pl.name.toUpperCase();
  } else {
    el.playerPlaylistRow.style.display='none';
  }
}

/* ── Playback core ── */
export function playTrack(track,group,opts){
  opts=opts||{};
  const prevGroupKey=state.playingGroup?state.playingGroup.title.toLowerCase():null;
  state.playingTrack=track;state.playingGroup=group||findGroup(track);
  const newGroupKey=state.playingGroup?state.playingGroup.title.toLowerCase():null;
  if(!opts.keepAB&&prevGroupKey!==newGroupKey){state.abA=null;state.abB=null;} // A/B clears on song change

  audio.src=track.file;audio.loop=state.looping;
  setSpeed(audio.playbackRate||1,false);   // re-apply rate + preservesPitch on new src
  if(opts.seek){audio.addEventListener('loadedmetadata',function s(){audio.currentTime=Math.min(opts.seek,(audio.duration||opts.seek));audio.removeEventListener('loadedmetadata',s);});}
  if(opts.noPlay){state.isPlaying=false;setPlayPauseUI(false);}
  else audio.play().catch(()=>{});
  saveResume();
  loadPeaksFor(track);
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
export function playNext(){
  if(state.activePlaylistId&&state.playlistQueue.length){
    const idx=state.playlistQueue.findIndex(t=>t._idx===state.playingTrack?._idx);
    if(idx>=0&&idx<state.playlistQueue.length-1){const n=state.playlistQueue[idx+1];playTrack(n,findGroup(n));return;}
    if(idx===state.playlistQueue.length-1)return;
  }
  if(state.isShuffling&&state.shuffleQueue.length>0){const n=state.shuffleQueue.shift();playTrack(n,findGroup(n));return;}
  const flat=getFlatTracks(),idx=flat.indexOf(state.playingTrack);
  if(idx<flat.length-1){const n=flat[idx+1];playTrack(n,findGroup(n));}
}
export function playPrev(){
  if(audio.currentTime>3){audio.currentTime=0;return;}
  if(state.activePlaylistId&&state.playlistQueue.length){
    const idx=state.playlistQueue.findIndex(t=>t._idx===state.playingTrack?._idx);
    if(idx>0){const p=state.playlistQueue[idx-1];playTrack(p,findGroup(p));return;}
    if(idx===0)return;
  }
  const flat=getFlatTracks(),idx=flat.indexOf(state.playingTrack);
  if(idx>0){const p=flat[idx-1];playTrack(p,findGroup(p));}
}
export function togglePlayPause(){
  if(!state.playingTrack){const flat=getFlatTracks();if(flat.length)playTrack(flat[0],findGroup(flat[0]));return;}
  state.isPlaying?audio.pause():audio.play().catch(()=>{});
}
export function activateShuffle(){
  state.activePlaylistId=null;state.playlistQueue=[];updatePlayerPlaylistBadge();
  state.isShuffling=true;state.currentSort='shuffle';
  state.shuffleQueue=shuffle([...getFlatTracks()]);render();
  if(state.shuffleQueue.length){const f=state.shuffleQueue.shift();playTrack(f,findGroup(f));}
}

audio.addEventListener('play',()=>{state.isPlaying=true;setPlayPauseUI(true);});
audio.addEventListener('pause',()=>{state.isPlaying=false;setPlayPauseUI(false);});
audio.addEventListener('ended',()=>{state.isPlaying=false;setPlayPauseUI(false);updateProgress();if(!state.looping)playNext();});

/* ── Resume across reloads ── */
let _lastResumeSave=0;
export function saveResume(){
  const t=state.playingTrack;if(!t)return;
  try{localStorage.setItem(RESUME_KEY,JSON.stringify({f:t.filename,t:Math.floor(audio.currentTime||0)}));}catch{}
}
window.addEventListener('beforeunload',saveResume);
audio.addEventListener('pause',saveResume);
audio.addEventListener('timeupdate',()=>{updateProgress();updateMediaPosition();
  const now=Date.now();if(now-_lastResumeSave>4000){_lastResumeSave=now;saveResume();}});
audio.addEventListener('loadedmetadata',()=>{updateProgress();updateMediaPosition();updateNoteFlags();});

el.miniBtnPlay.addEventListener('click',togglePlayPause);
el.miniBtnPrev.addEventListener('click',playPrev);
el.miniBtnNext.addEventListener('click',playNext);
if(el.deskBtnPlay){el.deskBtnPlay.addEventListener('click',togglePlayPause);}
if(el.deskBtnPrev){el.deskBtnPrev.addEventListener('click',playPrev);}
if(el.deskBtnNext){el.deskBtnNext.addEventListener('click',playNext);}
el.btnPlay.addEventListener('click',togglePlayPause);
el.btnPrev.addEventListener('click',playPrev);
el.btnNext.addEventListener('click',playNext);

/* ── Media Session ── */
export function setupMediaSession(){
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

/* ── Init (called from main.js boot) ── */
export function initPlayer(){
  setupMediaSession();updateTagEditorState(null);
  let _v=parseFloat(localStorage.getItem(VOLUME_KEY));setVolume(isNaN(_v)?1:_v,false);
  setSpeed(parseFloat(localStorage.getItem(SPEED_KEY))||1,false);
  el.downloadBtn.style.display='none';el.playerNote.disabled=true;
  if(el.tabBtnVersions)el.tabBtnVersions.style.display='none';
  setUtilOpen(localStorage.getItem(UTIL_KEY)==='1'); // default closed
}
