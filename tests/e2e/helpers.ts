import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { test as base, expect, type Page } from "@playwright/test";

// ---------------------------------------------------------------------------
// login() — fill the login form and submit (for tests that need fresh login)
// ---------------------------------------------------------------------------
export async function login(page: Page, username = "admin", password = "admin") {
  await page.goto("/login");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /login/i }).click();
  await page.waitForURL("/", { timeout: 15_000 });
}

// ---------------------------------------------------------------------------
// createTestImageFile() — create a small test PNG on disk and return its path
// ---------------------------------------------------------------------------
let _testImagePath: string | null = null;

export function getTestImagePath(): string {
  if (_testImagePath && fs.existsSync(_testImagePath)) return _testImagePath;

  const dir = path.join(process.cwd(), "test-results");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  _testImagePath = path.join(dir, "test-image.png");

  // Re-use an existing file (e.g. pre-created before the test run)
  if (fs.existsSync(_testImagePath)) return _testImagePath;

  try {
    const script = [
      "const sharp = require('sharp');",
      `sharp({create:{width:100,height:100,channels:4,background:{r:255,g:0,b:0,alpha:1}}}).png().toFile('${_testImagePath.replace(/'/g, "\\'")}')`,
    ].join(" ");
    execFileSync("node", ["-e", script], {
      cwd: process.cwd(),
      timeout: 5000,
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch {
    // Fallback: build a valid 100x100 RGBA PNG without sharp
    // zlib imported at top of file
    const width = 100;
    const height = 100;
    const raw = Buffer.alloc((1 + width * 4) * height);
    for (let y = 0; y < height; y++) {
      const off = y * (1 + width * 4);
      raw[off] = 0; // filter: none
      for (let x = 0; x < width; x++) {
        const px = off + 1 + x * 4;
        raw[px] = 255; // R
        raw[px + 3] = 255; // A
      }
    }
    const deflated = zlib.deflateSync(raw);

    const crc32 = (buf: Buffer) => {
      let c = 0xffffffff;
      const t = new Int32Array(256);
      for (let i = 0; i < 256; i++) {
        let v = i;
        for (let j = 0; j < 8; j++) v = v & 1 ? 0xedb88320 ^ (v >>> 1) : v >>> 1;
        t[i] = v;
      }
      for (let i = 0; i < buf.length; i++) c = t[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
      return (c ^ 0xffffffff) >>> 0;
    };

    const chunk = (type: string, data: Buffer) => {
      const tb = Buffer.from(type);
      const len = Buffer.alloc(4);
      len.writeUInt32BE(data.length);
      const crcBuf = Buffer.alloc(4);
      crcBuf.writeUInt32BE(crc32(Buffer.concat([tb, data])));
      return Buffer.concat([len, tb, data, crcBuf]);
    };

    const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8; // bit depth
    ihdr[9] = 6; // RGBA
    fs.writeFileSync(
      _testImagePath,
      Buffer.concat([
        sig,
        chunk("IHDR", ihdr),
        chunk("IDAT", deflated),
        chunk("IEND", Buffer.alloc(0)),
      ]),
    );
  }

  return _testImagePath;
}

// ---------------------------------------------------------------------------
// getTestHeicPath() — return a small HEIC test image (from fixtures)
// ---------------------------------------------------------------------------
export function getTestHeicPath(): string {
  return path.join(process.cwd(), "tests", "fixtures", "test-200x150.heic");
}

// ---------------------------------------------------------------------------
// uploadTestImage() — upload a test image via the file chooser on a tool page
// ---------------------------------------------------------------------------
export async function uploadTestImage(page: Page): Promise<void> {
  const testImagePath = getTestImagePath();

  const fileChooserPromise = page.waitForEvent("filechooser");
  const dropzone = page.locator("[class*='border-dashed']").first();
  await dropzone.click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles(testImagePath);

  // Wait for React state to update
  await page.waitForTimeout(500);
}

// ---------------------------------------------------------------------------
// waitForProcessing() — wait for processing to complete
// ---------------------------------------------------------------------------
export async function waitForProcessing(page: Page, timeoutMs = 30_000) {
  try {
    const spinner = page.locator("[class*='animate-spin']");
    if (await spinner.isVisible({ timeout: 2000 })) {
      await spinner.waitFor({ state: "hidden", timeout: timeoutMs });
    }
  } catch {
    // No spinner appeared — processing may have been instant
  }
}

// ---------------------------------------------------------------------------
// Custom test fixture — loggedInPage uses the saved storageState
// (all "chromium" project tests already have auth via storageState,
//  but this provides backward compatibility for tests that use it)
// ---------------------------------------------------------------------------
export const test = base.extend<{ loggedInPage: Page }>({
  loggedInPage: async ({ page }, use) => {
    // storageState is already loaded by the project config, just navigate
    await page.goto("/");
    await use(page);
  },
});

// ---------------------------------------------------------------------------
// isAiSidecarRunning() — check if the Python AI dispatcher is ready
// ---------------------------------------------------------------------------
export async function isAiSidecarRunning(page: Page): Promise<boolean> {
  try {
    const response = await page.request.get("/api/v1/admin/health");
    if (!response.ok()) return false;
    const health = (await response.json()) as {
      ai?: { dispatcher?: { ready?: boolean; running?: boolean } };
    };
    return health.ai?.dispatcher?.ready === true;
  } catch {
    return false;
  }
}

export { expect };
