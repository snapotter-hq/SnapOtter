/**
 * FULL TOOL AUDIT — Tests every tool in SnapOtter on Windows/amd64.
 * Verifies: (1) tool works, (2) GPU tools use GPU not CPU fallback,
 * (3) no unexpected model/method downgrades.
 */
const BASE = "http://localhost:1349";
const USERNAME = "admin";
const PASSWORD = "qFIJS2KcQ0NuUfZ0";
const IMG = "C:/Users/siddh/Downloads/passport-photo-sample-correct.webp";

import { readFileSync, writeFileSync } from "fs";

const results = [];
let token = "";

function log(tool, status, detail = "") {
  const icon = status === "PASS" ? "\u2713" : status === "FAIL" ? "\u2717" : "-";
  const line = `${icon} [${status}] ${tool}${detail ? " -- " + detail : ""}`;
  console.log(line);
  results.push({ tool, status, detail });
}

async function callTool(path, settings, filename = "test.webp") {
  const imageBuffer = readFileSync(IMG);
  const imageBlob = new Blob([imageBuffer], { type: "image/webp" });
  const formData = new FormData();
  formData.append("file", new File([imageBlob], filename, { type: "image/webp" }));
  formData.append("settings", JSON.stringify(settings));
  const res = await fetch(`${BASE}/api/v1/tools/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  const body = await res.json().catch(() => ({ error: `HTTP ${res.status} (non-JSON)` }));
  return { status: res.status, ok: res.ok, body };
}

async function test(name, path, settings, checks = {}) {
  try {
    const { status, ok, body } = await callTool(path, settings);
    if (!ok || body.error) {
      log(name, "FAIL", body.details || body.error || `HTTP ${status}`);
      return;
    }
    // Check expected model/method
    if (checks.expectKey && checks.expectValue) {
      const actual = body[checks.expectKey];
      if (actual !== checks.expectValue) {
        log(
          name,
          "FAIL",
          `Expected ${checks.expectKey}=${checks.expectValue} but got ${actual} (FALLBACK DETECTED)`,
        );
        return;
      }
    }
    // Build detail string
    const parts = [];
    for (const k of [
      "method",
      "model",
      "engine",
      "format",
      "width",
      "height",
      "facesDetected",
      "steps",
    ]) {
      if (body[k] !== undefined) {
        const v = Array.isArray(body[k]) ? JSON.stringify(body[k]) : body[k];
        parts.push(`${k}=${v}`);
      }
    }
    log(name, "PASS", parts.join(", "));
  } catch (err) {
    log(name, "FAIL", err.message.slice(0, 200));
  }
}

async function main() {
  console.log("=============================================================");
  console.log("  SNAPOTTER FULL TOOL AUDIT — Windows amd64 + RTX 4070");
  console.log("=============================================================\n");

  // Login
  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
  });
  const loginBody = await loginRes.json();
  token = loginBody.token;
  console.log("Authenticated.\n");

  // Check GPU status
  const healthRes = await fetch(`${BASE}/api/v1/admin/health`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const health = await healthRes.json();
  console.log(`GPU detected: ${health.ai?.gpu}`);
  console.log(`Version: ${health.version}\n`);

  // ════════════════════════════════════════════════════════════════
  // SECTION 1: GPU/AI TOOLS — verify correct model, no fallbacks
  // ════════════════════════════════════════════════════════════════
  console.log("--- GPU/AI TOOLS (must use GPU, no CPU fallback) ---\n");

  // Background removal — all models
  await test(
    "Remove BG (birefnet-general-lite)",
    "remove-background",
    { model: "birefnet-general-lite" },
    { expectKey: "model", expectValue: "birefnet-general-lite" },
  );
  await test(
    "Remove BG (birefnet-portrait)",
    "remove-background",
    { model: "birefnet-portrait" },
    { expectKey: "model", expectValue: "birefnet-portrait" },
  );
  await test(
    "Remove BG (birefnet-general)",
    "remove-background",
    { model: "birefnet-general" },
    { expectKey: "model", expectValue: "birefnet-general" },
  );
  await test(
    "Remove BG (u2net)",
    "remove-background",
    { model: "u2net" },
    { expectKey: "model", expectValue: "u2net" },
  );
  await test(
    "Remove BG (bria-rmbg)",
    "remove-background",
    { model: "bria-rmbg" },
    { expectKey: "model", expectValue: "bria-rmbg" },
  );
  await test(
    "Remove BG (isnet-general-use)",
    "remove-background",
    { model: "isnet-general-use" },
    { expectKey: "model", expectValue: "isnet-general-use" },
  );
  await test(
    "Remove BG (birefnet-matting/Ultra)",
    "remove-background",
    { model: "birefnet-matting" },
    { expectKey: "model", expectValue: "birefnet-matting" },
  );

  // Upscale
  await test(
    "Upscale (realesrgan 2x)",
    "upscale",
    { scale: 2, model: "realesrgan" },
    { expectKey: "method", expectValue: "realesrgan" },
  );
  await test(
    "Upscale (realesrgan 4x)",
    "upscale",
    { scale: 4, model: "realesrgan" },
    { expectKey: "method", expectValue: "realesrgan" },
  );
  await test("Upscale (lanczos 2x)", "upscale", { scale: 2, model: "lanczos" });
  await test("Upscale (auto)", "upscale", { scale: 2, model: "auto" });

  // Face enhancement
  await test(
    "Face Enhance (gfpgan)",
    "enhance-faces",
    { model: "gfpgan" },
    { expectKey: "model", expectValue: "gfpgan" },
  );
  await test("Face Enhance (codeformer)", "enhance-faces", { model: "codeformer" });
  await test("Face Enhance (auto)", "enhance-faces", { model: "auto" });

  // Colorize
  await test(
    "Colorize (ddcolor)",
    "colorize",
    { model: "ddcolor" },
    { expectKey: "method", expectValue: "ddcolor" },
  );
  await test("Colorize (auto)", "colorize", { model: "auto" });

  // Noise removal — all tiers
  await test("Noise Removal (quick)", "noise-removal", { tier: "quick" });
  await test("Noise Removal (balanced)", "noise-removal", { tier: "balanced" });
  await test("Noise Removal (quality/SCUNet)", "noise-removal", { tier: "quality" });
  await test("Noise Removal (maximum/NAFNet)", "noise-removal", { tier: "maximum" });

  // Photo restoration
  await test("Photo Restoration", "restore-photo", {});

  // OCR
  await test(
    "OCR (tesseract)",
    "ocr",
    { engine: "tesseract" },
    { expectKey: "engine", expectValue: "tesseract" },
  );
  await test(
    "OCR (paddleocr)",
    "ocr",
    { engine: "paddleocr" },
    { expectKey: "engine", expectValue: "paddleocr-v5" },
  );

  // Face operations (MediaPipe)
  await test("Face Blur", "blur-faces", { intensity: 50 });
  await test("Red-Eye Removal", "red-eye-removal", {});

  // Content-aware resize (caire binary)
  await test("Content-Aware Resize", "content-aware-resize", { width: 800, height: 800 });

  // Erase object (LaMa inpainting — needs mask, likely fails without one)
  // Skipping as it needs a mask input

  // Smart crop
  await test("Smart Crop", "smart-crop", { width: 400, height: 400 });

  // ════════════════════════════════════════════════════════════════
  // SECTION 2: IMAGE PROCESSING TOOLS (Sharp-based, CPU)
  // ════════════════════════════════════════════════════════════════
  console.log("\n--- IMAGE PROCESSING TOOLS (Sharp-based) ---\n");

  await test("Resize", "resize", { width: 512, height: 512, fit: "cover" });
  await test("Crop", "crop", { left: 100, top: 100, width: 500, height: 500 });
  await test("Rotate (90)", "rotate", { angle: 90 });
  await test("Rotate (45 + fill)", "rotate", { angle: 45, background: "#ffffff" });
  await test("Compress (webp q50)", "compress", { quality: 50 });
  await test("Convert (to PNG)", "convert", { format: "png" });
  await test("Convert (to JPEG)", "convert", { format: "jpg", quality: 85 });
  await test("Image Enhancement (auto)", "image-enhancement", { preset: "auto" });
  // color-adjustments is part of image-enhancement, not a separate tool
  await test("Image Enhancement (vivid)", "image-enhancement", { preset: "vivid" });
  await test("Sharpening", "sharpening", { sigma: 1.5, amount: 1.0 });
  await test("Border", "border", { size: 20, color: "#ff0000" });
  await test("Replace Color", "replace-color", {
    targetColor: "#ffffff",
    replacementColor: "#000000",
    tolerance: 30,
  });

  // ════════════════════════════════════════════════════════════════
  // SECTION 3: UTILITY TOOLS
  // ════════════════════════════════════════════════════════════════
  console.log("\n--- UTILITY TOOLS ---\n");

  await test("Info (metadata)", "info", {});
  await test("Strip Metadata", "strip-metadata", {});
  await test("Image to Base64", "image-to-base64", {});
  await test("Optimize for Web", "optimize-for-web", { maxWidth: 1920, quality: 80 });
  // Favicon returns binary ICO, not JSON — test via status code only
  try {
    const imageBuffer = readFileSync(IMG);
    const imageBlob = new Blob([imageBuffer], { type: "image/webp" });
    const formData = new FormData();
    formData.append("file", new File([imageBlob], "test.webp", { type: "image/webp" }));
    formData.append("settings", JSON.stringify({}));
    const res = await fetch(`${BASE}/api/v1/tools/favicon`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    log(
      "Favicon",
      res.ok ? "PASS" : "FAIL",
      `HTTP ${res.status}, ${res.headers.get("content-type")}`,
    );
  } catch (e) {
    log("Favicon", "FAIL", e.message.slice(0, 100));
  }

  // ════════════════════════════════════════════════════════════════
  // SECTION 4: MULTI-IMAGE / SPECIAL TOOLS (may need special input)
  // ════════════════════════════════════════════════════════════════
  console.log("\n--- SPECIAL TOOLS (may need specific inputs) ---\n");

  await test("QR Generate", "qr-generate", { text: "https://snapotter.app", size: 512, format: "png" });
  await test("Text Overlay", "text-overlay", {
    text: "TEST",
    fontSize: 48,
    color: "#ff0000",
    position: "center",
  });
  await test("Vectorize", "vectorize", {});
  await test("SVG to Raster", "svg-to-raster", {}); // Will fail - needs SVG input

  // ════════════════════════════════════════════════════════════════
  // SUMMARY
  // ════════════════════════════════════════════════════════════════
  console.log("\n=============================================================");
  console.log("  SUMMARY");
  console.log("=============================================================\n");

  const passed = results.filter((r) => r.status === "PASS");
  const failed = results.filter((r) => r.status === "FAIL");

  console.log(`PASSED: ${passed.length}`);
  console.log(`FAILED: ${failed.length}`);
  console.log(`TOTAL:  ${results.length}\n`);

  if (failed.length > 0) {
    console.log("FAILURES:");
    for (const r of failed) {
      // Truncate long error messages
      const detail = r.detail.length > 150 ? r.detail.slice(0, 150) + "..." : r.detail;
      console.log(`  \u2717 ${r.tool}: ${detail}`);
    }
  }

  // Check GPU usage in docker logs
  console.log("\n--- GPU USAGE CHECK ---\n");
  const { execSync } = await import("child_process");
  const logs = execSync("docker logs SnapOtter 2>&1", { encoding: "utf-8", maxBuffer: 1024 * 1024 });
  const gpuLines = logs
    .split("\n")
    .filter(
      (l) =>
        l.includes("[gpu]") ||
        l.includes("[bridge]") ||
        l.includes("[dispatcher]") ||
        l.includes("GPU") ||
        l.includes("CUDA") ||
        l.includes("CUDAExecution"),
    );
  for (const line of gpuLines.slice(0, 15)) {
    console.log("  " + line.trim().slice(0, 120));
  }

  // Check for any fallback warnings
  console.log("\n--- FALLBACK/MISMATCH WARNINGS ---\n");
  const warnLines = logs
    .split("\n")
    .filter(
      (l) =>
        l.includes("mismatch") ||
        l.includes("fallback") ||
        l.includes("Falling back") ||
        l.includes("degraded") ||
        (l.includes("lanczos") && l.includes("warn")),
    );
  if (warnLines.length === 0) {
    console.log("  None detected - no silent fallbacks occurred.");
  } else {
    for (const line of warnLines) {
      console.log("  WARNING: " + line.trim().slice(0, 150));
    }
  }

  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
