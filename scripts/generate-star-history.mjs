#!/usr/bin/env node
// Generates a self-contained star-history SVG for the README from the repo's own
// stargazer timeline. GitHub restricted the public stargazers API to a repo's own
// admins/collaborators (June 2026), which broke the hosted api.star-history.com badge
// for everyone. Running here with the repo's GITHUB_TOKEN reads its own stars, so no
// third-party service and no rate-limited shared token pool. Pure Node, no deps.
//
// Env:
//   GITHUB_TOKEN / GH_TOKEN   token with read access to the repo (Actions default works)
//   STAR_HISTORY_REPO         "owner/repo" (default snapotter-hq/SnapOtter)
//   STAR_HISTORY_OUT          output path (default branding/star-history.svg)

import { writeFileSync } from "node:fs";

const REPO = process.env.STAR_HISTORY_REPO ?? "snapotter-hq/SnapOtter";
const OUT = process.env.STAR_HISTORY_OUT ?? "branding/star-history.svg";
const TOKEN = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? "";

// Otter palette (dark theme), mirrored from apps/landing globals.css.
const COLOR = {
  bg: "#1A1210",
  panel: "#241a15",
  grid: "#33271f",
  line: "#E07832",
  lineSoft: "#F09550",
  text: "#F0EBE4",
  muted: "#9a8b7d",
};

const WIDTH = 800;
const HEIGHT = 480;
const M = { top: 74, right: 30, bottom: 54, left: 70 };
const plotW = WIDTH - M.left - M.right;
const plotH = HEIGHT - M.top - M.bottom;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const nf = new Intl.NumberFormat("en-US");

async function fetchStarredAt() {
  if (!TOKEN) throw new Error("GITHUB_TOKEN (or GH_TOKEN) is required");
  const times = [];
  for (let page = 1; page <= 400; page++) {
    const url = `https://api.github.com/repos/${REPO}/stargazers?per_page=100&page=${page}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        Accept: "application/vnd.github.star+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "snapotter-star-history",
      },
    });
    if (!res.ok) {
      throw new Error(`GitHub API ${res.status} ${res.statusText}: ${await res.text()}`);
    }
    const batch = await res.json();
    if (!Array.isArray(batch) || batch.length === 0) break;
    for (const item of batch) {
      if (item?.starred_at) times.push(Date.parse(item.starred_at));
    }
    if (batch.length < 100) break;
  }
  times.sort((a, b) => a - b);
  return times;
}

// Loose "nice" number for axis ticks (Heckbert).
function niceNum(range, round) {
  const exp = Math.floor(Math.log10(range));
  const frac = range / 10 ** exp;
  let nice;
  if (round) nice = frac < 1.5 ? 1 : frac < 3 ? 2 : frac < 7 ? 5 : 10;
  else nice = frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 5 ? 5 : 10;
  return nice * 10 ** exp;
}

function yTicks(max) {
  const target = 5;
  const spacing = niceNum(Math.max(max, 1) / (target - 1), true);
  const niceMax = Math.ceil(max / spacing) * spacing;
  const ticks = [];
  for (let v = 0; v <= niceMax + 1e-9; v += spacing) ticks.push(Math.round(v));
  return { ticks, niceMax };
}

const fmtMonth = (d) => `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;

// Ticks on month boundaries, anchored at the first star, thinned to <= 8 for old
// repos. Avoids the duplicate "Apr 2026 / Apr 2026" that evenly-spaced ticks produce
// on a short span, and never crowds a label against either end.
function xTicks(min, max) {
  const range = max - min;
  const minGap = range * 0.06;
  const first = new Date(min);
  const ticks = [{ t: min, label: fmtMonth(first) }];
  let d = Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 1);
  while (d <= max - minGap) {
    const dd = new Date(d);
    if (d - min >= minGap) ticks.push({ t: d, label: fmtMonth(dd) });
    d = Date.UTC(dd.getUTCFullYear(), dd.getUTCMonth() + 1, 1);
  }
  const maxTicks = 8;
  if (ticks.length > maxTicks) {
    const step = Math.ceil(ticks.length / maxTicks);
    const thinned = ticks.filter((_, i) => i % step === 0);
    const lastGen = ticks[ticks.length - 1];
    if (thinned[thinned.length - 1] !== lastGen) thinned.push(lastGen);
    return thinned;
  }
  return ticks;
}

// Even-index sample of the cumulative curve so the SVG stays small and smooth.
function samplePoints(times, maxPoints) {
  const n = times.length;
  const pts = [];
  if (n === 0) return pts;
  const step = Math.max(1, Math.ceil(n / maxPoints));
  for (let i = 0; i < n; i += step) pts.push({ t: times[i], y: i + 1 });
  pts.push({ t: times[n - 1], y: n }); // real last star
  pts.push({ t: Date.now(), y: n }); // extend the line to today
  return pts;
}

function esc(s) {
  return String(s).replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c]);
}

