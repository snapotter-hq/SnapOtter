import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "../../../../apps/api/src/config.js";
import { objectExists } from "../../../../apps/api/src/lib/object-storage.js";
import { DocumentInputHandler } from "../../../../apps/api/src/modality/document-input.js";
import { fixtures, readFixture } from "../../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../../test-server.js";

const mocks = vi.hoisted(() => ({
  flowAdd: vi.fn(),
  ocrUploadLimitsOverride: null as { fileBytes: number; aggregateBytes: number } | null,
}));

vi.mock("../../../../apps/api/src/jobs/enqueue.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../apps/api/src/jobs/enqueue.js")>();
  return {
    ...actual,
    getFlowProducer: () => ({ add: mocks.flowAdd }),
  };
});

vi.mock("../../../../apps/api/src/lib/ocr-limits.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../../apps/api/src/lib/ocr-limits.js")>();
  return {
    ...actual,
    resolveOcrUploadLimits: (maxUploadSizeMb: number) =>
      mocks.ocrUploadLimitsOverride ?? actual.resolveOcrUploadLimits(maxUploadSizeMb),
  };
});

const INVALID_PDF = Buffer.from("this is deliberately not a PDF");
const VALID_PDF = readFixture(fixtures.document.pdf3);
const ENCRYPTED_PDF = readFixture(fixtures.document.encrypted);
const OCR_PIPELINE = JSON.stringify({
  steps: [{ toolId: "ocr-pdf", settings: { quality: "fast", pages: "1" } }],
});

let testApp: TestApp;
let app: TestApp["app"];
let adminToken: string;
let scratchRoot: string;
let originalScratchPath: string;
let prepareSpy: ReturnType<typeof vi.spyOn>;

beforeAll(async () => {
  scratchRoot = await mkdtemp(join(tmpdir(), "snapotter-ocr-pdf-routes-"));
  originalScratchPath = env.SCRATCH_PATH;
  env.SCRATCH_PATH = scratchRoot;
  prepareSpy = vi.spyOn(DocumentInputHandler.prototype, "prepare");
  testApp = await buildTestApp();
  app = testApp.app;
  adminToken = await loginAsAdmin(app);
}, 30_000);

afterAll(async () => {
  prepareSpy.mockRestore();
  env.SCRATCH_PATH = originalScratchPath;
  await testApp.cleanup();
  await rm(scratchRoot, { recursive: true, force: true });
}, 10_000);

beforeEach(() => {
  mocks.flowAdd.mockReset();
  mocks.flowAdd.mockResolvedValue(undefined);
  mocks.ocrUploadLimitsOverride = null;
  prepareSpy.mockClear();
});

async function postMultipart(url: string, parts: Parameters<typeof createMultipartPayload>[0]) {
  const { body, contentType } = createMultipartPayload(parts);
  const response = await app.inject({
    method: "POST",
    url,
    headers: {
      authorization: `Bearer ${adminToken}`,
      "content-type": contentType,
    },
    body,
  });
  await vi.waitFor(async () => expect(await readdir(scratchRoot)).toEqual([]), {
    timeout: 1_000,
    interval: 10,
  });
  return response;
}

function invalidPdfPart() {
  return {
    name: "file",
    filename: "not-really.pdf",
    contentType: "application/pdf",
    content: INVALID_PDF,
  };
}

function validPdfPart() {
  return {
    name: "file",
    filename: "scan.pdf",
    contentType: "application/pdf",
    content: VALID_PDF,
  };
}

interface FlowNode {
  data?: { inputRefs?: string[] };
  children?: FlowNode[];
}

function firstInputRef(node: FlowNode): string | undefined {
  if (node.data?.inputRefs?.[0]) return node.data.inputRefs[0];
  for (const child of node.children ?? []) {
    const ref = firstInputRef(child);
    if (ref) return ref;
  }
  return undefined;
}

async function expectObjectDeleted(key: string) {
  await vi.waitFor(async () => expect(await objectExists(key)).toBe(false), {
    timeout: 1_000,
    interval: 10,
  });
}

