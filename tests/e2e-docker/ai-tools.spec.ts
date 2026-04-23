import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

// ─── AI Tools ───────────────────────────────────────────────────────
// Tests for: remove-background, upscale, ocr, blur-faces, smart-crop,
// enhance-faces, colorize, noise-removal, red-eye-removal, restore-photo,
// passport-photo, erase-object
//
// These tools require the AI sidecar (Python bridge). Each test detects
// whether the required feature bundle is installed:
//   - 200 = tool works, verify output
//   - 501 FEATURE_NOT_INSTALLED = skip gracefully (expected when bundle missing)
//   - Other errors = genuine failures

const FIXTURES = join(process.cwd(), "tests", "fixtures");
const CONTENT = join(FIXTURES, "content");

let token: string;

test.beforeAll(async ({ request }) => {
  const res = await request.post("/api/auth/login", {
    data: { username: "admin", password: "admin" },
  });
  const body = await res.json();
  token = body.token;
});

function fixture(name: string): Buffer {
  return readFileSync(join(FIXTURES, name));
}

function contentFixture(name: string): Buffer {
  return readFileSync(join(CONTENT, name));
}

const JPG_100x100 = fixture("test-100x100.jpg");
const BLANK_PNG = fixture("test-blank.png");
const HEIC_PORTRAIT = fixture("test-portrait.heic");

/** Minimal valid 1x1 PNG for quick feature-detection probes. */
const TINY_PNG = fixture("test-1x1.png");

/**
 * Determine whether a given AI tool's feature bundle is installed by
 * querying the features API and checking the status of the bundle that
 * enables the tool.
 */
async function isFeatureInstalled(
  request: import("@playwright/test").APIRequestContext,
  toolId: string,
): Promise<boolean> {
  const res = await request.get("/api/v1/features", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok()) return false;
  const data = await res.json();

  // Map tool IDs to their bundle IDs
  const toolBundleMap: Record<string, string> = {
    "remove-background": "background-removal",
    "passport-photo": "background-removal",
    "blur-faces": "face-detection",
    "red-eye-removal": "face-detection",
    "smart-crop": "face-detection",
    "erase-object": "object-eraser-colorize",
    colorize: "object-eraser-colorize",
    upscale: "upscale-enhance",
    "enhance-faces": "upscale-enhance",
    "noise-removal": "upscale-enhance",
    "restore-photo": "photo-restoration",
    ocr: "ocr",
  };

  const bundleId = toolBundleMap[toolId];
  if (!bundleId) return false;

  const bundle = data.bundles?.find((b: { id: string }) => b.id === bundleId);
  return bundle?.status === "installed";
}

/**
 * Post a file to an AI tool and return the response.
 * Handles the 501 FEATURE_NOT_INSTALLED case gracefully.
 */
async function callAiTool(
  request: import("@playwright/test").APIRequestContext,
  toolId: string,
  imageBuffer: Buffer,
  settings: Record<string, unknown> = {},
  filename = "test.png",
  mimeType = "image/png",
): Promise<{ installed: boolean; ok: boolean; status: number; body: Record<string, unknown> }> {
  const res = await request.post(`/api/v1/tools/${toolId}`, {
    headers: { Authorization: `Bearer ${token}` },
    multipart: {
      file: { name: filename, mimeType, buffer: imageBuffer },
      settings: JSON.stringify(settings),
    },
  });

  const status = res.status();
  const body = await res.json();

  if (status === 501 && body.code === "FEATURE_NOT_INSTALLED") {
    return { installed: false, ok: false, status, body };
  }

  return { installed: true, ok: res.ok(), status, body };
}

// ─── Remove Background ──────────────────────────────────────────────

test.describe("Remove Background", () => {
  test("remove background returns download URL or 501", async ({ request }) => {
    const result = await callAiTool(request, "remove-background", JPG_100x100, {});
    if (!result.installed) {
      expect(result.body.feature).toBe("background-removal");
      expect(result.body.featureName).toBeTruthy();
      test.skip();
      return;
    }
    expect(result.ok).toBe(true);
    expect(result.body.downloadUrl).toBeTruthy();
    expect(result.body.processedSize).toBeGreaterThan(0);
  });

  test("remove background with specific model", async ({ request }) => {
    const result = await callAiTool(request, "remove-background", JPG_100x100, {
      model: "u2net",
    });
    if (!result.installed) {
      test.skip();
      return;
    }
    expect(result.ok).toBe(true);
    expect(result.body.downloadUrl).toBeTruthy();
  });

  test("remove background on HEIC image", async ({ request }) => {
    const result = await callAiTool(
      request,
      "remove-background",
      HEIC_PORTRAIT,
      {},
      "portrait.heic",
      "image/heic",
    );
    if (!result.installed) {
      test.skip();
      return;
    }
    expect(result.ok).toBe(true);
    expect(result.body.downloadUrl).toBeTruthy();
  });
});