function render(times) {
  const n = times.length;
  const xMin = times[0];
  const xMax = Date.now();
  const { ticks: yt, niceMax } = yTicks(n);
  const xt = xTicks(xMin, xMax);
  const pts = samplePoints(times, 60);

  const xPx = (t) => M.left + ((t - xMin) / (xMax - xMin)) * plotW;
  const yPx = (v) => M.top + plotH - (v / niceMax) * plotH;
  const baseline = M.top + plotH;

  const linePts = pts.map((p) => `${xPx(p.t).toFixed(1)},${yPx(p.y).toFixed(1)}`).join(" ");
  const areaD =
    `M ${xPx(pts[0].t).toFixed(1)},${baseline.toFixed(1)} ` +
    pts.map((p) => `L ${xPx(p.t).toFixed(1)},${yPx(p.y).toFixed(1)}`).join(" ") +
    ` L ${xPx(pts[pts.length - 1].t).toFixed(1)},${baseline.toFixed(1)} Z`;

  const gridLines = yt
    .map((v) => {
      const y = yPx(v).toFixed(1);
      return (
        `<line x1="${M.left}" y1="${y}" x2="${M.left + plotW}" y2="${y}" stroke="${COLOR.grid}" stroke-width="1"/>` +
        `<text x="${M.left - 10}" y="${y}" fill="${COLOR.muted}" font-size="12" text-anchor="end" dominant-baseline="middle">${nf.format(v)}</text>`
      );
    })
    .join("\n    ");

  const xLabels = xt
    .map((tk) => {
      const x = xPx(tk.t).toFixed(1);
      return `<text x="${x}" y="${baseline + 22}" fill="${COLOR.muted}" font-size="12" text-anchor="middle">${tk.label}</text>`;
    })
    .join("\n    ");

  const last = pts[pts.length - 1];
  const lastX = xPx(last.t);
  const lastY = yPx(last.y);
  const fontStack = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" font-family="${fontStack}" role="img" aria-label="Star history for ${esc(REPO)}: ${nf.format(n)} stars">
  <defs>
    <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${COLOR.line}" stop-opacity="0.28"/>
      <stop offset="100%" stop-color="${COLOR.line}" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect x="0.5" y="0.5" width="${WIDTH - 1}" height="${HEIGHT - 1}" rx="14" fill="${COLOR.bg}" stroke="${COLOR.grid}"/>
  <text x="${M.left - 0}" y="34" fill="${COLOR.text}" font-size="19" font-weight="700">${esc(REPO)}</text>
  <text x="${M.left - 0}" y="54" fill="${COLOR.muted}" font-size="13">Star history</text>
  <g>
    <circle cx="${WIDTH - M.right - 96}" cy="30" r="4.5" fill="${COLOR.line}"/>
    <text x="${WIDTH - M.right - 84}" y="34" fill="${COLOR.muted}" font-size="13">GitHub stars</text>
  </g>
  <g>
    ${gridLines}
  </g>
  <path d="${areaD}" fill="url(#area)"/>
  <polyline points="${linePts}" fill="none" stroke="${COLOR.line}" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>
  <circle cx="${lastX.toFixed(1)}" cy="${lastY.toFixed(1)}" r="4.5" fill="${COLOR.line}" stroke="${COLOR.bg}" stroke-width="1.5"/>
  <text x="${(lastX - 8).toFixed(1)}" y="${(lastY - 12).toFixed(1)}" fill="${COLOR.lineSoft}" font-size="14" font-weight="700" text-anchor="end">${nf.format(n)}</text>
  <g>
    ${xLabels}
  </g>
</svg>
`;
}

const times = await fetchStarredAt();
if (times.length === 0) throw new Error(`No stargazers returned for ${REPO}`);
const svg = render(times);
writeFileSync(OUT, svg);
console.log(`Wrote ${OUT} — ${times.length} stars, ${(svg.length / 1024).toFixed(1)} KiB`);
