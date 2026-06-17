<script setup lang="ts">
const command = "docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest";

const selfLinks = [
  { label: "Quick start", href: "/guide/getting-started#quick-start" },
  { label: "Configuration", href: "/guide/configuration" },
  { label: "Hardware & sizing", href: "/guide/deployment#hardware-requirements" },
  { label: "Database & backups", href: "/guide/database" },
  { label: "Docker tags & GPU", href: "/guide/docker-tags" },
  { label: "Supported formats", href: "/guide/supported-formats" },
];
const entLinks = [
  { label: "Architecture", href: "/guide/architecture" },
  { label: "Security & hardening", href: "/guide/security" },
  { label: "SSO · SAML · OIDC", href: "/guide/oidc" },
  { label: "SCIM provisioning", href: "/guide/scim" },
  { label: "Users, roles & audit", href: "/guide/users-roles" },
  { label: "Compliance & SBOM", href: "/guide/security#compliance-artifacts" },
];
const modalities = [
  { label: "Image", count: 64, href: "/tools/resize" },
  { label: "Video", count: 29, href: "/tools/convert-video" },
  { label: "Audio", count: 17, href: "/tools/convert-audio" },
  { label: "PDF", count: 37, href: "/tools/merge-pdf" },
  { label: "Data", count: 10, href: "/tools/chart-maker" },
];
const shared = [
  { label: "REST API", sub: "Keys, endpoints & OpenAPI", href: "/api/rest" },
  { label: "Changelog", sub: "What's new in 2.0", href: "/changelog" },
  { label: "llms.txt", sub: "AI-friendly docs", href: "/llms.txt" },
];

import { ref } from "vue";
const copyLabel = ref("Copy");
function copyCommand() {
  navigator.clipboard?.writeText(command);
  copyLabel.value = "Copied!";
  setTimeout(() => { copyLabel.value = "Copy"; }, 1500);
}
</script>

<template>
  <div class="so-home">
    <section class="hero">
      <p class="eyebrow">Self-hosted · Open source · AGPLv3</p>
      <h1 class="hero-title">SnapOtter Documentation</h1>
      <p class="hero-sub">
        <strong>157 tools</strong> for image, video, audio, PDF &amp; data, running entirely on your
        hardware. Choose your path below, or get running in one command:
      </p>
      <div class="cmd">
        <code>$ {{ command }}</code>
        <button class="copy" type="button" aria-label="Copy command" @click="copyCommand">{{ copyLabel }}</button>
      </div>
      <p class="hero-meta">
        <a href="/guide/getting-started">Full install guide</a> ·
        <a href="/guide/getting-started#docker-compose">GPU &amp; Compose setup</a> ·
        <a href="https://demo.snapotter.com">Try the live demo</a>
      </p>
    </section>

    <section class="doors">
      <div class="door self">
        <div class="door-head">
          <span class="door-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/></svg>
          </span>
          <h2>Self-hosting</h2>
        </div>
        <p class="door-sub">Get SnapOtter running and keep it healthy.</p>
        <ul class="door-links">
          <li v-for="l in selfLinks" :key="l.href"><a :href="l.href">{{ l.label }}</a></li>
        </ul>
        <a class="door-cta" href="/guide/getting-started">Start self-hosting →</a>
      </div>

      <div class="door ent">
        <div class="door-head">
          <span class="door-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-4"/></svg>
          </span>
          <h2>Enterprise</h2>
        </div>
        <p class="door-sub">Evaluate, secure &amp; govern your deployment.</p>
        <ul class="door-links">
          <li v-for="l in entLinks" :key="l.href"><a :href="l.href">{{ l.label }}</a></li>
        </ul>
        <a class="door-cta" href="/guide/architecture">Evaluate for your org →</a>
      </div>
    </section>

    <section class="mod">
      <p class="mod-head"><strong>157 tools across 5 modalities</strong> <span>browse the full reference by type</span></p>
      <div class="chips">
        <a v-for="m in modalities" :key="m.href" class="chip" :href="m.href">
          <span class="chip-label">{{ m.label }}</span>
          <span class="chip-count">{{ m.count }} tools</span>
        </a>
      </div>
    </section>

    <section class="shared">
      <a v-for="s in shared" :key="s.href" class="scard" :href="s.href">
        <strong>{{ s.label }}</strong>
        <span>{{ s.sub }}</span>
      </a>
    </section>
  </div>
</template>

