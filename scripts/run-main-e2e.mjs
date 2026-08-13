import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const RELEASE_PROJECTS = [
  "chromium",
  "firefox",
  "webkit",
  "chromium-widths",
  "mobile-chromium",
  "mobile-webkit",
  "tablet-chromium",
  "tablet-webkit",
];

// The legacy broad matrix (visual-regression.spec.ts) keeps darwin-only
// baselines on purpose: the update-visual-baselines workflow regenerates only
// the maintained visual projects. Each visual lane is therefore gated on its
// OWN baselines, so a platform never runs comparisons that cannot have a
// snapshot (a missing snapshot is a test failure, not a skip).
const LEGACY_SNAPSHOT_DIR = "visual-regression.spec.ts";

function visualBaselineState(platform) {
  const screenshotRoot = path.resolve(process.cwd(), "tests/e2e/__screenshots__");
  const state = { maintained: false, legacy: false };
  if (!existsSync(screenshotRoot)) return state;
  for (const entry of readdirSync(screenshotRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const hasPlatform = readdirSync(path.join(screenshotRoot, entry.name)).some((file) =>
      file.endsWith(`-${platform}.png`),
    );
    if (!hasPlatform) continue;
    if (entry.name === LEGACY_SNAPSHOT_DIR) state.legacy = true;
    else state.maintained = true;
  }
  return state;
}

export function buildMainE2ePlan(platform = process.platform, coreOnly = false) {
  const projects = coreOnly ? ["chromium"] : RELEASE_PROJECTS;
  const standard = ["test", ...projects.map((project) => `--project=${project}`)];
  const baselines = visualBaselineState(platform);
  // Device @visual tests run inside the standard command's device projects
  // and share the maintained baseline set.
  if (!baselines.maintained) standard.push("--grep-invert=@visual");

  const plan = [standard, ["test", "--project=chromium-serial", "--workers=1"]];
  const visualLane = [
    ...(baselines.maintained ? ["--project=chromium-visual"] : []),
    ...(baselines.legacy ? ["--project=chromium-legacy-visual"] : []),
  ];
  if (visualLane.length > 0) plan.push(["test", ...visualLane]);
  return plan;
}

function main() {
  const planIndex = process.argv.indexOf("--plan");
  const coreOnly = process.argv.includes("--core");
  const platform = planIndex === -1 ? process.platform : process.argv[planIndex + 1];
  if (!platform || platform.startsWith("--")) {
    throw new Error("--plan requires a platform name such as darwin, linux, or win32");
  }

  const plan = buildMainE2ePlan(platform, coreOnly);
  if (planIndex !== -1) {
    process.stdout.write(JSON.stringify(plan));
    return;
  }

  const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  for (const args of plan) {
    const result = spawnSync(pnpm, ["exec", "playwright", ...args], {
      env: process.env,
      stdio: "inherit",
    });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main();
}
