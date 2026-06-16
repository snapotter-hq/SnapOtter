---
layout: home

hero:
  name: "SnapOtter"
  text: "Self-Hosted File Toolkit"
  tagline: 157 tools for image, video, audio, PDF, and data processing. Resize, compress, convert, remove backgrounds, merge PDFs, trim videos, transcribe audio, and more. Fully offline.
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: API reference
      link: /api/rest

features:
  - title: 157 Tools, 5 Modalities
    details: "Image: resize, crop, compress, convert, watermark, collage, and more. Video: trim, crop, merge, compress, add subtitles. Audio: trim, normalize, convert, transcribe. PDF: merge, split, compress, watermark, OCR, redact. Data: CSV/JSON/XML conversion, ZIP archives, chart maker."
  - title: Local AI
    details: 19 AI-powered tools - remove backgrounds, upscale, enhance images, restore and colorize old photos, erase objects, blur faces, enhance faces, extract text (OCR), fix fake transparency, expand canvas with AI fill. All on your hardware, no internet required.
  - title: Pipelines
    details: Chain tools into reusable workflows with unlimited steps. Batch process unlimited files at once with a single request.
  - title: REST API
    details: Every tool available via API with API key auth. Interactive docs at /api/docs, plus /llms.txt and /llms-full.txt for AI agents.
  - title: File Library
    details: Persistent file storage with full version history. Every processing step is tracked so you can trace the full tool chain from original to final output.
  - title: Teams & Access Control
    details: Multi-user support with admin/user roles, team grouping, per-resource permissions, and audit logging for all sensitive actions.
---

<div class="quick-start-banner">

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

</div>
