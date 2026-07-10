# 📻 millo-archive (v11)

Retro 1-bit personal music archive + player. Static site (no framework, no build step)
deployed on **GitHub Pages**, audio in **Cloudflare R2**, state in **Workers KV**,
all glued by one **Cloudflare Worker**.

- Live Player: [millo-band.github.io/millo-archive](https://millo-band.github.io/millo-archive/)
- Worker: `https://millo-worker.millo-manager.workers.dev`

---

## Filename convention (the ingest language)

Files are named like `song-title-d-v2-mattymix3-120bpm-Amin.mp3`. The worker parses:

| token | meaning |
|---|---|
| `-d` | demo |
| `-f` | finished |
| `-c` | complete |
| `-os` | idea (legacy) |
| *(none)* | idea |
| `-vN` | version number (first found) |
| `mattymix3`, `roughmix`, `mastered`… | label (after version/stage) |
| bpm numbers, key notation (`Amin`, `f#`), `novox`, `nofx`, `inst`, `stems` | stripped from titles |
| any filename containing `voice` | voice memo → VOICE tab |

Leftmost stage tag wins. **Filename IS the metadata.**

## Screens

Bottom tab bar: **ARCHIVE · ALBUMS · VAULT · VOICE** (hash-routed: `#archive` etc).

- **ARCHIVE** — the grid. Stage chips filter (dither texture = stage), sort, search, EDIT (mass tag / mass add-to-album), drag-and-drop upload anywhere on the window (or the `+` button / `U`).
- **ALBUMS** — album workbench. Per-slot version pinning, drag reorder, play-all, target track count + target runtime, readiness bar (dither per track stage, dashed = empty slot).
- **VAULT** — daily deterministic pick from tracks untouched >60 days (weighted old + idea/demo), stale shelf (10 most neglected), 26-week upload heatmap.
- **VOICE** — voice memos. `→ SONG` links a memo to a song group; linked memos appear on that song's page.

Player: pixel waveform scrubber (peaks cached in KV), timestamped notes (`N` at playhead; `[2:14]` seeks; `▼` flags on the waveform), A/B version compare (`X` flips), UTIL disclosure hides VOL/SPEED. Press `?` for the full keyboard map.

## Data (Workers KV — namespace binding `MILLO_NOTES`)

| key | value |
|---|---|
| `all` | legacy plain notes `{ filename: string }` (read-only, merged on the fly) |
| `notes2` | `{ [filename]: { general, timed: [{ t, text, created }] } }` |
| `state` | `{ playlists, favorites, tagOverrides, voiceLinks, updated }` |
| `peaks:<filename>` | ~200 quantized (0–7) waveform peaks |

Device prefs (volume, speed, resume position, theme, UTIL open) stay in localStorage.
The old localStorage playlists/favorites/tags are auto-migrated to `state` on first load
and kept locally as a fallback — never deleted.

## Worker routes (`worker.js` — single file, dashboard paste-deployable)

```
GET    /            track listing from R2
GET    /notes       merged notes2 (+converted legacy)
POST   /notes       { filename, general?, timed? }   (legacy { filename, note } ok)
GET    /state       app state
POST   /state       replace app state (last-write-wins)
GET    /peaks?f=    peaks for one file
POST   /peaks       { filename, peaks }
POST   /upload      raw bytes; headers X-Filename (URL-encoded) + Content-Type
DELETE /file?f=     delete from R2
```

All POST/DELETE require header `X-Millo-Key` matching the Worker secret `MILLO_KEY`.
The frontend prompts `KEY:` once on first write and stores it (`millo-key` in localStorage);
a 401 clears it and re-prompts. That's the whole auth system.

## Cloudflare dashboard setup (one-time for v11)

1. Workers & Pages → millo-worker → **Settings → Variables → Add secret**: `MILLO_KEY` = your write key.
   (Until the secret exists, writes are allowed — nothing breaks mid-migration.)
2. Paste the new `worker.js` into the dashboard editor and deploy.
3. Bindings already exist: KV `MILLO_NOTES`, R2 `MILLO_BUCKET`. No new namespaces, buckets, or services.

Alternatively fill the two IDs in `wrangler.toml` and `npx wrangler deploy` (never required).

### R2 CORS Policy (unchanged from v10)

Uploads go through the worker, so no CORS change is needed. The existing rule below must stay —
it also lets the browser decode audio for waveform peaks on these origins:

```json
[
  {
    "AllowedOrigins": [
      "https://millo-band.github.io",
      "http://localhost:5500"
    ],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["*"]
  }
]
```

## Local dev

```
python3 serve.py                 # http://localhost:7822
PORT=5500 python3 serve.py       # http://localhost:5500 (matches the R2 CORS rule)
```

## Code layout

```
index.html                  shell
css/base.css                tokens, dither primitives, header/chips/tabbar, overlays
css/player.css              floating player, waveform, notes log, A/B, UTIL
css/screens.css             grid/cards, song page, albums workbench, vault, voice
js/core.js                  shared state, constants, helpers (no imports)
js/api.js                   worker calls, server-state sync, notes, peaks, upload
js/art.js                   50-algorithm 1-bit pixel-art generator (verbatim, do not touch)
js/waveform.js              pixel waveform renderer + peaks pipeline
js/player.js                playback, player UI, timed notes, A/B
js/songpage.js              song page overlay
js/screens/{archive,albums,vault,voice}.js
js/upload.js                drag-drop + XHR progress upload
js/main.js                  boot, tab routing, keyboard, help overlay
worker.js                   the Cloudflare Worker (single file)
```

Design law: two tokens only, hard offset shadows, square corners, dither-not-opacity,
inversion-not-highlight. Dither classes `.dither-25/-50/-75/-100` encode stage as texture everywhere.
