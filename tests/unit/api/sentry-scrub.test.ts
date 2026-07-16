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
  tags: { tool_id: "resize", input_format: "webp", secret_tag: "leak" },
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
  it("strips high-risk surfaces but keeps full stack paths for debugging", () => {
    const hint = {
      originalException: Object.assign(new Error("x"), { code: "EACCES", syscall: "mkdir" }),
    };
    const out = send(evt(), hint)!;
    // Still dropped: these can carry user data / PII.
    expect(out.message).toBeUndefined();
    expect(out.server_name).toBeUndefined();
    expect(out.request).toBeUndefined();
    expect(out.extra).toBeUndefined();
    expect(out.user).toBeUndefined();
    expect(out.exception.values[0].value).toBe("EACCES mkdir");
    expect(out.exception.values[0].stacktrace.frames[0].vars).toBeUndefined();
    // Restored for debugging: full source path (open-source code, not user data).
    expect(out.exception.values[0].stacktrace.frames[0].filename).toBe(
      "/app/apps/api/src/lib/cleanup.ts",
    );
    expect(out.exception.values[0].stacktrace.frames[0].abs_path).toBe("/app/x");
  });
  it("keeps the breadcrumb trail, redacting urls but keeping safe http status/method", () => {
    const out = send(
      evt({
        breadcrumbs: [
          {
            message: "GET https://host/u/photo.jpg 500",
            category: "http",
            data: { url: "https://host/u/photo.jpg", status_code: 500, method: "GET" },
          },
          { message: "reading /Users/me/secret.txt", category: "console", level: "info" },
        ],
      }),
      {},
    )!;
    expect(out.breadcrumbs).toEqual([
      { message: "GET <url> 500", category: "http", data: { status_code: 500, method: "GET" } },
      { message: "reading <path>", category: "console", level: "info" },
    ]);
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
    expect(out.tags.input_format).toBe("webp");
    expect(out.tags.secret_tag).toBeUndefined();
  });
  it("keeps job_id and instance_id tags for cross-referencing and blast-radius triage", () => {
    const out = send(evt({ tags: { job_id: "j1", instance_id: "i1", secret_tag: "x" } }), {})!;
    expect(out.tags.job_id).toBe("j1");
    expect(out.tags.instance_id).toBe("i1");
    expect(out.tags.secret_tag).toBeUndefined();
  });
  it("keeps a vetted tool context (primitives) and drops non-primitive fields", () => {
    const out = send(
      evt({
        contexts: { tool: { format: "png", quality: 80, blob: { x: 1 }, long: "x".repeat(40) } },
      }),
      {},
    )!;
    expect(out.contexts.tool).toEqual({ format: "png", quality: 80 });
  });
  it("drops contexts entirely when nothing allowlisted survives", () => {
    const out = send(evt({ contexts: { device: { hostname: "leak" } } }), {})!;
    expect(out.contexts).toBeUndefined();
  });
  it("enforces the 500-events-per-hour ceiling", () => {
    for (let i = 0; i < 500; i++) expect(send(evt(), {})).not.toBeNull();
    expect(send(evt(), {})).toBeNull();
  });
  it("never throws on malformed events (fail-closed to a scrubbed event)", () => {
    expect(() => send({} as AnyEvent, {})).not.toThrow();
    expect(() => send(evt({ exception: { values: null } }), {})).not.toThrow();
  });
});