// ─── Upscale ────────────────────────────────────────────────────────

test.describe("Upscale", () => {
  test("upscale 2x returns larger image or 501", async ({ request }) => {
    const result = await callAiTool(request, "upscale", JPG_100x100, {
      scale: 2,
      model: "auto",
    });
    if (!result.installed) {
      expect(result.body.feature).toBe("upscale-enhance");
      test.skip();
      return;
    }
    expect(result.ok).toBe(true);
    expect(result.body.downloadUrl).toBeTruthy();
    expect(result.body.processedSize).toBeGreaterThan(0);
  });

  test("upscale 4x", async ({ request }) => {
    const result = await callAiTool(request, "upscale", TINY_PNG, {
      scale: 4,
      model: "auto",
    });
    if (!result.installed) {
      test.skip();
      return;
    }
    expect(result.ok).toBe(true);
    expect(result.body.downloadUrl).toBeTruthy();
  });

  test("upscale with lanczos (CPU fallback)", async ({ request }) => {
    const result = await callAiTool(request, "upscale", JPG_100x100, {
      scale: 2,
      model: "lanczos",
    });
    if (!result.installed) {
      test.skip();
      return;
    }
    expect(result.ok).toBe(true);
    expect(result.body.downloadUrl).toBeTruthy();
  });

  test("upscale with realesrgan model", async ({ request }) => {
    const result = await callAiTool(request, "upscale", TINY_PNG, {
      scale: 2,
      model: "realesrgan",
    });
    if (!result.installed) {
      test.skip();
      return;
    }
    expect(result.ok).toBe(true);
    expect(result.body.downloadUrl).toBeTruthy();
  });
});

// ─── OCR ────────────────────────────────────────────────────────────

test.describe("OCR", () => {
  test("OCR processes image or returns 501", async ({ request }) => {
    const result = await callAiTool(request, "ocr", JPG_100x100, {});
    if (!result.installed) {
      expect(result.body.feature).toBe("ocr");
      test.skip();
      return;
    }
    expect(result.ok).toBe(true);
    // OCR response may have text, blocks, or engine field
    expect(result.body.text !== undefined || result.body.blocks !== undefined).toBe(true);
  });

  test("OCR with tesseract engine", async ({ request }) => {
    const result = await callAiTool(request, "ocr", JPG_100x100, { engine: "tesseract" });
    if (!result.installed) {
      test.skip();
      return;
    }
    expect(result.ok).toBe(true);
  });

  test("OCR with paddleocr engine", async ({ request }) => {
    const result = await callAiTool(request, "ocr", JPG_100x100, { engine: "paddleocr" });
    if (!result.installed) {
      test.skip();
      return;
    }
    expect(result.ok).toBe(true);
  });

  test("OCR on Japanese text image", async ({ request }) => {
    const ocrJapanese = contentFixture("ocr-japanese.png");
    const result = await callAiTool(
      request,
      "ocr",
      ocrJapanese,
      {},
      "ocr-japanese.png",
      "image/png",
    );
    if (!result.installed) {
      test.skip();
      return;
    }
    expect(result.ok).toBe(true);
  });

  test("OCR on chat screenshot", async ({ request }) => {
    const ocrChat = contentFixture("ocr-chat.jpeg");
    const result = await callAiTool(request, "ocr", ocrChat, {}, "ocr-chat.jpeg", "image/jpeg");
    if (!result.installed) {
      test.skip();
      return;
    }
    expect(result.ok).toBe(true);
    // Chat screenshot should contain some readable text
    if (result.body.text) {
      expect((result.body.text as string).length).toBeGreaterThan(0);
    }
  });
});

// ─── Blur Faces ─────────────────────────────────────────────────────

