/**
 * MILLO ARCHIVE — Cloudflare Worker
 *
 * SETUP: Add a KV namespace binding in the Cloudflare dashboard:
 *   Workers & Pages → your worker → Settings → Variables → KV Namespace Bindings
 *   Variable name: MILLO_NOTES   (create a new KV namespace with the same name)
 *
 * Routes:
 *   GET  /        → list all tracks from R2
 *   GET  /notes   → get all notes { filename: text }
 *   POST /notes   → save a note { filename, note } (empty string deletes)
 *
 * Tags (leftmost wins for multi-tag files):
 *   -d   = demo
 *   -f   = finished
 *   -c   = complete
 *   -os  = idea (legacy one-shot tag)
 *   none = idea (catch-all)
 *
 * Version: -v1, -v2 etc (first found)
 * Noise stripped: bpm values, key notation, novox, nofx etc
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Content-Type': 'application/json',
    };

    if (request.method === 'OPTIONS') return new Response(null, { headers });

    // ── Notes endpoints ───────────────────────
    if (url.pathname === '/notes') {
      if (request.method === 'GET') {
        const val = await env.MILLO_NOTES.get('all');
        return new Response(val || '{}', { headers });
      }

      if (request.method === 'POST') {
        let body;
        try { body = await request.json(); } catch {
          return new Response(JSON.stringify({ error: 'invalid json' }), { status: 400, headers });
        }
        const { filename, note } = body;
        if (!filename) return new Response(JSON.stringify({ error: 'filename required' }), { status: 400, headers });

        const existing = JSON.parse(await env.MILLO_NOTES.get('all') || '{}');
        if (!note || note.trim() === '') {
          delete existing[filename];
        } else {
          existing[filename] = note.trim();
        }
        await env.MILLO_NOTES.put('all', JSON.stringify(existing));
        return new Response(JSON.stringify({ ok: true }), { headers });
      }
    }

    // ── Track listing ─────────────────────────
    try {
      const listed = await env.MILLO_BUCKET.list();
      const objects = listed.objects || [];
      const tracks = [];

      for (const obj of objects) {
        const filename = obj.key;
        if (!filename.match(/\.(mp3|wav|flac|m4a|aac|ogg)$/i)) continue;
        const parsed = parseFilename(filename);
        tracks.push({
          ...parsed,
          filename,
          file: `https://pub-103b038a63c34bd188b1dcdf972b277a.r2.dev/${encodeURIComponent(filename)}`,
          uploaded: obj.uploaded ? obj.uploaded.toISOString().split('T')[0] : null,
        });
      }

      tracks.sort((a, b) => (b.uploaded > a.uploaded ? 1 : -1));
      return new Response(JSON.stringify(tracks), { headers });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
    }
  }
};

const NOISE    = new Set(['novox','nofx','instrumental','inst','mix','remix','mastered','stem','stems','loop','demo2']);
const TAG_MAP  = { d:'demo', f:'finished', c:'complete', os:'idea' };
const STAGE_KEYS = new Set(Object.keys(TAG_MAP));

function parseFilename(filename) {
  const name  = filename.replace(/\.[^.]+$/, '');
  const parts = name.split('-');

  const allTags = [];
  for (let i = 0; i < parts.length; i++) {
    const t = parts[i].toLowerCase();
    if (STAGE_KEYS.has(t)) allTags.push({ idx: i, stage: TAG_MAP[t] });
  }

  let stage  = null;
  let tagIdx = -1;
  if (allTags.length > 0) {
    tagIdx = allTags[0].idx;
    stage  = allTags[0].stage;
  }

  let version = null;
  for (const p of parts) {
    if (/^v\d+$/i.test(p)) { version = parseInt(p.slice(1), 10); break; }
  }

  const titleParts = (tagIdx >= 0 ? parts.slice(0, tagIdx) : parts).filter(p => {
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
  return { title, stage: stage || 'idea', version };
}
