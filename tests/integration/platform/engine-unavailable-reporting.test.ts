/**
 * An engine-unavailable 503 is the operator's container, not the caller's
 * file, so every route that can raise one has to leave a trace server side
 * (#1330, #1403). The single-file tool route already did; batch, pipeline, and
 * ocr-pdf sent the 503 and logged nothing, pipeline dropped the code, and a 503
 * raised inside the worker reached the job row as a bare message.
 *
 * The engines are faked rather than broken for real: the fleet and dev boxes
 * have ffmpeg and qpdf, and the point here is what the routes do with the
 * error, which media-input.test.ts and document-engine-unavailable.test.ts
 * already pin at the source.
 */
import { eq } from "drizzle-orm";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  type MockInstance,
  vi,
} from "vitest";
import { db, schema } from "../../../apps/api/src/db/index.js";
import { logger } from "../../../apps/api/src/lib/logger.js";
import { InputValidationError } from "../../../apps/api/src/modality/contract.js";
import { DocumentInputHandler } from "../../../apps/api/src/modality/document-input.js";
import { MediaInputHandler } from "../../../apps/api/src/modality/media-input.js";
import { fixtures, readFixture } from "../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../test-server.js";

const mocks = vi.hoisted(() => ({
  reportError: vi.fn(),
  /** Wraps the real helper, so each call site is visible past its once-per-process dedupe. */
  reportEngineUnavailable: vi.fn(),
  /** validatePdfPath calls to let through before it starts failing. */
  pdfPassesLeft: Number.POSITIVE_INFINITY,
}));

vi.mock("../../../apps/api/src/lib/error-report.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../apps/api/src/lib/error-report.js")>();
  return { ...actual, reportError: mocks.reportError };
});

vi.mock("../../../apps/api/src/lib/engine-unavailable.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../apps/api/src/lib/engine-unavailable.js")>();
  mocks.reportEngineUnavailable.mockImplementation(actual.reportEngineUnavailable);
  return { reportEngineUnavailable: mocks.reportEngineUnavailable };
});

vi.mock("../../../apps/api/src/modality/document-input.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../apps/api/src/modality/document-input.js")>();
  const { InputValidationError: IVE } = await import("../../../apps/api/src/modality/contract.js");
  return {
    ...actual,
    validatePdfPath: async (...args: Parameters<typeof actual.validatePdfPath>) => {
      if (mocks.pdfPassesLeft > 0) {
        mocks.pdfPassesLeft--;
        return actual.validatePdfPath(...args);
      }
      throw new IVE(
        "PDF processing is unavailable on this server because qpdf could not be started.",
        503,
        "Check QPDF_PATH: it must point at an executable qpdf binary.",
        "ENGINE_UNAVAILABLE",
      );
    },
  };
});

const VIDEO = readFixture(fixtures.video.tiny("mp4"));
const PDF = readFixture(fixtures.document.pdf3);
const SIG = readFixture(fixtures.image.base.png200);

let testApp: TestApp;
let app: TestApp["app"];
let token: string;
let prepareSpy: MockInstance<MediaInputHandler["prepare"]>;

function ffmpegMissing(): InputValidationError {
  return new InputValidationError(
    "Media processing is unavailable on this server because ffmpeg is not installed.",
    503,
    "Install ffmpeg in the container or set FFMPEG_PATH and FFPROBE_PATH.",
    "ENGINE_UNAVAILABLE",
  );
}

beforeAll(async () => {
  prepareSpy = vi.spyOn(MediaInputHandler.prototype, "prepare");
  testApp = await buildTestApp();
  app = testApp.app;
  token = await loginAsAdmin(app);
}, 30_000);

afterAll(async () => {
  prepareSpy.mockRestore();
  await testApp.cleanup();
}, 10_000);

beforeEach(() => {
  mocks.reportError.mockReset();
  mocks.reportEngineUnavailable.mockClear();
  mocks.pdfPassesLeft = Number.POSITIVE_INFINITY;
  prepareSpy.mockReset();
  prepareSpy.mockRejectedValue(ffmpegMissing());
});