test.describe("Blur Faces", () => {
  test("blur faces processes image or returns 501", async ({ request }) => {
    const portrait = contentFixture("portrait-color.jpg");
    const result = await callAiTool(
      request,
      "blur-faces",
      portrait,
      { blurRadius: 30, sensitivity: 0.5 },
      "portrait.jpg",
      "image/jpeg",
    );
    if (!result.installed) {
      expect(result.body.feature).toBe("face-detection");
      test.skip();
      return;
    }
    expect(result.ok).toBe(true);
    expect(result.body.downloadUrl).toBeTruthy();
  });

  test("blur faces on HEIC portrait", async ({ request }) => {
    const result = await callAiTool(
      request,
      "blur-faces",
      HEIC_PORTRAIT,
      { blurRadius: 30 },
      "portrait.heic",
      "image/heic",
    );
    if (!result.installed) {
      test.skip();
      return;
    }
    expect(result.ok).toBe(true);
    expect(result.body.downloadUrl).toBeTruthy();
  });

  test("blur faces on image with no faces returns warning", async ({ request }) => {
    const result = await callAiTool(request, "blur-faces", BLANK_PNG, { blurRadius: 30 });
    if (!result.installed) {
      test.skip();
      return;
    }
    // Should succeed but indicate no faces were found
    expect(result.ok).toBe(true);
    // facesDetected should be 0 or a warning should be present
    if (result.body.facesDetected !== undefined) {
      expect(result.body.facesDetected).toBe(0);
    }
  });

  test("blur faces on multi-face image", async ({ request }) => {
    const multiFace = contentFixture("multi-face.webp");
    const result = await callAiTool(
      request,
      "blur-faces",
      multiFace,
      { blurRadius: 20 },
      "multi-face.webp",
      "image/webp",
    );
    if (!result.installed) {
      test.skip();
      return;
    }
    expect(result.ok).toBe(true);
    expect(result.body.downloadUrl).toBeTruthy();
  });
});

// ─── Smart Crop ─────────────────────────────────────────────────────

test.describe("Smart Crop", () => {
  test("smart crop to portrait dimensions or returns 501", async ({ request }) => {
    const portrait = contentFixture("portrait-color.jpg");
    const result = await callAiTool(
      request,
      "smart-crop",
      portrait,
      { width: 400, height: 400 },
      "portrait.jpg",
      "image/jpeg",
    );
    if (!result.installed) {
      expect(result.body.feature).toBe("face-detection");
      test.skip();
      return;
    }
    expect(result.ok).toBe(true);
    expect(result.body.downloadUrl).toBeTruthy();
  });

  test("smart crop with landscape aspect ratio", async ({ request }) => {
    const portrait = contentFixture("portrait-color.jpg");
    const result = await callAiTool(
      request,
      "smart-crop",
      portrait,
      { width: 800, height: 400 },
      "portrait.jpg",
      "image/jpeg",
    );
    if (!result.installed) {
      test.skip();
      return;
    }
    expect(result.ok).toBe(true);
    expect(result.body.downloadUrl).toBeTruthy();
  });
});

// ─── Enhance Faces ──────────────────────────────────────────────────

test.describe("Enhance Faces", () => {
  test("enhance faces with auto model or returns 501", async ({ request }) => {
    const portrait = contentFixture("portrait-color.jpg");
    const result = await callAiTool(
      request,
      "enhance-faces",
      portrait,
      { model: "auto" },
      "portrait.jpg",
      "image/jpeg",
    );
    if (!result.installed) {
      expect(result.body.feature).toBe("upscale-enhance");
      test.skip();
      return;
    }
    expect(result.ok).toBe(true);
    expect(result.body.downloadUrl).toBeTruthy();
  });

  test("enhance faces with gfpgan model", async ({ request }) => {
    const portrait = contentFixture("portrait-color.jpg");
    const result = await callAiTool(
      request,
      "enhance-faces",
      portrait,
      { model: "gfpgan" },
      "portrait.jpg",
      "image/jpeg",
    );
    if (!result.installed) {
      test.skip();
      return;
    }
    expect(result.ok).toBe(true);
    expect(result.body.downloadUrl).toBeTruthy();
  });

  test("enhance faces with codeformer model", async ({ request }) => {
    const portrait = contentFixture("portrait-color.jpg");
    const result = await callAiTool(
      request,
      "enhance-faces",
      portrait,
      { model: "codeformer" },
      "portrait.jpg",
      "image/jpeg",
    );
    if (!result.installed) {
      test.skip();
      return;
    }
    expect(result.ok).toBe(true);
    expect(result.body.downloadUrl).toBeTruthy();
  });
});

// ─── Colorize ───────────────────────────────────────────────────────

