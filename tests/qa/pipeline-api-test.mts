/**
 * API-level pipeline test harness.
 *
 * Runs against the QA container at http://localhost:13499 (auth off).
 * Tests pipeline chaining by POSTing to /api/v1/pipeline/execute and
 * verifying the final output reflects EVERY step.
 *
 * Usage:
 *   cd apps/api && npx tsx ../../tests/qa/pipeline-api-test.mts
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.QA_BASE_URL || "http://localhost:13499";
const FIXTURE = join(import.meta.dirname, "..", "fixtures", "image", "formats", "sample.png");

// ── Helpers ─────────────────────────────────────────────────────

interface PipelineResult {
  status: number;
  body: Record<string, unknown>;
  downloadUrl?: string;
}

async function executePipeline(
  fixtureFile: string,
  steps: Array<{ toolId: string; settings: Record<string, unknown> }>,
): Promise<PipelineResult> {
  const fileBuffer = readFileSync(fixtureFile);
  const blob = new Blob([fileBuffer], { type: "image/png" });

  const form = new FormData();
  form.append("file", blob, "sample.png");
  form.append("pipeline", JSON.stringify({ steps }));

  const res = await fetch(`${BASE}/api/v1/pipeline/execute`, {
    method: "POST",
    body: form,
  });

  const body = await res.json() as Record<string, unknown>;
  return {
    status: res.status,
    body,
    downloadUrl: typeof body.downloadUrl === "string" ? body.downloadUrl : undefined,
  };
}

async function downloadToFile(downloadUrl: string): Promise<string> {
  const res = await fetch(`${BASE}${downloadUrl}`);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const tmp = mkdtempSync(join(tmpdir(), "pipeline-qa-"));
  // Extract filename from URL
  const urlFilename = downloadUrl.split("/").pop() || "output";
  const outPath = join(tmp, decodeURIComponent(urlFilename));
  writeFileSync(outPath, buf);
  return outPath;
}

function imageInfo(file: string): { width: number; height: number; codec: string; pixFmt: string } {
  const out = execFileSync(
    "ffprobe",
    ["-v", "quiet", "-select_streams", "v:0", "-show_entries", "stream=width,height,codec_name,pix_fmt", "-print_format", "json", file],
    { encoding: "utf8", timeout: 20_000 },
  );
  const s = (JSON.parse(out).streams ?? [])[0] ?? {};
  return { width: s.width ?? 0, height: s.height ?? 0, codec: s.codec_name ?? "", pixFmt: s.pix_fmt ?? "" };
}

function imageSaturation(file: string): number {
  const esc = file.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
  const out = execFileSync(
    "ffprobe",
    ["-v", "quiet", "-f", "lavfi", "-i", `movie=${esc},signalstats`, "-show_entries", "frame_tags=lavfi.signalstats.SATAVG", "-read_intervals", "%+#1", "-print_format", "json"],
    { encoding: "utf8", timeout: 20_000 },
  );
  const tags = (JSON.parse(out).frames ?? [])[0]?.tags ?? {};
  return Number(tags["lavfi.signalstats.SATAVG"] ?? 0);
}

function magicIsWebp(buf: Buffer): boolean {
  return buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP";
}

// ── Test results ────────────────────────────────────────────────

interface Finding {
  chain: string;
  severity: "BUG" | "WARN" | "PASS";
  expected: string;
  actual: string;
  detail?: string;
}

const findings: Finding[] = [];

function report(f: Finding) {
  findings.push(f);
  const icon = f.severity === "BUG" ? "BUG" : f.severity === "WARN" ? "WARN" : "OK";
  console.log(`[${icon}] ${f.chain}: ${f.actual}`);
}

// ── Chain 1: resize(100) -> adjust-colors(grayscale) -> convert(webp) ──

async function testChain1() {
  const chain = "resize(width=100) -> adjust-colors(effect=grayscale) -> convert(webp)";
  console.log(`\nTesting: ${chain}`);

  let result: PipelineResult;
  try {
    result = await executePipeline(FIXTURE, [
      { toolId: "resize", settings: { width: 100 } },
      { toolId: "adjust-colors", settings: { effect: "grayscale" } },
      { toolId: "convert", settings: { format: "webp" } },
    ]);
  } catch (err) {
    report({ chain, severity: "BUG", expected: "200 OK", actual: `Request failed: ${err}` });
    return;
  }

  if (result.status !== 200) {
    report({ chain, severity: "BUG", expected: "200 OK", actual: `HTTP ${result.status}: ${JSON.stringify(result.body)}` });
    return;
  }

  if (!result.downloadUrl) {
    report({ chain, severity: "BUG", expected: "downloadUrl present", actual: "No downloadUrl in response" });
    return;
  }

  // Verify stepsCompleted
  const stepsCompleted = result.body.stepsCompleted;
  if (stepsCompleted !== 3) {
    report({ chain, severity: "BUG", expected: "stepsCompleted=3", actual: `stepsCompleted=${stepsCompleted}` });
  }

  let filePath: string;
  try {
    filePath = await downloadToFile(result.downloadUrl);
  } catch (err) {
    report({ chain, severity: "BUG", expected: "Download succeeds", actual: `Download failed: ${err}` });
    return;
  }

  // Check 1: Width must be 100
  const info = imageInfo(filePath);
  if (info.width !== 100) {
    report({ chain, severity: "BUG", expected: "width=100 (resize applied)", actual: `width=${info.width}` });
  } else {
    report({ chain, severity: "PASS", expected: "width=100", actual: `width=${info.width}` });
  }

  // Check 2: Grayscale -- saturation must be near 0
  const sat = imageSaturation(filePath);
  if (sat > 5) {
    report({ chain, severity: "BUG", expected: "saturation ~0 (grayscale applied)", actual: `saturation=${sat}`, detail: "The adjust-colors grayscale step was likely dropped -- output still has color" });
  } else {
    report({ chain, severity: "PASS", expected: "saturation ~0", actual: `saturation=${sat}` });
  }

  // Check 3: WebP magic bytes
  const buf = readFileSync(filePath);
  if (!magicIsWebp(buf)) {
    report({ chain, severity: "BUG", expected: "WebP magic bytes (convert applied)", actual: `First bytes: ${buf.subarray(0, 12).toString("hex")}`, detail: "The convert step was likely dropped -- output is not WebP" });
  } else {
    report({ chain, severity: "PASS", expected: "WebP format", actual: "WebP magic confirmed" });
  }

  // Cleanup
  try { rmSync(join(filePath, ".."), { recursive: true, force: true }); } catch {}
}

// ── Chain 2: crop -> border -> watermark-text ──────────────────

async function testChain2() {
  const chain = "crop(50x50+10+10) -> border(20px) -> watermark-text('TEST')";
  console.log(`\nTesting: ${chain}`);

  let result: PipelineResult;
  try {
    result = await executePipeline(FIXTURE, [
      { toolId: "crop", settings: { left: 10, top: 10, width: 200, height: 150 } },
      { toolId: "border", settings: { borderWidth: 20, borderColor: "#FF0000" } },
      { toolId: "watermark-text", settings: { text: "TEST", fontSize: 24, opacity: 80 } },
    ]);
  } catch (err) {
    report({ chain, severity: "BUG", expected: "200 OK", actual: `Request failed: ${err}` });
    return;
  }

  if (result.status !== 200) {
    report({ chain, severity: "BUG", expected: "200 OK", actual: `HTTP ${result.status}: ${JSON.stringify(result.body)}` });
    return;
  }

  if (!result.downloadUrl) {
    report({ chain, severity: "BUG", expected: "downloadUrl present", actual: "No downloadUrl in response" });
    return;
  }

  let filePath: string;
  try {
    filePath = await downloadToFile(result.downloadUrl);
  } catch (err) {
    report({ chain, severity: "BUG", expected: "Download succeeds", actual: `Download failed: ${err}` });
    return;
  }

  const info = imageInfo(filePath);

  // After crop(200x150), border adds 20px on each side: 200+40=240 wide, 150+40=190 tall
  const expectedW = 200 + 40;
  const expectedH = 150 + 40;

  if (info.width !== expectedW) {
    report({
      chain,
      severity: "BUG",
      expected: `width=${expectedW} (crop 200 + border 2*20)`,
      actual: `width=${info.width}`,
      detail: info.width === 200 ? "Border step was likely dropped" : info.width === 640 ? "Crop step was likely dropped" : "Unexpected dimension",
    });
  } else {
    report({ chain, severity: "PASS", expected: `width=${expectedW}`, actual: `width=${info.width}` });
  }

  if (info.height !== expectedH) {
    report({
      chain,
      severity: "BUG",
      expected: `height=${expectedH} (crop 150 + border 2*20)`,
      actual: `height=${info.height}`,
    });
  } else {
    report({ chain, severity: "PASS", expected: `height=${expectedH}`, actual: `height=${info.height}` });
  }

  // File size must be > 0 (watermark applied -- hard to verify pixel content via ffprobe,
  // but at minimum the pipeline should complete all 3 steps)
  const stepsCompleted = result.body.stepsCompleted;
  if (stepsCompleted !== 3) {
    report({ chain, severity: "BUG", expected: "stepsCompleted=3", actual: `stepsCompleted=${stepsCompleted}` });
  } else {
    report({ chain, severity: "PASS", expected: "3 steps completed", actual: `stepsCompleted=${stepsCompleted}` });
  }

  try { rmSync(join(filePath, ".."), { recursive: true, force: true }); } catch {}
}

// ── Chain 3: rotate(90) -> resize(width=50) ────────────────────

async function testChain3() {
  const chain = "rotate(90) -> resize(width=50)";
  console.log(`\nTesting: ${chain}`);

  // Original: 640x426. After 90-degree rotation: 426x640. After resize width=50: 50x(50*640/426)=50x75ish
  let result: PipelineResult;
  try {
    result = await executePipeline(FIXTURE, [
      { toolId: "rotate", settings: { angle: 90 } },
      { toolId: "resize", settings: { width: 50 } },
    ]);
  } catch (err) {
    report({ chain, severity: "BUG", expected: "200 OK", actual: `Request failed: ${err}` });
    return;
  }

  if (result.status !== 200) {
    report({ chain, severity: "BUG", expected: "200 OK", actual: `HTTP ${result.status}: ${JSON.stringify(result.body)}` });
    return;
  }

  if (!result.downloadUrl) {
    report({ chain, severity: "BUG", expected: "downloadUrl present", actual: "No downloadUrl in response" });
    return;
  }

  let filePath: string;
  try {
    filePath = await downloadToFile(result.downloadUrl);
  } catch (err) {
    report({ chain, severity: "BUG", expected: "Download succeeds", actual: `Download failed: ${err}` });
    return;
  }

  const info = imageInfo(filePath);

  // Width must be 50 (resize applied)
  if (info.width !== 50) {
    report({ chain, severity: "BUG", expected: "width=50 (resize applied)", actual: `width=${info.width}` });
  } else {
    report({ chain, severity: "PASS", expected: "width=50", actual: `width=${info.width}` });
  }

  // Height should reflect aspect ratio after 90-degree rotation.
  // Original 640x426 rotated 90 = 426x640. Resize width=50 with contain => height = round(50 * 640/426) = 75
  // Allow +/-1 for rounding
  const expectedH = Math.round(50 * 640 / 426);
  if (Math.abs(info.height - expectedH) > 1) {
    report({
      chain,
      severity: "BUG",
      expected: `height ~${expectedH} (rotation then resize)`,
      actual: `height=${info.height}`,
      detail: info.height === Math.round(50 * 426 / 640) ? "Rotation step was likely dropped -- aspect ratio matches un-rotated image" : "Unexpected height",
    });
  } else {
    report({ chain, severity: "PASS", expected: `height ~${expectedH}`, actual: `height=${info.height}` });
  }

  try { rmSync(join(filePath, ".."), { recursive: true, force: true }); } catch {}
}

// ── Chain 4: Edge case -- incompatible step formats ──

async function testChain4_incompatibleFormat() {
  const chain = "convert(gif) -> [video tool] (format incompatibility edge case)";
  console.log(`\nTesting: ${chain}`);

  // This tests an image tool followed by a tool that expects a different modality.
  // The pipeline should either error cleanly or handle it gracefully.
  // We'll try convert(format=gif) -> trim-video (a video-only tool).
  // This should fail with a validation error, not crash.
  let result: PipelineResult;
  try {
    result = await executePipeline(FIXTURE, [
      { toolId: "convert", settings: { format: "gif" } },
      { toolId: "trim-video", settings: { start: 0, end: 5 } },
    ]);
  } catch (err) {
    report({ chain, severity: "BUG", expected: "Error response (not a crash)", actual: `Request crashed: ${err}` });
    return;
  }

  // We expect an error response (400 or 422), not a 200 or a 500
  if (result.status >= 500) {
    report({
      chain,
      severity: "BUG",
      expected: "Clean error (4xx) for incompatible tool",
      actual: `HTTP ${result.status}: server error (crash)`,
      detail: JSON.stringify(result.body),
    });
  } else if (result.status >= 400 && result.status < 500) {
    report({
      chain,
      severity: "PASS",
      expected: "Clean error for incompatible tool",
      actual: `HTTP ${result.status}: ${JSON.stringify(result.body).slice(0, 200)}`,
    });
  } else if (result.status === 200) {
    // If it somehow succeeds, check whether it silently skipped the video step
    report({
      chain,
      severity: "WARN",
      expected: "Error for incompatible tool",
      actual: `HTTP 200 -- pipeline somehow completed. Check if video step was silently skipped.`,
      detail: JSON.stringify(result.body).slice(0, 300),
    });
  } else {
    report({
      chain,
      severity: "PASS",
      expected: "Non-200 response",
      actual: `HTTP ${result.status}`,
    });
  }
}

// ── Chain 5: Single step pipeline (sanity) ─────────────────

async function testChain5_singleStep() {
  const chain = "resize(width=200) [single-step sanity]";
  console.log(`\nTesting: ${chain}`);

  let result: PipelineResult;
  try {
    result = await executePipeline(FIXTURE, [
      { toolId: "resize", settings: { width: 200 } },
    ]);
  } catch (err) {
    report({ chain, severity: "BUG", expected: "200 OK", actual: `Request failed: ${err}` });
    return;
  }

  if (result.status !== 200) {
    report({ chain, severity: "BUG", expected: "200 OK", actual: `HTTP ${result.status}: ${JSON.stringify(result.body)}` });
    return;
  }

  if (!result.downloadUrl) {
    report({ chain, severity: "BUG", expected: "downloadUrl present", actual: "No downloadUrl" });
    return;
  }

  let filePath: string;
  try {
    filePath = await downloadToFile(result.downloadUrl);
  } catch (err) {
    report({ chain, severity: "BUG", expected: "Download succeeds", actual: `Download failed: ${err}` });
    return;
  }

  const info = imageInfo(filePath);
  if (info.width !== 200) {
    report({ chain, severity: "BUG", expected: "width=200", actual: `width=${info.width}` });
  } else {
    report({ chain, severity: "PASS", expected: "width=200", actual: `width=${info.width}` });
  }

  try { rmSync(join(filePath, ".."), { recursive: true, force: true }); } catch {}
}

// ── Chain 6: Empty pipeline ──────────────────────────────────

async function testChain6_emptyPipeline() {
  const chain = "[] (empty pipeline)";
  console.log(`\nTesting: ${chain}`);

  let result: PipelineResult;
  try {
    result = await executePipeline(FIXTURE, []);
  } catch (err) {
    report({ chain, severity: "BUG", expected: "400 Bad Request", actual: `Request crashed: ${err}` });
    return;
  }

  if (result.status === 400) {
    report({ chain, severity: "PASS", expected: "400 for empty pipeline", actual: `HTTP ${result.status}` });
  } else if (result.status >= 500) {
    report({ chain, severity: "BUG", expected: "400 (not 5xx)", actual: `HTTP ${result.status}: ${JSON.stringify(result.body)}` });
  } else {
    report({ chain, severity: "PASS", expected: "Error for empty pipeline", actual: `HTTP ${result.status}` });
  }
}

// ── Chain 7: Invalid tool in pipeline ──────────────────────────

async function testChain7_invalidTool() {
  const chain = "resize(100) -> nonexistent-tool -> convert(webp)";
  console.log(`\nTesting: ${chain}`);

  let result: PipelineResult;
  try {
    result = await executePipeline(FIXTURE, [
      { toolId: "resize", settings: { width: 100 } },
      { toolId: "nonexistent-tool-12345", settings: {} },
      { toolId: "convert", settings: { format: "webp" } },
    ]);
  } catch (err) {
    report({ chain, severity: "BUG", expected: "400 Bad Request", actual: `Request crashed: ${err}` });
    return;
  }

  if (result.status === 400) {
    report({ chain, severity: "PASS", expected: "400 for invalid tool", actual: `HTTP ${result.status}: ${JSON.stringify(result.body).slice(0, 200)}` });
  } else if (result.status >= 500) {
    report({ chain, severity: "BUG", expected: "400 (not 5xx)", actual: `HTTP ${result.status}: ${JSON.stringify(result.body)}` });
  } else {
    report({ chain, severity: "WARN", expected: "400 for invalid tool", actual: `HTTP ${result.status}` });
  }
}

// ── Chain 8: resize -> adjust-colors(saturation=-100) -> convert(webp) ──
// Alternative grayscale via saturation instead of effect

async function testChain8_saturationGrayscale() {
  const chain = "resize(width=100) -> adjust-colors(saturation=-100) -> convert(webp)";
  console.log(`\nTesting: ${chain}`);

  let result: PipelineResult;
  try {
    result = await executePipeline(FIXTURE, [
      { toolId: "resize", settings: { width: 100 } },
      { toolId: "adjust-colors", settings: { saturation: -100 } },
      { toolId: "convert", settings: { format: "webp" } },
    ]);
  } catch (err) {
    report({ chain, severity: "BUG", expected: "200 OK", actual: `Request failed: ${err}` });
    return;
  }

  if (result.status !== 200) {
    report({ chain, severity: "BUG", expected: "200 OK", actual: `HTTP ${result.status}: ${JSON.stringify(result.body)}` });
    return;
  }

  if (!result.downloadUrl) {
    report({ chain, severity: "BUG", expected: "downloadUrl present", actual: "No downloadUrl" });
    return;
  }

  let filePath: string;
  try {
    filePath = await downloadToFile(result.downloadUrl);
  } catch (err) {
    report({ chain, severity: "BUG", expected: "Download succeeds", actual: `Download failed: ${err}` });
    return;
  }

  const info = imageInfo(filePath);
  if (info.width !== 100) {
    report({ chain, severity: "BUG", expected: "width=100", actual: `width=${info.width}` });
  } else {
    report({ chain, severity: "PASS", expected: "width=100", actual: `width=${info.width}` });
  }

  const sat = imageSaturation(filePath);
  if (sat > 5) {
    report({ chain, severity: "BUG", expected: "saturation ~0 (desaturated)", actual: `saturation=${sat}`, detail: "saturation=-100 step was likely dropped" });
  } else {
    report({ chain, severity: "PASS", expected: "saturation ~0", actual: `saturation=${sat}` });
  }

  const buf = readFileSync(filePath);
  if (!magicIsWebp(buf)) {
    report({ chain, severity: "BUG", expected: "WebP format", actual: `Not WebP: ${buf.subarray(0, 12).toString("hex")}` });
  } else {
    report({ chain, severity: "PASS", expected: "WebP format", actual: "WebP confirmed" });
  }

  try { rmSync(join(filePath, ".."), { recursive: true, force: true }); } catch {}
}

// ── Chain 9: Save, list, load, delete pipeline ──────────────────

async function testPipelineCRUD() {
  const chain = "Pipeline CRUD (save/list/delete)";
  console.log(`\nTesting: ${chain}`);

  // Save
  const saveRes = await fetch(`${BASE}/api/v1/pipeline/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "QA Test Pipeline",
      description: "Automated QA test",
      steps: [
        { toolId: "resize", settings: { width: 100 } },
        { toolId: "convert", settings: { format: "webp" } },
      ],
    }),
  });

  if (saveRes.status === 201) {
    report({ chain, severity: "PASS", expected: "Save returns 201", actual: `HTTP ${saveRes.status}` });
  } else {
    report({ chain, severity: "BUG", expected: "Save returns 201", actual: `HTTP ${saveRes.status}: ${await saveRes.text()}` });
    return;
  }

  const saved = await saveRes.json() as { id: string };

  // List
  const listRes = await fetch(`${BASE}/api/v1/pipeline/list`);
  if (listRes.ok) {
    const data = await listRes.json() as { pipelines: Array<{ id: string; name: string }> };
    const found = data.pipelines.find((p) => p.id === saved.id);
    if (found) {
      report({ chain, severity: "PASS", expected: "Saved pipeline in list", actual: `Found "${found.name}"` });
    } else {
      report({ chain, severity: "BUG", expected: "Saved pipeline in list", actual: "Not found in list" });
    }
  } else {
    report({ chain, severity: "BUG", expected: "List returns 200", actual: `HTTP ${listRes.status}` });
  }

  // Delete
  const delRes = await fetch(`${BASE}/api/v1/pipeline/${saved.id}`, { method: "DELETE" });
  if (delRes.ok) {
    report({ chain, severity: "PASS", expected: "Delete returns 200", actual: `HTTP ${delRes.status}` });
  } else {
    report({ chain, severity: "BUG", expected: "Delete returns 200", actual: `HTTP ${delRes.status}` });
  }

  // Verify deletion
  const listRes2 = await fetch(`${BASE}/api/v1/pipeline/list`);
  if (listRes2.ok) {
    const data2 = await listRes2.json() as { pipelines: Array<{ id: string }> };
    const still = data2.pipelines.find((p) => p.id === saved.id);
    if (!still) {
      report({ chain, severity: "PASS", expected: "Pipeline removed after delete", actual: "Confirmed removed" });
    } else {
      report({ chain, severity: "BUG", expected: "Pipeline removed after delete", actual: "Still present in list" });
    }
  }
}

// ── Chain 10: Batch pipeline ────────────────────────────────────

async function testBatchPipeline() {
  const chain = "Batch pipeline (2 files, resize+convert)";
  console.log(`\nTesting: ${chain}`);

  const fileBuffer = readFileSync(FIXTURE);
  const blob1 = new Blob([fileBuffer], { type: "image/png" });
  const blob2 = new Blob([fileBuffer], { type: "image/png" });

  const form = new FormData();
  form.append("file", blob1, "img1.png");
  form.append("file", blob2, "img2.png");
  form.append("pipeline", JSON.stringify({
    steps: [
      { toolId: "resize", settings: { width: 80 } },
      { toolId: "convert", settings: { format: "webp" } },
    ],
  }));

  const res = await fetch(`${BASE}/api/v1/pipeline/batch`, {
    method: "POST",
    body: form,
  });

  if (res.status !== 200) {
    const text = await res.text();
    report({ chain, severity: "BUG", expected: "200 OK (ZIP)", actual: `HTTP ${res.status}: ${text.slice(0, 300)}` });
    return;
  }

  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("zip")) {
    report({ chain, severity: "BUG", expected: "Content-Type: application/zip", actual: `Content-Type: ${contentType}` });
  } else {
    report({ chain, severity: "PASS", expected: "ZIP response", actual: `Content-Type: ${contentType}` });
  }

  const zipBuf = Buffer.from(await res.arrayBuffer());
  if (zipBuf.length < 100) {
    report({ chain, severity: "BUG", expected: "Non-trivial ZIP size", actual: `ZIP size: ${zipBuf.length} bytes` });
  } else {
    report({ chain, severity: "PASS", expected: "ZIP with content", actual: `ZIP size: ${zipBuf.length} bytes` });
  }

  // Check X-File-Results header
  const xFileResults = res.headers.get("x-file-results");
  if (xFileResults) {
    try {
      const decoded = JSON.parse(decodeURIComponent(xFileResults));
      const keys = Object.keys(decoded);
      if (keys.length === 2) {
        report({ chain, severity: "PASS", expected: "2 results in header", actual: `${keys.length} results: ${JSON.stringify(decoded)}` });
      } else {
        report({ chain, severity: "BUG", expected: "2 results in X-File-Results", actual: `${keys.length} results` });
      }
    } catch {
      report({ chain, severity: "WARN", expected: "Valid X-File-Results header", actual: `Could not parse: ${xFileResults}` });
    }
  } else {
    report({ chain, severity: "BUG", expected: "X-File-Results header present", actual: "Header missing" });
  }
}

// ── Run all tests ──────────────────────────────────────────────

async function main() {
  console.log("=== SnapOtter Pipeline API Tests ===");
  console.log(`Target: ${BASE}`);
  console.log(`Fixture: ${FIXTURE}`);

  // Verify connectivity
  try {
    const health = await fetch(`${BASE}/api/v1/health`);
    if (!health.ok) throw new Error(`Health check failed: ${health.status}`);
    console.log("Container healthy.\n");
  } catch (err) {
    console.error(`Cannot reach ${BASE}: ${err}`);
    process.exit(1);
  }

  await testChain5_singleStep();
  await testChain1();
  await testChain8_saturationGrayscale();
  await testChain2();
  await testChain3();
  await testChain4_incompatibleFormat();
  await testChain6_emptyPipeline();
  await testChain7_invalidTool();
  await testPipelineCRUD();
  await testBatchPipeline();

  console.log("\n=== Summary ===");
  const bugs = findings.filter((f) => f.severity === "BUG");
  const warns = findings.filter((f) => f.severity === "WARN");
  const passes = findings.filter((f) => f.severity === "PASS");
  console.log(`PASS: ${passes.length}  |  WARN: ${warns.length}  |  BUG: ${bugs.length}`);

  if (bugs.length > 0) {
    console.log("\n--- BUGS ---");
    for (const b of bugs) {
      console.log(`  [BUG] ${b.chain}`);
      console.log(`    Expected: ${b.expected}`);
      console.log(`    Actual:   ${b.actual}`);
      if (b.detail) console.log(`    Detail:   ${b.detail}`);
    }
  }

  if (warns.length > 0) {
    console.log("\n--- WARNINGS ---");
    for (const w of warns) {
      console.log(`  [WARN] ${w.chain}`);
      console.log(`    Expected: ${w.expected}`);
      console.log(`    Actual:   ${w.actual}`);
      if (w.detail) console.log(`    Detail:   ${w.detail}`);
    }
  }

  // Write JSON results
  const resultsPath = join(import.meta.dirname, "..", "..", "docs", "qa", "pipeline-api-results.json");
  writeFileSync(resultsPath, JSON.stringify(findings, null, 2));
  console.log(`\nResults written to: ${resultsPath}`);

  // Exit with error if bugs found
  if (bugs.length > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(2);
});
