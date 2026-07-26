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

function hasVisualBaselines(platform) {
  const screenshotRoot = path.resolve(process.cwd(), "tests/e2e/__screenshots__");
  if (!existsSync(screenshotRoot)) return false;
  return readdirSync(screenshotRoot, { recursive: true }).some((entry) =>
    String(entry).endsWith(`-${platform}.png`),
  );
}

export function buildMainE2ePlan(platform = process.platform, coreOnly = false) {
  const projects = coreOnly ? ["chromium"] : RELEASE_PROJECTS;
  const standard = ["test", ...projects.map((project) => `--project=${project}`)];
  const visualBaselinesAvailable = hasVisualBaselines(platform);
  if (!visualBaselinesAvailable) standard.push("--grep-invert=@visual");

  const plan = [standard, ["test", "--project=chromium-serial", "--workers=1"]];
  if (visualBaselinesAvailable) {
    plan.push(["test", "--project=chromium-visual", "--project=chromium-legacy-visual"]);
  }
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