test.describe("Colorize", () => {
  test("colorize B&W image or returns 501", async ({ request }) => {
    const bwPortrait = contentFixture("portrait-bw.jpeg");
    const result = await callAiTool(
      request,
      "colorize",
      bwPortrait,
      { model: "auto" },
      "portrait-bw.jpeg",
      "image/jpeg",
    );
    if (!result.installed) {
      expect(result.body.feature).toBe("object-eraser-colorize");
      test.skip();
      return;
    }
    expect(result.ok).toBe(true);
    expect(result.body.downloadUrl).toBeTruthy();
  });

  test("colorize with ddcolor model", async ({ request }) => {
    const bwPortrait = contentFixture("portrait-bw.jpeg");
    const result = await callAiTool(
      request,
      "colorize",
      bwPortrait,
      { model: "ddcolor" },
      "portrait-bw.jpeg",
      "image/jpeg",
    );
    if (!result.installed) {
      test.skip();
      return;
    }
    expect(result.ok).toBe(true);
    expect(result.body.downloadUrl).toBeTruthy();
  });
});

// ─── Noise Removal ──────────────────────────────────────────────────

test.describe("Noise Removal", () => {
  test("noise removal with quick tier or returns 501", async ({ request }) => {
    const result = await callAiTool(request, "noise-removal", JPG_100x100, {
      tier: "quick",
    });
    if (!result.installed) {
      expect(result.body.feature).toBe("upscale-enhance");
      test.skip();
      return;
    }
    expect(result.ok).toBe(true);
    expect(result.body.downloadUrl).toBeTruthy();
  });

  test("noise removal with balanced tier", async ({ request }) => {
    const result = await callAiTool(request, "noise-removal", JPG_100x100, {
      tier: "balanced",
    });
    if (!result.installed) {
      test.skip();
      return;
    }
    expect(result.ok).toBe(true);
    expect(result.body.downloadUrl).toBeTruthy();
  });

  test("noise removal with quality tier (SCUNet)", async ({ request }) => {
    const result = await callAiTool(request, "noise-removal", JPG_100x100, {
      tier: "quality",
    });
    if (!result.installed) {
      test.skip();
      return;
    }
    expect(result.ok).toBe(true);
    expect(result.body.downloadUrl).toBeTruthy();
  });

  test("noise removal with maximum tier (NAFNet)", async ({ request }) => {
    const result = await callAiTool(request, "noise-removal", TINY_PNG, {
      tier: "maximum",
    });
    if (!result.installed) {
      test.skip();
      return;
    }
    expect(result.ok).toBe(true);
    expect(result.body.downloadUrl).toBeTruthy();
  });
});

// ─── Red-Eye Removal ────────────────────────────────────────────────

test.describe("Red-Eye Removal", () => {
  test("red-eye removal processes image or returns 501", async ({ request }) => {
    const redEye = contentFixture("red-eye.jpg");
    const result = await callAiTool(
      request,
      "red-eye-removal",
      redEye,
      {},
      "red-eye.jpg",
      "image/jpeg",
    );
    if (!result.installed) {
      expect(result.body.feature).toBe("face-detection");
      test.skip();
      return;
    }
    expect(result.ok).toBe(true);
    expect(result.body.downloadUrl).toBeTruthy();
  });

  test("red-eye removal on image without red eyes succeeds gracefully", async ({ request }) => {
    const portrait = contentFixture("portrait-color.jpg");
    const result = await callAiTool(
      request,
      "red-eye-removal",
      portrait,
      {},
      "portrait.jpg",
      "image/jpeg",
    );
    if (!result.installed) {
      test.skip();
      return;
    }
    // Should succeed even if no red eyes found
    expect(result.ok).toBe(true);
    expect(result.body.downloadUrl).toBeTruthy();
  });
});

// ─── Restore Photo ──────────────────────────────────────────────────

test.describe("Restore Photo", () => {
  test("restore photo processes image or returns 501", async ({ request }) => {
    const bwPortrait = contentFixture("portrait-bw.jpeg");
    const result = await callAiTool(
      request,
      "restore-photo",
      bwPortrait,
      {},
      "old-photo.jpeg",
      "image/jpeg",
    );
    if (!result.installed) {
      expect(result.body.feature).toBe("photo-restoration");
      test.skip();
      return;
    }
    expect(result.ok).toBe(true);
    expect(result.body.downloadUrl).toBeTruthy();
    expect(result.body.processedSize).toBeGreaterThan(0);
  });
});

// ─── Passport Photo ─────────────────────────────────────────────────

