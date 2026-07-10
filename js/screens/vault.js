/* ============================================
   MILLO ARCHIVE v11 — screens/vault.js
   The motivation engine (§6.4):
   FROM THE VAULT (daily pick) · STALE SHELF · ACTIVITY heatmap.
============================================ */
import {
  state, $, daysSince, TAG_LABEL, STAGE_DITHER, fillDurations,
} from '../core.js';
import { playTrack } from '../player.js';
import { openSongPage } from '../songpage.js';
import { generatePixelArt } from '../art.js';

/* deterministic daily rng — same pick all day, new pick tomorrow */
function seededRandom(seedString){
  let hash=0;
  for(let i=0;i<seedString.length;i++)hash=seedString.charCodeAt(i)+((hash<<5)-hash);
  return function(){const x=Math.sin(hash++)*10000;return x-Math.floor(x);};
}

/* weighted toward older + idea/demo (unfinished business) */
export function pickOfTheDay(){
  const today=new Date().toISOString().split('T')[0];
  const rng=seededRandom(today);
  let candidates=state.groups.filter(g=>daysSince(g.latestDate)>60);
  if(!candidates.length){
    // nothing older than 60 days → oldest group
    return [...state.groups].sort((a,b)=>a.latestDate>b.latestDate?1:-1)[0]||null;
  }
  const weights=candidates.map(g=>{
    const age=daysSince(g.latestDate);
    const stageBoost=(g.stage==='idea'||g.stage==='demo')?2:1;
    return age*stageBoost;
  });
  const totalW=weights.reduce((a,b)=>a+b,0);
  let r=rng()*totalW;
  for(let i=0;i<candidates.length;i++){
    r-=weights[i];
    if(r<=0)return candidates[i];
  }
  return candidates[candidates.length-1];
}

export function renderVault(){
  const body=$('vault-body');
  body.innerHTML='';
  if(!state.groups.length){
    const empty=document.createElement('div');empty.className='sp-empty';empty.textContent='NOTHING IN THE VAULT YET.';
    body.appendChild(empty);return;
  }

  /* ── 1. FROM THE VAULT — arcade attract screen ── */
  const pick=pickOfTheDay();
  if(pick){
    const sec=document.createElement('div');sec.className='vault-section';
    const lbl=document.createElement('div');lbl.className='section-label';lbl.textContent='FROM THE VAULT';sec.appendChild(lbl);

    const card=document.createElement('div');card.className='vault-pick';
    const canvas=document.createElement('canvas');
    canvas.id='vault-pick-canvas';canvas.className='vault-pick-art';
    canvas.width=64;canvas.height=64;
    card.appendChild(canvas);

    const info=document.createElement('div');info.className='vault-pick-info';
    const title=document.createElement('div');title.className='vault-pick-title';title.textContent=pick.title.toUpperCase();info.appendChild(title);

    const meta=document.createElement('div');meta.className='vault-pick-meta';
    const days=daysSince(pick.latestDate);
    const touched=document.createElement('span');touched.className='vault-pick-touched';
    touched.textContent=`LAST TOUCHED: ${days} DAY${days!==1?'S':''} AGO`;
    meta.appendChild(touched);
    const pill=document.createElement('span');pill.className='tag-pill';
    pill.innerHTML=`<span class="dither-swatch ${STAGE_DITHER[pick.stage]||''}"></span>${TAG_LABEL[pick.stage]||'?'}`;
    meta.appendChild(pill);
    info.appendChild(meta);

    const prompt=document.createElement('div');prompt.className='vault-press-play';prompt.textContent='▶ PRESS PLAY';
    info.appendChild(prompt);
    card.appendChild(info);

    card.addEventListener('click',()=>{
      const playT=pick.tracks[pick.tracks.length-1];
      playTrack(playT,pick);
    });
    sec.appendChild(card);
    body.appendChild(sec);
    generatePixelArt('vault-pick-canvas', pick.title);
  }

  /* ── 2. STALE SHELF — 10 most-neglected groups ── */
  const staleSec=document.createElement('div');staleSec.className='vault-section';
  const staleLbl=document.createElement('div');staleLbl.className='section-label';staleLbl.textContent='STALE SHELF';staleSec.appendChild(staleLbl);

  const stale=[...state.groups].sort((a,b)=>a.latestDate>b.latestDate?1:-1).slice(0,10);
  stale.forEach(g=>{
    const row=document.createElement('div');row.className='stale-row';
    const d=document.createElement('span');d.className='stale-days';d.textContent=`${daysSince(g.latestDate)}d`;
    const t=document.createElement('span');t.className='stale-title';t.textContent=g.title;
    const pill=document.createElement('span');pill.className='tag-pill stale-pill';
    pill.innerHTML=`<span class="dither-swatch ${STAGE_DITHER[g.stage]||''}"></span>${TAG_LABEL[g.stage]||'?'}`;
    row.appendChild(d);row.appendChild(t);row.appendChild(pill);
    row.addEventListener('click',()=>openSongPage(g));
    staleSec.appendChild(row);
  });
  body.appendChild(staleSec);

  /* ── 3. ACTIVITY — 7×26 upload heatmap ── */
  const actSec=document.createElement('div');actSec.className='vault-section';
  const actLbl=document.createElement('div');actLbl.className='section-label';actLbl.textContent='ACTIVITY';actSec.appendChild(actLbl);

  // count uploads per day (pure upload-date data — no new tracking)
  const counts={};
  state.allTracks.forEach(t=>{if(t.uploaded)counts[t.uploaded]=(counts[t.uploaded]||0)+1;});

  const WEEKS=26;
  const today=new Date();
  // start on the Sunday 26 weeks back so columns align to weeks
  const start=new Date(today);
  start.setDate(start.getDate()-(WEEKS*7-1)-today.getDay());

  const heat=document.createElement('div');heat.className='vault-heatmap';
  for(let w=0;w<WEEKS;w++){
    const col=document.createElement('div');col.className='heat-col';
    for(let d=0;d<7;d++){
      const cellDate=new Date(start);
      cellDate.setDate(start.getDate()+w*7+d);
      const iso=cellDate.toISOString().split('T')[0];
      const n=counts[iso]||0;
      const cell=document.createElement('span');
      cell.className='heat-cell '+(n===0?'heat-0':n===1?'dither-25':n===2?'dither-50':'dither-100');
      if(cellDate>today)cell.classList.add('heat-future');
      cell.title=`${iso} — ${n} upload${n!==1?'s':''}`;
      col.appendChild(cell);
    }
    heat.appendChild(col);
  }
  actSec.appendChild(heat);

  // stat line: `LAST UPLOAD: 3D AGO · 14 UPLOADS THIS MONTH`
  const dates=Object.keys(counts).sort();
  const lastUpload=dates[dates.length-1];
  const thisMonth=new Date().toISOString().slice(0,7);
  const monthCount=state.allTracks.filter(t=>t.uploaded&&t.uploaded.startsWith(thisMonth)).length;
  const stat=document.createElement('div');stat.className='vault-stat-line';
  const lastD=lastUpload?daysSince(lastUpload):null;
  stat.textContent=(lastD!==null?`LAST UPLOAD: ${lastD===0?'TODAY':lastD+'D AGO'}`:'NO UPLOADS')+` · ${monthCount} UPLOAD${monthCount!==1?'S':''} THIS MONTH`;
  actSec.appendChild(stat);

  body.appendChild(actSec);
  fillDurations(body);
}
