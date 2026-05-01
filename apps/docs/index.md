---
layout: home

hero:
  name: "SnapOtter"
  text: "A Self Hosted Image Manipulator"
  tagline: 47 tools. Local AI. No cloud. Your images stay on your machine.
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: API reference
      link: /api/rest

features:
  - title: 47 Image Tools
    details: Resize, crop, compress, convert, watermark, color adjust, vectorize, create GIFs, build collages, generate passport photos, find duplicates, and more.
  - title: Local AI
    details: 14 AI-powered tools - remove backgrounds, upscale, enhance images, restore and colorize old photos, erase objects, blur faces, enhance faces, extract text (OCR). All on your hardware, no internet required.
  - title: Pipelines
    details: Chain tools into reusable workflows with unlimited steps. Batch process unlimited images at once with a single request.
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
