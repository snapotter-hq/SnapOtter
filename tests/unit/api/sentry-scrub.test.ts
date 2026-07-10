import { beforeEach, describe, expect, it } from "vitest";
import { buildBeforeSend } from "../../../apps/api/src/lib/sentry-scrub.js";

type AnyEvent = Record<string, any>;
const evt = (over: AnyEvent = {}): AnyEvent => ({
  message: "raw message",
  server_name: "users-macbook",
  request: { url: "http://10.0.0.5/api/x" },
  extra: { a: 1 },
  breadcrumbs: [{ message: "SELECT secret" }],
  user: { ip: "1.2.3.4" },
  contexts: {
    os: { name: "Ubuntu", version: "24.04", kernel: "x" },
    runtime: { name: "node", version: "22.1.0" },
    device: { hostname: "leak" },
  },
  tags: { tool_id: "resize", secret_tag: "leak" },
  exception: {
    values: [
      {
        type: "Error",
        value: "EACCES: permission denied, mkdir '/data/x'",
        stacktrace: {
          frames: [
            { filename: "/app/apps/api/src/lib/cleanup.ts", abs_path: "/app/x", vars: { p: "s" } },
          ],
        },
      },
    ],
  },
  ...over,
});

describe("buildBeforeSend (api)", () => {
  let send: ReturnType<typeof buildBeforeSend>;
  beforeEach(() => {
    send = buildBeforeSend(() => true);
  });

  it("returns null when the gate is off", () => {
    expect(buildBeforeSend(() => false)(evt(), {})).toBeNull();
  });
  it("strips PII surfaces and rebuilds the value from the hint error", () => {
    const hint = {
      originalException: Object.assign(new Error("x"), { code: "EACCES", syscall: "mkdir" }),
    };
    const out = send(evt(), hint)!;
    expect(out.message).toBeUndefined();
    expect(out.server_name).toBeUndefined();
    expect(out.request).toBeUndefined();
    expect(out.extra).toBeUndefined();
    expect(out.breadcrumbs).toBeUndefined();
    expect(out.user).toBeUndefined();
    expect(out.exception.values[0].value).toBe("EACCES mkdir");
    expect(out.exception.values[0].stacktrace.frames[0].filename).toBe("cleanup.ts");
    expect(out.exception.values[0].stacktrace.frames[0].abs_path).toBeUndefined();
    expect(out.exception.values[0].stacktrace.frames[0].vars).toBeUndefined();
  });
  it("falls back to type-only for unknown errors", () => {
    const out = send(evt(), { originalException: new Error("user path /tmp/z") })!;
    expect(out.exception.values[0].value).toBe("Error");
  });
  it("applies the rebuilt value to the last (original) exception entry only", () => {
    const event = evt({
      exception: {
        values: [
          { type: "WrapperError", value: "outer secret" },
          { type: "Error", value: "inner secret" },
        ],
      },
    });
    const hint = { originalException: Object.assign(new Error("x"), { code: "ENOSPC" }) };
    const out = send(event, hint)!;
    expect(out.exception.values[0].value).toBe("WrapperError");
    expect(out.exception.values[1].value).toBe("ENOSPC");
  });
  it("keeps only allowlisted contexts and tags", () => {
    const out = send(evt(), {})!;
    expect(out.contexts).toEqual({
      os: { name: "Ubuntu", version: "24.04" },
      runtime: { name: "node", version: "22.1.0" },
    });
    expect(out.tags.tool_id).toBe("resize");
    expect(out.tags.secret_tag).toBeUndefined();
  });
  it("drops contexts entirely when nothing allowlisted survives", () => {
    const out = send(evt({ contexts: { device: { hostname: "leak" } } }), {})!;
    expect(out.contexts).toBeUndefined();
  });
  it("enforces the 20-events-per-hour ceiling", () => {
    for (let i = 0; i < 20; i++) expect(send(evt(), {})).not.toBeNull();
    expect(send(evt(), {})).toBeNull();
  });
  it("never throws on malformed events (fail-closed to a scrubbed event)", () => {
    expect(() => send({} as AnyEvent, {})).not.toThrow();
    expect(() => send(evt({ exception: { values: null } }), {})).not.toThrow();
  });
});
