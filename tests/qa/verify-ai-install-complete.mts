// Companion to install-ai-bundles-ui.mts: once every bundle reports installed via
// the API, screenshot the completed UI state and run one real tool per bundle to
// prove the freshly-downloaded model actually executes (not just "installed: true").
//
// Usage:
//   QA_BASE_URL=http://localhost:13599 QA_USERNAME=admin QA_PASSWORD=admin \
//     apps/api/node_modules/.bin/tsx tests/qa/verify-ai-install-complete.mts
import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";
import { apiToolPath } from "../../packages/shared/src/constants.js";

const BASE = process.env.QA_BASE_URL || "http://localhost:13499";
const USERNAME = process.env.QA_USERNAME || "admin";
const PASSWORD = process.env.QA_PASSWORD || "admin";
const SHOT_DIR = path.join("tests", "e2e", "screenshots", "qa", "ai-install");
fs.mkdirSync(SHOT_DIR, { recursive: true });

interface Bundle {
  id: string;
  status: string;
  installedVersion: string | null;
}

async function login(): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
  });
  const j = (await res.json()) as { token: string };
  return j.token;
}

async function getBundles(token: string): Promise<Bundle[]> {
  const res = await fetch(`${BASE}/api/v1/features`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = (await res.json()) as Bundle[] | { bundles: Bundle[] };
  return Array.isArray(body) ? body : body.bundles;
}

const ONE_TOOL_PER_BUNDLE: Record<string, { toolId: string; file: string; settings: object }> = {
  "background-removal": {
    toolId: "remove-background",
    file: "tests/fixtures/image/valid/portrait-color.jpg",
    settings: { outputFormat: "png" },
  },
  "face-detection": {
    toolId: "smart-crop",
    file: "tests/fixtures/image/valid/multi-face.webp",
    settings: { width: 200, height: 200 },
  },
  "object-eraser-colorize": {
    toolId: "colorize",
    file: "tests/fixtures/image/valid/portrait-bw.jpeg",
    settings: {},
  },
  "upscale-enhance": {
    toolId: "upscale",
    file: "tests/fixtures/image/valid/test-100x100.jpg",
    settings: { scale: 2 },
  },
  "photo-restoration": {
    toolId: "restore-photo",
    file: "tests/fixtures/image/valid/portrait-bw.jpeg",
    settings: {},
  },
  ocr: { toolId: "ocr", file: "tests/fixtures/image/valid/ocr-clean.png", settings: {} },
  transcription: {
    toolId: "transcribe-audio",
    file: "tests/fixtures/audio/valid/speech-10s.wav",
    settings: { outputFormat: "txt" },
  },
};

async function pollSSE(token: string, jobId: string, timeoutMs = 300_000) {
  const res = await fetch(`${BASE}/api/v1/jobs/${jobId}/progress`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.body) return { error: "no body" };
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx: number;
    // biome-ignore lint/suspicious/noAssignInExpressions: stream parse
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line.startsWith("data:")) continue;
      try {
        const d = JSON.parse(line.slice(5).trim());
        if (d.phase === "complete" || d.status === "completed") {
          await reader.cancel();
          return d;
        }
        if (d.phase === "failed" || d.status === "failed") {
          await reader.cancel();
          return { failed: true, ...d };
        }
      } catch {
        // partial line, keep buffering
      }
    }
  }
  await reader.cancel();
  return { timeout: true };
}

async function runOneTool(token: string, bundleId: string) {
  const spec = ONE_TOOL_PER_BUNDLE[bundleId];
  if (!spec) {
    console.log(`  [${bundleId}] no smoke-tool mapping defined, skipping first-run check`);
    return;
  }
  const buf = fs.readFileSync(spec.file);
  const fd = new FormData();
  fd.append("file", new Blob([buf]), path.basename(spec.file));
  fd.append("settings", JSON.stringify(spec.settings));
  const res = await fetch(`${BASE}${apiToolPath(spec.toolId)}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
  if (res.status === 200) {
    const j = (await res.json()) as { downloadUrl?: string };
    console.log(`  [${bundleId}] ${spec.toolId}: sync 200, downloadUrl=${!!j.downloadUrl}`);
    return;
  }
  if (res.status === 202) {
    const j = (await res.json()) as { jobId: string };
    const done = await pollSSE(token, j.jobId);
    if ((done as { failed?: boolean }).failed) {
      console.log(`  [${bundleId}] ${spec.toolId}: FAILED - ${JSON.stringify(done).slice(0, 200)}`);
    } else if ((done as { timeout?: boolean }).timeout) {
      console.log(`  [${bundleId}] ${spec.toolId}: TIMED OUT waiting for completion`);
    } else {
      console.log(`  [${bundleId}] ${spec.toolId}: async completed OK`);
    }
    return;
  }
  console.log(`  [${bundleId}] ${spec.toolId}: unexpected status ${res.status}`);
}

async function main() {
  const token = await login();
  const bundles = await getBundles(token);
  console.log("Bundle status:");
  for (const b of bundles) console.log(`  ${b.id}: ${b.status} (${b.installedVersion ?? "-"})`);

  const notInstalled = bundles.filter((b) => b.status !== "installed");
  if (notInstalled.length > 0) {
    console.log(
      `\n${notInstalled.length} bundle(s) not yet installed: ${notInstalled.map((b) => b.id).join(", ")}`,
    );
    console.log("Re-run this script once they finish installing.");
  }

  console.log("\nScreenshotting completed UI state...");
  const browser = await chromium.launch({ channel: "chrome" });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(BASE);
  await page.waitForLoadState("networkidle").catch(() => {});
  if (page.url().includes("/login")) {
    await page.locator("#username").waitFor({ timeout: 10_000 });
    await page.locator("#username").fill(USERNAME);
    await page.locator("#password").fill(PASSWORD);
    await page.getByRole("button", { name: /^log ?in$/i }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 });
  }
  await page.getByRole("button", { name: USERNAME, exact: true }).click();
  await page.getByText("Settings", { exact: true }).click();
  await page.getByText("AI Features", { exact: true }).click();
  await page.waitForTimeout(1000);
  await page.screenshot({
    path: path.join(SHOT_DIR, "04-post-install.png"),
    fullPage: true,
  });
  console.log(`  screenshot: ${path.join(SHOT_DIR, "04-post-install.png")}`);
  await browser.close();

  console.log("\nRunning one real tool per installed bundle...");
  for (const b of bundles.filter((x) => x.status === "installed")) {
    await runOneTool(token, b.id);
  }

  console.log("\nDONE");
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
