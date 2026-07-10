/**
 * MILLO ARCHIVE — Cloudflare Worker (V11)
 *
 * SETUP (dashboard → worker → Settings):
 *   KV Namespace Binding : MILLO_NOTES   (existing)
 *   R2 Bucket Binding    : MILLO_BUCKET  (existing)
 *   Secret               : MILLO_KEY     (NEW — write key. wrangler secret put MILLO_KEY
 *                          or dashboard → Settings → Variables → add secret)
 *   If MILLO_KEY is not set yet, writes are allowed (legacy behavior) so
 *   nothing breaks before the secret exists.
 *
 * Routes:
 *   GET    /            → list all tracks from R2
 *   GET    /notes       → merged notes { filename: { general, timed:[{t,text,created}] } }
 *   POST   /notes       → save { filename, general?, timed? }  (legacy { filename, note } still accepted)
 *   GET    /state       → app state { playlists, favorites, tagOverrides, voiceLinks, updated }
 *   POST   /state       → replace app state (last-write-wins, single user)
 *   GET    /peaks?f=    → [0-7 × ~200] quantized waveform peaks for one file (null if none)
 *   POST   /peaks       → save { filename, peaks }
 *   POST   /upload      → raw file bytes; headers X-Filename (URL-encoded) + Content-Type.
 *                         Streams into R2, returns the parsed track object.
 *   DELETE /file?f=     → delete an audio file from R2
 *
 * All POST/DELETE require header X-Millo-Key === MILLO_KEY (when the secret is set).
 *
 * Filename tags (leftmost wins): -d demo · -f finished · -c complete · -os idea · none = idea
 * Version: -v1, -v2 etc (first found). Noise stripped: bpm, key notation, novox, nofx etc.
 */

const R2_PUBLIC = 'https://pub-103b038a63c34bd188b1dcdf972b277a.r2.dev';
const AUDIO_RE  = /\.(mp3|wav|flac|m4a|aac|ogg)$/i;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Millo-Key, X-Filename',
      'Content-Type': 'application/json',
    };
    const json = (obj, status) => new Response(JSON.stringify(obj), { status: status || 200, headers });

    if (request.method === 'OPTIONS') return new Response(null, { headers });

    // ── Write guard ───────────────────────────
    const isWrite = request.method === 'POST' || request.method === 'DELETE';
    if (isWrite && env.MILLO_KEY && request.headers.get('X-Millo-Key') !== env.MILLO_KEY) {
      return json({ error: 'unauthorized' }, 401);
    }

    // ── Notes ─────────────────────────────────
    if (url.pathname === '/notes') {
      if (request.method === 'GET') {
        const merged = await readNotes(env);
        return json(merged);
      }
      if (request.method === 'POST') {
        let body;
        try { body = await request.json(); } catch { return json({ error: 'invalid json' }, 400); }
        const { filename } = body;
        if (!filename) return json({ error: 'filename required' }, 400);

        const merged = await readNotes(env);
        const entry = merged[filename] || { general: '', timed: [] };
        if ('note' in body) entry.general = (body.note || '').trim();          // legacy shape
        if ('general' in body) entry.general = (body.general || '').trim();
        if ('timed' in body && Array.isArray(body.timed)) {
          entry.timed = body.timed
            .filter(n => n && typeof n.t === 'number' && n.text)
            .map(n => ({ t: n.t, text: String(n.text).slice(0, 500), created: n.created || new Date().toISOString() }));
        }
        if (!entry.general && !entry.timed.length) delete merged[filename];
        else merged[filename] = entry;
        await env.MILLO_NOTES.put('notes2', JSON.stringify(merged));
        return json({ ok: true });
      }
    }

    // ── App state (playlists / favorites / tag overrides / voice links) ──
    if (url.pathname === '/state') {
      if (request.method === 'GET') {
        const val = await env.MILLO_NOTES.get('state');
        return new Response(val || '{}', { headers });
      }
      if (request.method === 'POST') {
        let body;
        try { body = await request.json(); } catch { return json({ error: 'invalid json' }, 400); }
        body.updated = new Date().toISOString();
        await env.MILLO_NOTES.put('state', JSON.stringify(body));
        return json({ ok: true, updated: body.updated });
      }
    }

    // ── Waveform peaks ────────────────────────
    if (url.pathname === '/peaks') {
      if (request.method === 'GET') {
        const f = url.searchParams.get('f');
        if (!f) return json({ error: 'f required' }, 400);
        const val = await env.MILLO_NOTES.get('peaks:' + f);
        return new Response(val || 'null', { headers });
      }
      if (request.method === 'POST') {
        let body;
        try { body = await request.json(); } catch { return json({ error: 'invalid json' }, 400); }
        const { filename, peaks } = body;
        if (!filename || !Array.isArray(peaks) || !peaks.length || peaks.length > 400)
          return json({ error: 'filename + peaks[] required' }, 400);
        const clean = peaks.map(p => Math.max(0, Math.min(7, Math.round(p) || 0)));
        await env.MILLO_NOTES.put('peaks:' + filename, JSON.stringify(clean));
        return json({ ok: true });
      }
    }

    // ── Upload ────────────────────────────────
    if (url.pathname === '/upload' && request.method === 'POST') {
      const raw = request.headers.get('X-Filename');
      if (!raw) return json({ error: 'X-Filename header required' }, 400);
      const filename = decodeURIComponent(raw);
      if (!AUDIO_RE.test(filename)) return json({ error: 'not an audio file' }, 400);
      await env.MILLO_BUCKET.put(filename, request.body, {
        httpMetadata: { contentType: request.headers.get('Content-Type') || 'application/octet-stream' },
      });
      const parsed = parseFilename(filename);
      return json({
        ...parsed,
        filename,
        file: `${R2_PUBLIC}/${encodeURIComponent(filename)}`,
        uploaded: new Date().toISOString().split('T')[0],
      });
    }

    // ── Delete file ───────────────────────────
    if (url.pathname === '/file' && request.method === 'DELETE') {
      const f = url.searchParams.get('f');
      if (!f) return json({ error: 'f required' }, 400);
      await env.MILLO_BUCKET.delete(f);
      return json({ ok: true });
    }

    // ── Track listing ─────────────────────────
    try {
      const listed = await env.MILLO_BUCKET.list();
      const objects = listed.objects || [];
      const tracks = [];

      for (const obj of objects) {
        const filename = obj.key;
        if (!filename.match(AUDIO_RE)) continue;
        const parsed = parseFilename(filename);
        tracks.push({
          ...parsed,
          filename,
          file: `${R2_PUBLIC}/${encodeURIComponent(filename)}`,
          uploaded: obj.uploaded ? obj.uploaded.toISOString().split('T')[0] : null,
        });
      }

      tracks.sort((a, b) => (b.uploaded > a.uploaded ? 1 : -1));
      return json(tracks);
    } catch (err) {
      return json({ error: err.message }, 500);
    }
  }
};

