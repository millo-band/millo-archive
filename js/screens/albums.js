/* ============================================
   MILLO ARCHIVE v11 — screens/albums.js
   Lists evolved into the Album Workbench (§6.3):
   targets, readiness bars, empty slot rows, runtime vs target.
============================================ */
import {
  state, $, fmtSec, fmtDate, TAG_LABEL, STAGE_DITHER,
  durSecCache, onDurationLoaded, fillDurations,
} from '../core.js';
import {
  getPlaylists, createPlaylist, deletePlaylist, removeSongFromPlaylist,
  setTrackVersion, reorderPlaylistTrack, setPlaylistTarget, setPlaylistTargetRuntime,
} from '../api.js';
import { playFromPlaylist, playTrack, updatePlayerPlaylistBadge } from '../player.js';
import { generatePixelArt } from '../art.js';

const el = {
  index:$('albums-index'), detail:$('albums-detail'),
  body:$('playlists-body'),
  detailTitle:$('playlist-detail-title'), detailBody:$('playlist-detail-body'),
  statsBar:$('playlist-stats-bar'),
};

/* ── Readiness bar builder — one dither segment per slot (§6.3) ── */
function buildReadinessBar(pl, mini){
  const bar=document.createElement('div');
  bar.className='readiness-bar'+(mini?' readiness-mini':'');
  const slots=Math.max(pl.tracks.length, pl.target||0);
  if(!slots)return bar;
  for(let i=0;i<slots;i++){
    const seg=document.createElement('span');
    const pt=pl.tracks[i];
    if(pt){
      const track=state.allTracks.find(t=>t.filename===pt.filename)
        ||state.groups.find(g=>g.title.toLowerCase()===pt.songKey)?.tracks.slice(-1)[0];
      seg.className='readiness-seg '+(STAGE_DITHER[track?track.stage:'idea']||'dither-25');
    } else {
      seg.className='readiness-seg readiness-empty'; // dashed outline = still to write
    }
    bar.appendChild(seg);
  }
  return bar;
}

/* ── Screen navigation (albums index ⇄ detail, inside the tab) ── */
export function showAlbumsIndex(){
  state.openPlaylistId=null;
  el.detail.style.display='none';
  el.index.style.display='block';
  renderPlaylistsPage();
}
export function openPlaylistDetailPage(id){
  state.openPlaylistId=id;
  renderPlaylistDetailPage(id);
  el.index.style.display='none';
  el.detail.style.display='flex';
}

$('playlist-detail-back-btn').addEventListener('click',showAlbumsIndex);
$('new-playlist-btn').addEventListener('click',()=>{
  const name=prompt('Album name:');if(!name||!name.trim())return;
  createPlaylist(name.trim());renderPlaylistsPage();
});
$('playlist-play-all-btn').addEventListener('click',()=>{if(state.openPlaylistId)playFromPlaylist(state.openPlaylistId,null);});

document.addEventListener('click',()=>{
  document.querySelectorAll('.pl-ver-opts.open').forEach(o=>o.classList.remove('open'));
  document.querySelectorAll('.pl-ver-trigger.open').forEach(o=>o.classList.remove('open'));
});

/* ── Albums index ── */
export function renderPlaylistsPage(){
  el.body.innerHTML='';
  const playlists=getPlaylists();
  const entries=Object.entries(playlists);

  if(!entries.length){
    const empty=document.createElement('div');empty.className='sp-empty';
    empty.innerHTML='NO ALBUMS YET.<br><br>TAP "+ NEW" OR OPEN ANY SONG<br>AND ADD IT TO A NEW ALBUM.';
    el.body.appendChild(empty);return;
  }

  const grid=document.createElement('div');grid.className='album-grid';
  entries.forEach(([id,pl])=>{
    const card=document.createElement('div');card.className='album-card';

    const canvasId=`album-art-${id}`;
    const canvas=document.createElement('canvas');
    canvas.id=canvasId; canvas.className='album-art-canvas';
    canvas.width=64; canvas.height=64;
    card.appendChild(canvas);

    const info=document.createElement('div');info.className='album-card-info';
    const name=document.createElement('div');name.className='album-card-name';name.textContent=pl.name.toUpperCase();
    const count=document.createElement('div');count.className='album-card-count';
    count.textContent=`${pl.tracks.length}${pl.target?'/'+pl.target:''} TRACK${(pl.target||pl.tracks.length)!==1?'S':''}`;
    info.appendChild(name);info.appendChild(count);
    info.appendChild(buildReadinessBar(pl,true)); // mini readiness bar on index cards
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
    generatePixelArt(canvasId, pl.name);
  });
  el.body.appendChild(grid);
}

