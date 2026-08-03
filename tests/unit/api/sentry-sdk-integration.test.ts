/**
 * End-to-end check against the REAL @sentry/node SDK (not synthetic events):
 * init Sentry with our buildBeforeSend + a capturing transport, push errors
 * through reportError, and assert the actual outgoing event. This validates the
 * SDK -> beforeSend integration the other unit tests stub, and that beforeSend
 * never throws on a real SDK event (which would drop or leak an event).
 */
import * as Sentry from "@sentry/node";
import { SafeError } from "@snapotter/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  __resetGateForTests,
  __setReaderForTests,
  primeAnalyticsGate,
} from "../../../apps/api/src/lib/analytics-gate.js";
import { reportError, resetThrottleForTests } from "../../../apps/api/src/lib/error-report.js";
import { buildBeforeSend } from "../../../apps/api/src/lib/sentry-scrub.js";

interface Cap {
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  threw: unknown;
}
const captured: Cap[] = [];
const clone = (v: unknown) => JSON.parse(JSON.stringify(v ?? null));

beforeAll(async () => {
  process.env.ANALYTICS_BAKED_OVERRIDE = "on"; // NODE_ENV=test lets the gate turn on
  __setReaderForTests(async () => true);
  await primeAnalyticsGate();
  const real = buildBeforeSend(() => true);
  Sentry.init({
    dsn: "https://0123456789abcdef0123456789abcdef@o1.ingest.sentry.io/1",
    defaultIntegrations: false,
    // Deliberately NOT setting normalizeDepth: the real init uses the default (3),
    // and the flattened string frames must survive that.
    beforeSend: (event, hint) => {
      const input = clone({
        exception: event.exception,
        message: event.message,
        request: event.request,
        tags: event.tags,
        contexts: event.contexts,
      });
      let output: unknown;
      let threw: unknown = null;
      try {
        output = real(event as never, hint as never);
      } catch (e) {
        threw = e;
      }
      captured.push({ input, output: output ? clone(output) : null, threw });
      return output as never;
    },
    transport: () => ({ send: async () => ({}) as never, flush: async () => true }),
  });
});

afterAll(async () => {
  await Sentry.close(0);
  __resetGateForTests();
  delete process.env.ANALYTICS_BAKED_OVERRIDE;
});

async function capture(err: unknown, ctx: Parameters<typeof reportError>[1]): Promise<Cap> {
  resetThrottleForTests();
  captured.length = 0;
  await reportError(err, ctx);
  await Sentry.flush(2000);
  expect(captured.length).toBeGreaterThan(0); // the SDK actually called our beforeSend
  return captured.at(-1) as Cap;
}

const outStr = (c: Cap) => JSON.stringify(c.output);
const lastValue = (c: Cap) =>
  (c.output?.exception as { values?: Array<{ value?: string }> })?.values?.at(-1)?.value ?? "";

describe("real @sentry/node integration", () => {
  it("redacts a plain Error message and drops PII surfaces", async () => {
    const c = await capture(new Error("open /data/uploads/9f/holiday_in_paris.jpg failed"), {
      source: "worker",
      pool: "image",
      toolId: "rounded-crop",
    });
    expect(c.threw).toBeNull(); // beforeSend did not throw on a real SDK event
    // the SDK built the raw event with the real message
    expect(JSON.stringify(c.input.exception)).toContain("holiday_in_paris");
    // the scrubbed, outgoing event does not leak it
    expect(lastValue(c)).toBe("open <path> failed");
    expect(outStr(c)).not.toContain("holiday_in_paris");
    expect(outStr(c)).not.toContain("/data/uploads");
    expect((c.output as { request?: unknown }).request).toBeUndefined();
    expect((c.output as { tags: Record<string, string> }).tags.tool_id).toBe("rounded-crop");
  });

  it("keeps a vetted python context for a sidecar SafeError", async () => {
    const e = new SafeError("Background removal failed", { kind: "bug" });
    Object.assign(e, {
      pythonType: "RuntimeError",
      pythonFrames: [{ file: "remove_bg.py", line: 88, func: "run" }],
    });
    const c = await capture(e, { source: "worker", pool: "ai", toolId: "remove-background" });
    expect(c.threw).toBeNull();
    const py = (c.output?.contexts as { python?: { type?: string; frames?: unknown[] } })?.python;
    expect(py?.type).toBe("RuntimeError");
    // reportError flattens frame objects to strings so they survive normalizeDepth.
    expect(py?.frames).toEqual(["remove_bg.py:88 run"]);
    expect(lastValue(c)).toBe("Background removal failed");
  });

  it("rebuilds a pg error and redacts an IP in the message", async () => {
    const pg = Object.assign(new Error("could not connect to 10.1.2.3"), {
      code: "28P01",
      routine: "auth_failed",
    });
    const c = await capture(pg, { source: "worker", pool: "system" });
    expect(c.threw).toBeNull();
    expect(lastValue(c)).toBe("pg 28P01 auth_failed");
    expect((c.output as { tags: Record<string, string> }).tags.error_class).toBe("operational");
  });

  it("derives a frame title for an empty-message error", async () => {
    const e = new Error("");
    e.stack = "Error\n    at Object.process (/app/apps/api/src/routes/tools/rounded-crop.ts:96:10)";
    const c = await capture(e, { source: "worker", pool: "image", toolId: "rounded-crop" });
    expect(c.threw).toBeNull();
    expect(lastValue(c)).toBe("at rounded-crop.ts:96");
  });

  it("only ships allowlisted tags (no stray keys)", async () => {
    const c = await capture(new Error("boom"), {
      source: "worker",
      pool: "image",
      toolId: "crop",
    });
    const allowed = new Set([
      "source",
      "tool_id",
      "pool",
      "route",
      "method",
      "error_class",
      "error_code",
      "deploy_mode",
      "subsystem",
      "status_code",
      "input_format",
      "job_id",
      "instance_id",
      "error_name",
    ]);
    for (const k of Object.keys((c.output as { tags: Record<string, string> }).tags ?? {})) {
      expect(allowed.has(k)).toBe(true);
    }
  });
});
