<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>MILLO — ARCHIVE README</title>
  
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&family=IBM+Plex+Mono:wght@400;500;700&display=swap" rel="stylesheet" />

  <style>
    :root {
      --pink: #FF91AF;
      --black: #000000;
      --border: 2px solid var(--black);
      --shadow: 4px 4px 0px var(--black);
      --shadow-lg: 6px 6px 0px var(--black);
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      background-color: var(--pink);
      color: var(--black);
      font-family: 'IBM Plex Mono', monospace;
      padding: 40px 20px;
      line-height: 1.6;
      -webkit-font-smoothing: antialiased;
    }

    .container {
      max-width: 800px;
      margin: 0 auto;
    }

    /* ══ HEADER ══════════════════════════════════ */
    header {
      background: var(--pink);
      border: var(--border);
      box-shadow: var(--shadow-lg);
      padding: 30px;
      margin-bottom: 40px;
      position: relative;
    }

    .header-top {
      display: flex;
      align-items: center;
      gap: 15px;
      margin-bottom: 15px;
    }

    .pixel-logo {
      width: 48px;
      height: 48px;
      background: var(--black);
      border: 2px solid var(--pink);
      outline: 2px solid var(--black);
      flex-shrink: 0;
      display: grid;
      grid-template-columns: repeat(8, 1fr);
      padding: 4px;
    }

    /* Little procedural 1-bit glyph layout */
    .pixel-logo::before {
      content: '';
      grid-column: 2 / 8;
      grid-row: 2 / 8;
      background-color: var(--pink);
      border: 4px double var(--black);
    }

    .site-title {
      font-family: 'Press Start 2P', monospace;
      font-size: 28px;
      line-height: 1.1;
      text-transform: uppercase;
    }

    .site-sub {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.3em;
      opacity: 0.7;
      text-transform: uppercase;
      margin-top: 5px;
    }

    .tagline {
      font-size: 13px;
      margin-top: 15px;
      padding-top: 15px;
      border-top: 1px dashed var(--black);
    }

    .demo-btn {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      margin-top: 20px;
      font-family: 'Press Start 2P', monospace;
      font-size: 10px;
      background: var(--black);
      color: var(--pink);
      border: var(--border);
      padding: 12px 18px;
      text-decoration: none;
      box-shadow: var(--shadow);
      cursor: pointer;
      transition: transform 0.1s, box-shadow 0.1s;
    }

    .demo-btn:active {
      transform: translate(3px, 3px);
      box-shadow: none;
    }

    /* ══ SECTIONS ════════════════════════════════ */
    section {
      background: var(--pink);
      border: var(--border);
      box-shadow: var(--shadow);
      padding: 30px;
      margin-bottom: 30px;
    }

    h2 {
      font-family: 'Press Start 2P', monospace;
      font-size: 14px;
      letter-spacing: 0.05em;
      margin-bottom: 25px;
      display: flex;
      align-items: center;
      gap: 12px;
      border-bottom: 2px solid var(--black);
      padding-bottom: 10px;
    }

    h3 {
      font-size: 14px;
      font-weight: 700;
      margin: 20px 0 10px;
      text-transform: uppercase;
    }

    /* ══ FEATURES GRID ══════════════════════════ */
    .features-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 20px;
    }

    @media (min-width: 640px) {
      .features-grid {
        grid-template-columns: 1fr 1fr;
      }
    }

    .feature-card {
      border: 1px dashed var(--black);
      padding: 20px;
      background: rgba(0, 0, 0, 0.02);
    }

    .feature-title {
      font-weight: 700;
      font-size: 13px;
      margin-bottom: 8px;
      display: flex;
      align-items: center;
      gap: 8px;
      text-transform: uppercase;
    }

    .feature-title::before {
      content: '■';
      font-size: 10px;
    }

    .feature-desc {
      font-size: 12px;
      opacity: 0.85;
    }

    /* ══ CODE BLOCKS ════════════════════════════ */
    pre {
      background: var(--black);
      color: var(--pink);
      padding: 20px;
      font-family: 'IBM Plex Mono', monospace;
      font-size: 12px;
      overflow-x: auto;
      border: var(--border);
      box-shadow: inset 0 0 10px rgba(0,0,0,0.5);
      margin: 15px 0;
    }

    code {
      font-family: 'IBM Plex Mono', monospace;
      background: rgba(0, 0, 0, 0.1);
      padding: 2px 6px;
      font-size: 12px;
      font-weight: bold;
    }

    pre code {
      background: none;
      padding: 0;
      font-weight: normal;
    }

    /* ══ LISTS ══════════════════════════════════ */
    ul {
      list-style: none;
      padding-left: 0;
    }

    li {
      margin-bottom: 12px;
      position: relative;
      padding-left: 20px;
      font-size: 13px;
    }

    li::before {
      content: '►';
      position: absolute;
      left: 0;
      top: 2px;
      font-size: 10px;
    }

    /* ══ AESTHETICS CHIPS ═══════════════════════ */
    .aesthetic-spec {
      display: flex;
      flex-direction: column;
      gap: 15px;
    }

    .spec-item {
      display: flex;
      align-items: center;
      gap: 15px;
      border: 1px solid var(--black);
      padding: 10px 15px;
    }

    .color-chip {
      width: 40px;
      height: 40px;
      border: var(--border);
      box-shadow: var(--shadow);
      flex-shrink: 0;
    }

    .color-chip.pink { background-color: #FF91AF; }
    .color-chip.black { background-color: #000000; }

    .font-sample {
      font-size: 13px;
    }
    
    .font-sample.header-font {
      font-family: 'Press Start 2P', monospace;
      font-size: 10px;
    }

    .font-sample.body-font {
      font-family: 'IBM Plex Mono', monospace;
      font-weight: bold;
    }
  </style>
</head>
<body>

  <div class="container">

    <!-- ══ HEADER ══════════════════════════════════ -->
    <header>
      <div class="header-top">
        <div class="pixel-logo"></div>
        <div>
          <h1 class="site-title">Millo Archive</h1>
          <div class="site-sub">Technical Documentation</div>
        </div>
      </div>
      <p class="tagline">
        A high-fidelity personal music archive and audio player featuring a retro, dithered 1-bit pixel aesthetic. Powered dynamically by <strong>Cloudflare Workers</strong>, <strong>Cloudflare R2 storage</strong>, and <strong>Workers KV</strong>.
      </p>
      <a href="https://millo-band.github.io/millo-archive/" class="demo-btn" target="_blank">
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style="display:inline-block; vertical-align:middle; margin-right:4px;">
          <path d="M1 4h8M6 1l3 3-3 3M15 12H7M10 9l3 3-3 3M1 12h2a4 4 0 0 1 4-4" stroke="currentColor" stroke-width="2" stroke-linecap="square"/>
        </svg>
        Launch Live Demo
      </a>
    </header>

    <!-- ══ FEATURES ════════════════════════════════ -->
    <section>
      <h2>⚡ Key Features</h2>
      <div class="features-grid">
        <div class="feature-card">
          <div class="feature-title">Procedural 1-Bit Pixel Art</div>
          <div class="feature-desc">
            Dynamically generates unique, high-contrast, dithered cover art (totems, masks, geometric patterns) using the track title as a deterministic random seed. The same song always displays its own signature artwork!
          </div>
        </div>
        
        <div class="feature-card">
          <div class="feature-title">Gmail-Style Desktop Player</div>
          <div class="feature-desc">
            On desktop layouts, the media controller shrinks into a compact, floating picture-in-picture widget in the bottom-right corner, leaving your notes fully readable. On mobile, it expands smoothly to a full-screen drawer.
          </div>
        </div>

        <div class="feature-card">
          <div class="feature-title">Lock Screen Integration</div>
          <div class="feature-desc">
            Feeds the procedurally generated artwork directly to your iOS/Android native lock screen and media widgets via the Media Session API.
          </div>
        </div>

        <div class="feature-card">
          <div class="feature-title">Dynamic Version Grouping</div>
          <div class="feature-desc">
            Automatically groups and stacks alternate mix versions (<code>v1</code>, <code>v2</code>, etc.) and multi-tag track uploads under a single card with an expandable version history drawer.
          </div>
        </div>

        <div class="feature-card">
          <div class="feature-title">Notes Persistence</div>
          <div class="feature-desc">
            Instantly save production notes, lyric scraps, and mix critiques directly to the player dashboard, saved automatically to Cloudflare KV.
          </div>
        </div>

        <div class="feature-card">
          <div class="feature-title">Fast Global Streaming</div>
          <div class="feature-desc">
            Streams audio directly from Cloudflare R2 edge locations with zero latency.
          </div>
        </div>
      </div>
    </section>

    <!-- ══ REPOSITORY ARCHITECTURE ═════════════════ -->
    <section>
      <h2>🛠️ Repository Architecture</h2>
      <p style="font-size:13px; margin-bottom:15px;">Your files must remain structured exactly like this at your project root directory:</p>
      <pre>millo-archive/
├── index.html            # Core typographic interface layout
├── style.css             # Pink & black retro theme & responsive layouts
├── app.js                # Local storage, canvas rendering, & playback systems
├── worker.js             # Cloudflare Worker code for listings & KV updates
├── apple-touch-icon.png  # Web App icon
├── og-image.png          # Embed preview graphic
└── README.md             # Standard project description</pre>
    </section>

    <!-- ══ BACKEND SETUP ═══════════════════════════ -->
    <section>
      <h2>⚙️ Backend Setup & Configuration</h2>
      
      <h3>1. Cloudflare R2 CORS Policy</h3>
      <p style="font-size:13px; margin-bottom:10px;">To allow your web application to request, parse metadata, and play back high-quality audio files from your R2 buckets without browser blocks, add the following CORS policy to your bucket's settings:</p>
      <pre>[
  {
    "AllowedOrigins": [
      "https://millo-band.github.io",
      "http://localhost:5500"
    ],
    "AllowedMethods": [
      "GET",
      "HEAD"
    ],
    "AllowedHeaders": [
      "*"
    ],
    "ExposeHeaders": [],
    "MaxAgeSeconds": 3000
  }
]</pre>

      <h3>2. Cloudflare Worker KV Bindings</h3>
      <p style="font-size:13px; margin-bottom:10px;">Ensure your Cloudflare Worker (<code>worker.js</code>) has the following bindings declared under your dashboard variables:</p>
      <ul>
        <li><strong>KV Namespace Binding:</strong> <code>MILLO_NOTES</code> mapped to a valid Cloudflare KV Namespace.</li>
        <li><strong>R2 Bucket Binding:</strong> <code>MILLO_BUCKET</code> mapped directly to your audio storage bucket.</li>
      </ul>
    </section>

    <!-- ══ AESTHETICS ══════════════════════════════ -->
    <section>
      <h2>🎨 Aesthetic Specification</h2>
      <div class="aesthetic-spec">
        <div class="spec-item">
          <div class="color-chip pink"></div>
          <div>
            <strong>Background Theme Color</strong><br/>
            <code>#FF91AF</code> (Classic retro-synth pink)
          </div>
        </div>

        <div class="spec-item">
          <div class="color-chip black"></div>
          <div>
            <strong>Primary Contrast Color</strong><br/>
            <code>#000000</code> (Pure black dither pixels & solid borders)
          </div>
        </div>

        <div class="spec-item">
          <div class="font-sample header-font">MILLO</div>
          <div>
            <strong>Headers Typography</strong><br/>
            <code>'Press Start 2P'</code> (Chunky 8-bit visual markers)
          </div>
        </div>

        <div class="spec-item">
          <div class="font-sample body-font">ARCHIVE v10</div>
          <div>
            <strong>Interface Label Typography</strong><br/>
            <code>'IBM Plex Mono'</code> (Clean terminal-style layout labels)
          </div>
        </div>
      </div>
    </section>

  </div>

</body>
</html>
