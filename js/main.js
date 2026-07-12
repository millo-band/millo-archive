/* ============================================
   MILLO ARCHIVE v11 — main.js
   Boot, tab routing, keyboard map, help overlay, theme.
============================================ */
import {
  state, $, WORKER_URL, RESUME_KEY, buildGroups, sortGroups,
  isVoiceNote, findGroup, loadAllDurations,
} from './core.js';
import { loadServerState, loadNotes, applyTagOverrides } from './api.js';
import { rerenderAllWaveforms } from './waveform.js';
import {
  initPlayer, playTrack, playNext, playPrev, togglePlayPause, activateShuffle,
  setPlayerExpanded, setVolume, cycleSpeed, toggleLoop, startTimedNote, flipAB,
  getFlatTracks, updatePlayerPlaylistBadge,
} from './player.js';
import { render, setFilter } from './screens/archive.js';
import { showAlbumsIndex, renderPlaylistsPage } from './screens/albums.js';
import { renderVault } from './screens/vault.js';
import { renderVoiceList, closeVoicePicker, isVoicePickerOpen } from './screens/voice.js';
import { openSongPage, closeSongPage } from './songpage.js';
import { openFilePicker } from './upload.js';
import { audio } from './core.js';

/* ── Theme toggle (light pink ⇄ dark terminal) ── */
const themeBtn=$('theme-toggle-btn');
if(themeBtn){
  themeBtn.addEventListener('click',()=>{
    const dark=document.body.classList.toggle('dark');
    try{localStorage.setItem('millo-theme',dark?'dark':'light');}catch{}
    const tc=document.querySelector('meta[name="theme-color"]');
    if(tc)tc.setAttribute('content',dark?'#070409':'#FF91AF');
    rerenderAllWaveforms(); // canvas ink color changed
  });
}

/* ── Bottom tab bar + hash routing (§4) ── */
const SCREENS=['archive','albums','vault','voice'];
export function switchScreen(name){
  if(!SCREENS.includes(name))name='archive';
  state.activeScreen=name;
  document.body.dataset.screen=name;
  document.querySelectorAll('.tabbar-btn').forEach(b=>b.classList.toggle('active',b.dataset.screen===name));
  document.querySelectorAll('.screen').forEach(s=>s.classList.toggle('active',s.id==='screen-'+name));
  // keep query params, swap hash
  const url=new URL(window.location);url.hash='#'+name;
  history.replaceState(null,'',url.toString());

  if(name==='albums'){
    if(state.openPlaylistId)return; // stay on the open album
    showAlbumsIndex();
  }
  if(name==='vault')renderVault();
  if(name==='voice')renderVoiceList();
  if(name==='archive')render();
  $('main-content').scrollTop=0;
}
document.querySelectorAll('.tabbar-btn').forEach(btn=>{
  btn.addEventListener('click',()=>switchScreen(btn.dataset.screen));
});
window.addEventListener('hashchange',()=>{
  const name=location.hash.replace('#','');
  if(SCREENS.includes(name)&&name!==state.activeScreen)switchScreen(name);
});

/* ── RADIO ── */
$('shuffle-radio-btn').addEventListener('click',()=>{
  if(state.activeScreen!=='archive')switchScreen('archive');
  state.currentFilter='all';
  document.querySelectorAll('.stage-chip').forEach(c=>c.classList.toggle('active',c.dataset.filter==='all'));
  activateShuffle();$('shuffle-radio-btn').classList.add('playing');
});

/* ── Song page back / share ── */
$('song-back-btn').addEventListener('click',closeSongPage);
$('song-share-btn').addEventListener('click',()=>{
  if(state.songPageGroup)import('./player.js').then(m=>m.shareGroup(state.songPageGroup));
});

/* ── Help overlay (§7) ── */
const helpOverlay=$('help-overlay');
export function toggleHelp(force){
  const show=force!==undefined?force:helpOverlay.style.display==='none'||!helpOverlay.style.display;
  helpOverlay.style.display=show?'flex':'none';
}
if($('help-close'))$('help-close').addEventListener('click',()=>toggleHelp(false));
if(helpOverlay)helpOverlay.addEventListener('click',e=>{if(e.target===helpOverlay)toggleHelp(false);});