<style scoped>
.so-home { max-width: 1080px; margin: 0 auto; padding: 16px 24px 64px; }
.hero { text-align: center; padding: 48px 16px 28px; }
.eyebrow { font: 600 11px/1 var(--vp-font-family-mono); letter-spacing: .16em; text-transform: uppercase; color: #A85518; margin-bottom: 14px; }
.hero-title { font-family: var(--so-font-heading); font-size: 42px; font-weight: 800; letter-spacing: -.03em; margin-bottom: 12px; }
.hero-sub { color: var(--vp-c-text-2); font-size: 17px; max-width: 60ch; margin: 0 auto 20px; }
.cmd { display: flex; gap: 14px; align-items: center; max-width: 680px; margin: 0 auto; background: #15100B; border: 1px solid #3A2A1E; border-radius: 10px; padding: 13px 16px; text-align: left; }
.cmd code { flex: 1; min-width: 0; font: 600 13.5px/1.5 var(--vp-font-family-mono); color: #FFD9B0; white-space: pre-wrap; overflow-wrap: anywhere; }
.copy { flex: none; font: 600 10.5px/1 var(--vp-font-family-mono); color: #cbb9a6; border: 1px solid #4a3a2c; border-radius: 6px; padding: 8px 11px; background: transparent; cursor: pointer; }
.hero-meta { margin-top: 12px; font-size: 13px; color: var(--vp-c-text-2); }
.hero-meta a { color: #A85518; font-weight: 600; }
.doors { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
.door { border: 1px solid var(--vp-c-border); border-radius: 16px; padding: 24px; transition: transform .15s, box-shadow .15s; }
.door:hover { transform: translateY(-3px); box-shadow: 0 22px 44px -26px rgba(20,12,4,.5); }
.door.self { background: linear-gradient(180deg, #FFF5ED, #fff); }
.door.ent { background: linear-gradient(165deg, #241A13, #15100B); color: #F0EBE4; border-color: #3A2A1E; }
.door-head { display: flex; align-items: center; gap: 12px; margin-bottom: 6px; }
.door-icon { width: 40px; height: 40px; border-radius: 11px; display: flex; align-items: center; justify-content: center; flex: none; }
.door.self .door-icon { background: #E07832; color: #fff; }
.door.ent .door-icon { background: #3A2A1E; color: #F09550; }
.door-head h2 { font-family: var(--so-font-heading); font-size: 22px; font-weight: 700; border: 0; padding: 0; margin: 0; }
.door-sub { font-size: 13.5px; margin-bottom: 18px; }
.door.self .door-sub { color: var(--vp-c-text-2); }
.door.ent .door-sub { color: #C9BCAE; }
.door-links { display: grid; grid-template-columns: 1fr 1fr; gap: 0 18px; list-style: none; margin: 0 0 20px; padding: 0; }
.door-links li { border-bottom: 1px solid; padding: 0; }
.door.self .door-links li { border-color: #EBDDCC; }
.door.ent .door-links li { border-color: #3A2C20; }
.door-links a { display: block; padding: 10px 2px; font-size: 13.5px; font-weight: 500; text-decoration: none; color: inherit; }
.door.self .door-links a:hover { color: #A85518; }
.door.ent .door-links a:hover { color: #F09550; }
.door-cta { display: inline-flex; align-items: center; gap: 8px; font-weight: 600; font-size: 13.5px; padding: 11px 18px; border-radius: 10px; text-decoration: none; }
.door.self .door-cta { background: #A85518; color: #fff; }
.door.ent .door-cta { background: #F09550; color: #231A12; }
.mod { padding: 28px 0 6px; }
.mod-head { margin-bottom: 13px; }
.mod-head strong { font-family: var(--so-font-heading); font-size: 15px; }
.mod-head span { font-size: 12.5px; color: var(--vp-c-text-2); margin-left: 8px; }
.chips { display: grid; grid-template-columns: repeat(5, 1fr); gap: 11px; }
.chip { display: flex; flex-direction: column; gap: 2px; border: 1px solid var(--vp-c-border); border-radius: 11px; padding: 12px 13px; text-decoration: none; transition: border-color .15s, transform .15s; }
.chip:hover { border-color: #E07832; transform: translateY(-2px); }
.chip-label { font-size: 12.5px; font-weight: 600; color: var(--vp-c-text-1); }
.chip-count { font: 700 12px/1 var(--vp-font-family-mono); color: #A85518; }
.shared { display: grid; grid-template-columns: repeat(3, 1fr); gap: 13px; padding: 18px 0 0; }
.scard { display: flex; flex-direction: column; gap: 2px; border: 1px solid var(--vp-c-border); border-radius: 12px; padding: 14px 15px; text-decoration: none; transition: border-color .15s, transform .15s; }
.scard:hover { border-color: #E07832; transform: translateY(-2px); }
.scard strong { font-family: var(--so-font-heading); font-size: 13.5px; color: var(--vp-c-text-1); }
.scard span { font-size: 11.5px; color: var(--vp-c-text-2); }

:root.dark .chip-label, :root.dark .scard strong { color: var(--vp-c-text-1); }
:root.dark .door.self { background: linear-gradient(180deg, #2A1F16, #221A13); border-color: #3A2C20; color: #F0EBE4; }
:root.dark .door.self .door-links li { border-color: #3A2C20; }
:root.dark .chip-count { color: #F0A766; }
:root.dark .hero-meta a, :root.dark .eyebrow { color: #F0A766; }
:root.dark .door.self .door-sub { color: #C9BCAE; }
:root.dark .door.self .door-links a:hover { color: #F09550; }
:root.dark .door.self .door-cta { background: #A85518; }

@media (max-width: 840px) {
  .doors, .shared { grid-template-columns: 1fr; }
  .chips { grid-template-columns: repeat(2, 1fr); }
}
</style>
