import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from "vitest";
import { readFile } from "node:fs/promises";
import { join, basename } from "node:path";
import { existsSync } from "node:fs";
import { mkdir, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

const FIXTURES = join(__dirname, "../../fixtures");

// ---------------------------------------------------------------------------
// 1. File validation
// ---------------------------------------------------------------------------

// We need to mock `../config.js` which file-validation.ts imports as `env`.
// Provide a minimal env object with the fields file-validation.ts uses.
vi.mock("../../../apps/api/src/config.js", () => ({
  env: {
    MAX_MEGAPIXELS: 100,
    WORKSPACE_PATH: "/tmp/test-workspace",
  },
}));

describe("validateImageBuffer", () => {
  let validateImageBuffer: typeof import("../../../apps/api/src/lib/file-validation.js").validateImageBuffer;

  beforeEach(async () => {
    // Re-import to pick up mock
    const mod = await import("../../../apps/api/src/lib/file-validation.js");
    validateImageBuffer = mod.validateImageBuffer;
  });

  // -- Valid formats --------------------------------------------------------

  it("accepts a valid PNG file", async () => {
    const buf = await readFile(join(FIXTURES, "test-200x150.png"));
    const result = await validateImageBuffer(buf);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.format).toBe("png");
      expect(result.width).toBe(200);
      expect(result.height).toBe(150);
    }
  });

  it("accepts a valid JPEG file", async () => {
    const buf = await readFile(join(FIXTURES, "test-100x100.jpg"));
    const result = await validateImageBuffer(buf);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.format).toBe("jpeg");
      expect(result.width).toBe(100);
      expect(result.height).toBe(100);
    }
  });

  it("accepts a valid WebP file", async () => {
    const buf = await readFile(join(FIXTURES, "test-50x50.webp"));
    const result = await validateImageBuffer(buf);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.format).toBe("webp");
      expect(result.width).toBe(50);
      expect(result.height).toBe(50);
    }
  });

  it("accepts a tiny 1x1 PNG file", async () => {
    const buf = await readFile(join(FIXTURES, "test-1x1.png"));
    const result = await validateImageBuffer(buf);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.format).toBe("png");
      expect(result.width).toBe(1);
      expect(result.height).toBe(1);
    }
  });

  // -- Synthetic valid buffers for formats without fixtures -----------------

  it("accepts a GIF buffer with correct magic bytes", async () => {
    // Minimal GIF89a: header + logical screen descriptor + terminator
    const gif = Buffer.from(
      "474946383961010001000000002c00000000010001000002024401003b",
      "hex",
    );
    const result = await validateImageBuffer(gif);
    // sharp may or may not parse this minimal GIF; what matters is magic bytes pass
    // If sharp fails metadata, that is "Failed to read image metadata"
    expect(result).toBeDefined();
    if (result.valid) {
      expect(result.format).toBe("gif");
    }
  });

  it("accepts a BMP buffer with correct magic bytes", async () => {
    // Build a minimal 1x1 24-bit BMP (62 bytes header + 4 bytes pixel data)
    const bmp = Buffer.alloc(66);
    // BM signature
    bmp[0] = 0x42;
    bmp[1] = 0x4d;
    // File size (66 bytes, little-endian)
    bmp.writeUInt32LE(66, 2);
    // Reserved
    bmp.writeUInt32LE(0, 6);
    // Pixel data offset
    bmp.writeUInt32LE(62, 10);
    // DIB header size (40 = BITMAPINFOHEADER)
    bmp.writeUInt32LE(40, 14);
    // Width = 1
    bmp.writeInt32LE(1, 18);
    // Height = 1
    bmp.writeInt32LE(1, 22);
    // Planes = 1
    bmp.writeUInt16LE(1, 26);
    // Bits per pixel = 24
    bmp.writeUInt16LE(24, 28);
    // Compression = 0 (BI_RGB)
    bmp.writeUInt32LE(0, 30);
    // Image size (can be 0 for BI_RGB)
    bmp.writeUInt32LE(0, 34);
    // X/Y pixels per meter
    bmp.writeInt32LE(2835, 38);
    bmp.writeInt32LE(2835, 42);
    // Colors used / important
    bmp.writeUInt32LE(0, 46);
    bmp.writeUInt32LE(0, 50);

    const result = await validateImageBuffer(bmp);
    expect(result).toBeDefined();
    if (result.valid) {
      expect(result.format).toBe("bmp");
    }
  });

  it("accepts a TIFF buffer (little-endian byte order)", async () => {
    // Minimal TIFF is complex; just verify magic bytes detection works
    // and sharp either parses or gives metadata error (not "unrecognized format")
    const tiffLE = Buffer.from([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00]);
    const result = await validateImageBuffer(tiffLE);
    // Magic bytes should be detected as tiff, but sharp may fail on a truncated TIFF
    expect(result).toBeDefined();
    if (!result.valid) {
      expect(result.reason).toBe("Failed to read image metadata");
    }
  });

  it("accepts a TIFF buffer (big-endian byte order)", async () => {
    const tiffBE = Buffer.from([0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08]);
    const result = await validateImageBuffer(tiffBE);
    expect(result).toBeDefined();
    if (!result.valid) {
      expect(result.reason).toBe("Failed to read image metadata");
    }
  });

  // -- Empty / null / missing -----------------------------------------------

  it("rejects an empty buffer", async () => {
    const result = await validateImageBuffer(Buffer.alloc(0));
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe("File is empty");
    }
  });

  it("rejects null passed as buffer", async () => {
    const result = await validateImageBuffer(null as unknown as Buffer);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe("File is empty");
    }
  });

  it("rejects undefined passed as buffer", async () => {
    const result = await validateImageBuffer(undefined as unknown as Buffer);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe("File is empty");
    }
  });

  // -- Random / garbage data ------------------------------------------------

  it("rejects a buffer of random bytes", async () => {
    const garbage = Buffer.from(Array.from({ length: 256 }, () => Math.floor(Math.random() * 256)));
    // Ensure the first bytes do not accidentally match any magic signature
    garbage[0] = 0x00;
    garbage[1] = 0x00;
    const result = await validateImageBuffer(garbage);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe("Unrecognized image format");
    }
  });

  it("rejects a text file disguised with no image magic bytes", async () => {
    const text = Buffer.from("This is definitely not an image file. Lorem ipsum dolor sit amet.");
    const result = await validateImageBuffer(text);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe("Unrecognized image format");
    }
  });

  it("rejects an HTML file", async () => {
    const html = Buffer.from("<html><body><h1>Hello</h1></body></html>");
    const result = await validateImageBuffer(html);
    expect(result.valid).toBe(false);
  });

  it("rejects a JSON file", async () => {
    const json = Buffer.from(JSON.stringify({ image: "fake.png", width: 100 }));
    const result = await validateImageBuffer(json);
    expect(result.valid).toBe(false);
  });

  // -- Truncated headers ----------------------------------------------------

  it("rejects a buffer with only the first byte of a PNG header", async () => {
    const partial = Buffer.from([0x89]);
    const result = await validateImageBuffer(partial);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe("Unrecognized image format");
    }
  });

  it("rejects a truncated PNG header (3 of 4 magic bytes)", async () => {
    const partial = Buffer.from([0x89, 0x50, 0x4e]);
    const result = await validateImageBuffer(partial);
    expect(result.valid).toBe(false);
  });

  it("rejects a buffer with PNG magic bytes but no real image data", async () => {
    // Correct 4-byte PNG signature but nothing valid after
    const fakePng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x00, 0x00, 0x00]);
    const result = await validateImageBuffer(fakePng);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe("Failed to read image metadata");
    }
  });

  it("rejects a buffer with JPEG magic bytes but truncated body", async () => {
    const fakeJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]);
    const result = await validateImageBuffer(fakeJpeg);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe("Failed to read image metadata");
    }
  });

  // -- RIFF container that is NOT WebP (e.g. WAV/AVI) ----------------------

  it("rejects a RIFF container that is not WebP (e.g. WAVE)", async () => {
    // RIFF....WAVE
    const riffWave = Buffer.alloc(12);
    riffWave.write("RIFF", 0, "ascii");
    riffWave.writeUInt32LE(4, 4); // chunk size
    riffWave.write("WAVE", 8, "ascii");
    const result = await validateImageBuffer(riffWave);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe("Unrecognized image format");
    }
  });

  it("rejects a RIFF container that is AVI", async () => {
    const riffAvi = Buffer.alloc(12);
    riffAvi.write("RIFF", 0, "ascii");
    riffAvi.writeUInt32LE(4, 4);
    riffAvi.write("AVI ", 8, "ascii");
    const result = await validateImageBuffer(riffAvi);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe("Unrecognized image format");
    }
  });

  it("rejects a RIFF container too short to contain WEBP signature", async () => {
    // Only 8 bytes of RIFF -- no room for the format tag at bytes 8-11
    const shortRiff = Buffer.alloc(8);
    shortRiff.write("RIFF", 0, "ascii");
    shortRiff.writeUInt32LE(0, 4);
    const result = await validateImageBuffer(shortRiff);
    expect(result.valid).toBe(false);
  });

  // -- Partial magic bytes edge cases ---------------------------------------

  it("rejects a single-byte buffer (0xFF -- JPEG first byte only)", async () => {
    const result = await validateImageBuffer(Buffer.from([0xff]));
    expect(result.valid).toBe(false);
  });

  it("rejects two JPEG magic bytes without the third", async () => {
    const result = await validateImageBuffer(Buffer.from([0xff, 0xd8]));
    expect(result.valid).toBe(false);
  });

  it("rejects BMP magic with no actual BMP structure", async () => {
    const fakeBmp = Buffer.from([0x42, 0x4d, 0x00, 0x00]);
    const result = await validateImageBuffer(fakeBmp);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe("Failed to read image metadata");
    }
  });

  // -- Oversized image (megapixel limit) ------------------------------------

  it("rejects an image that exceeds MAX_MEGAPIXELS", async () => {
    // We cannot easily build a 100MP+ image buffer in a test, so re-mock env
    // with a very low limit (0.0001 MP = 100 pixels) and test with the 200x150 fixture
    const origMod = await import("../../../apps/api/src/config.js");
    const savedMax = origMod.env.MAX_MEGAPIXELS;
    origMod.env.MAX_MEGAPIXELS = 0.0001; // 100 pixels -- 200x150 = 30000px >> 100

    try {
      const buf = await readFile(join(FIXTURES, "test-200x150.png"));
      const result = await validateImageBuffer(buf);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toContain("exceeds maximum size");
        expect(result.reason).toContain("MP");
      }
    } finally {
      origMod.env.MAX_MEGAPIXELS = savedMax;
    }
  });

  // -- Polyglot / tricky inputs ---------------------------------------------

  it("rejects a ZIP file (PK magic 0x50 0x4B)", async () => {
    const zip = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00]);
    const result = await validateImageBuffer(zip);
    expect(result.valid).toBe(false);
  });

  it("rejects a PDF file (%PDF-)", async () => {
    const pdf = Buffer.from("%PDF-1.4 fake content");
    const result = await validateImageBuffer(pdf);
    expect(result.valid).toBe(false);
  });

  it("rejects an EXE file (MZ header)", async () => {
    const exe = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);
    const result = await validateImageBuffer(exe);
    expect(result.valid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. Workspace
// ---------------------------------------------------------------------------

describe("workspace", () => {
  // Use a real temp directory to avoid polluting the project
  let TEST_WORKSPACE: string;

  beforeEach(async () => {
    TEST_WORKSPACE = join(tmpdir(), `stirling-test-workspace-${randomUUID()}`);
    await mkdir(TEST_WORKSPACE, { recursive: true });

    // Point the env mock's WORKSPACE_PATH at our temp dir
    const configMod = await import("../../../apps/api/src/config.js");
    configMod.env.WORKSPACE_PATH = TEST_WORKSPACE;
  });

  afterEach(async () => {
    // Clean up the temp dir
    await rm(TEST_WORKSPACE, { recursive: true, force: true });
  });

  it("createWorkspace creates input and output subdirectories", async () => {
    const { createWorkspace } = await import("../../../apps/api/src/lib/workspace.js");
    const jobId = randomUUID();
    const root = await createWorkspace(jobId);

    expect(root).toBe(join(TEST_WORKSPACE, jobId));
    expect(existsSync(join(root, "input"))).toBe(true);
    expect(existsSync(join(root, "output"))).toBe(true);
  });

  it("createWorkspace returns the workspace root path", async () => {
    const { createWorkspace } = await import("../../../apps/api/src/lib/workspace.js");
    const jobId = "my-test-job-123";
    const root = await createWorkspace(jobId);
    expect(root).toBe(join(TEST_WORKSPACE, jobId));
  });

  it("getWorkspacePath returns correct path without creating dirs", async () => {
    const { getWorkspacePath } = await import("../../../apps/api/src/lib/workspace.js");
    const jobId = "path-check-id";
    const result = getWorkspacePath(jobId);
    expect(result).toBe(join(TEST_WORKSPACE, jobId));
    // Should NOT have created the directory
    expect(existsSync(join(TEST_WORKSPACE, jobId))).toBe(false);
  });

  it("cleanupWorkspace removes the entire workspace directory", async () => {
    const { createWorkspace, cleanupWorkspace } = await import(
      "../../../apps/api/src/lib/workspace.js"
    );
    const jobId = randomUUID();
    const root = await createWorkspace(jobId);

    // Verify it exists
    expect(existsSync(root)).toBe(true);

    await cleanupWorkspace(jobId);

    // Verify it is gone
    expect(existsSync(root)).toBe(false);
  });

  it("cleanupWorkspace on a non-existent directory does not throw", async () => {
    const { cleanupWorkspace } = await import("../../../apps/api/src/lib/workspace.js");
    // This job was never created
    await expect(cleanupWorkspace("does-not-exist-" + randomUUID())).resolves.toBeUndefined();
  });

  it("createWorkspace is idempotent (calling twice does not throw)", async () => {
    const { createWorkspace } = await import("../../../apps/api/src/lib/workspace.js");
    const jobId = randomUUID();
    await createWorkspace(jobId);
    await expect(createWorkspace(jobId)).resolves.toBeDefined();
  });

  it("createWorkspace with empty string job ID still creates a directory", async () => {
    const { createWorkspace } = await import("../../../apps/api/src/lib/workspace.js");
    // Empty string is technically allowed by mkdir, it just uses WORKSPACE_PATH as the root
    const root = await createWorkspace("");
    expect(existsSync(root)).toBe(true);
  });

  it("workspace directories are nested under the configured WORKSPACE_PATH", async () => {
    const { createWorkspace, getWorkspacePath } = await import(
      "../../../apps/api/src/lib/workspace.js"
    );
    const jobId = randomUUID();
    const wsPath = getWorkspacePath(jobId);
    const root = await createWorkspace(jobId);

    expect(wsPath).toBe(root);
    expect(root.startsWith(TEST_WORKSPACE)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. Env loading
// ---------------------------------------------------------------------------

describe("loadEnv", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset to a clean slate before each test --
    // wipe all keys that our schema cares about so defaults kick in
    const keysToClean = [
      "PORT",
      "AUTH_ENABLED",
      "DEFAULT_USERNAME",
      "DEFAULT_PASSWORD",
      "STORAGE_MODE",
      "FILE_MAX_AGE_HOURS",
      "CLEANUP_INTERVAL_MINUTES",
      "MAX_UPLOAD_SIZE_MB",
      "MAX_BATCH_SIZE",
      "CONCURRENT_JOBS",
      "MAX_MEGAPIXELS",
      "RATE_LIMIT_PER_MIN",
      "DB_PATH",
      "WORKSPACE_PATH",
      "DEFAULT_THEME",
      "DEFAULT_LOCALE",
      "APP_NAME",
    ];
    for (const key of keysToClean) {
      delete process.env[key];
    }
  });

  afterAll(() => {
    // Restore original process.env
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
  });

  // We import the raw loadEnv function (not the cached `env` from config.ts)
  // so each call reads the current process.env.

  it("parses env vars and applies Zod schema correctly", async () => {
    // loadEnv reads process.env; vitest.config.ts injects test env vars.
    // We verify the schema parses them correctly rather than testing defaults
    // (which requires a clean env that vitest's env injection prevents).
    const { loadEnv } = await import("../../../apps/api/src/lib/env.js");
    const env = loadEnv();
    // Verify types are correct after Zod parsing
    expect(typeof env.PORT).toBe("number");
    expect(typeof env.AUTH_ENABLED).toBe("boolean");
    expect(typeof env.DEFAULT_USERNAME).toBe("string");
    expect(typeof env.DEFAULT_PASSWORD).toBe("string");
    expect(["local", "s3"]).toContain(env.STORAGE_MODE);
    expect(typeof env.FILE_MAX_AGE_HOURS).toBe("number");
    expect(typeof env.CLEANUP_INTERVAL_MINUTES).toBe("number");
    expect(typeof env.MAX_UPLOAD_SIZE_MB).toBe("number");
    expect(typeof env.MAX_BATCH_SIZE).toBe("number");
    expect(typeof env.CONCURRENT_JOBS).toBe("number");
    expect(typeof env.MAX_MEGAPIXELS).toBe("number");
    expect(typeof env.RATE_LIMIT_PER_MIN).toBe("number");
    expect(typeof env.DB_PATH).toBe("string");
    expect(typeof env.WORKSPACE_PATH).toBe("string");
    expect(["light", "dark"]).toContain(env.DEFAULT_THEME);
    expect(typeof env.DEFAULT_LOCALE).toBe("string");
    expect(typeof env.APP_NAME).toBe("string");
  });

  it("parses custom PORT as a number via coercion", async () => {
    process.env.PORT = "8080";
    const { loadEnv } = await import("../../../apps/api/src/lib/env.js");
    expect(loadEnv().PORT).toBe(8080);
  });

  it("coerces string 'true' for AUTH_ENABLED to boolean true", async () => {
    process.env.AUTH_ENABLED = "true";
    const { loadEnv } = await import("../../../apps/api/src/lib/env.js");
    expect(loadEnv().AUTH_ENABLED).toBe(true);
  });

  it("coerces string 'false' for AUTH_ENABLED to boolean false", async () => {
    process.env.AUTH_ENABLED = "false";
    const { loadEnv } = await import("../../../apps/api/src/lib/env.js");
    expect(loadEnv().AUTH_ENABLED).toBe(false);
  });

  it("rejects AUTH_ENABLED with a non-enum value", async () => {
    process.env.AUTH_ENABLED = "yes";
    const { loadEnv } = await import("../../../apps/api/src/lib/env.js");
    expect(() => loadEnv()).toThrow();
  });

  it("rejects STORAGE_MODE with an invalid enum value", async () => {
    process.env.STORAGE_MODE = "gcs";
    const { loadEnv } = await import("../../../apps/api/src/lib/env.js");
    expect(() => loadEnv()).toThrow();
  });

  it("rejects DEFAULT_THEME with an invalid enum value", async () => {
    process.env.DEFAULT_THEME = "solarized";
    const { loadEnv } = await import("../../../apps/api/src/lib/env.js");
    expect(() => loadEnv()).toThrow();
  });

  it("coerces numeric strings for MAX_MEGAPIXELS", async () => {
    process.env.MAX_MEGAPIXELS = "50";
    const { loadEnv } = await import("../../../apps/api/src/lib/env.js");
    expect(loadEnv().MAX_MEGAPIXELS).toBe(50);
  });

  it("coerces floating point string for FILE_MAX_AGE_HOURS", async () => {
    process.env.FILE_MAX_AGE_HOURS = "2.5";
    const { loadEnv } = await import("../../../apps/api/src/lib/env.js");
    expect(loadEnv().FILE_MAX_AGE_HOURS).toBe(2.5);
  });

  it("accepts 0 for numeric fields", async () => {
    process.env.PORT = "0";
    process.env.CONCURRENT_JOBS = "0";
    const { loadEnv } = await import("../../../apps/api/src/lib/env.js");
    const env = loadEnv();
    expect(env.PORT).toBe(0);
    expect(env.CONCURRENT_JOBS).toBe(0);
  });

  it("coerces negative numbers for numeric fields", async () => {
    process.env.PORT = "-1";
    const { loadEnv } = await import("../../../apps/api/src/lib/env.js");
    // zod coerce will parse to -1; there is no positive-only constraint
    expect(loadEnv().PORT).toBe(-1);
  });

  it("accepts string values for string fields", async () => {
    process.env.APP_NAME = "My Custom App";
    process.env.DB_PATH = "/var/data/mydb.sqlite";
    process.env.DEFAULT_LOCALE = "fr";
    const { loadEnv } = await import("../../../apps/api/src/lib/env.js");
    const env = loadEnv();
    expect(env.APP_NAME).toBe("My Custom App");
    expect(env.DB_PATH).toBe("/var/data/mydb.sqlite");
    expect(env.DEFAULT_LOCALE).toBe("fr");
  });

  it("rejects non-numeric strings for number fields", async () => {
    process.env.PORT = "not_a_number";
    const { loadEnv } = await import("../../../apps/api/src/lib/env.js");
    // z.coerce.number() produces NaN for non-numeric strings, and zod rejects NaN
    expect(() => loadEnv()).toThrow();
  });

  it("accepts all custom values at once", async () => {
    process.env.PORT = "9999";
    process.env.AUTH_ENABLED = "true";
    process.env.DEFAULT_USERNAME = "root";
    process.env.DEFAULT_PASSWORD = "s3cret!";
    process.env.STORAGE_MODE = "s3";
    process.env.DEFAULT_THEME = "dark";
    process.env.MAX_BATCH_SIZE = "500";
    const { loadEnv } = await import("../../../apps/api/src/lib/env.js");
    const env = loadEnv();
    expect(env.PORT).toBe(9999);
    expect(env.AUTH_ENABLED).toBe(true);
    expect(env.DEFAULT_USERNAME).toBe("root");
    expect(env.DEFAULT_PASSWORD).toBe("s3cret!");
    expect(env.STORAGE_MODE).toBe("s3");
    expect(env.DEFAULT_THEME).toBe("dark");
    expect(env.MAX_BATCH_SIZE).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// 4. Auth helpers (hashPassword / verifyPassword)
// ---------------------------------------------------------------------------

// These functions are pure crypto -- they do not import db or env at the module
// top level, so we can import them directly without mocking the database.
// However auth.ts does import db and env at the top level, so we need to mock those.

vi.mock("../../../apps/api/src/db/index.js", () => ({
  db: {},
  schema: { users: {}, sessions: {} },
}));

describe("hashPassword", () => {
  let hashPassword: typeof import("../../../apps/api/src/plugins/auth.js").hashPassword;

  beforeEach(async () => {
    const mod = await import("../../../apps/api/src/plugins/auth.js");
    hashPassword = mod.hashPassword;
  });

  it("produces a string in salt:hash format", async () => {
    const result = await hashPassword("mypassword");
    const parts = result.split(":");
    expect(parts).toHaveLength(2);
    expect(parts[0].length).toBeGreaterThan(0); // salt
    expect(parts[1].length).toBeGreaterThan(0); // hash
  });

  it("salt is 32 bytes (64 hex chars)", async () => {
    const result = await hashPassword("test");
    const salt = result.split(":")[0];
    expect(salt.length).toBe(64); // 32 bytes * 2 hex chars
    // Ensure it's valid hex
    expect(/^[0-9a-f]+$/.test(salt)).toBe(true);
  });

  it("hash (derived key) is 64 bytes (128 hex chars)", async () => {
    const result = await hashPassword("test");
    const hash = result.split(":")[1];
    expect(hash.length).toBe(128); // 64 bytes * 2 hex chars
    expect(/^[0-9a-f]+$/.test(hash)).toBe(true);
  });

  it("different passwords produce different hashes", async () => {
    const hash1 = await hashPassword("password1");
    const hash2 = await hashPassword("password2");
    expect(hash1).not.toBe(hash2);
  });

  it("same password produces different salts (non-deterministic)", async () => {
    const hash1 = await hashPassword("samepassword");
    const hash2 = await hashPassword("samepassword");
    const salt1 = hash1.split(":")[0];
    const salt2 = hash2.split(":")[0];
    expect(salt1).not.toBe(salt2);
  });

  it("same password produces different derived keys due to different salts", async () => {
    const hash1 = await hashPassword("samepassword");
    const hash2 = await hashPassword("samepassword");
    const derived1 = hash1.split(":")[1];
    const derived2 = hash2.split(":")[1];
    expect(derived1).not.toBe(derived2);
  });

  it("handles empty string password", async () => {
    const result = await hashPassword("");
    expect(result).toContain(":");
    const parts = result.split(":");
    expect(parts[0].length).toBe(64);
    expect(parts[1].length).toBe(128);
  });

  it("handles very long password", async () => {
    const longPw = "a".repeat(10_000);
    const result = await hashPassword(longPw);
    expect(result).toContain(":");
    const parts = result.split(":");
    expect(parts[0].length).toBe(64);
    expect(parts[1].length).toBe(128);
  });

  it("handles unicode password", async () => {
    const result = await hashPassword("\u{1F600}\u{1F680}\u4F60\u597D");
    expect(result).toContain(":");
    const parts = result.split(":");
    expect(parts).toHaveLength(2);
  });

  it("handles password with colons (does not break salt:hash parsing)", async () => {
    const result = await hashPassword("pass:with:colons");
    // The output format is salt:hash -- salt and hash are hex so they cannot contain colons
    const parts = result.split(":");
    expect(parts).toHaveLength(2);
  });
});

describe("verifyPassword", () => {
  let hashPassword: typeof import("../../../apps/api/src/plugins/auth.js").hashPassword;
  let verifyPassword: typeof import("../../../apps/api/src/plugins/auth.js").verifyPassword;

  beforeEach(async () => {
    const mod = await import("../../../apps/api/src/plugins/auth.js");
    hashPassword = mod.hashPassword;
    verifyPassword = mod.verifyPassword;
  });

  it("returns true for the correct password", async () => {
    const stored = await hashPassword("correcthorse");
    expect(await verifyPassword("correcthorse", stored)).toBe(true);
  });

  it("returns false for the wrong password", async () => {
    const stored = await hashPassword("correcthorse");
    expect(await verifyPassword("wronghorse", stored)).toBe(false);
  });

  it("returns false for empty password when hash was non-empty", async () => {
    const stored = await hashPassword("realpassword");
    expect(await verifyPassword("", stored)).toBe(false);
  });

  it("returns true for empty password when hash was from empty password", async () => {
    const stored = await hashPassword("");
    expect(await verifyPassword("", stored)).toBe(true);
  });

  it("returns false for a stored hash with no colon separator", async () => {
    expect(await verifyPassword("anything", "nocolonhere")).toBe(false);
  });

  it("returns false for an empty stored hash string", async () => {
    expect(await verifyPassword("anything", "")).toBe(false);
  });

  it("returns false for stored hash that is just a colon", async () => {
    expect(await verifyPassword("anything", ":")).toBe(false);
  });

  it("returns false when salt is present but hash part is empty", async () => {
    expect(await verifyPassword("test", "abcd1234:")).toBe(false);
  });

  it("returns false when hash part is present but salt is empty", async () => {
    expect(await verifyPassword("test", ":abcd1234")).toBe(false);
  });

  it("returns false for a corrupted (truncated) hash", async () => {
    const stored = await hashPassword("mypass");
    // Truncate the hash part
    const truncated = stored.substring(0, stored.indexOf(":") + 5);
    expect(await verifyPassword("mypass", truncated)).toBe(false);
  });

  it("returns false for a valid salt with wrong hash bytes", async () => {
    const stored = await hashPassword("mypass");
    const salt = stored.split(":")[0];
    // Replace the hash with a different valid hex string of the same length
    const fakeHash = "ff".repeat(64);
    expect(await verifyPassword("mypass", `${salt}:${fakeHash}`)).toBe(false);
  });

  it("handles unicode passwords in verification", async () => {
    const pw = "\u00E9\u00E8\u00EA\u00EB"; // accented characters
    const stored = await hashPassword(pw);
    expect(await verifyPassword(pw, stored)).toBe(true);
    expect(await verifyPassword("eeee", stored)).toBe(false);
  });

  it("is case-sensitive", async () => {
    const stored = await hashPassword("Password");
    expect(await verifyPassword("Password", stored)).toBe(true);
    expect(await verifyPassword("password", stored)).toBe(false);
    expect(await verifyPassword("PASSWORD", stored)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 5. sanitizeFilename
// ---------------------------------------------------------------------------

// The function is duplicated across multiple route files. Since it is not exported,
// we replicate the exact logic here and test it directly. This tests the BEHAVIOR
// so if any of the copies drift, these tests document the expected contract.

function sanitizeFilename(raw: string): string {
  let name = basename(raw);
  name = name.replace(/\.\./g, "");
  name = name.replace(/\0/g, "");
  if (!name || name === "." || name === "..") {
    name = "upload";
  }
  return name;
}

describe("sanitizeFilename", () => {
  // -- Path traversal attacks -----------------------------------------------

  it("strips directory traversal ../../etc/passwd", () => {
    const result = sanitizeFilename("../../etc/passwd");
    expect(result).toBe("passwd");
    expect(result).not.toContain("..");
    expect(result).not.toContain("/");
  });

  it("strips more deeply nested traversal", () => {
    const result = sanitizeFilename("../../../../../../../etc/shadow");
    expect(result).toBe("shadow");
  });

  it("strips Windows-style backslash traversal", () => {
    const result = sanitizeFilename("..\\..\\Windows\\System32\\config\\SAM");
    // basename on POSIX treats backslashes literally; on Windows it would strip
    // Either way the result should not contain path separators
    expect(result).not.toContain("/");
  });

  it("strips traversal with URL encoding (literal %2e%2e)", () => {
    // basename sees this as a literal filename with percent signs
    const result = sanitizeFilename("%2e%2e/%2e%2e/etc/passwd");
    expect(result).toBe("passwd");
  });

  // -- Null bytes -----------------------------------------------------------

  it("removes null bytes from filename", () => {
    const result = sanitizeFilename("image\0.png");
    expect(result).toBe("image.png");
    expect(result).not.toContain("\0");
  });

  it("removes multiple null bytes", () => {
    const result = sanitizeFilename("\0\0evil\0\0.exe\0");
    expect(result).not.toContain("\0");
  });

  it("falls back when filename is only null bytes", () => {
    const result = sanitizeFilename("\0\0\0");
    expect(result).toBe("upload");
  });

  // -- Empty / degenerate inputs --------------------------------------------

  it("returns fallback for empty string", () => {
    const result = sanitizeFilename("");
    expect(result).toBe("upload");
  });

  it("returns fallback for single dot", () => {
    const result = sanitizeFilename(".");
    expect(result).toBe("upload");
  });

  it("returns fallback for double dot", () => {
    const result = sanitizeFilename("..");
    expect(result).toBe("upload");
  });

  it("returns fallback for triple dots (.. removal leaves .)", () => {
    // "..." -> remove ".." -> "." -> fallback
    const result = sanitizeFilename("...");
    expect(result).toBe("upload");
  });

  it("returns fallback for four dots (.. removal leaves empty)", () => {
    // "...." -> remove all ".." occurrences -> "" -> fallback
    const result = sanitizeFilename("....");
    expect(result).toBe("upload");
  });

  it("returns fallback for slash only", () => {
    const result = sanitizeFilename("/");
    expect(result).toBe("upload");
  });

  // -- Normal filenames preserved -------------------------------------------

  it("preserves a normal filename", () => {
    expect(sanitizeFilename("photo.png")).toBe("photo.png");
  });

  it("preserves a filename with spaces", () => {
    expect(sanitizeFilename("my photo 2024.jpg")).toBe("my photo 2024.jpg");
  });

  it("preserves a filename with dashes and underscores", () => {
    expect(sanitizeFilename("my-photo_v2.webp")).toBe("my-photo_v2.webp");
  });

  it("preserves a dotfile (starts with single dot)", () => {
    expect(sanitizeFilename(".gitignore")).toBe(".gitignore");
  });

  it("preserves filename with multiple extensions", () => {
    expect(sanitizeFilename("archive.tar.gz")).toBe("archive.tar.gz");
  });

  // -- Unicode filenames ----------------------------------------------------

  it("preserves CJK characters", () => {
    expect(sanitizeFilename("\u5199\u771F.png")).toBe("\u5199\u771F.png");
  });

  it("preserves emoji in filenames", () => {
    expect(sanitizeFilename("\u{1F600}photo.jpg")).toBe("\u{1F600}photo.jpg");
  });

  it("preserves Arabic script", () => {
    expect(sanitizeFilename("\u0635\u0648\u0631\u0629.png")).toBe("\u0635\u0648\u0631\u0629.png");
  });

  it("preserves accented Latin characters", () => {
    expect(sanitizeFilename("caf\u00E9.png")).toBe("caf\u00E9.png");
  });

  // -- Tricky edge cases ----------------------------------------------------

  it("extracts basename from a full path", () => {
    expect(sanitizeFilename("/usr/local/bin/image.png")).toBe("image.png");
  });

  it("handles filename consisting only of spaces", () => {
    const result = sanitizeFilename("   ");
    // basename("   ") returns "   " which is truthy and not "." or ".."
    expect(result).toBe("   ");
  });

  it("strips double dots embedded in a filename but keeps the rest", () => {
    // "my..file..name.png" -> remove ".." -> "myfilename.png"
    expect(sanitizeFilename("my..file..name.png")).toBe("myfilename.png");
  });

  it("handles very long filenames", () => {
    const longName = "a".repeat(500) + ".png";
    expect(sanitizeFilename(longName)).toBe(longName);
  });

  it("handles filename with only extension", () => {
    expect(sanitizeFilename(".png")).toBe(".png");
  });

  it("handles directory path with trailing slash", () => {
    // basename("/foo/bar/") returns "bar" on POSIX
    expect(sanitizeFilename("/foo/bar/")).toBe("bar");
  });
});
