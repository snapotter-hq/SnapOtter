---
layout: home

hero:
  name: "SnapOtter"
  text: "Self-Hosted File Manipulation Suite"
  tagline: 157 tools across image, video, audio, PDF, and data. Docker Compose stack, fully offline, GPU-optional.
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: API reference
      link: /api/rest

features:
  - title: 157 Tools, 5 Modalities
    details: Image, video, audio, PDF, and data processing. Resize, convert, compress, watermark, trim, merge, transcribe, OCR, and much more.
  - title: Local AI
    details: 19 AI-powered tools - remove backgrounds, upscale, enhance images, restore and colorize old photos, erase objects, blur faces, enhance faces, extract text (OCR), transcribe audio, fix fake transparency, expand canvas with AI fill. All on your hardware, no internet required.
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
docker compose up -d    # app + Postgres 17 + Redis 8
```

</div>
