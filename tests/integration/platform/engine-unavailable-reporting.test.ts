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
import { randomUUID } from "node:crypto";
import { SafeError } from "@snapotter/shared";
import { eq } from "drizzle-orm";
import {
  afterAll,
  afterEach,
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
import { ImageInputHandler } from "../../../apps/api/src/modality/image-input.js";
import { MediaInputHandler } from "../../../apps/api/src/modality/media-input.js";
import { buildBatchReplayEvent } from "../../../apps/api/src/routes/progress.js";
import { getToolConfig } from "../../../apps/api/src/routes/tool-factory.js";
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
  return { ...actual, reportEngineUnavailable: mocks.reportEngineUnavailable };
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
    // Every file failed on the same missing engine, so the batch says so
    // instead of a generic 422, and each file keeps its code (#1432).
    expect(res.statusCode, res.body).toBe(503);
    const body = res.json() as {
      code?: string;
      details?: string;
      errors: Array<{ filename: string; code?: string }>;
    };
    expect(body.code).toBe("ENGINE_UNAVAILABLE");
    expect(body.details).toContain("FFPROBE_PATH");
    expect(body.errors.map((e) => e.code)).toEqual(["ENGINE_UNAVAILABLE", "ENGINE_UNAVAILABLE"]);
    expect(engineReports("mute-video")).toHaveLength(1);

    await post("/api/v1/tools/video/mute-video/batch", [
      videoPart("c.mp4"),
      { name: "settings", content: "{}" },
    ]);
    expect(engineReports("mute-video"), "a busy instance must not report per upload").toHaveLength(
      1,
    );
  });

  it("a batch that fails at upload on the missing engine replays its code and hint as a frame (#2178)", async () => {
    const clientJobId = randomUUID();
    const res = await post("/api/v1/tools/video/mute-video/batch", [
      videoPart("a.mp4"),
      videoPart("b.mp4"),
      { name: "settings", content: "{}" },
      { name: "clientJobId", content: clientJobId },
    ]);
    expect(res.statusCode, res.body).toBe(503);

    const [row] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, clientJobId));
    const replayed = buildBatchReplayEvent({
      jobId: clientJobId,
      status: row.status,
      progress: row.progress,
      error: row.error,
    });
    expect(replayed.status).toBe("failed");
    expect(replayed.code).toBe("ENGINE_UNAVAILABLE");
    expect(replayed.details).toContain("FFPROBE_PATH");
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
    expect(res.statusCode, res.body).toBe(503);
    expect(res.json()).toMatchObject({
      code: "ENGINE_UNAVAILABLE",
      details: expect.stringContaining("FFPROBE_PATH"),
      errors: [{ code: "ENGINE_UNAVAILABLE" }, { code: "ENGINE_UNAVAILABLE" }],
    });
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