/* ── Album detail (workbench) ── */
function parseRuntime(str){
  // "35:00" or "35" (minutes) → seconds
  if(!str)return null;
  const m=String(str).trim().match(/^(\d+)(?::(\d{1,2}))?$/);
  if(!m)return null;
  return parseInt(m[1],10)*60+(m[2]?parseInt(m[2],10):0);
}

export function renderPlaylistDetailPage(id){
  const playlists=getPlaylists();
  const pl=playlists[id];
  if(!pl)return;

  el.detailTitle.textContent=pl.name.toUpperCase();
  el.detailBody.innerHTML='';

  generatePixelArt('pl-detail-canvas', pl.name);

  /* stats: `9 TRACKS · 24:12 / ~35:00` */
  const statsBar=el.statsBar;
  const statsCount=$('playlist-stats-count');
  const statsDur=$('playlist-stats-dur');
  statsBar.style.display='flex';
  statsCount.textContent=`${pl.tracks.length}${pl.target?'/'+pl.target:''} TRACK${(pl.target||pl.tracks.length)!==1?'S':''}`;
  const trackObjs=pl.tracks.map(pt=>state.allTracks.find(t=>t.filename===pt.filename)).filter(Boolean);
  let total=0,missing=0;
  trackObjs.forEach(t=>{const d=durSecCache[t._idx];if(d)total+=d;else missing++;});
  let durText=trackObjs.length? (missing?'…':fmtSec(total)) : '—';
  if(pl.targetRuntime)durText+=` / ~${fmtSec(pl.targetRuntime)}`;
  statsDur.textContent=durText;

  /* target editors */
  const targetRow=$('album-target-row');
  if(targetRow){
    const tIn=$('album-target-input');
    const rIn=$('album-target-runtime');
    tIn.value=pl.target||'';
    rIn.value=pl.targetRuntime?fmtSec(pl.targetRuntime):'';
    tIn.onchange=()=>{
      const v=parseInt(tIn.value,10);
      setPlaylistTarget(id,(v&&v>0)?v:null);
      renderPlaylistDetailPage(id);
      renderPlaylistsPage();
    };
    rIn.onchange=()=>{
      setPlaylistTargetRuntime(id,parseRuntime(rIn.value));
      renderPlaylistDetailPage(id);
    };
  }

  /* readiness bar under the stats */
  const readinessWrap=$('playlist-readiness');
  if(readinessWrap){
    readinessWrap.innerHTML='';
    readinessWrap.appendChild(buildReadinessBar(pl,false));
  }

  if(!pl.tracks.length&&!pl.target){
    const empty=document.createElement('div');empty.className='sp-empty';
    empty.innerHTML='NO SONGS YET.<br><br>OPEN ANY SONG PAGE AND<br>ADD IT TO THIS ALBUM.';
    el.detailBody.appendChild(empty);return;
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
    trigger.innerHTML=`<span class="dither-swatch ${STAGE_DITHER[resolvedTrack.stage]||''}"></span>`+[stageLabel,verLabel].filter(Boolean).join(' · ');

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
    el.detailBody.appendChild(row);
  });

  /* dashed empty slot rows — the nag (§6.3) */
  if(pl.target&&pl.target>pl.tracks.length){
    for(let i=pl.tracks.length;i<pl.target;i++){
      const slot=document.createElement('div');slot.className='pl-empty-slot';
      const num=document.createElement('span');num.className='pl-track-num';num.textContent=String(i+1).padStart(2,'0');
      const label=document.createElement('span');label.textContent='-- EMPTY SLOT --';
      slot.appendChild(num);slot.appendChild(label);
      el.detailBody.appendChild(slot);
    }
  }

  const hint=document.createElement('div');hint.className='pl-add-hint';
  hint.textContent='TO ADD SONGS — OPEN A SONG PAGE AND TAP THIS ALBUM\'S NAME.';
  el.detailBody.appendChild(hint);

  fillDurations(el.detailBody);
  setupPlaylistDragDrop(el.detailBody, id);
}

/* refresh runtime stat as durations stream in */
onDurationLoaded(()=>{
  if(state.openPlaylistId&&state.activeScreen==='albums'){
    const pl=getPlaylists()[state.openPlaylistId];
    if(!pl)return;
    const trackObjs=pl.tracks.map(pt=>state.allTracks.find(t=>t.filename===pt.filename)).filter(Boolean);
    let total=0,missing=0;
    trackObjs.forEach(t=>{const d=durSecCache[t._idx];if(d)total+=d;else missing++;});
    let durText=trackObjs.length?(missing?'…':fmtSec(total)):'—';
    if(pl.targetRuntime)durText+=` / ~${fmtSec(pl.targetRuntime)}`;
    const statsDur=$('playlist-stats-dur');
    if(statsDur)statsDur.textContent=durText;
  }
});

/* ── Drag and Drop (moved verbatim from v10) ── */
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
      e.stopPropagation(); // don't trigger the global upload drop overlay
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
