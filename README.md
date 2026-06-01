# 📻 millo-archive

Retro 1-bit music player and personal audio archive.

Live Player: [millo-band.github.io/millo-archive](https://millo-band.github.io/millo-archive/)

---

## ⚙️ Cloudflare Configuration

### 1. R2 CORS Policy
Paste this directly into your Cloudflare R2 bucket settings so the browser doesn't block your audio streams:

```json
[
  {
    "AllowedOrigins": [
      "[https://millo-band.github.io](https://millo-band.github.io)",
      "http://localhost:5500"
    ],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["*"]
  }
]
