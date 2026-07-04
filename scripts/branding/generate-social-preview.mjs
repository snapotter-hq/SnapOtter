// Generates branding/social-preview.png (1280x640) -- the SnapOtter social/OG card.
// Echoes the landing hero: trust badges, the "Every file tool you need / Your files
// never leave your network" headline, the supporting subhead, and the five modality
// cards. Rendered from HTML with the real brand fonts via headless Chromium.
// Run (tsx, because it imports the shared TS catalog for live tool counts):
//   apps/api/node_modules/.bin/tsx scripts/branding/generate-social-preview.mjs
//
// The same output is the canonical OG image; sync it to apps/landing/public/og-image.png
// and apps/web/public/og-image.png (see scripts/branding/sync-og.sh).

import { rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
// Relative import (not the "@snapotter/shared" specifier) so the script runs
// from the repo root under tsx without the workspace symlink on the resolve path.
import { TOOLS, toolSection } from "../../packages/shared/src/index.ts";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const out = resolve(repoRoot, "branding/social-preview.png");
// Temp HTML lives in branding/ so the page origin is file:// and can load the
// sibling logo and the ../apps fonts as file:// subresources.
const htmlPath = resolve(repoRoot, "branding/.og.html");

// Trust badges (subset of Hero.astro's trustBadges list).
const BADGES = ["Self-hosted", "Privacy-sensitive", "Compliance-friendly", "Air-gap capable", "Open source"];

// lucide icon inner-SVG (stroke), matching the icons used in CategoryCards.astro.
const ICON = {
  image:
    '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
  video:
    '<path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"/><rect x="2" y="6" width="14" height="12" rx="2"/>',
  music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  fileText:
    '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/>',
  database:
    '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/>',
};

// Mirrors CategoryCards.astro (label/blurb/color/icon). Counts are derived live
// from toolSection() over the shared TOOLS catalog -- same source the landing
// cards use -- so the card never drifts as tools are added.
const sectionCount = (section) => TOOLS.filter((t) => toolSection(t) === section).length;
const CARDS = [
  {
    label: "Image Tools",
    count: sectionCount("image"),
    blurb: "Resize, convert, and enhance",
    color: "#E07832",
    icon: ICON.image,
  },
  {
    label: "Video Tools",
    count: sectionCount("video"),
    blurb: "Trim, convert, and caption",
    color: "#BE4A3C",
    icon: ICON.video,
  },
  {
    label: "Audio Tools",
    count: sectionCount("audio"),
    blurb: "Convert, trim, and transcribe",
    color: "#2C7A75",
    icon: ICON.music,
  },
  {
    label: "PDF & Documents",
    count: sectionCount("pdf"),
    blurb: "Merge, split, and convert",
    color: "#44568C",
    icon: ICON.fileText,
  },
  {
    label: "File Tools",
    count: sectionCount("files"),
    blurb: "Convert and transform",
    color: "#5C8642",
    icon: ICON.database,
  },
];
const total = CARDS.reduce((s, c) => s + c.count, 0);

const badgesHtml = BADGES.map(
  (b) =>
    `<span class="badge"><svg class="chk" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>${b}</span>`,
).join("");

const cardsHtml = CARDS.map(
  (c) => `<div class="card" style="background:${c.color}">
  <div class="card-top">
    <span class="card-icon"><svg viewBox="0 0 24 24">${c.icon}</svg></span>
    <span class="card-pill">${c.count} tools</span>
  </div>
  <div class="card-label">${c.label}</div>
  <div class="card-blurb">${c.blurb}</div>
</div>`,
).join("");

const html = `<!doctype html><html><head><meta charset="utf-8"/><style>
@font-face{font-family:'Bricolage Grotesque';src:url('../apps/landing/public/fonts/bricolage-grotesque-var.woff2') format('woff2');font-weight:200 800;font-display:block}
@font-face{font-family:'Instrument Sans';src:url('../apps/landing/public/fonts/instrument-sans-400.woff2') format('woff2');font-weight:400;font-display:block}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1280px;height:640px}
.canvas{position:relative;width:1280px;height:640px;overflow:hidden;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px 30px;
  font-family:'Instrument Sans',system-ui,sans-serif;
  background:
    radial-gradient(60% 55% at 13% 8%, rgba(224,120,50,.10), transparent 62%),
    radial-gradient(55% 55% at 88% 94%, rgba(68,86,140,.08), transparent 60%),
    linear-gradient(158deg,#FFFFFF 0%,#FAFAF7 48%,#F3EEE6 100%)}
.brand{display:flex;align-items:center;gap:15px}
.brand img{width:56px;height:56px}
.brand .wm{font-family:'Bricolage Grotesque',system-ui,sans-serif;font-weight:800;font-size:46px;letter-spacing:-1px;color:#1A1814}
.brand .wm .o{color:#E07832}
.brand .pill{margin-left:4px;align-self:center;border-radius:999px;background:#FFF1E6;border:1px solid rgba(224,120,50,.30);color:#C06520;font-weight:700;font-size:16px;padding:6px 14px;letter-spacing:.2px}
.badges{display:flex;flex-wrap:wrap;justify-content:center;gap:9px;margin-top:20px}
.badge{display:inline-flex;align-items:center;gap:6px;border-radius:999px;border:1px solid rgba(224,120,50,.22);background:rgba(224,120,50,.06);padding:5px 13px;font-size:14px;font-weight:500;color:#C06520}
.badge .chk{width:13px;height:13px;stroke:#C06520;stroke-width:2.5;fill:none;stroke-linecap:round;stroke-linejoin:round}
.headline{margin-top:22px;text-align:center;font-family:'Bricolage Grotesque',system-ui,sans-serif;font-weight:800;font-size:58px;line-height:1.04;letter-spacing:-1.4px;color:#1A1814}
.headline .f{color:#E07832}
.headline .hl2{display:block;margin-top:12px;font-size:32px;font-weight:700;letter-spacing:-.5px;
  background:linear-gradient(90deg,#E07832,#F09550);-webkit-background-clip:text;background-clip:text;color:transparent}
.subhead{margin-top:15px;font-size:20px;color:#6B6560;text-align:center;max-width:760px}
.cards{display:flex;gap:16px;margin-top:30px}
.card{width:230px;border-radius:20px;padding:20px;color:#fff;display:flex;flex-direction:column;box-shadow:0 9px 22px rgba(26,18,16,.13)}
.card-top{display:flex;align-items:center;justify-content:space-between}
.card-icon{display:flex;align-items:center;justify-content:center;width:42px;height:42px;border-radius:11px;background:rgba(255,255,255,.20)}
.card-icon svg{width:23px;height:23px;stroke:#fff;stroke-width:2;fill:none;stroke-linecap:round;stroke-linejoin:round}
.card-pill{background:rgba(255,255,255,.20);border-radius:999px;padding:3px 12px;font-size:13px;font-weight:600}
.card-label{font-family:'Bricolage Grotesque',system-ui,sans-serif;font-weight:700;font-size:20px;line-height:1.1;margin-top:34px}
.card-blurb{font-size:14px;color:rgba(255,255,255,.84);margin-top:6px}
</style></head><body><div class="canvas">
<div class="brand"><img src="logo-512.png" alt=""/><span class="wm">Snap<span class="o">Otter</span></span><span class="pill">${total} tools</span></div>
<div class="badges">${badgesHtml}</div>
<div class="headline">Every <span class="f">file</span> tool you need.<span class="hl2">Your files never leave your network.</span></div>
<div class="subhead">The file-processing suite for teams that keep sensitive data in-house.</div>
<div class="cards">${cardsHtml}</div>
</div></body></html>`;

writeFileSync(htmlPath, html);
try {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 640 } });
  const page = await ctx.newPage();
  await page.goto("file://" + htmlPath, { waitUntil: "load" });
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await page.waitForTimeout(150);
  await page.screenshot({ path: out });
  await browser.close();
  console.log("wrote " + out);
} finally {
  rmSync(htmlPath, { force: true });
}