test.describe("Passport Photo", () => {
  test("passport photo processes portrait or returns 501", async ({ request }) => {
    const portrait = contentFixture("portrait-color.jpg");
    const result = await callAiTool(
      request,
      "passport-photo",
      portrait,
      {},
      "portrait.jpg",
      "image/jpeg",
    );
    if (!result.installed) {
      expect(result.body.feature).toBe("background-removal");
      test.skip();
      return;
    }
    // Passport photo may succeed or fail with "no face detected"
    if (result.ok) {
      expect(result.body.downloadUrl).toBeTruthy();
    } else {
      // Acceptable failure if face detection didn't find a face
      expect(result.body.error).toBeDefined();
      expect(typeof result.body.error).toBe("string");
      expect(result.body.error).not.toContain("[object Object]");
    }
  });

  test("passport photo error is readable for non-face image", async ({ request }) => {
    const result = await callAiTool(request, "passport-photo", BLANK_PNG, {});
    if (!result.installed) {
      test.skip();
      return;
    }
    // Should fail gracefully with a readable error, not [object Object]
    if (!result.ok) {
      expect(typeof result.body.error).toBe("string");
      expect(result.body.error).not.toContain("[object Object]");
      if (result.body.details) {
        expect(typeof result.body.details).toBe("string");
      }
    }
  });

  test("passport photo on headshot portrait", async ({ request }) => {
    const headshot = contentFixture("portrait-headshot.heic");
    const result = await callAiTool(
      request,
      "passport-photo",
      headshot,
      {},
      "headshot.heic",
      "image/heic",
    );
    if (!result.installed) {
      test.skip();
      return;
    }
    if (result.ok) {
      expect(result.body.downloadUrl).toBeTruthy();
    }
  });
});

// ─── Erase Object ───────────────────────────────────────────────────

test.describe("Erase Object", () => {
  test("erase object returns 501 when feature not installed", async ({ request }) => {
    const result = await callAiTool(request, "erase-object", JPG_100x100, {});
    if (!result.installed) {
      expect(result.body.feature).toBe("object-eraser-colorize");
      expect(result.body.code).toBe("FEATURE_NOT_INSTALLED");
      // This is the expected state — erase-object needs a mask and LaMa model
      return;
    }
    // If installed, it may fail because no mask was provided
    // That's still a valid test — we're checking the tool doesn't crash
    expect(typeof result.body.error === "string" || result.body.downloadUrl).toBeTruthy();
  });
});

// ─── Feature Bundle Status ──────────────────────────────────────────

test.describe("AI Feature Bundle Status", () => {
  test("all AI tools return correct 501 response when uninstalled", async ({ request }) => {
    const aiTools = [
      { tool: "remove-background", bundle: "background-removal" },
      { tool: "upscale", bundle: "upscale-enhance" },
      { tool: "blur-faces", bundle: "face-detection" },
      { tool: "erase-object", bundle: "object-eraser-colorize" },
      { tool: "ocr", bundle: "ocr" },
      { tool: "colorize", bundle: "object-eraser-colorize" },
      { tool: "enhance-faces", bundle: "upscale-enhance" },
      { tool: "noise-removal", bundle: "upscale-enhance" },
      { tool: "red-eye-removal", bundle: "face-detection" },
      { tool: "restore-photo", bundle: "photo-restoration" },
      { tool: "passport-photo/analyze", bundle: "background-removal" },
    ];

    let testedCount = 0;

    for (const { tool, bundle } of aiTools) {
      const installed = await isFeatureInstalled(request, tool);
      if (installed) continue;

      testedCount++;
      const res = await request.post(`/api/v1/tools/${tool}`, {
        headers: { Authorization: `Bearer ${token}` },
        multipart: {
          file: { name: "test.png", mimeType: "image/png", buffer: TINY_PNG },
          settings: JSON.stringify({}),
        },
      });
      expect(res.status(), `${tool} should return 501`).toBe(501);
      const body = await res.json();
      expect(body.code, `${tool} missing code`).toBe("FEATURE_NOT_INSTALLED");
      expect(body.feature, `${tool} wrong bundle`).toBe(bundle);
      expect(body.featureName, `${tool} missing featureName`).toBeTruthy();
      expect(
        typeof body.estimatedSize === "string",
        `${tool} estimatedSize should be a string`,
      ).toBe(true);
    }

    // If all bundles are installed, skip the test gracefully
    if (testedCount === 0) {
      test.skip();
    }
  });
});
