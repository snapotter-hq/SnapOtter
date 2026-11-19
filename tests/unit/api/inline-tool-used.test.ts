/**
 * Inline tool routes (the ones that never enqueue a BullMQ job, #4337) must
 * report a server-side tool_used outcome like worker runs do (#4819).
 */
import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  analyticsOn: true,
  tracked: [] as Array<{ event: string; props: Record<string, unknown>; distinctId?: string }>,
}));

vi.mock("../../../apps/api/src/lib/analytics.js", () => ({
  trackEvent: vi.fn(async (event: string, props: Record<string, unknown>, distinctId?: string) => {
    state.tracked.push({ event, props, distinctId });
  }),
}));

vi.mock("../../../apps/api/src/lib/analytics-gate.js", () => ({
  analyticsEnabled: () => state.analyticsOn,
}));

vi.mock("../../../apps/api/src/lib/audit.js", () => ({
  isToolAuditEnabled: vi.fn(async () => false),
  auditLog: vi.fn(),
  auditFromRequest: vi.fn(() => vi.fn()),
}));

vi.mock("../../../apps/api/src/db/index.js", () => ({ db: {}, schema: { users: {} } }));

import {
  emitInlineRequestAuditIfNeeded,
  enterToolRequestAuditContext,
  markToolRequestEnqueued,
  recordInlineInputFile,
} from "../../../apps/api/src/lib/tool-audit.js";

type FakeRequest = {
  ip: string;
  id: string;
  headers: Record<string, string>;
  log: { error: () => void };
  parts?: () => AsyncIterable<unknown>;
};

function makeRequest(headers: Record<string, string> = {}): FakeRequest {
  return { ip: "192.0.2.10", id: "req-1", headers, log: { error: vi.fn() } };
}

function enter(
  req: FakeRequest,
  toolId: string,
  opts: { subRoute?: string | null; authorized?: boolean } = {},
) {
  return enterToolRequestAuditContext(req as never, {
    userId: "user-1",
    username: "admin",
    ip: req.ip,
    requestId: req.id,
    toolId,
    subRoute: opts.subRoute ?? null,
    startTime: Date.now() - 25,
    authorized: opts.authorized ?? true,
  });
}

function toolUsed() {
  return state.tracked.filter((t) => t.event === "tool_used");
}

describe("inline tool routes emit tool_used (#4819)", () => {
  beforeEach(() => {
    state.analyticsOn = true;
    state.tracked = [];
  });

  it("sends a completed tool_used with the shared dimensions on HTTP 200", async () => {
    const req = makeRequest({ "x-posthog-distinct-id": "browser-abc" });
    enter(req, "collage");
    recordInlineInputFile(req as never, 4096);

    await emitInlineRequestAuditIfNeeded(req as never, 200, '{"downloadUrl":"/x"}');

    expect(toolUsed()).toHaveLength(1);
    const [{ props, distinctId }] = toolUsed();
    expect(distinctId).toBe("browser-abc");
    expect(props).toMatchObject({
      tool_id: "collage",
      status: "completed",
      category: "layout",
      is_ai_tool: false,
      is_batch: false,
      execution_hint: "fast",
      input_format: "unknown",
      bytes_in: 4096,
    });
    expect(props.duration_ms).toBeGreaterThanOrEqual(25);
  });

  it("sends a failed tool_used carrying the route's error code, not its message", async () => {
    const req = makeRequest();
    enter(req, "passport-photo", { subRoute: "generate" });

    await emitInlineRequestAuditIfNeeded(
      req as never,
      501,
      JSON.stringify({
        error: "Feature not installed",
        code: "FEATURE_NOT_INSTALLED",
        feature: "face-detection",
      }),
    );

    expect(toolUsed()).toHaveLength(1);
    expect(toolUsed()[0].props).toMatchObject({
      tool_id: "passport-photo",
      status: "failed",
      error_code: "feature_not_installed",
      error_kind: "operational",
      is_ai_tool: true,
    });
    expect(JSON.stringify(toolUsed()[0].props)).not.toContain("Feature not installed");
  });

  it("falls back to the status code when the body has no safe machine code", async () => {
    const bad = makeRequest();
    enter(bad, "qr-generate");
    await emitInlineRequestAuditIfNeeded(bad as never, 400, '{"error":"bad","code":"has spaces!"}');

    const crash = makeRequest();
    enter(crash, "qr-generate");
    await emitInlineRequestAuditIfNeeded(crash as never, 500, "not json");

    expect(toolUsed().map((t) => [t.props.error_code, t.props.error_kind])).toEqual([
      ["http_400", "input"],
      ["http_500", "bug"],
    ]);
  });

  it("sends at most one event per request even when the route settles it twice", async () => {
    const req = makeRequest();
    enter(req, "favicon");
    await emitInlineRequestAuditIfNeeded(req as never, 200, "{}");
    await emitInlineRequestAuditIfNeeded(req as never, 200, "{}");
    expect(toolUsed()).toHaveLength(1);
  });

  it("stays silent for queued, unauthorized, read-only sub-route, and non-final responses", async () => {
    const queued = makeRequest();
    enter(queued, "resize");
    markToolRequestEnqueued(queued as never);
    await emitInlineRequestAuditIfNeeded(queued as never, 200, "{}");

    const denied = makeRequest();
    enter(denied, "qr-generate", { authorized: false });
    await emitInlineRequestAuditIfNeeded(denied as never, 403, '{"code":"FORBIDDEN"}');

    for (const subRoute of ["info", "preview", "inspect", "analyze", "effects", "batch"]) {
      const req = makeRequest();
      enter(req, "pdf-to-image", { subRoute });
      await emitInlineRequestAuditIfNeeded(req as never, 200, "{}");
    }

    const redirect = makeRequest();
    enter(redirect, "qr-generate");
    await emitInlineRequestAuditIfNeeded(redirect as never, 304, "");

    expect(toolUsed()).toHaveLength(0);
  });

  it("sends nothing when analytics is off", async () => {
    state.analyticsOn = false;
    const req = makeRequest();
    enter(req, "collage");
    await emitInlineRequestAuditIfNeeded(req as never, 200, "{}");
    expect(state.tracked).toHaveLength(0);
  });

  it("reports the uploaded file's extension, never its name", async () => {
    const req = makeRequest();
    req.parts = async function* () {
      yield {
        type: "file",
        fieldname: "file",
        filename: "Jane Doe passport.HEIC",
        file: Readable.from([Buffer.from("abc")]),
      };
    };
    enter(req, "passport-photo", { subRoute: "generate" });
    for await (const part of req.parts()) {
      for await (const _chunk of (part as { file: Readable }).file) {
        // drain so the byte count is recorded
      }
    }

    await emitInlineRequestAuditIfNeeded(req as never, 200, "{}");

    expect(toolUsed()[0].props).toMatchObject({ input_format: "heic", bytes_in: 3 });
    expect(JSON.stringify(toolUsed()[0].props)).not.toContain("Jane");
  });
});
