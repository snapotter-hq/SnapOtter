import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const config = vi.hoisted(() => ({
  FILES_STORAGE_PATH: "",
  STORAGE_MODE: "s3" as "local" | "s3",
  S3_BUCKET: "test-bucket",
  S3_REGION: "us-east-1",
  S3_ENDPOINT: "http://localhost:19000",
  S3_ACCESS_KEY_ID: "minioadmin",
  S3_SECRET_ACCESS_KEY: "minioadmin",
  S3_FORCE_PATH_STYLE: true,
  S3_PREFIX: "",
  PREVIEW_TIMEOUT_S: 300,
  LIBREOFFICE_TIMEOUT_S: 120,
}));

vi.mock("../../../apps/api/src/config.js", () => ({
  env: config,
}));

const s3Objects = vi.hoisted(() => new Map<string, Buffer>());
const s3MidStreamError = vi.hoisted(() => new Set<string>());
const s3GetStreamCalls = vi.hoisted(() => [] as string[]);

vi.mock("@snapotter/enterprise", () => ({
  loadS3Storage: vi.fn(async () => ({
    configureS3: vi.fn(),
    checkConnection: vi.fn(async () => {}),
    putObject: vi.fn(async (storedName: string, buf: Buffer) => {
      s3Objects.set(storedName, Buffer.from(buf));
    }),
    getObject: vi.fn(async (storedName: string) => {
      const buf = s3Objects.get(storedName);
      if (!buf) {
        throw Object.assign(new Error("NoSuchKey"), {
          name: "NoSuchKey",
          $metadata: { httpStatusCode: 404 },
        });
      }
      return Buffer.from(buf);
    }),
    getObjectStream: vi.fn(async (storedName: string) => {
      s3GetStreamCalls.push(storedName);
      if (s3MidStreamError.has(storedName)) {
        return new Readable({
          read() {
            this.push(Buffer.from("partial-bytes"));
            this.destroy(Object.assign(new Error("S3 stream reset"), { code: "EIO" }));
          },
        });
      }
      const buf = s3Objects.get(storedName);
      if (!buf) {
        throw Object.assign(new Error("NoSuchKey"), {
          name: "NoSuchKey",
          $metadata: { httpStatusCode: 404 },
        });
      }
      return Readable.from(Buffer.from(buf));
    }),
    deleteObject: vi.fn(async (storedName: string) => {
      s3Objects.delete(storedName);
    }),
    isMissingObjectError: vi.fn(
      (err: unknown) =>
        typeof err === "object" && err !== null && (err as { name?: string }).name === "NoSuchKey",
    ),
  })),
}));

interface FileRow {
  id: string;
  userId: string;
  originalName: string;
  storedName: string;
  mimeType: string;
}

const fileRows = vi.hoisted(() => new Map<string, FileRow>());
const mocks = vi.hoisted(() => ({
  reportError: vi.fn(),
  convertDocument: vi.fn(),
  runFfmpeg: vi.fn(),
}));

vi.mock("drizzle-orm", () => ({
  eq: (_col: unknown, val: string) => val,
}));

vi.mock("../../../apps/api/src/db/index.js", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: (id: string) => {
          const row = fileRows.get(id);
          return Promise.resolve(row ? [row] : []);
        },
      }),
    }),
  },
  schema: { userFiles: { id: "id" } },
}));

vi.mock("../../../apps/api/src/plugins/auth.js", () => ({
  requireAuth: () => ({ id: "user-1", role: "admin" }),
}));

vi.mock("../../../apps/api/src/permissions.js", () => ({
  hasEffectivePermission: async () => true,
  requirePermission: () => async () => true,
}));

vi.mock("../../../apps/api/src/lib/error-report.js", () => ({
  reportError: mocks.reportError,
}));

vi.mock("@snapotter/doc-engine", () => ({
  sofficeAvailable: () => true,
  convertDocument: mocks.convertDocument,
}));

vi.mock("@snapotter/media-engine", () => ({
  runFfmpeg: mocks.runFfmpeg,
  softwareEncoder: (codec: string) => codec,
}));

