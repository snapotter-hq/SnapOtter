import { httpStatusTag, SafeError } from "@snapotter/shared";
import { describe, expect, it } from "vitest";
import { buildWebBeforeSend, DENY_URLS, IGNORE_ERRORS, isIgnoredError } from "@/lib/sentry-scrub";

describe("static filter lists", () => {
  it("deny extension frames and ignore noisy network errors", () => {
    expect(DENY_URLS.some((re) => re.test("chrome-extension://abcdef/content.js"))).toBe(true);
    expect(DENY_URLS.some((re) => re.test("moz-extension://abcdef/content.js"))).toBe(true);
    expect(IGNORE_ERRORS).toContain("Failed to fetch");
    expect(IGNORE_ERRORS).toContain("Load failed");
  });

  // Callers that wrap a request failure in their own SafeError check this
  // first, or the wrapper carries an ignored error past the filter (#1815).
  it("matches an error the way Sentry's ignore list does", () => {
    expect(isIgnoredError(new TypeError("Failed to fetch"))).toBe(true);
    expect(isIgnoredError(new TypeError("Load failed"))).toBe(true);
    expect(isIgnoredError(new DOMException("The user aborted a request.", "AbortError"))).toBe(
      true,
    );
    expect(isIgnoredError(new Error("headers broke"))).toBe(false);
    expect(isIgnoredError("Failed to fetch")).toBe(false);
    expect(isIgnoredError(null)).toBe(false);
  });
});

describe("noise filters for non-app code", () => {
  const matchesIgnore = (message: string) =>
    IGNORE_ERRORS.some((p) => (typeof p === "string" ? message.includes(p) : p.test(message)));

  // Sentry WEB-J: crypto-wallet extensions poke window.ethereum into every page.
  it("ignores wallet-extension injections", () => {
    expect(
      matchesIgnore("undefined is not an object (evaluating 'window.ethereum.selectedAddress')"),
    ).toBe(true);
  });

  // Sentry WEB-M: injected code referencing globals that do not exist here.
  it("ignores the EmptyRanges injected-global error", () => {
    expect(matchesIgnore("Can't find variable: EmptyRanges")).toBe(true);
  });

  // Sentry WEB-V/W/Y/Z: a fork running `vite dev` with our baked DSN reports
  // stacks through /node_modules/.vite/deps/, which no production build of
  // ours ever produces. Their errors are not ours to triage.
  it("drops events whose frames come from a vite dev server", () => {
    const send = buildWebBeforeSend(() => true);
    const event = {
      exception: {
        values: [
          {
            type: "TypeError",
            value: "useMaterialStore.getState(...).setToken is not a function",
            stacktrace: {
              frames: [
                { filename: "http://localhost:5173/node_modules/.vite/deps/react-dom_client.js" },
                { filename: "/src/pages/home-page.tsx" },
              ],
            },
          },
        ],
      },
    };
    expect(send(event, { originalException: new TypeError("x") })).toBeNull();
  });

  it("keeps events whose frames come from our built bundle", () => {
    const send = buildWebBeforeSend(() => true);
    const event = {
      exception: {
        values: [
          {
            type: "TypeError",
            value: "real bug",
            stacktrace: { frames: [{ filename: "http://192.168.0.4:1349/assets/app.js" }] },
          },
        ],
      },
    };
    expect(send(event, { originalException: new TypeError("x") })).not.toBeNull();
  });
});

