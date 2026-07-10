/* ============================================
   MILLO ARCHIVE v11 — songpage.js
   Song page overlay: version timeline, per-version notes
   (general + timed), album chips, linked voice memos, A/B.
============================================ */
import {
  state, audio, $, fmtSec, fmtDate, TAG_LABEL, STAGE_DITHER, fillDurations,
} from './core.js';
import {
  notes, noteFor, saveNote, getPlaylists, createPlaylist, addSongToPlaylist,
  removeSongFromPlaylist, isSongInPlaylist, getVoiceLinks,
} from './api.js';
import {
  playTrack, shareTrack, shareGroup, buildABButtons, renderNoteLog,
} from './player.js';
import { renderPlaylistDetailPage } from './screens/albums.js';

const el = {
  songPage:$('song-page'), songPageTitle:$('song-page-title'), songPageBody:$('song-page-body'),
};

export function openSongPage(group){
  state.songPageGroup=group;
  renderSongPage(group);
  el.songPage.style.display='flex';
  document.body.classList.add('overlay-open');
  history.pushState({song:group.title},'','?song='+encodeURIComponent(group.title)+location.hash);
}

export function closeSongPage(){
  el.songPage.style.display='none';
  document.body.classList.remove('overlay-open');
  state.songPageGroup=null;
  const url=new URL(window.location);url.searchParams.delete('song');
  history.pushState({},'',url.toString());
}

const SHARE_SVG=`<svg width="11" height="11" viewBox="0 0 16 16" fill="none"><circle cx="13" cy="3" r="2" stroke="currentColor" stroke-width="1.8"/><circle cx="3" cy="8" r="2" stroke="currentColor" stroke-width="1.8"/><circle cx="13" cy="13" r="2" stroke="currentColor" stroke-width="1.8"/><line x1="5" y1="9" x2="11" y2="12" stroke="currentColor" stroke-width="1.8"/><line x1="11" y1="4" x2="5" y2="7" stroke="currentColor" stroke-width="1.8"/></svg>`;
const PLAY_SVG=`<svg width="13" height="13" viewBox="0 0 16 16"><polygon points="2,1 2,15 14,8" fill="currentColor"/></svg>`;
const PAUSE_SVG=`<svg width="13" height="13" viewBox="0 0 16 16"><rect x="2" y="1" width="4" height="14" fill="currentColor"/><rect x="10" y="1" width="4" height="14" fill="currentColor"/></svg>`;

export function refreshSongPagePlaying(){
  if(!el.songPage||el.songPage.style.display==='none')return;
  const idx=state.playingTrack?state.playingTrack._idx:-1;
  el.songPageBody.querySelectorAll('.sp-ver-row').forEach(row=>{
    const active=parseInt(row.dataset.trackIdx)===idx;
    row.classList.toggle('sp-playing',active);
    const pb=row.querySelector('.sp-ver-play');
    if(pb)pb.innerHTML=(active&&state.isPlaying)?PAUSE_SVG:PLAY_SVG;
  });
  el.songPageBody.querySelectorAll('.voice-row').forEach(row=>{
    row.classList.toggle('playing',parseInt(row.dataset.trackIdx)===idx);
  });
}

export function renderSongPage(group){
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
    stagePill.innerHTML=`<span class="dither-swatch ${STAGE_DITHER[track.stage]||''}"></span>${TAG_LABEL[track.stage]||'?'}`;
    rowTop.appendChild(stagePill);

    const ver=document.createElement('span');ver.className='sp-ver-label';
    ver.textContent=(track.version?`v${track.version}`:'—')+(track.label?` · ${track.label}`:'');
    rowTop.appendChild(ver);

    const date=document.createElement('span');date.className='sp-ver-date';date.textContent=fmtDate(track.uploaded)||'—';rowTop.appendChild(date);

    const sp=document.createElement('span');sp.style.flex='1';rowTop.appendChild(sp);
    if(i===0){const lb=document.createElement('span');lb.className='sp-latest-badge';lb.textContent='LATEST';rowTop.appendChild(lb);}
    const dur=document.createElement('span');dur.className='sp-ver-dur';dur.dataset.trackIdx=track._idx;rowTop.appendChild(dur);

    // A/B assignment (§5.3)
    rowTop.appendChild(buildABButtons(track));

    const shareBtn=document.createElement('button');shareBtn.className='sp-ver-share-btn';shareBtn.setAttribute('aria-label','Share version');
    shareBtn.innerHTML=SHARE_SVG;
    shareBtn.addEventListener('click',e=>{e.stopPropagation();shareTrack(track,group);});
    rowTop.appendChild(shareBtn);
    row.appendChild(rowTop);

    if(track.filename){
      const fn=document.createElement('div');fn.className='sp-ver-filename';fn.textContent=track.filename;row.appendChild(fn);
    }

    row.appendChild(buildVersionNotes(track));
    timeline.appendChild(row);
  });

  versSec.appendChild(timeline);
  el.songPageBody.appendChild(versSec);

  renderSongPagePlaylists(group);
  renderSongPageVoiceMemos(group);
  fillDurations(el.songPageBody);
  refreshSongPagePlaying();
}