describe("GET /api/v1/files/:id/preview in S3 storage mode (#1575)", () => {
  let testDir: string;
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    testDir = join(tmpdir(), `snapotter-s3-preview-${randomUUID().slice(0, 8)}`);
    await mkdir(testDir, { recursive: true });
    config.FILES_STORAGE_PATH = testDir;
    config.STORAGE_MODE = "s3";
    s3Objects.clear();
    s3MidStreamError.clear();
    s3GetStreamCalls.length = 0;
    fileRows.clear();
    mocks.reportError.mockReset();
    mocks.convertDocument.mockReset();
    mocks.runFfmpeg.mockReset();

    vi.resetModules();
    const { filePreviewRoutes } = await import("../../../apps/api/src/routes/file-preview.js");
    app = Fastify();
    await filePreviewRoutes(app);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    await rm(testDir, { recursive: true, force: true });
  });

  async function seedS3File(opts: {
    id: string;
    originalName: string;
    mimeType: string;
    content: Buffer;
  }): Promise<FileRow> {
    const { saveFile } = await import("../../../apps/api/src/lib/file-storage.js");
    const storedName = await saveFile(opts.content, opts.originalName);
    // Confirm the stored file only exists in S3, never in FILES_STORAGE_PATH.
    expect(existsSync(join(testDir, storedName))).toBe(false);
    const row: FileRow = {
      id: opts.id,
      userId: "user-1",
      originalName: opts.originalName,
      storedName,
      mimeType: opts.mimeType,
    };
    fileRows.set(opts.id, row);
    return row;
  }

  it("streams a PDF directly from S3 when STORAGE_MODE=s3", async () => {
    const pdfBytes = Buffer.from("%PDF-1.4 s3-stored-pdf");
    await seedS3File({
      id: "pdf-s3-1",
      originalName: "manual.pdf",
      mimeType: "application/pdf",
      content: pdfBytes,
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/files/pdf-s3-1/preview",
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("application/pdf");
    expect(res.headers["cache-control"]).toBe("public, max-age=86400, immutable");
    expect(res.rawPayload.equals(pdfBytes)).toBe(true);
    expect(mocks.reportError).not.toHaveBeenCalled();
  });

  it("answers a missing PDF in S3 with a reported 500 and no immutable cache header", async () => {
    const row = await seedS3File({
      id: "pdf-s3-gone",
      originalName: "gone.pdf",
      mimeType: "application/pdf",
      content: Buffer.from("%PDF-1.4"),
    });
    s3Objects.delete(row.storedName);

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/files/pdf-s3-gone/preview",
    });

    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ error: "Could not prepare preview" });
    expect(res.headers["cache-control"]).toBeUndefined();
    expect(s3GetStreamCalls).toEqual([row.storedName]);
    expect(mocks.reportError).toHaveBeenCalledTimes(1);
  });

  it("stages an office document from S3 for LibreOffice conversion and caches the PDF", async () => {
    const docxBytes = Buffer.from("PK-fake-docx-from-s3");
    await seedS3File({
      id: "docx-s3-1",
      originalName: "report.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      content: docxBytes,
    });

    let stagedBytes: Buffer | null = null;
    mocks.convertDocument.mockImplementation(async (inputPath: string, outDir: string) => {
      stagedBytes = await readFile(inputPath);
      await writeFile(join(outDir, "input.pdf"), "%PDF-1.4 converted-from-s3");
    });

    const first = await app.inject({
      method: "GET",
      url: "/api/v1/files/docx-s3-1/preview",
    });

    expect(first.statusCode).toBe(200);
    expect(first.headers["content-type"]).toBe("application/pdf");
    expect(first.body).toBe("%PDF-1.4 converted-from-s3");
    expect(stagedBytes).toEqual(docxBytes);
    expect(mocks.reportError).not.toHaveBeenCalled();

    // Only the cached PDF remains in .previews (temp dir is cleaned up).
    const previewEntries = await readdir(join(testDir, ".previews"));
    expect(previewEntries).toEqual(["docx-s3-1.pdf"]);

    // Second request hits the local preview cache without fetching S3 or running LibreOffice.
    const s3ReadsBefore = s3GetStreamCalls.length;
    const second = await app.inject({
      method: "GET",
      url: "/api/v1/files/docx-s3-1/preview",
    });
    expect(second.statusCode).toBe(200);
    expect(second.body).toBe("%PDF-1.4 converted-from-s3");
    expect(s3GetStreamCalls.length).toBe(s3ReadsBefore);
    expect(mocks.convertDocument).toHaveBeenCalledTimes(1);
  });

  it("answers a missing S3 office document with a reported 500 and removes the staging dir", async () => {
    const row = await seedS3File({
      id: "docx-s3-gone",
      originalName: "gone.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      content: Buffer.from("PK"),
    });
    s3Objects.delete(row.storedName);

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/files/docx-s3-gone/preview",
    });

    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ error: "Could not prepare document preview" });
    expect(s3GetStreamCalls).toEqual([row.storedName]);
    expect(mocks.convertDocument).not.toHaveBeenCalled();
    expect(mocks.reportError).toHaveBeenCalledTimes(1);
    expect(await readdir(join(testDir, ".previews"))).toEqual([]);
  });

  it.each([
    ["audio", "audio-s3-1", "clip.wav", "audio/wav", "audio/mpeg", ".mp3"],
    ["video", "video-s3-1", "clip.mp4", "video/mp4", "video/mp4", ".mp4"],
  ])(
    "stages a %s file from S3 for ffmpeg, caches the preview, and removes the temp copy",
    async (_kind, id, originalName, mimeType, expectedContentType, expectedExt) => {
      const sourceBytes = Buffer.from(`s3-${originalName}-bytes`);
      await seedS3File({
        id,
        originalName,
        mimeType,
        content: sourceBytes,
      });

      let ffmpegInputBytes: Buffer | null = null;
      let ffmpegInputPath = "";
      mocks.runFfmpeg.mockImplementation(async (args: string[]) => {
        const iIdx = args.indexOf("-i");
        ffmpegInputPath = args[iIdx + 1];
        ffmpegInputBytes = await readFile(ffmpegInputPath);
        const outputPath = args.at(-1) ?? "";
        await writeFile(outputPath, `encoded-${id}`);
      });

      const first = await app.inject({
        method: "GET",
        url: `/api/v1/files/${id}/preview`,
      });

      expect(first.statusCode).toBe(200);
      expect(first.headers["content-type"]).toBe(expectedContentType);
      expect(first.body).toBe(`encoded-${id}`);
      expect(ffmpegInputBytes).toEqual(sourceBytes);
      expect(ffmpegInputPath.endsWith(expectedExt === ".mp4" ? ".mp4" : ".wav")).toBe(true);
      expect(existsSync(ffmpegInputPath)).toBe(false);
      expect(mocks.reportError).not.toHaveBeenCalled();

      // Only the final cached preview remains in .previews.
      const previewEntries = await readdir(join(testDir, ".previews"));
      expect(previewEntries).toEqual([`${id}${expectedExt}`]);

      // Second request serves the cached preview without fetching S3 or running ffmpeg.
      const s3ReadsBefore = s3GetStreamCalls.length;
      const second = await app.inject({
        method: "GET",
        url: `/api/v1/files/${id}/preview`,
      });
      expect(second.statusCode).toBe(200);
      expect(second.body).toBe(`encoded-${id}`);
      expect(s3GetStreamCalls.length).toBe(s3ReadsBefore);
      expect(mocks.runFfmpeg).toHaveBeenCalledTimes(1);
    },
  );

  it("answers a missing S3 media file with a reported 500, without running ffmpeg, and removes the temp dir", async () => {
    const row = await seedS3File({
      id: "audio-s3-gone",
      originalName: "gone.wav",
      mimeType: "audio/wav",
      content: Buffer.from("RIFF"),
    });
    s3Objects.delete(row.storedName);

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/files/audio-s3-gone/preview",
    });

    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ error: "Could not prepare preview" });
    expect(s3GetStreamCalls).toEqual([row.storedName]);
    expect(mocks.runFfmpeg).not.toHaveBeenCalled();
    expect(mocks.reportError).toHaveBeenCalledTimes(1);
    expect(await readdir(join(testDir, ".previews"))).toEqual([]);
  });

  it("cleans up the non-empty staging dir and reports 500 when the S3 stream fails mid-transfer", async () => {
    const row = await seedS3File({
      id: "video-s3-midstream-err",
      originalName: "cut.mp4",
      mimeType: "video/mp4",
      content: Buffer.from("mp4-bytes"),
    });
    s3MidStreamError.add(row.storedName);

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/files/video-s3-midstream-err/preview",
    });

    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ error: "Could not prepare preview" });
    expect(s3GetStreamCalls).toEqual([row.storedName]);
    expect(mocks.runFfmpeg).not.toHaveBeenCalled();
    expect(mocks.reportError).toHaveBeenCalledTimes(1);
    expect(await readdir(join(testDir, ".previews"))).toEqual([]);
  });

  it("removes both the S3 temp input dir and partial output when ffmpeg fails mid-encode", async () => {
    await seedS3File({
      id: "audio-s3-fail",
      originalName: "bad.wav",
      mimeType: "audio/wav",
      content: Buffer.from("corrupt-wav"),
    });

    mocks.runFfmpeg.mockImplementation(async (args: string[]) => {
      const outputPath = args.at(-1) ?? "";
      await writeFile(outputPath, "partial-mp3");
      throw new Error("ffmpeg: Invalid data found when processing input");
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/files/audio-s3-fail/preview",
    });

    expect(res.statusCode).toBe(422);
    expect(res.json()).toEqual({ error: "Could not generate preview" });
    expect(mocks.reportError).not.toHaveBeenCalled();
    expect(await readdir(join(testDir, ".previews"))).toEqual([]);
  });

  it("keeps reading local media files in place when STORAGE_MODE=local without staging a duplicate copy", async () => {
    config.STORAGE_MODE = "local";
    const { saveFile, getStoredFilePath } = await import(
      "../../../apps/api/src/lib/file-storage.js"
    );
    const storedName = await saveFile(Buffer.from("local-video-bytes"), "movie.mp4");
    fileRows.set("video-local-1", {
      id: "video-local-1",
      userId: "user-1",
      originalName: "movie.mp4",
      storedName,
      mimeType: "video/mp4",
    });

    let ffmpegInputPath = "";
    mocks.runFfmpeg.mockImplementation(async (args: string[]) => {
      const iIdx = args.indexOf("-i");
      ffmpegInputPath = args[iIdx + 1];
      const outputPath = args.at(-1) ?? "";
      await writeFile(outputPath, "encoded-local-video");
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/files/video-local-1/preview",
    });

    expect(res.statusCode).toBe(200);
    expect(ffmpegInputPath).toBe(getStoredFilePath(storedName));
    expect(existsSync(ffmpegInputPath)).toBe(true);
    expect(s3GetStreamCalls).toHaveLength(0);
  });
});