async function post(url: string, parts: Parameters<typeof createMultipartPayload>[0]) {
  const { body, contentType } = createMultipartPayload(parts);
  return app.inject({
    method: "POST",
    url,
    body,
    headers: { "content-type": contentType, authorization: `Bearer ${token}` },
  });
}

function videoPart(filename: string) {
  return { name: "file", filename, contentType: "video/mp4", content: VIDEO };
}

/** Whether a route handed an engine-unavailable error for this tool to the helper. */
function helperSawEngineDown(toolId: string): boolean {
  return mocks.reportEngineUnavailable.mock.calls.some(
    ([err, id]) => (err as { code?: string }).code === "ENGINE_UNAVAILABLE" && id === toolId,
  );
}

function pdfPart(filename = "scan.pdf") {
  return { name: "file", filename, contentType: "application/pdf", content: PDF };
}

/** The reportError calls that carried an engine-unavailable error for this tool. */
function engineReports(toolId: string) {
  return mocks.reportError.mock.calls.filter(
    ([err, ctx]) =>
      (err as { code?: string }).code === "ENGINE_UNAVAILABLE" &&
      (ctx as { toolId?: string }).toolId === toolId,
  );
}

describe("engine-unavailable 503s are reported, not just returned (#1403)", () => {
  it("batch reports it once per tool, however many files fail", async () => {
    const res = await post("/api/v1/tools/video/mute-video/batch", [
      videoPart("a.mp4"),
      videoPart("b.mp4"),
      { name: "settings", content: "{}" },
    ]);
    // The per-file failure behavior is unchanged; the report is additive.
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(engineReports("mute-video")).toHaveLength(1);

    await post("/api/v1/tools/video/mute-video/batch", [
      videoPart("c.mp4"),
      { name: "settings", content: "{}" },
    ]);
    expect(engineReports("mute-video"), "a busy instance must not report per upload").toHaveLength(
      1,
    );
  });

  it("pipeline execute reports it and keeps the code in the reply", async () => {
    const res = await post("/api/v1/pipeline/execute", [
      videoPart("clip.mp4"),
      {
        name: "pipeline",
        content: JSON.stringify({ steps: [{ toolId: "trim-video", settings: {} }] }),
      },
    ]);
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ code: "ENGINE_UNAVAILABLE" });
    expect(engineReports("trim-video")).toHaveLength(1);
  });

  it("pipeline batch reports it once, with each file still failing on its own", async () => {
    const res = await post("/api/v1/pipeline/batch", [
      videoPart("one.mp4"),
      videoPart("two.mp4"),
      {
        name: "pipeline",
        content: JSON.stringify({ steps: [{ toolId: "extract-audio", settings: {} }] }),
      },
    ]);
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(engineReports("extract-audio")).toHaveLength(1);
  });

  it("the ocr-pdf route reports it", async () => {
    mocks.pdfPassesLeft = 0;
    const res = await post("/api/v1/tools/pdf/ocr-pdf", [
      { name: "file", filename: "scan.pdf", contentType: "application/pdf", content: PDF },
      { name: "settings", content: JSON.stringify({ quality: "fast", pages: "1" }) },
    ]);
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ code: "ENGINE_UNAVAILABLE" });
    expect(engineReports("ocr-pdf")).toHaveLength(1);
  });

  it("the ocr-pdf batch ingest reports it", async () => {
    mocks.pdfPassesLeft = 0;
    const res = await post("/api/v1/tools/pdf/ocr-pdf/batch", [
      pdfPart("a.pdf"),
      pdfPart("b.pdf"),
      { name: "settings", content: JSON.stringify({ quality: "fast", pages: "1" }) },
    ]);
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(helperSawEngineDown("ocr-pdf")).toBe(true);
  });

  it("pipeline execute with an ocr-pdf first step reports it and keeps the code", async () => {
    mocks.pdfPassesLeft = 0;
    const res = await post("/api/v1/pipeline/execute", [
      pdfPart(),
      {
        name: "pipeline",
        content: JSON.stringify({
          steps: [{ toolId: "ocr-pdf", settings: { quality: "fast", pages: "1" } }],
        }),
      },
    ]);
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ code: "ENGINE_UNAVAILABLE" });
    expect(helperSawEngineDown("ocr-pdf")).toBe(true);
  });

  it("sign-pdf answers a broken qpdf with its 503 instead of Invalid PDF", async () => {
    const docSpy = vi
      .spyOn(DocumentInputHandler.prototype, "prepare")
      .mockRejectedValueOnce(
        new InputValidationError(
          "PDF processing is unavailable on this server because qpdf could not be started.",
          503,
          "Check QPDF_PATH: it must point at an executable qpdf binary.",
          "ENGINE_UNAVAILABLE",
        ),
      );
    try {
      const res = await post("/api/v1/tools/pdf/sign-pdf", [
        pdfPart("in.pdf"),
        { name: "sig0", filename: "sig0.png", contentType: "image/png", content: SIG },
        {
          name: "placements",
          content: JSON.stringify([{ sig: 0, page: 0, x: 0, y: 0, w: 0.25, h: 0.1 }]),
        },
      ]);
      expect(res.statusCode).toBe(503);
      expect(res.json()).toMatchObject({
        code: "ENGINE_UNAVAILABLE",
        details: expect.stringContaining("QPDF_PATH"),
      });
      expect(engineReports("sign-pdf")).toHaveLength(1);
    } finally {
      docSpy.mockRestore();
    }
  });

  it("the single-file tool route answers every upload with the code, reporting once (#1407)", async () => {
    const upload = () =>
      post("/api/v1/tools/video/resize-video", [
        videoPart("clip.mp4"),
        { name: "settings", content: JSON.stringify({ width: 320 }) },
      ]);
    for (const res of [await upload(), await upload()]) {
      expect(res.statusCode).toBe(503);
      expect(res.json()).toMatchObject({ code: "ENGINE_UNAVAILABLE" });
    }
    expect(
      engineReports("resize-video"),
      "a busy instance must not report per upload",
    ).toHaveLength(1);
  });

  it("a 503 raised inside the worker keeps its code and details on the job row", async () => {
    const errorSpy = vi.spyOn(logger, "error");
    try {
      // The route's pre-validation passes; qpdf breaks before the worker runs.
      mocks.pdfPassesLeft = 1;
      const res = await post("/api/v1/tools/pdf/ocr-pdf", [
        { name: "file", filename: "scan.pdf", contentType: "application/pdf", content: PDF },
        { name: "settings", content: JSON.stringify({ quality: "fast", pages: "1" }) },
      ]);
      expect(res.statusCode).toBe(202);
      const { jobId } = res.json() as { jobId: string };

      let row: typeof schema.jobs.$inferSelect | undefined;
      for (let i = 0; i < 150; i++) {
        [row] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, jobId));
        if (row?.status === "failed") break;
        await new Promise((r) => setTimeout(r, 200));
      }
      expect(row?.status).toBe("failed");
      expect(row?.error).toMatchObject({
        code: "ENGINE_UNAVAILABLE",
        details: expect.stringContaining("QPDF_PATH"),
      });

      // The worker logs it as a fault instead of skipping it as bad input (#1330, #1407).
      expect(errorSpy).toHaveBeenCalledWith(
        expect.objectContaining({ jobId, toolId: "ocr-pdf" }),
        "tool job failed",
      );

      // A client reconnecting after the failure replays the same code and hint.
      const replay = await app.inject({
        method: "GET",
        url: `/api/v1/jobs/${jobId}/progress`,
        headers: { authorization: `Bearer ${token}` },
      });
      const frame = JSON.parse(replay.body.match(/data: (.+)/)?.[1] ?? "{}");
      expect(frame).toMatchObject({
        phase: "failed",
        code: "ENGINE_UNAVAILABLE",
        details: expect.stringContaining("QPDF_PATH"),
      });
    } finally {
      errorSpy.mockRestore();
    }
  });
});
