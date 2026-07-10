/* ============================================
   MILLO ARCHIVE v11 — upload.js
   Global drag-and-drop + file-picker upload (§6.2).
   Old-school segmented progress bars via XHR events.
============================================ */
import { state, $, buildGroups, isVoiceNote, showToast, loadAllDurations } from './core.js';
import { uploadFile, applyTagOverrides } from './api.js';
import { render } from './screens/archive.js';
import { renderVoiceList } from './screens/voice.js';

const AUDIO_RE = /\.(mp3|wav|flac|m4a|aac|ogg)$/i;
const el = {
  overlay:$('drop-overlay'),
  queue:$('upload-queue'), queueList:$('upload-queue-list'),
};

function segBar(pct){
  // ████████░░░░ 64%
  const total=12, filled=Math.round(pct*total);
  return '█'.repeat(filled)+'░'.repeat(total-filled)+' '+Math.round(pct*100)+'%';
}

let activeUploads=0;
function queueRow(name){
  el.queue.style.display='block';
  const row=document.createElement('div');row.className='upload-row';
  const label=document.createElement('span');label.className='upload-row-name';label.textContent=name;
  const bar=document.createElement('span');bar.className='upload-row-bar';bar.textContent=segBar(0);
  row.appendChild(label);row.appendChild(bar);
  el.queueList.appendChild(row);
  return { row, bar };
}
function maybeHideQueue(){
  if(activeUploads===0){
    setTimeout(()=>{
      if(activeUploads===0){el.queue.style.display='none';el.queueList.innerHTML='';}
    },2600);
  }
}

/* merge a returned track object into live state — new card appears, no reload */
function mergeTrack(track){
  track._idx=state.allTracks.length;
  applyTagOverrides([track]);
  state.allTracks.push(track);
  if(isVoiceNote(track)){
    state.voiceTracks.push(track);
    if(state.activeScreen==='voice')renderVoiceList();
  } else {
    state.groups=buildGroups(state.allTracks.filter(t=>!isVoiceNote(t)));
    render();
  }
  loadAllDurations([track]);
}

export async function handleFiles(files){
  const audioFiles=[...files].filter(f=>AUDIO_RE.test(f.name));
  if(!audioFiles.length){showToast('NO AUDIO FILES');return;}
  for(const file of audioFiles){
    const ui=queueRow(file.name);
    activeUploads++;
    try{
      const track=await uploadFile(file,pct=>{ui.bar.textContent=segBar(pct);});
      ui.bar.textContent=segBar(1)+' ✓';
      mergeTrack(track);
    }catch(err){
      ui.bar.textContent='FAILED — '+(err.message||'ERROR');
      ui.row.classList.add('upload-failed');
      showToast('UPLOAD FAILED: '+file.name);
    }finally{
      activeUploads--;
      maybeHideQueue();
    }
  }
}

/* ── Global drag overlay ── */
let dragDepth=0;
window.addEventListener('dragenter',e=>{
  if(![...e.dataTransfer.types].includes('Files'))return;
  e.preventDefault();
  dragDepth++;
  el.overlay.style.display='flex';
});
window.addEventListener('dragover',e=>{e.preventDefault();});
window.addEventListener('dragleave',e=>{
  dragDepth=Math.max(0,dragDepth-1);
  if(dragDepth===0)el.overlay.style.display='none';
});
window.addEventListener('drop',e=>{
  e.preventDefault();
  dragDepth=0;
  el.overlay.style.display='none';
  if(e.dataTransfer.files&&e.dataTransfer.files.length)handleFiles(e.dataTransfer.files);
});

/* ── + button / U key → file picker ── */
export function openFilePicker(){
  const input=$('upload-file-input');
  if(input)input.click();
}
const uploadBtn=$('upload-btn');
if(uploadBtn)uploadBtn.addEventListener('click',openFilePicker);
const fileInput=$('upload-file-input');
if(fileInput)fileInput.addEventListener('change',()=>{
  if(fileInput.files.length)handleFiles(fileInput.files);
  fileInput.value='';
});