// #1432 gave the upload-time failure its status and code; the same missing
// engine one step later, inside the worker, still answered a bare 422 (#1627).
describe("a batch whose files all fail in the worker on one engine fault (#1627)", () => {
  const PNG = readFixture(fixtures.image.base.png200);
  const pngPart = (filename: string) => ({
    name: "file",
    filename,
    contentType: "image/png",
    content: PNG,
  });
  const HINT = "Check the container's image libraries.";

  function engineDown(): InputValidationError {
    return new InputValidationError(
      "Image processing is unavailable on this server because its engine could not start.",
      503,
      HINT,
      "ENGINE_UNAVAILABLE",
    );
  }

  // Restored after every test, so one that times out mid-request can't leave
  // the fake installed for the next.
  let restoreWorker: (() => void) | null = null;
  afterEach(() => {
    restoreWorker?.();
    restoreWorker = null;
  });

  /** Make the worker's run of `toolId` fail with each error in turn. */
  function failInWorker(toolId: string, ...errors: Error[]): void {
    const config = getToolConfig(toolId);
    if (!config?.processV2) throw new Error(`${toolId} has no processV2`);
    const real = config.processV2;
    let call = 0;
    config.processV2 = async () => {
      throw errors[Math.min(call++, errors.length - 1)];
    };
    restoreWorker = () => {
      config.processV2 = real;
    };
  }

  async function parentRow(id: string) {
    const [row] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, id));
    return row;
  }

  it("answers the shared status, code and hint, with each file's code", async () => {
    failInWorker("resize", engineDown());
    const clientJobId = randomUUID();
    const res = await post("/api/v1/tools/image/resize/batch", [
      pngPart("a.png"),
      pngPart("b.png"),
      { name: "settings", content: JSON.stringify({ width: 50 }) },
      { name: "clientJobId", content: clientJobId },
    ]);
    expect(res.statusCode, res.body).toBe(503);
    expect(res.json()).toMatchObject({
      error: engineDown().message,
      code: "ENGINE_UNAVAILABLE",
      details: HINT,
      errors: [{ code: "ENGINE_UNAVAILABLE" }, { code: "ENGINE_UNAVAILABLE" }],
    });

    // The terminal state a reconnecting client replays says the same thing.
    const row = await parentRow(clientJobId);
    expect(row?.error).toMatchObject({
      message: engineDown().message,
      code: "ENGINE_UNAVAILABLE",
      hint: HINT,
    });
    // ...as a frame, with the fault's code and hint beside the text (#2178).
    expect(
      buildBatchReplayEvent({
        jobId: clientJobId,
        status: row.status,
        progress: row.progress,
        error: row.error,
      }),
    ).toMatchObject({ status: "failed", code: "ENGINE_UNAVAILABLE", details: HINT });
    // failBatchJob keeps the per-file entries, plus the run's own blank-name
    // one, as the row error's details.
    const entries = (row?.error as { details?: Array<{ filename: string; error: string }> })
      ?.details;
    expect(entries?.at(-1)).toEqual({ filename: "", error: `${engineDown().message}: ${HINT}` });
  });

  it("counts a file that failed the same way at upload alongside the worker's", async () => {
    // The first file's upload-time check hits the fault; the second gets
    // through and hits it in the worker.
    const prepare = vi
      .spyOn(ImageInputHandler.prototype, "prepare")
      .mockRejectedValueOnce(engineDown());
    try {
      failInWorker("resize", engineDown());
      const res = await post("/api/v1/tools/image/resize/batch", [
        pngPart("a.png"),
        pngPart("b.png"),
        { name: "settings", content: JSON.stringify({ width: 50 }) },
      ]);
      expect(res.statusCode, res.body).toBe(503);
      expect(res.json()).toMatchObject({
        code: "ENGINE_UNAVAILABLE",
        errors: [{ filename: "a.png", code: "ENGINE_UNAVAILABLE" }, { code: "ENGINE_UNAVAILABLE" }],
      });
    } finally {
      prepare.mockRestore();
    }
  });

  it("keeps the generic 422 when the files failed for different reasons", async () => {
    failInWorker(
      "resize",
      engineDown(),
      new InputValidationError("This image is too small to resize.", 400),
    );
    const res = await post("/api/v1/tools/image/resize/batch", [
      pngPart("a.png"),
      pngPart("b.png"),
      { name: "settings", content: JSON.stringify({ width: 50 }) },
    ]);
    expect(res.statusCode, res.body).toBe(422);
    const body = res.json() as { error: string; code?: string; errors: Array<{ code?: string }> };
    expect(body.error).toBe("All files failed processing");
    expect(body.code).toBeUndefined();
    // The file that did hit the engine fault still says so.
    expect(body.errors.filter((e) => e.code === "ENGINE_UNAVAILABLE")).toHaveLength(1);
  });

  it("pipeline batch answers the shared fault too", async () => {
    failInWorker("resize", engineDown());
    const res = await post("/api/v1/pipeline/batch", [
      pngPart("one.png"),
      pngPart("two.png"),
      {
        name: "pipeline",
        content: JSON.stringify({ steps: [{ toolId: "resize", settings: { width: 50 } }] }),
      },
    ]);
    expect(res.statusCode, res.body).toBe(503);
    expect(res.json()).toMatchObject({
      code: "ENGINE_UNAVAILABLE",
      details: HINT,
      errors: [{ code: "ENGINE_UNAVAILABLE" }, { code: "ENGINE_UNAVAILABLE" }],
    });
  });

  // #2179: single-file execute read only the finalize's resultPayload and
  // answered 422 for every failed step, a server fault included. The failed
  // step's status, code and hint now ride the payload next to its message.
  it("pipeline execute answers a step's server fault with its status, code and hint (#2179)", async () => {
    failInWorker("resize", engineDown());
    const res = await post("/api/v1/pipeline/execute", [
      pngPart("one.png"),
      {
        name: "pipeline",
        content: JSON.stringify({ steps: [{ toolId: "resize", settings: { width: 50 } }] }),
      },
    ]);
    expect(res.statusCode, res.body).toBe(503);
    expect(res.json()).toMatchObject({
      error: `Step 1: ${engineDown().message}`,
      code: "ENGINE_UNAVAILABLE",
      details: HINT,
      completedSteps: [],
    });
  });

  it("pipeline execute keeps the completed steps when a later step hits the fault (#2179)", async () => {
    failInWorker("resize", engineDown());
    const res = await post("/api/v1/pipeline/execute", [
      pngPart("one.png"),
      {
        name: "pipeline",
        content: JSON.stringify({
          steps: [
            { toolId: "rotate", settings: { angle: 90 } },
            { toolId: "resize", settings: { width: 50 } },
          ],
        }),
      },
    ]);
    expect(res.statusCode, res.body).toBe(503);
    const body = res.json();
    expect(body.code).toBe("ENGINE_UNAVAILABLE");
    expect(body.error).toBe(`Step 2: ${engineDown().message}`);
    expect(body.completedSteps).toHaveLength(1);
  });

  it("pipeline execute still answers 422 for a step that failed for another reason (#2179)", async () => {
    failInWorker("resize", new Error("Resize ran out of road"));
    const res = await post("/api/v1/pipeline/execute", [
      pngPart("one.png"),
      {
        name: "pipeline",
        content: JSON.stringify({ steps: [{ toolId: "resize", settings: { width: 50 } }] }),
      },
    ]);
    expect(res.statusCode, res.body).toBe(422);
    expect(res.json().error).toBe("Step 1: Resize ran out of road");
    expect(res.json().code).toBeUndefined();
  });

  // #2210: the worker recorded a status on a failed row only for input errors,
  // so a step that died on a storage SafeError (a full workspace, an unwritable
  // volume) came back 422 from every route that reads the row.
  describe("a storage fault inside the worker keeps its status and code (#2210)", () => {
    const storageFull = () =>
      new SafeError("The server's storage is full.", {
        statusCode: 503,
        code: "storage-full",
      });
    const resizePipeline = {
      name: "pipeline",
      content: JSON.stringify({ steps: [{ toolId: "resize", settings: { width: 50 } }] }),
    };

    it("pipeline execute answers 503 with the code", async () => {
      failInWorker("resize", storageFull());
      const res = await post("/api/v1/pipeline/execute", [pngPart("one.png"), resizePipeline]);

      expect(res.statusCode, res.body).toBe(503);
      expect(res.json()).toMatchObject({
        error: `Step 1: ${storageFull().message}`,
        code: "storage-full",
      });
    });

    it("the single-file tool route answers 503 with the code instead of Processing failed", async () => {
      failInWorker("resize", storageFull());
      const res = await post("/api/v1/tools/image/resize", [
        pngPart("one.png"),
        { name: "settings", content: JSON.stringify({ width: 50 }) },
      ]);

      expect(res.statusCode, res.body).toBe(503);
      expect(res.json()).toMatchObject({ error: storageFull().message, code: "storage-full" });
    });

    it("a batch whose every file hits it answers the shared status and code", async () => {
      failInWorker("resize", storageFull());
      const res = await post("/api/v1/tools/image/resize/batch", [
        pngPart("a.png"),
        pngPart("b.png"),
        { name: "settings", content: JSON.stringify({ width: 50 }) },
      ]);

      expect(res.statusCode, res.body).toBe(503);
      expect(res.json()).toMatchObject({ code: "storage-full" });
    });

    it("keeps the status on the failed job row", async () => {
      failInWorker("resize", storageFull());
      const clientJobId = randomUUID();
      const res = await post("/api/v1/tools/image/resize", [
        pngPart("one.png"),
        { name: "settings", content: JSON.stringify({ width: 50 }) },
        { name: "clientJobId", content: clientJobId },
      ]);
      expect(res.statusCode, res.body).toBe(503);

      const [row] = await db
        .select()
        .from(schema.jobs)
        .where(eq(schema.jobs.id, res.json().jobId ?? clientJobId));
      expect(row?.error).toMatchObject({ code: "storage-full", httpStatus: 503 });
    });

    it("keeps the single-file 422 for a SafeError that is not a server fault", async () => {
      failInWorker(
        "resize",
        new SafeError("That setting is not allowed.", { statusCode: 400, code: "BAD_SETTING" }),
      );
      const res = await post("/api/v1/tools/image/resize", [
        pngPart("one.png"),
        { name: "settings", content: JSON.stringify({ width: 50 }) },
      ]);

      expect(res.statusCode, res.body).toBe(422);
      expect(res.json().code).toBeUndefined();
    });

    it("keeps the single-file 422 for a plain error with no status", async () => {
      failInWorker("resize", new Error("Resize ran out of road"));
      const res = await post("/api/v1/tools/image/resize", [
        pngPart("one.png"),
        { name: "settings", content: JSON.stringify({ width: 50 }) },
      ]);

      expect(res.statusCode, res.body).toBe(422);
    });
  });

  it("pipeline batch names one shared reason that isn't a server fault", async () => {
    failInWorker("resize", new Error("Resize ran out of road"));
    const res = await post("/api/v1/pipeline/batch", [
      pngPart("one.png"),
      pngPart("two.png"),
      {
        name: "pipeline",
        content: JSON.stringify({ steps: [{ toolId: "resize", settings: { width: 50 } }] }),
      },
    ]);
    expect(res.statusCode, res.body).toBe(422);
    expect(res.json().error).toBe("Step 1: Resize ran out of road");
  });
});
