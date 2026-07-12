/* ============================================
   MILLO ARCHIVE v11 — screens/voice.js
   Voice notes tab + voice → song linking (§6.5).
============================================ */
import { state, $, showToast, fmtDate } from '../core.js';
import { getVoiceLinks, setVoiceLink } from '../api.js';
import { playTrack } from '../player.js';
import { renderSongPage } from './../songpage.js';

const el = { voiceList:$('voice-list'), picker:$('voice-picker'), pickerInput:$('voice-picker-input'), pickerList:$('voice-picker-list') };

export function renderVoiceList(){
  el.voiceList.innerHTML='';
  // newest first — field recordings pile up, the latest ones matter most
  const sorted=[...state.voiceTracks].sort((a,b)=>{
    const d=(b.uploaded||'').localeCompare(a.uploaded||'');
    return d!==0?d:(b.filename||'').localeCompare(a.filename||'');
  });
  if(!sorted.length){
    const empty=document.createElement('div');empty.className='sp-empty';
    empty.innerHTML='NO FIELD RECORDINGS.<br><br>ANY FILE NAMED "ZOOM…"<br>OR CONTAINING "VOICE"<br>LANDS HERE.';
    el.voiceList.appendChild(empty);return;
  }
  const links=getVoiceLinks();
  const linkedCount=sorted.filter(t=>links[t.filename]).length;
  const hdr=document.createElement('div');hdr.className='voice-header';
  hdr.textContent=`VOICE & FIELD RECORDINGS — ${sorted.length}`+(linkedCount?` · ${linkedCount} LINKED`:'');
  el.voiceList.appendChild(hdr);

  // group under date headings so a long tape reel is scannable
  let lastDate=null;
  sorted.forEach((track,i)=>{
    if(track.uploaded && track.uploaded!==lastDate){
      lastDate=track.uploaded;
      const dh=document.createElement('div');dh.className='voice-date-head';dh.textContent=fmtDate(track.uploaded);
      el.voiceList.appendChild(dh);
    }
    const row=document.createElement('div');row.className='voice-row';row.dataset.trackIdx=track._idx;
    const num=document.createElement('span');num.className='voice-row-num';num.textContent=String(i+1).padStart(2,'0');
    const title=document.createElement('span');title.className='voice-row-title';title.textContent=track.title||track.filename;
    const dur=document.createElement('span');dur.className='voice-row-dur';dur.dataset.trackIdx=track._idx;

    // → SONG link button
    const linkBtn=document.createElement('button');
    linkBtn.className='voice-link-btn'+(links[track.filename]?' linked':'');
    linkBtn.textContent=links[track.filename]?('→ '+links[track.filename].toUpperCase().slice(0,14)):'→ SONG';
    linkBtn.addEventListener('click',e=>{
      e.stopPropagation();
      openVoicePicker(track);
    });

    row.appendChild(num);row.appendChild(title);row.appendChild(dur);row.appendChild(linkBtn);
    row.addEventListener('click',()=>playTrack(track,null));
    el.voiceList.appendChild(row);
  });
  import('../core.js').then(m=>m.fillDurations(el.voiceList));
  import('./archive.js').then(m=>m.refreshPlayingState());
}

/* search-filterable song picker */
let pickerTrack=null;
function openVoicePicker(track){
  pickerTrack=track;
  el.picker.style.display='flex';
  el.pickerInput.value='';
  renderPickerList('');
  setTimeout(()=>el.pickerInput.focus(),50);
}
export function closeVoicePicker(){
  el.picker.style.display='none';
  pickerTrack=null;
}
function renderPickerList(q){
  el.pickerList.innerHTML='';
  const links=getVoiceLinks();
  const current=pickerTrack?links[pickerTrack.filename]:null;

  if(current){
    const unlink=document.createElement('button');
    unlink.className='voice-picker-item voice-picker-unlink';
    unlink.textContent='✕ UNLINK FROM '+current.toUpperCase();
    unlink.addEventListener('click',()=>{
      setVoiceLink(pickerTrack.filename,null);
      closeVoicePicker();renderVoiceList();
      if(state.songPageGroup)renderSongPage(state.songPageGroup);
    });
    el.pickerList.appendChild(unlink);
  }

  state.groups
    .filter(g=>!q||g.title.toLowerCase().includes(q))
    .slice(0,50)
    .forEach(g=>{
      const item=document.createElement('button');
      item.className='voice-picker-item'+(current===g.title.toLowerCase()?' active':'');
      item.textContent=g.title.toUpperCase();
      item.addEventListener('click',()=>{
        setVoiceLink(pickerTrack.filename,g.title.toLowerCase());
        showToast('LINKED → '+g.title.toUpperCase());
        closeVoicePicker();renderVoiceList();
        if(state.songPageGroup)renderSongPage(state.songPageGroup);
      });
      el.pickerList.appendChild(item);
    });
}
if(el.pickerInput){
  el.pickerInput.addEventListener('input',()=>renderPickerList(el.pickerInput.value.trim().toLowerCase()));
  el.pickerInput.addEventListener('keydown',e=>{
    e.stopPropagation();
    if(e.key==='Escape')closeVoicePicker();
  });
}
if($('voice-picker-close'))$('voice-picker-close').addEventListener('click',closeVoicePicker);
if(el.picker)el.picker.addEventListener('click',e=>{if(e.target===el.picker)closeVoicePicker();});
export function isVoicePickerOpen(){return el.picker&&el.picker.style.display!=='none'&&el.picker.style.display!=='';}