describe("buildWebBeforeSend", () => {
  const baseEvent = (over: Record<string, any> = {}): Record<string, any> => ({
    request: { url: "http://192.168.0.4:1349/image/resize" },
    breadcrumbs: [{}],
    user: { id: "x" },
    contexts: { react: { componentStack: "at ToolPage" }, device: { name: "leak" } },
    exception: {
      values: [
        {
          type: "TypeError",
          value: "secret /Users/a/b",
          stacktrace: { frames: [{ filename: "http://192.168.0.4:1349/assets/app.js" }] },
        },
      ],
    },
    tags: { tool_id: "resize", drop_me: "x" },
    ...over,
  });

  it("gates, strips, keeps react componentStack, redacts values", () => {
    const send = buildWebBeforeSend(() => true);
    const out = send(baseEvent(), { originalException: new TypeError("boom /Users/a/b") })!;
    expect(out.request).toBeUndefined();
    expect(out.user).toBeUndefined();
    expect(out.contexts.react.componentStack).toBe("at ToolPage");
    expect(out.contexts.device).toBeUndefined();
    expect(out.exception.values[0].value).toBe("boom <path>");
    expect(out.exception.values[0].stacktrace.frames[0].filename).toBe("/assets/app.js");
    expect(out.tags.tool_id).toBe("resize");
    expect(out.tags.drop_me).toBeUndefined();
    expect(buildWebBeforeSend(() => false)(baseEvent(), {})).toBeNull();
  });

  it("keeps the breadcrumb trail, redacting urls but keeping safe fetch status/method", () => {
    const send = buildWebBeforeSend(() => true);
    const out = send(
      baseEvent({
        breadcrumbs: [
          {
            message: "fetch https://host/user.png",
            category: "fetch",
            data: { url: "https://host/user.png", status_code: 500, method: "POST" },
          },
          { message: "open /Users/a/secret.pdf", category: "console", level: "warning" },
        ],
      }),
      {},
    )!;
    expect(out.breadcrumbs).toEqual([
      { message: "fetch <url>", category: "fetch", data: { status_code: 500, method: "POST" } },
      { message: "open <path>", category: "console", level: "warning" },
    ]);
  });

  it("keeps a redacted message for a non-native error", () => {
    const send = buildWebBeforeSend(() => true);
    const custom = Object.assign(new Error("user secret"), { name: "WeirdLibError" });
    const out = send(baseEvent(), { originalException: custom })!;
    expect(out.exception.values[0].value).toBe("user secret");
  });

  it("keeps a redacted message for a non-native app error", () => {
    const send = buildWebBeforeSend(() => true);
    const out = send(baseEvent(), {
      originalException: new Error("upload failed for report.pdf"),
    })!;
    expect(out.exception.values[0].value).toBe("upload failed for <file>");
  });

  it("enforces the 500-per-hour ceiling", () => {
    const send = buildWebBeforeSend(() => true);
    for (let i = 0; i < 500; i++) expect(send(baseEvent(), {})).not.toBeNull();
    expect(send(baseEvent(), {})).toBeNull();
  });

  it("never throws on malformed events", () => {
    const send = buildWebBeforeSend(() => true);
    expect(() => send({} as Record<string, any>, {})).not.toThrow();
    expect(() => send({ exception: { values: null } } as any, {})).not.toThrow();
  });
});

// #1351: a SafeError's message stays constant, so the HTTP status rides along
// as a tag. Only a plain three-digit status may pass; the tag must never
// become a channel for free-form text.
describe("status_code tag (#1351)", () => {
  it("accepts an integer HTTP status from 100 to 599, as a string", () => {
    expect(httpStatusTag(100)).toBe("100");
    expect(httpStatusTag(404)).toBe("404");
    expect(httpStatusTag(599)).toBe("599");
    expect(httpStatusTag("502")).toBe("502");
  });

  it.each([
    99,
    600,
    0,
    -404,
    404.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    "40",
    "600",
    "099",
    " 404",
    "404 ",
    "4.0e2",
    "0x194",
    "404 /Users/alice/secret.pdf",
    "https://host/x?status=404",
    "abc",
    "",
    null,
    undefined,
    true,
    { status: 404 },
    [404],
  ])("rejects %j", (value) => {
    expect(httpStatusTag(value)).toBeUndefined();
  });

  function eventWithTags(tags: Record<string, unknown>): Record<string, any> {
    return {
      exception: { values: [{ type: "SafeError", value: "x" }] },
      tags,
    };
  }

  it("keeps a valid status_code tag next to the other allowlisted tags", () => {
    const send = buildWebBeforeSend(() => true);
    const out = send(eventWithTags({ status_code: "404", tool_id: "resize", drop_me: "x" }), {})!;
    expect(out.tags).toEqual({ status_code: "404", tool_id: "resize" });
  });

  it("normalizes a numeric status_code tag to its string form", () => {
    const send = buildWebBeforeSend(() => true);
    const out = send(eventWithTags({ status_code: 502 }), {})!;
    expect(out.tags).toEqual({ status_code: "502" });
  });

  it.each([
    "404 /Users/alice/secret.pdf",
    "https://host/api/v1/download/job/a.png",
    "alice@example.com",
    "600",
    "99",
    404.5,
    null,
  ])("drops a status_code tag of %j", (value) => {
    const send = buildWebBeforeSend(() => true);
    const out = send(eventWithTags({ status_code: value, tool_id: "resize" }), {})!;
    expect(out.tags).toEqual({ tool_id: "resize" });
  });

  it("sends the constant SafeError message, with the status only in the tag", () => {
    const send = buildWebBeforeSend(() => true);
    const err = new SafeError("Save to Files upload failed", {
      code: "save-upload-500",
      statusCode: 500,
    });
    const out = send(eventWithTags({ status_code: "500", error_class: "operational" }), {
      originalException: err,
    })!;
    expect(out.exception.values[0].value).toBe("Save to Files upload failed");
    expect(out.tags).toEqual({ status_code: "500", error_class: "operational" });
  });

  it("still sends nothing at all when telemetry is off", () => {
    const send = buildWebBeforeSend(() => false);
    expect(send(eventWithTags({ status_code: "500" }), {})).toBeNull();
  });
});