/* Merged notes view: legacy `all` converted on the fly, overlaid by `notes2`. */
async function readNotes(env) {
  const [legacyRaw, v2Raw] = await Promise.all([
    env.MILLO_NOTES.get('all'),
    env.MILLO_NOTES.get('notes2'),
  ]);
  const merged = {};
  try {
    const legacy = JSON.parse(legacyRaw || '{}');
    for (const [fn, text] of Object.entries(legacy)) merged[fn] = { general: text, timed: [] };
  } catch {}
  try {
    const v2 = JSON.parse(v2Raw || '{}');
    for (const [fn, entry] of Object.entries(v2))
      merged[fn] = { general: entry.general || '', timed: Array.isArray(entry.timed) ? entry.timed : [] };
  } catch {}
  return merged;
}

const NOISE      = new Set(['novox','nofx','instrumental','inst','stem','stems','loop','demo2']);
const TAG_MAP    = { d:'demo', f:'finished', c:'complete', os:'idea' };
const STAGE_KEYS = new Set(Object.keys(TAG_MAP));

// Label tokens that carry meaning — keep these as part of the label
const MIX_TOKENS  = new Set(['mix','remix','master','mastered','rough','radio','edit','acappella','acap','acoustic','live','alt','final','bounce','export']);
// Suffix pattern: mix/master type + optional person name  e.g. "mattymix3", "roughmix", "mastered"
const LABEL_RE    = /^([a-z]+mix\d*|[a-z]*master(?:ed)?\d*|rough|radio\s*edit|alt|live|acoustic|bounce\d*|final\d*)$/i;

function parseFilename(filename) {
  const name  = filename.replace(/\.[^.]+$/, '');
  const parts = name.split('-');

  // Find stage tag (leftmost wins)
  const allTags = [];
  for (let i = 0; i < parts.length; i++) {
    const t = parts[i].toLowerCase();
    if (STAGE_KEYS.has(t)) allTags.push({ idx: i, stage: TAG_MAP[t] });
  }
  let stage  = null;
  let tagIdx = -1;
  if (allTags.length > 0) { tagIdx = allTags[0].idx; stage = allTags[0].stage; }

  // Find version (first vN token)
  let version = null;
  let versionIdx = -1;
  for (let i = 0; i < parts.length; i++) {
    if (/^v\d+$/i.test(parts[i])) { version = parseInt(parts[i].slice(1), 10); versionIdx = i; break; }
  }

  // Label = tokens after the version (or after stage if no version) that aren't pure noise
  // e.g. "mattymix3", "roughmix", "mastered", "jd-v2-mattymix3" → label = "mattymix3"
  const labelStart = versionIdx >= 0 ? versionIdx + 1 : (tagIdx >= 0 ? tagIdx + 1 : -1);
  let label = null;
  if (labelStart > 0 && labelStart < parts.length) {
    const labelParts = parts.slice(labelStart).filter(p => {
      const t = p.toLowerCase();
      return !STAGE_KEYS.has(t) && !/^v\d+$/i.test(t) && !/^\d+(bpm)?$/.test(t);
    });
    if (labelParts.length > 0) label = labelParts.join('-');
  }

  // Title = parts before stage tag (excluding version, bpm, key, noise)
  const cutoff = tagIdx >= 0 ? tagIdx : (versionIdx >= 0 ? versionIdx : parts.length);
  const titleParts = parts.slice(0, cutoff).filter(p => {
    const t = p.toLowerCase();
    return (
      !/^v\d+$/i.test(t) &&
      !/^\d+(bpm)?$/.test(t) &&
      !(/^[a-g][b#]?(min|maj|m)?$/.test(t) && t.length <= 4) &&
      !NOISE.has(t) &&
      !STAGE_KEYS.has(t)
    );
  });

  const title = titleParts.join(' ').trim() || filename;
  return { title, stage: stage || 'idea', version, label: label || null };
}
