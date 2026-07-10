/**
 * js/upload.js
 * Global drag-and-drop upload and progress queue.
 */
import { uploadFile } from './api.js';
import { state } from './main.js';
import { renderArchive } from './screens/archive.js';

const dropOverlay = document.getElementById('drop-overlay');
const uploadQueue = document.getElementById('upload-queue');
const uploadQueueList = document.getElementById('upload-queue-list');
const uploadBtn = document.getElementById('upload-btn');
const fileInput = document.getElementById('upload-file-input');

let dragCounter = 0;

export function setupUpload() {
  // ── Drag & Drop Events ──
  window.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dragCounter++;
    if (dragCounter === 1) dropOverlay.style.display = 'flex';
  });

  window.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dragCounter--;
    if (dragCounter === 0) dropOverlay.style.display = 'none';
  });

  window.addEventListener('dragover', (e) => {
    e.preventDefault(); // Required to allow drop
  });

  window.addEventListener('drop', (e) => {
    e.preventDefault();
    dragCounter = 0;
    dropOverlay.style.display = 'none';
    
    const files = Array.from(e.dataTransfer.files).filter(f => 
      f.type.startsWith('audio/') || /\.(mp3|wav|flac|m4a|aac|ogg)$/i.test(f.name)
    );
    
    if (files.length) handleFiles(files);
  });

  // ── Manual Button Fallback ──
  if (uploadBtn && fileInput) {
    uploadBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
      const files = Array.from(e.target.files);
      if (files.length) handleFiles(files);
      fileInput.value = ''; // Reset
    });
  }
}

// Global U shortcut
document.addEventListener('keydown', (e) => {
  if (e.key === 'u' || e.key === 'U') {
    if (document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
      if (fileInput) fileInput.click();
    }
  }
});

function handleFiles(files) {
  uploadQueue.style.display = 'block';
  
  files.forEach(file => {
    const row = document.createElement('div');
    row.className = 'upload-row';
    
    const nameStr = document.createElement('div');
    nameStr.className = 'upload-row-name';
    nameStr.textContent = file.name;
    
    const bar = document.createElement('div');
    bar.className = 'upload-row-bar';
    bar.textContent = '░░░░░░░░░░ 0%';
    
    row.appendChild(nameStr);
    row.appendChild(bar);
    uploadQueueList.appendChild(row);

    uploadFile(file, (pct) => {
      // Old-school blocky progress bar
      const filled = Math.floor(pct / 10);
      const blocks = '█'.repeat(filled) + '░'.repeat(10 - filled);
      bar.textContent = `${blocks} ${pct}%`;
    }).then(trackObj => {
      bar.textContent = '██████████ 100%';
      setTimeout(() => row.remove(), 2000);
      checkQueueEmpty();
      
      // Inject new track seamlessly
      trackObj._idx = state.allTracks.length;
      state.allTracks.push(trackObj);
      
      // Rebuild groups to ensure it shows up in Archive immediately
      // (Assuming you expose a rebuild/refresh method from main.js)
      window.dispatchEvent(new CustomEvent('millo-track-uploaded')); 
      if (state.activeTab === 'archive') renderArchive();
      
    }).catch(err => {
      row.classList.add('upload-failed');
      bar.textContent = 'FAILED';
      setTimeout(() => row.remove(), 4000);
      checkQueueEmpty();
    });
  });
}

function checkQueueEmpty() {
  if (uploadQueueList.children.length === 0) {
    uploadQueue.style.display = 'none';
  }
}