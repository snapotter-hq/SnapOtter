/**
 * The transparency-fixer route refuses a CPU host short on memory with a 422
 * before any decode (#4510), and records the refusal so the blocked rate can
 * be counted (#4808).
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fixtures, readFixture } from "../../fixtures/index.js";

const GIB = 1024 ** 3;

const mocks = vi.hoisted(() => ({
  availableMemoryBytes: vi.fn<() => number | null>(),
  hostMemoryCapacityBytes: vi.fn<() => number>(),
  enqueueToolJob: vi.fn(),
  getObjectBuffer: vi.fn(),
  trackEvent: vi.fn(),
}));

vi.mock("../../../apps/api/src/db/index.js", () => ({
  db: {
    select: vi.fn(() => ({ from: () => ({ where: () => Promise.resolve([]) }) })),
  },
  schema: { jobs: { id: {}, status: {}, error: {} } },
}));

vi.mock("@snapotter/ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@snapotter/ai")>()),
  gpuMayBeAvailable: () => false,
}));

vi.mock("../../../apps/api/src/lib/hq-memory-gate.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../apps/api/src/lib/hq-memory-gate.js")>()),
  availableMemoryBytes: mocks.availableMemoryBytes,
  hostMemoryCapacityBytes: mocks.hostMemoryCapacityBytes,
}));

vi.mock("../../../apps/api/src/lib/analytics.js", () => ({ trackEvent: mocks.trackEvent }));

vi.mock("../../../apps/api/src/jobs/enqueue.js", () => ({
  enqueueToolJob: mocks.enqueueToolJob,
  insertToolJobAlias: vi.fn(() => Promise.resolve(true)),
}));

vi.mock("../../../apps/api/src/lib/feature-status.js", () => ({
  isToolInstalled: () => true,
}));

vi.mock("../../../apps/api/src/lib/upload-stream.js", () => ({
  receiveUpload: (_part: unknown, jobId: string) =>
    Promise.resolve({ key: `uploads/${jobId}/photo.png`, filename: "photo.png", size: 100 }),
}));

vi.mock("../../../apps/api/src/lib/object-storage.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../apps/api/src/lib/object-storage.js")>()),
  deleteObject: vi.fn(() => Promise.resolve()),
  deletePrefix: vi.fn(() => Promise.resolve()),
  getObjectBuffer: mocks.getObjectBuffer,
  putObject: vi.fn(() => Promise.resolve()),
}));

vi.mock("../../../apps/api/src/plugins/auth.js", () => ({
  getAuthUser: vi.fn(() => ({ id: "user-1", username: "test", role: "admin" })),
}));

import { registerTransparencyFixer } from "../../../apps/api/src/routes/tools/transparency-fixer.js";

type RouteHandler = (request: unknown, reply: unknown) => Promise<unknown>;
let handler: RouteHandler;

beforeAll(() => {
  registerTransparencyFixer({
    post: (_path: string, h: RouteHandler) => {
      handler = h;
    },
  } as unknown as Parameters<typeof registerTransparencyFixer>[0]);
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getObjectBuffer.mockResolvedValue(readFixture(fixtures.image.base.png200));
  mocks.hostMemoryCapacityBytes.mockReturnValue(16 * GIB);
});

function makeReply() {
  return {
    statusCode: 200,
    payload: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    send(payload: unknown) {
      this.payload = payload;
      return this;
    },
  };
}

function makeRequest() {
  return {
    headers: { "x-posthog-distinct-id": "browser-1" },
    log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
    parts: async function* () {
      yield { type: "file", fieldname: "file", filename: "photo.png", file: {} };
    },
  };
}

describe("transparency-fixer memory refusal", () => {
  it("answers 422 and sends tool_refused when free memory is under the floor", async () => {
    mocks.availableMemoryBytes.mockReturnValue(11.4 * GIB);
    const reply = makeReply();
    await handler(makeRequest(), reply);

    expect(reply.statusCode).toBe(422);
    expect(mocks.enqueueToolJob).not.toHaveBeenCalled();
    expect(mocks.trackEvent).toHaveBeenCalledWith(
      "tool_refused",
      {
        tool_id: "transparency-fixer",
        reason: "insufficient_memory",
        available_memory_gb: 11,
        host_memory_gb: 16,
      },
      "browser-1",
    );
  });

  it("sends no refusal event when free memory covers the floor", async () => {
    mocks.availableMemoryBytes.mockReturnValue(64 * GIB);
    const reply = makeReply();
    await handler(makeRequest(), reply);

    expect(reply.statusCode).not.toBe(422);
    expect(mocks.trackEvent).not.toHaveBeenCalled();
  });
});