describe("OCR PDF path-backed batch and pipeline ingress", () => {
  it("rejects direct and tool-batch PDFs while their streams cross the configured cap", async () => {
    const originalLimit = env.MAX_UPLOAD_SIZE_MB;
    env.MAX_UPLOAD_SIZE_MB = 1 / (1024 * 1024);
    try {
      const oversized = {
        name: "file",
        filename: "oversized.pdf",
        contentType: "application/pdf",
        content: Buffer.from("12"),
      };
      const settings = {
        name: "settings",
        content: JSON.stringify({ quality: "fast", pages: "1" }),
      };

      const direct = await postMultipart("/api/v1/tools/pdf/ocr-pdf", [oversized, settings]);
      const batch = await postMultipart("/api/v1/tools/pdf/ocr-pdf/batch", [oversized, settings]);

      expect(direct.statusCode).toBe(413);
      expect(batch.statusCode).toBe(413);
      expect(prepareSpy).not.toHaveBeenCalled();
    } finally {
      env.MAX_UPLOAD_SIZE_MB = originalLimit;
    }
  });

  it.each([
    "file-first",
    "field-first",
  ] as const)("rejects oversized pipeline OCR PDFs with %s multipart ordering", async (ordering) => {
    const originalLimit = env.MAX_UPLOAD_SIZE_MB;
    env.MAX_UPLOAD_SIZE_MB = 1 / (1024 * 1024);
    try {
      const oversized = {
        name: "file",
        filename: "oversized.pdf",
        contentType: "application/pdf",
        content: Buffer.from("12"),
      };
      const pipelinePart = { name: "pipeline", content: OCR_PIPELINE };
      const parts =
        ordering === "file-first" ? [oversized, pipelinePart] : [pipelinePart, oversized];

      const execute = await postMultipart("/api/v1/pipeline/execute", parts);
      const batch = await postMultipart("/api/v1/pipeline/batch", parts);

      expect(execute.statusCode).toBe(413);
      expect(batch.statusCode).toBe(413);
      expect(prepareSpy).not.toHaveBeenCalled();
    } finally {
      env.MAX_UPLOAD_SIZE_MB = originalLimit;
    }
  });

  it("enforces the OCR stream cap before a trailing pipeline field reveals the modality", async () => {
    const originalLimit = env.MAX_UPLOAD_SIZE_MB;
    env.MAX_UPLOAD_SIZE_MB = 0;
    mocks.ocrUploadLimitsOverride = { fileBytes: 1, aggregateBytes: 1 };
    try {
      const oversized = {
        name: "file",
        filename: "oversized.pdf",
        contentType: "application/pdf",
        content: Buffer.from("12"),
      };
      const pipelinePart = { name: "pipeline", content: OCR_PIPELINE };

      const execute = await postMultipart("/api/v1/pipeline/execute", [oversized, pipelinePart]);
      const batch = await postMultipart("/api/v1/pipeline/batch", [oversized, pipelinePart]);

      expect(execute.statusCode).toBe(413);
      expect(batch.statusCode).toBe(413);
      expect(mocks.flowAdd).not.toHaveBeenCalled();
      expect(prepareSpy).not.toHaveBeenCalled();
    } finally {
      mocks.ocrUploadLimitsOverride = null;
      env.MAX_UPLOAD_SIZE_MB = originalLimit;
    }
  });

  it("validates tool-batch PDF files by path without invoking the buffered document handler", async () => {
    const response = await postMultipart("/api/v1/tools/pdf/ocr-pdf/batch", [
      invalidPdfPart(),
      { name: "settings", content: JSON.stringify({ quality: "fast", pages: "1" }) },
    ]);

    expect(response.statusCode).toBe(422);
    expect(JSON.parse(response.body).errors[0].error).toMatch(/PDF header/i);
    expect(prepareSpy).not.toHaveBeenCalled();
    expect(mocks.flowAdd).not.toHaveBeenCalled();
  });

  it("rejects password-protected PDFs before enqueue across every OCR ingress surface", async () => {
    const encrypted = {
      name: "file",
      filename: "encrypted.pdf",
      contentType: "application/pdf",
      content: ENCRYPTED_PDF,
    };
    const settings = {
      name: "settings",
      content: JSON.stringify({ quality: "fast", pages: "1" }),
    };
    const pipeline = { name: "pipeline", content: OCR_PIPELINE };

    const direct = await postMultipart("/api/v1/tools/pdf/ocr-pdf", [encrypted, settings]);
    const toolBatch = await postMultipart("/api/v1/tools/pdf/ocr-pdf/batch", [encrypted, settings]);
    const execute = await postMultipart("/api/v1/pipeline/execute", [encrypted, pipeline]);
    const pipelineBatch = await postMultipart("/api/v1/pipeline/batch", [encrypted, pipeline]);

    expect(direct.statusCode).toBe(400);
    expect(JSON.parse(direct.body).error).toMatch(/password-protected/i);
    expect(toolBatch.statusCode).toBe(422);
    expect(JSON.parse(toolBatch.body).errors[0].error).toMatch(/password-protected/i);
    expect(execute.statusCode).toBe(400);
    expect(JSON.parse(execute.body).error).toMatch(/password-protected/i);
    expect(pipelineBatch.statusCode).toBe(422);
    expect(JSON.parse(pipelineBatch.body).errors[0].error).toMatch(/password-protected/i);
    expect(mocks.flowAdd).not.toHaveBeenCalled();
    expect(prepareSpy).not.toHaveBeenCalled();
  });

  it.each([
    "file-first",
    "field-first",
  ] as const)("validates execute-pipeline OCR PDF input by path with %s multipart ordering", async (ordering) => {
    const pipelinePart = { name: "pipeline", content: OCR_PIPELINE };
    const parts =
      ordering === "file-first"
        ? [invalidPdfPart(), pipelinePart]
        : [pipelinePart, invalidPdfPart()];

    const response = await postMultipart("/api/v1/pipeline/execute", parts);

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error).toMatch(/PDF header/i);
    expect(prepareSpy).not.toHaveBeenCalled();
  });

  it.each([
    "file-first",
    "field-first",
  ] as const)("validates batch-pipeline OCR PDF files by path with %s multipart ordering", async (ordering) => {
    const pipelinePart = { name: "pipeline", content: OCR_PIPELINE };
    const parts =
      ordering === "file-first"
        ? [invalidPdfPart(), pipelinePart]
        : [pipelinePart, invalidPdfPart()];

    const response = await postMultipart("/api/v1/pipeline/batch", parts);

    expect(response.statusCode).toBe(422);
    expect(JSON.parse(response.body).errors[0].error).toMatch(/PDF header/i);
    expect(prepareSpy).not.toHaveBeenCalled();
  });

  it("rolls back tool-batch OCR objects when BullMQ rejects the flow handoff", async () => {
    mocks.flowAdd.mockRejectedValueOnce(new Error("Redis unavailable"));
    const parentId = "ocr-pdf-tool-batch-rollback";
    const response = await postMultipart("/api/v1/tools/pdf/ocr-pdf/batch", [
      validPdfPart(),
      { name: "settings", content: JSON.stringify({ quality: "fast", pages: "1" }) },
      { name: "clientJobId", content: parentId },
    ]);

    expect(response.statusCode).toBe(500);
    await expectObjectDeleted(`uploads/${parentId}-f0/scan.pdf`);
  });

  it("rolls back execute-pipeline OCR objects when BullMQ rejects the flow handoff", async () => {
    mocks.flowAdd.mockRejectedValueOnce(new Error("Redis unavailable"));
    const response = await postMultipart("/api/v1/pipeline/execute", [
      validPdfPart(),
      { name: "pipeline", content: OCR_PIPELINE },
    ]);

    expect(response.statusCode).toBe(500);
    const tree = mocks.flowAdd.mock.calls[0]?.[0] as FlowNode | undefined;
    const key = tree ? firstInputRef(tree) : undefined;
    expect(key).toMatch(/^uploads\/[0-9a-f-]+\/scan\.pdf$/i);
    await expectObjectDeleted(key as string);
  });

  it("rolls back batch-pipeline OCR objects when BullMQ rejects the flow handoff", async () => {
    mocks.flowAdd.mockRejectedValueOnce(new Error("Redis unavailable"));
    const parentId = "ocr-pdf-pipeline-batch-rollback";
    const response = await postMultipart("/api/v1/pipeline/batch", [
      validPdfPart(),
      { name: "pipeline", content: OCR_PIPELINE },
      { name: "clientJobId", content: parentId },
    ]);

    expect(response.statusCode).toBe(500);
    await expectObjectDeleted(`uploads/${parentId}-f0-s0/scan.pdf`);
  });
});
