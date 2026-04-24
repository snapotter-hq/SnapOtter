/**
 * Playwright E2E test for all GPU-dependent tools on Windows/amd64.
 * Uses the API directly (multipart upload) with browser auth context.
 */
import { chromium } from "playwright";

const BASE = "http://localhost:1349";
const USERNAME = "admin";
const PASSWORD = "qFIJS2KcQ0NuUfZ0";
const TEST_IMAGE = "C:/Users/siddh/Downloads/passport-photo-sample-correct.webp";

const results = [];

function log(tool, status, detail = "") {
  const icon = status === "PASS" ? "\u2713" : status === "FAIL" ? "\u2717" : "!";
  console.log(`${icon} ${tool}: ${status}${detail ? " - " + detail : ""}`);
  results.push({ tool, status, detail });
}

async function main() {
  console.log("=== SnapOtter GPU Tools E2E Test ===\n");

  // Login via API
  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
  });
  const { token } = await loginRes.json();
  console.log("Logged in.\n");

  const { readFileSync } = await import("fs");
  const imageBuffer = readFileSync(TEST_IMAGE);
  const imageBlob = new Blob([imageBuffer], { type: "image/webp" });

  const tools = [
    {
      name: "Remove Background",
      path: "remove-background",
      settings: { model: "birefnet-general-lite" },
      resultKey: "model",
    },
    {
      name: "Remove Background (portrait)",
      path: "remove-background",
      settings: { model: "birefnet-portrait" },
      resultKey: "model",
    },
    {
      name: "Upscale (realesrgan)",
      path: "upscale",
      settings: { scale: 2, model: "realesrgan" },
      resultKey: "method",
    },
    {
      name: "Face Enhancement (gfpgan)",
      path: "enhance-faces",
      settings: { model: "gfpgan" },
      resultKey: "model",
    },
    {
      name: "Face Enhancement (codeformer)",
      path: "enhance-faces",
      settings: { model: "codeformer" },
      resultKey: "model",
    },
    {
      name: "Colorize",
      path: "colorize",
      settings: { model: "auto" },
      resultKey: "method",
    },
    {
      name: "Noise Removal (quality/SCUNet)",
      path: "noise-removal",
      settings: { tier: "quality" },
      resultKey: null,
    },
    {
      name: "Photo Restoration",
      path: "restore-photo",
      settings: {},
      resultKey: "steps",
    },
    {
      name: "Face Blur",
      path: "blur-faces",
      settings: { intensity: 50 },
      resultKey: "facesDetected",
    },
    {
      name: "Red-Eye Removal",
      path: "red-eye-removal",
      settings: {},
      resultKey: "facesDetected",
    },
    {
      name: "OCR (tesseract)",
      path: "ocr",
      settings: { engine: "tesseract" },
      resultKey: "engine",
    },
    {
      name: "OCR (paddleocr)",
      path: "ocr",
      settings: { engine: "paddleocr" },
      resultKey: "engine",
    },
  ];

  for (const tool of tools) {
    try {
      const formData = new FormData();
      formData.append("file", new File([imageBlob], "test.webp", { type: "image/webp" }));
      formData.append("settings", JSON.stringify(tool.settings));

      const res = await fetch(`${BASE}/api/v1/tools/${tool.path}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));

      if (res.ok && !body.error) {
        const val = tool.resultKey ? body[tool.resultKey] : "ok";
        const detail = Array.isArray(val)
          ? JSON.stringify(val)
          : val !== undefined
            ? `${tool.resultKey}=${val}`
            : "";
        log(tool.name, "PASS", detail);
      } else {
        log(tool.name, "FAIL", body.details || body.error || `HTTP ${res.status}`);
      }
    } catch (err) {
      log(tool.name, "FAIL", err.message.slice(0, 200));
    }
  }

  // Summary
  console.log("\n=== Summary ===");
  const passed = results.filter((r) => r.status === "PASS").length;
  const failed = results.filter((r) => r.status === "FAIL").length;
  console.log(`Passed: ${passed}  Failed: ${failed}  Total: ${results.length}`);

  if (failed > 0) {
    console.log("\nFailed tests:");
    for (const r of results.filter((r) => r.status === "FAIL")) {
      console.log(`  x ${r.tool}: ${r.detail}`);
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