/* per-version notes: general textarea + timed log — same model as the player (§5.2) */
function buildVersionNotes(track){
  const wrap=document.createElement('div');wrap.className='sp-ver-note-wrap';

  const entry=noteFor(track.filename);
  const note=document.createElement('textarea');note.className='sp-ver-note-input';
  note.placeholder='Add a note for this version…';
  note.value=entry.general||'';
  note.rows=2;
  const status=document.createElement('span');status.className='sp-ver-note-status';
  note.addEventListener('input',()=>{
    entry.general=note.value.trim();
    saveNote(track.filename,status);
    // keep the player note field in sync if it's the same file
    if(state.playingTrack&&state.playingTrack.filename===track.filename){
      const pn=$('player-note');if(pn)pn.value=note.value;
    }
  });
  note.addEventListener('click',e=>e.stopPropagation());
  note.addEventListener('keydown',e=>e.stopPropagation());
  wrap.appendChild(note);

  // timed log (read + seek + delete; adding happens from the player at the playhead)
  const log=document.createElement('div');log.className='note-log sp-ver-log';
  function renderLog(){
    log.innerHTML='';
    const sortedNotes=[...entry.timed].sort((a,b)=>a.t-b.t);
    sortedNotes.forEach(n=>{
      const line=document.createElement('div');line.className='note-log-line';
      const ts=document.createElement('button');ts.className='note-log-time';ts.textContent=`[${fmtSec(n.t)}]`;
      ts.addEventListener('click',e=>{
        e.stopPropagation();
        const isCur=state.playingTrack&&state.playingTrack.filename===track.filename;
        if(isCur&&audio.duration){audio.currentTime=Math.min(n.t,audio.duration);}
        else{playTrack(track,state.songPageGroup,{seek:n.t});}
      });
      const txt=document.createElement('span');txt.className='note-log-text';txt.textContent=n.text;
      const del=document.createElement('button');del.className='note-log-del';del.textContent='✕';
      del.addEventListener('click',e=>{
        e.stopPropagation();
        entry.timed=entry.timed.filter(x=>x!==n);
        saveNote(track.filename,status);
        renderLog();
        if(state.playingTrack&&state.playingTrack.filename===track.filename)renderNoteLog();
      });
      line.appendChild(ts);line.appendChild(txt);line.appendChild(del);
      log.appendChild(line);
    });
  }
  renderLog();
  wrap.appendChild(log);
  wrap.appendChild(status);
  return wrap;
}

function renderSongPagePlaylists(group){
  const existing=el.songPageBody.querySelector('.sp-playlists-section');
  if(existing)existing.remove();

  const sec=document.createElement('div');sec.className='sp-section sp-playlists-section';
  const lbl=document.createElement('div');lbl.className='sp-section-label';lbl.textContent='ADD TO ALBUM';sec.appendChild(lbl);

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
  newBtn.textContent='+ NEW ALBUM';
  newBtn.addEventListener('click',()=>{
    const name=prompt('Album name:');
    if(!name||!name.trim())return;
    const id=createPlaylist(name.trim());
    addSongToPlaylist(id,songKey,latestTrack.filename);
    renderSongPagePlaylists(group);
  });
  chips.appendChild(newBtn);
  sec.appendChild(chips);

  if(!Object.keys(playlists).length){
    const hint=document.createElement('div');hint.className='sp-playlist-hint';
    hint.textContent='CREATE AN ALBUM TO BUILD A SEQUENCE.';
    sec.appendChild(hint);
  }

  el.songPageBody.appendChild(sec);
}

/* linked voice memos — v0 of "voice memo as version zero" (§6.5) */
function renderSongPageVoiceMemos(group){
  const links=getVoiceLinks();
  const songKey=group.title.toLowerCase();
  const linked=state.voiceTracks.filter(t=>links[t.filename]===songKey);
  if(!linked.length)return;

  const sec=document.createElement('div');sec.className='sp-section sp-voice-section';
  const lbl=document.createElement('div');lbl.className='sp-section-label';lbl.textContent=`VOICE MEMOS — ${linked.length}`;sec.appendChild(lbl);

  linked.forEach((track,i)=>{
    const row=document.createElement('div');row.className='voice-row';row.dataset.trackIdx=track._idx;
    const num=document.createElement('span');num.className='voice-row-num';num.textContent=String(i+1).padStart(2,'0');
    const title=document.createElement('span');title.className='voice-row-title';title.textContent=track.title||track.filename;
    const dur=document.createElement('span');dur.className='voice-row-dur';dur.dataset.trackIdx=track._idx;
    row.appendChild(num);row.appendChild(title);row.appendChild(dur);
    row.addEventListener('click',()=>{playTrack(track,null);refreshSongPagePlaying();});
    sec.appendChild(row);
  });

  el.songPageBody.appendChild(sec);
}
