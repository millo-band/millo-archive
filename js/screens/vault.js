/**
 * js/screens/vault.js
 * The Vault: Daily pick, stale shelf, and upload heatmap.
 */
import { state } from '../main.js';

const STAGE_DITHER = { idea: 'dither-25', demo: 'dither-50', finished: 'dither-75', complete: 'dither-100' };

// Simple seeded PRNG for daily deterministic picks
function seededRandom(seedStr) {
  let h = 0;
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(31, h) + seedStr.charCodeAt(i) | 0;
  }
  return function() {
    h = Math.imul(h ^ h >>> 16, 2246822507);
    h = Math.imul(h ^ h >>> 13, 3266489909);
    return (h ^= h >>> 16) >>> 0 / 4294967296;
  };
}

function getDaysSince(dateStr) {
  if (!dateStr || dateStr.startsWith('1970')) return 999;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

export function renderVault() {
  const vaultBody = document.getElementById('vault-body');
  if (!vaultBody) return;
  vaultBody.innerHTML = '';

  const groups = state.groups.filter(g => g.tracks.length > 0);
  if (!groups.length) return;

  // ── 1. FROM THE VAULT (Daily Pick) ──
  const today = new Date().toISOString().split('T')[0];
  const rng = seededRandom(today);
  
  // Qualify > 60 days old
  let qualified = groups.filter(g => getDaysSince(g.latestDate) > 60);
  if (!qualified.length) qualified = groups; // Fallback to all

  // Weight towards older and idea/demo
  qualified.sort((a, b) => {
    let weightA = getDaysSince(a.latestDate) + (['idea', 'demo'].includes(a.stage) ? 100 : 0);
    let weightB = getDaysSince(b.latestDate) + (['idea', 'demo'].includes(b.stage) ? 100 : 0);
    return weightB - weightA;
  });

  // Pick one from top tier using today's seed
  const pickPool = qualified.slice(0, Math.max(1, Math.floor(qualified.length * 0.2)));
  const pick = pickPool[Math.floor(rng() * pickPool.length)] || groups[groups.length - 1];

  const pickCard = document.createElement('div');
  pickCard.className = 'vault-pick vault-section';
  
  // We reuse the existing pixel generator on a 128px canvas
  const canvasId = `vault-art-${Date.now()}`;
  const pickArt = document.createElement('canvas');
  pickArt.id = canvasId;
  pickArt.className = 'vault-pick-art';
  pickCard.appendChild(pickArt);

  const pickInfo = document.createElement('div');
  pickInfo.className = 'vault-pick-info';
  pickInfo.innerHTML = `
    <div class="vault-pick-meta">
      <span class="sp-stage-pill sp-stage-sm">${pick.stage.toUpperCase()}</span>
      <span class="vault-pick-touched">LAST TOUCHED: ${getDaysSince(pick.latestDate)} DAYS AGO</span>
    </div>
    <div class="vault-pick-title">${pick.title.toUpperCase()}</div>
    <div class="vault-press-play">▶ PRESS PLAY</div>
  `;
  pickCard.appendChild(pickInfo);
  
  pickCard.addEventListener('click', () => {
    console.log('Playing daily pick', pick.title);
    // playTrack(pick.tracks[pick.tracks.length - 1], pick); 
  });
  
  vaultBody.appendChild(pickCard);
  
  // Call the global procedural art generator if available
  if (window.generatePixelArt) window.generatePixelArt(canvasId, pick.title);

  // ── 2. STALE SHELF ──
  const staleSection = document.createElement('div');
  staleSection.className = 'vault-section';
  staleSection.innerHTML = `<div class="section-label">STALE SHELF</div>`;
  
  const staleList = [...groups]
    .sort((a, b) => getDaysSince(b.latestDate) - getDaysSince(a.latestDate))
    .slice(0, 10);
    
  staleList.forEach(g => {
    const row = document.createElement('div');
    row.className = 'stale-row';
    row.innerHTML = `
      <span class="stale-days">${getDaysSince(g.latestDate)}d</span>
      <span class="stale-title">${g.title}</span>
      <span class="sp-stage-pill sp-stage-sm stale-pill">[${g.stage.toUpperCase()}]</span>
    `;
    // row.addEventListener('click', () => openSongPage(g));
    staleSection.appendChild(row);
  });
  
  vaultBody.appendChild(staleSection);

  // ── 3. ACTIVITY HEATMAP ──
  const heatSection = document.createElement('div');
  heatSection.className = 'vault-section';
  heatSection.innerHTML = `<div class="section-label">ACTIVITY</div>`;

  const heatmap = document.createElement('div');
  heatmap.className = 'vault-heatmap';
  
  // Count uploads per day
  const uploadCounts = {};
  state.allTracks.forEach(t => {
    if (t.uploaded) uploadCounts[t.uploaded] = (uploadCounts[t.uploaded] || 0) + 1;
  });

  const WEEKS = 26;
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  let thisMonthCount = 0;
  
  // Adjust to start on Sunday
  const startOffset = now.getDay();
  
  for (let w = WEEKS - 1; w >= 0; w--) {
    const col = document.createElement('div');
    col.className = 'heat-col';
    
    for (let d = 0; d < 7; d++) {
      const cellDate = new Date(now);
      cellDate.setDate(now.getDate() - (w * 7) - (startOffset - d));
      const dateStr = cellDate.toISOString().split('T')[0];
      
      const count = uploadCounts[dateStr] || 0;
      if (dateStr.startsWith(todayStr.slice(0, 7))) thisMonthCount += count;
      
      const cell = document.createElement('div');
      cell.className = 'heat-cell';
      
      if (dateStr > todayStr) {
        cell.classList.add('heat-future');
      } else if (count === 0) {
        cell.classList.add('heat-0');
      } else {
        // Apply new dither classes
        if (count === 1) cell.classList.add('dither-25');
        else if (count === 2) cell.classList.add('dither-50');
        else cell.classList.add('dither-100'); // 3+ is solid
      }
      
      cell.title = `${dateStr}: ${count} uploads`;
      col.appendChild(cell);
    }
    heatmap.appendChild(col);
  }
  
  heatSection.appendChild(heatmap);
  
  const sortedDates = Object.keys(uploadCounts).sort();
  const lastUpload = sortedDates.length ? getDaysSince(sortedDates[sortedDates.length - 1]) : '?';
  
  const statLine = document.createElement('div');
  statLine.className = 'vault-stat-line';
  statLine.textContent = `LAST UPLOAD: ${lastUpload}D AGO · ${thisMonthCount} UPLOADS THIS MONTH`;
  heatSection.appendChild(statLine);

  vaultBody.appendChild(heatSection);
}