/* ── Keyboard map (§7 — existing bindings all stay) ── */
document.addEventListener('keydown',e=>{
  if(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA')return;
  if(e.key==='/'){e.preventDefault();if(state.activeScreen!=='archive')switchScreen('archive');if(!document.body.classList.contains('search-open'))$('search-btn').click();return;}
  if(e.key==='?'){e.preventDefault();toggleHelp();return;}
  if(e.key==='Escape'){goBack();return;}
  if(e.code==='Space'){e.preventDefault();togglePlayPause();return;}
  if((e.shiftKey&&e.code==='ArrowRight')||e.key==='.'){if(audio.duration){audio.currentTime=Math.min(audio.duration,audio.currentTime+5);}return;}
  if((e.shiftKey&&e.code==='ArrowLeft')||e.key===','){if(audio.duration){audio.currentTime=Math.max(0,audio.currentTime-5);}return;}
  if(e.code==='ArrowRight'){playNext();return;}
  if(e.code==='ArrowLeft'){playPrev();return;}
  if(e.code==='ArrowUp'){e.preventDefault();setVolume(audio.volume+0.05);return;}
  if(e.code==='ArrowDown'){e.preventDefault();setVolume(audio.volume-0.05);return;}
  if(e.key==='['){cycleSpeed(-1);return;}
  if(e.key===']'){cycleSpeed(1);return;}
  if(e.key==='l'||e.key==='L'){toggleLoop();return;}
  /* new in v11 */
  if(e.key==='n'||e.key==='N'){e.preventDefault();startTimedNote();return;}
  if(e.key==='x'||e.key==='X'){flipAB();return;}
  if(e.key==='u'||e.key==='U'){openFilePicker();return;}
  if(e.key==='1'){switchScreen('archive');return;}
  if(e.key==='2'){switchScreen('albums');return;}
  if(e.key==='3'){switchScreen('vault');return;}
  if(e.key==='4'){switchScreen('voice');return;}
});

/* ── Unified "back" — Esc key AND swipe-right share this (§ fluid nav) ──
   Peels one layer at a time: overlays → search → song page → album detail →
   collapse player. Returns true if something was closed. */
export function goBack(){
  if(helpOverlay.style.display==='flex'){toggleHelp(false);return true;}
  if(isVoicePickerOpen()){closeVoicePicker();return true;}
  if(document.body.classList.contains('search-open')){$('search-btn').click();return true;}
  if(state.songPageGroup){closeSongPage();return true;}
  if(state.activeScreen==='albums'&&state.openPlaylistId){showAlbumsIndex();return true;}
  if(state.playerExpanded){setPlayerExpanded(false);return true;}
  return false;
}

/* ── Swipe navigation (mobile) — make getting around feel fluid ──
   • Swipe right → back (one layer), matching the OS back gesture.
   • Horizontal swipe on the bottom tab bar hops between tabs. */
(function(){
  let x0=0, y0=0, t0=0, tracking=false;
  const H_MIN=60, V_MAX=45, T_MAX=600;  // px / ms thresholds
  document.addEventListener('touchstart',e=>{
    if(e.touches.length!==1){tracking=false;return;}
    const t=e.touches[0]; x0=t.clientX; y0=t.clientY; t0=Date.now(); tracking=true;
  },{passive:true});
  document.addEventListener('touchend',e=>{
    if(!tracking)return; tracking=false;
    const t=e.changedTouches[0];
    const dx=t.clientX-x0, dy=t.clientY-y0, dt=Date.now()-t0;
    if(dt>T_MAX || Math.abs(dx)<H_MIN || Math.abs(dy)>V_MAX) return;
    // don't hijack swipes that start on a scrubber / slider / horizontal scroller
    if(e.target.closest('.wave-canvas, input[type=range], .player-versions-list, .pl-two-column')) return;

    // Tab-bar swipe → move between the four screens
    if(e.target.closest('#tabbar')){
      const i=SCREENS.indexOf(state.activeScreen);
      const ni=dx<0 ? Math.min(SCREENS.length-1,i+1) : Math.max(0,i-1);
      if(ni!==i) switchScreen(SCREENS[ni]);
      return;
    }
    // Swipe right anywhere else → back one layer
    if(dx>0) goBack();
  },{passive:true});
})();

/* ── Boot ── */
async function init(){
  initPlayer();

  // data layer first: server state (with one-time localStorage migration) + notes
  await Promise.all([loadServerState(), loadNotes()]);

  try{
    const tracks=await fetch(WORKER_URL).then(r=>r.json());
    $('loading-state').style.display='none';
    if(!tracks.length){$('empty-state').style.display='block';return;}
    tracks.forEach((t,i)=>t._idx=i);
    applyTagOverrides(tracks);
    state.allTracks=tracks;
    state.voiceTracks=tracks.filter(isVoiceNote);
    const nonVoice=tracks.filter(t=>!isVoiceNote(t));
    state.groups=buildGroups(nonVoice);
    state.filteredGroups=sortGroups(state.groups,'newest');

    // restore active tab from hash, then render it
    const initial=location.hash.replace('#','');
    switchScreen(SCREENS.includes(initial)?initial:'archive');

    loadAllDurations(tracks);

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
  }catch(err){
    $('loading-state').innerHTML=`<span class="loading-text">ERROR: ${err.message}</span>`;
    $('loading-state').style.display='block';
  }
}

init();
