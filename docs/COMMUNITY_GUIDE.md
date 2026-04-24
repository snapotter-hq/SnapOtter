# Community Guide — GitHub Discussions Setup

This document contains the category structure, pinned Welcome post, and seed
post ideas for the SnapOtter GitHub Discussions.

---

## Discussion Categories

Create these 5 categories in **Settings → Discussions → Categories** on GitHub.

| Category | Format | Description |
|----------|--------|-------------|
| **General** | Open | Announcements, project updates, and casual conversation about SnapOtter. Pinned Welcome post lives here. |
| **Q&A** | Question / Answer | Ask for help with image processing, tool behavior, or unexpected results. Mark accepted answers so others can find solutions quickly. |
| **Ideas** | Open | Suggest new tools, improvements to existing features, or workflow changes. Upvote ideas you want to see prioritized. |
| **Show & Tell** | Open | Share your SnapOtter setup — screenshots of pipelines, Docker Compose configs, automation scripts using the REST API, before/after results. |
| **Self-Hosting Help** | Question / Answer | Docker, reverse proxy, storage, networking, multi-arch, and environment configuration. If your question is about getting SnapOtter running rather than using its tools, post here. |

### Why these categories

- **Q&A vs Self-Hosting Help** — Separating "how do I use the resize tool" from
  "how do I get SnapOtter behind Caddy" keeps both channels useful. Self-hosters
  and image-tool users are often different people with different expertise.
- **Show & Tell** — Pipeline sharing/export isn't built into the app yet, so
  this category is the place to describe your workflows with screenshots and
  step lists. When export lands, this becomes the natural home for shared
  pipeline files.
- **Ideas over Issues** — Feature requests in Discussions get community
  upvotes and discussion before becoming actionable Issues.

---

## Pinned Welcome Post

> **Title:** Welcome to SnapOtter Discussions
>
> **Category:** General
>
> ---
>
> Thanks for joining the SnapOtter community. This is the place to ask questions,
> suggest features, and share what you're building with SnapOtter.
>
> **Where to post:**
>
> | I want to... | Post in |
> |---|---|
> | Ask how to use a tool or fix unexpected output | [Q&A] |
> | Get help with Docker, reverse proxies, or deployment | [Self-Hosting Help] |
> | Suggest a new feature or improvement | [Ideas] |
> | Show off my setup, pipeline, or results | [Show & Tell] |
> | Report a bug | [GitHub Issues](https://github.com/snapotter-hq/snapotter/issues/new/choose) |
> | Report a security vulnerability | [Security Advisories](https://github.com/snapotter-hq/snapotter/security/advisories/new) |
>
> **A few ground rules:**
>
> - Search before posting — your question may already have an answer.
> - In Q&A and Self-Hosting Help, mark the reply that solved your problem so
>   others can find it.
> - Keep it constructive. We follow the
>   [Code of Conduct](https://github.com/snapotter-hq/snapotter/blob/main/CODE_OF_CONDUCT.md).
>
> If you're new to SnapOtter, the
> [documentation](https://github.com/snapotter-hq/snapotter#readme) is the best
> starting point.

---

## Seed Posts

Two posts you can publish yourself to get early activity in the community.

### Seed Post 1 — Self-Hosting Help

> **Title:** What's your SnapOtter deployment setup?
>
> **Category:** Self-Hosting Help
>
> I'm curious how everyone is running SnapOtter. A few things I'd love to hear
> about:
>
> - Are you running it on a NAS, a VPS, or a home server?
> - What reverse proxy are you using (Traefik, Caddy, nginx)?
> - Have you enabled the AI features, and if so, how much RAM/VRAM does your
>   setup have?
>
> I'll go first — I run SnapOtter on [describe your own setup here] with
> [reverse proxy] in front. The AI sidecar uses about [X] GB of RAM on my
> machine.

### Seed Post 2 — Show & Tell

> **Title:** Share your favorite pipeline
>
> **Category:** Show & Tell
>
> Pipelines let you chain multiple image tools together and run them in one
> pass. I'd love to see what workflows people are building.
>
> Since there's no export button yet, just describe your steps or post a
> screenshot of your pipeline builder. Here's one of mine:
>
> **"Blog image prep"** — 4 steps:
> 1. Resize (max width 1200px)
> 2. Convert to WebP (quality 85)
> 3. Strip metadata
> 4. Compress (target 200 KB)
>
> What does yours look like?
