import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const config = vi.hoisted(() => ({
  FILES_STORAGE_PATH: "",
  PREVIEW_TIMEOUT_S: 300,
  LIBREOFFICE_TIMEOUT_S: 120,
}));

vi.mock("../../../apps/api/src/config.js", () => ({
  env: config,
}));

const loggerMock = vi.hoisted(() => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock("../../../apps/api/src/lib/logger.js", () => ({ logger: loggerMock }));

vi.mock("../../../apps/api/src/db/index.js", () => ({
  db: { select: vi.fn() },
  schema: { userFiles: {} },
}));

vi.mock("@snapotter/doc-engine", () => ({
  convertDocument: vi.fn(),
  sofficeAvailable: vi.fn(),
}));

vi.mock("@snapotter/media-engine", () => ({
  runFfmpeg: vi.fn(),
  softwareEncoder: vi.fn((x) => x),
}));

let testDir: string;
let previewDir: string;

beforeEach(async () => {
  testDir = join(tmpdir(), `snapotter-preview-test-${randomUUID().slice(0, 8)}`);
  previewDir = join(testDir, ".previews");
  await mkdir(previewDir, { recursive: true });
  config.FILES_STORAGE_PATH = testDir;
  vi.resetModules();
});

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

describe("deletePreview (#1320)", () => {
  it("unlinks .mp4, .mp3, and .pdf preview files for the file id", async () => {
    const { deletePreview } = await import("../../../apps/api/src/routes/file-preview.js");
    const fileId = "test-file-123";

    await writeFile(join(previewDir, `${fileId}.mp4`), "video-data");
    await writeFile(join(previewDir, `${fileId}.mp3`), "audio-data");
    await writeFile(join(previewDir, `${fileId}.pdf`), "pdf-data");
    await writeFile(join(previewDir, "other-file.mp4"), "other-data");

    await deletePreview(fileId);

    expect(existsSync(join(previewDir, `${fileId}.mp4`))).toBe(false);
    expect(existsSync(join(previewDir, `${fileId}.mp3`))).toBe(false);
    expect(existsSync(join(previewDir, `${fileId}.pdf`))).toBe(false);
    expect(existsSync(join(previewDir, "other-file.mp4"))).toBe(true);
  });

  it("is idempotent when preview files do not exist", async () => {
    const { deletePreview } = await import("../../../apps/api/src/routes/file-preview.js");
    await expect(deletePreview("nonexistent-file-id")).resolves.toBeUndefined();
  });
});

describe("ensurePreviewDir startup sweep (#1320)", () => {
  async function makeStale(path: string): Promise<void> {
    const old = new Date(Date.now() - (config.PREVIEW_TIMEOUT_S + 60) * 1000);
    await utimes(path, old, old);
  }

  it("removes stale temp dirs and .part files but keeps cached previews", async () => {
    await mkdir(join(previewDir, "doc-abc123"));
    await writeFile(join(previewDir, "doc-abc123", "input.docx"), "x");
    await writeFile(join(previewDir, "vid.1234.part.mp4"), "partial");
    await writeFile(join(previewDir, "vid.mp4"), "cached");
    await makeStale(join(previewDir, "doc-abc123"));
    await makeStale(join(previewDir, "vid.1234.part.mp4"));
    await makeStale(join(previewDir, "vid.mp4"));

    const { ensurePreviewDir } = await import("../../../apps/api/src/routes/file-preview.js");
    await ensurePreviewDir();

    expect(existsSync(join(previewDir, "doc-abc123"))).toBe(false);
    expect(existsSync(join(previewDir, "vid.1234.part.mp4"))).toBe(false);
    expect(existsSync(join(previewDir, "vid.mp4"))).toBe(true);
  });

  it("leaves fresh temp work alone, since another replica may still be writing it", async () => {
    await mkdir(join(previewDir, "doc-live01"));
    await writeFile(join(previewDir, "aud.5678.part.mp3"), "partial");

    const { ensurePreviewDir } = await import("../../../apps/api/src/routes/file-preview.js");
    await ensurePreviewDir();

    expect(existsSync(join(previewDir, "doc-live01"))).toBe(true);
    expect(existsSync(join(previewDir, "aud.5678.part.mp3"))).toBe(true);
  });

  it("sweeps once per process, even for concurrent first calls", async () => {
    const { ensurePreviewDir } = await import("../../../apps/api/src/routes/file-preview.js");
    const first = ensurePreviewDir();
    const second = ensurePreviewDir();
    expect(second).toBe(first);
    await first;

    // Work created after the sweep survives a later call, stale or not.
    await mkdir(join(previewDir, "doc-after1"));
    await makeStale(join(previewDir, "doc-after1"));
    await ensurePreviewDir();
    expect(existsSync(join(previewDir, "doc-after1"))).toBe(true);
  });
});
