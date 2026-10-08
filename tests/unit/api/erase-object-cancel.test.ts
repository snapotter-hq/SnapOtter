import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { runAiToolJob } from "../../../apps/api/src/jobs/ai-handlers.js";
import type { ToolJobData } from "../../../apps/api/src/jobs/types.js";
import type { ToolProcessCtx } from "../../../apps/api/src/routes/tool-factory.js";
import { registerEraseObject } from "../../../apps/api/src/routes/tools/erase-object.js";
import { fixtures, readFixture } from "../../fixtures/index.js";

const mocks = vi.hoisted(() => ({
  inpaint: vi.fn(),
  getObjectBuffer: vi.fn(),
}));

vi.mock("@snapotter/ai", () => ({
  inpaint: mocks.inpaint,
  isGpuAvailable: vi.fn(() => false),
}));

vi.mock("../../../apps/api/src/lib/object-storage.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../apps/api/src/lib/object-storage.js")>()),
  getObjectBuffer: mocks.getObjectBuffer,
}));

const PNG = readFixture(fixtures.image.base.png200);
const MASK = Buffer.from("mask-bytes");
const SCRATCH_DIR = join(tmpdir(), "snapotter-erase-object-cancel-test");

const job: ToolJobData = {
  jobId: "job-erase-object",
  toolId: "erase-object",
  userId: null,
  pool: "ai",
  inputRefs: ["uploads/job-erase-object/photo.png", "uploads/job-erase-object/mask.png"],
  filename: "photo.png",
  settings: { format: "png", qualityMode: "fast" },
  kind: "ai-tool",
};

beforeAll(() => {
  mocks.getObjectBuffer.mockResolvedValue(MASK);
  mocks.inpaint.mockResolvedValue(PNG);
  registerEraseObject({ post: vi.fn() } as unknown as FastifyInstance);
});

describe("erase-object honors a job cancel (#2092)", () => {
  // A cancel or worker timeout aborts ctx.signal. Without forwarding it the
  // sidecar keeps inpainting a job that is already dead.
  it("forwards ctx.signal to the sidecar call", async () => {
    const ctx: ToolProcessCtx = {
      signal: new AbortController().signal,
      scratchDir: SCRATCH_DIR,
      report: vi.fn(),
    };

    await runAiToolJob(job, PNG, ctx);

    expect(mocks.inpaint).toHaveBeenCalledWith(
      PNG,
      MASK,
      SCRATCH_DIR,
      expect.any(Function),
      "fast",
      { signal: ctx.signal },
    );
  });
});
