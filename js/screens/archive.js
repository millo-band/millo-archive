/**
 * js/screens/archive.js
 * Phase 2 grid rendering, stage chips, and dither strips.
 */
import { state } from '../main.js';

const TAG_LABEL = { idea: 'IDEA', demo: 'DEMO', finished: 'FIN', complete: 'COMP' };
const STAGE_DITHER = { idea: 'dither-25', demo: 'dither-50', finished: 'dither-75', complete: 'dither-100' };
const NEW_DAYS = 7;

function isNew(d) { return d && (Date.now() - new Date(d).getTime()) < NEW_DAYS * 86400000; }

export function setupArchive() {
  // Stage Chips setup
  document.querySelectorAll('.stage-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      state.currentFilter = chip.dataset.filter;
      document.querySelectorAll('.stage-chip').forEach(c => c.classList.toggle('active', c === chip));
      renderArchive();
    });
  });
}

function filterAndSort() {
  let visible = state.groups;
  
  // Filter
  if (state.currentFilter === 'starred') {
    // Requires api.js favorite checking (will hook up in player module)
    // For now, bypass
  } else if (state.currentFilter !== 'all') {
    visible = visible.filter(g => g.stages.has(state.currentFilter));
  }

  // Search
  if (state.searchQuery) {
    visible = visible.filter(g => g.title.toLowerCase().includes(state.searchQuery));
  }

  // Sort
  visible.sort((a, b) => state.currentSort === 'newest' 
    ? (b.latestDate > a.latestDate ? 1 : -1) 
    : (a.latestDate > b.latestDate ? 1 : -1));

  state.filteredGroups = visible;
  return visible;
}

export function renderArchive() {
  const grid = document.getElementById('tracks-grid');
  const empty = document.getElementById('empty-state');
  grid.innerHTML = '';
  
  const visible = filterAndSort();
  
  if (!visible.length) {
    empty.style.display = 'block';
    return;
  }
  
  empty.style.display = 'none';
  visible.forEach((group, gIdx) => grid.appendChild(buildCard(group, gIdx)));
}

function buildCard(group, gIdx) {
  const playT = group.tracks[group.tracks.length - 1];
  const hasVersions = group.tracks.length > 1;
  const fresh = isNew(group.latestDate);
  
  const card = document.createElement('div');
  card.className = 'track-card' + (hasVersions ? ' has-versions' : '');
  card.dataset.gIdx = gIdx;
  
  // ── PHASE 2: Dither Stage Strip ──
  const strip = document.createElement('div');
  strip.className = `card-stage-strip ${STAGE_DITHER[group.stage] || 'dither-25'}`;
  card.appendChild(strip);

  const body = document.createElement('div');
  body.className = 'card-body';
  
  const top = document.createElement('div');
  top.className = 'card-top';
  
  const badges = document.createElement('div');
  badges.className = 'card-badges';
  if (TAG_LABEL[group.stage]) {
    const pill = document.createElement('span');
    pill.className = 'tag-pill';
    pill.textContent = TAG_LABEL[group.stage];
    badges.appendChild(pill);
  }
  if (fresh) {
    const nb = document.createElement('span');
    nb.className = 'new-badge';
    nb.textContent = 'NEW';
    badges.appendChild(nb);
  }
  top.appendChild(badges);
  body.appendChild(top);
  
  const titleEl = document.createElement('div');
  titleEl.className = 'card-title';
  titleEl.textContent = group.title;
  body.appendChild(titleEl);
  
  const footer = document.createElement('div');
  footer.className = 'card-footer';
  
  // ── PHASE 2: New Metadata Line ──
  const metaLine = document.createElement('div');
  metaLine.style.fontSize = '8px';
  metaLine.style.opacity = '0.5';
  metaLine.textContent = `${group.tracks.length} VER · TOUCHED ${group.latestDate || 'UNKNOWN'}`;
  footer.appendChild(metaLine);

  body.appendChild(footer);
  card.appendChild(body);
  
  // Hook up click to play later
  card.addEventListener('click', () => console.log('Play:', playT.filename));
  
  return card;
}