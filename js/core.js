/* ============================================
   MILLO ARCHIVE v11 — core.js
   Shared state, constants, helpers. No imports.
============================================ */

export const WORKER_URL = 'https://millo-worker.millo-manager.workers.dev';
export const NEW_DAYS   = 7;

/* device-local prefs (stay in localStorage forever) */
export const VOLUME_KEY = 'millo-volume-v1';
export const SPEED_KEY  = 'millo-speed-v1';
export const RESUME_KEY = 'millo-resume-v1';
export const UTIL_KEY   = 'millo-util-open-v1';
export const KEY_KEY    = 'millo-key';

/* legacy keys — migrated to server state, kept as fallback */
export const TAG_OVERRIDES_KEY = 'millo-tag-overrides-v1';
export const FAVORITES_KEY     = 'millo-favorites-v1';
export const PLAYLISTS_KEY     = 'millo-playlists-v1';

export const SPEED_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2];

export const TAG_LABEL  = { idea:'IDEA', demo:'DEMO', finished:'FIN', complete:'COMP' };
export const TAG_SHORT  = { idea:'I', demo:'D', finished:'F', complete:'C' };
export const TAG_FULL   = { idea:'IDEA', demo:'DEMO', finished:'FINISHED', complete:'COMPLETE' };
export const STAGE_RANK = { idea:0, demo:1, finished:2, complete:3 };
/* stage-as-texture: dither density encodes stage everywhere (§2.2) */
export const STAGE_DITHER = { idea:'dither-25', demo:'dither-50', finished:'dither-75', complete:'dither-100' };

export const audio = document.getElementById('audio-player');

export function isVoiceNote(t) { return t.filename && /voice/i.test(t.filename); }

// ── Shared mutable state ─────────────────────
export const state = {
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
  activeScreen:'archive',          // archive | albums | vault | voice
  abA:null, abB:null,              // filenames armed for A/B compare
  noteDraftTime:null,              // frozen playhead for a timed note being typed
};

export const $ = id => document.getElementById(id);

// ── Tiny utils ───────────────────────────────
export function shuffle(arr){for(let i=arr.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[arr[i],arr[j]]=[arr[j],arr[i]];}return arr;}
export function isNew(d){return d&&(Date.now()-new Date(d).getTime())<NEW_DAYS*86400000;}
export function fmtSec(s){if(!s||isNaN(s))return'0:00';return`${Math.floor(s/60)}:${(Math.floor(s)%60).toString().padStart(2,'0')}`;}
export function fmtDate(d){return d?d.slice(5):'';}
export function daysSince(d){if(!d)return 9999;return Math.max(0,Math.floor((Date.now()-new Date(d).getTime())/86400000));}

export function showToast(msg){
  const t=document.createElement('div');t.className='share-toast';t.textContent=msg;
  document.body.appendChild(t);
  requestAnimationFrame(()=>t.classList.add('visible'));
  setTimeout(()=>{t.classList.remove('visible');setTimeout(()=>t.remove(),350);},2500);
}

// ── Group building (moved verbatim from v10) ─
export function buildGroups(tracks){
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

export function sortGroups(groups,sort){
  if(sort==='shuffle')return shuffle([...groups]);
  return[...groups].sort((a,b)=>sort==='newest'?(b.latestDate>a.latestDate?1:-1):(a.latestDate>b.latestDate?1:-1));
}
export function searchGroups(groups,q){if(!q)return groups;return groups.filter(g=>g.title.toLowerCase().includes(q));}

export function findGroup(t){return state.groups.find(g=>g.tracks.includes(t))||null;}

// ── Duration probing / cache (moved from v10) ─
export const durCache={};
const DUR_CLASSES=['card-duration','voice-row-dur','pver-row-dur','sp-ver-dur','sp-hero-dur','pl-ver-opt-dur','vault-pick-dur'];
function applyDurToNode(node,dur){ if(DUR_CLASSES.some(c=>node.classList.contains(c)))node.textContent=dur; }
export function fillDurations(root){
  (root||document).querySelectorAll('[data-track-idx]').forEach(node=>{
    const d=durCache[node.dataset.trackIdx];
    if(d)applyDurToNode(node,d);
  });
}
export function loadAllDurations(tracks){
  tracks.forEach(t=>{
    if(durCache[t._idx]){ document.querySelectorAll(`[data-track-idx="${t._idx}"]`).forEach(n=>applyDurToNode(n,durCache[t._idx])); return; }
    const probe=new Audio();probe.preload='metadata';probe.src=t.file;
    probe.addEventListener('loadedmetadata',()=>{
      const dur=fmtSec(probe.duration);
      durCache[t._idx]=dur;
      durSecCache[t._idx]=probe.duration;
      document.querySelectorAll(`[data-track-idx="${t._idx}"]`).forEach(node=>applyDurToNode(node,dur));
      durationListeners.forEach(fn=>fn(t._idx,probe.duration));
    });
  });
}
/* numeric durations (seconds) for album runtime math */
export const durSecCache={};
const durationListeners=[];
export function onDurationLoaded(fn){durationListeners.push(fn);}
