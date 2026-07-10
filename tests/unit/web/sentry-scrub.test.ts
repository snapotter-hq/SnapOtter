import { describe, expect, it } from "vitest";
import {
  buildWebBeforeSend,
  DENY_URLS,
  IGNORE_ERRORS,
  scrubBrowserMessage,
} from "@/lib/sentry-scrub";

describe("scrubBrowserMessage", () => {
  it("keeps browser-native messages with urls/paths redacted", () => {
    expect(scrubBrowserMessage("TypeError", "Failed to fetch https://intra.host/x?q=1")).toBe(
      "Failed to fetch <url>",
    );
    expect(scrubBrowserMessage("TypeError", "cannot read /Users/bob/file.png")).toBe(
      "cannot read <path>",
    );
    expect(scrubBrowserMessage("RangeError", "Invalid array length")).toBe("Invalid array length");
  });

  it("redacts blob urls and windows paths", () => {
    expect(scrubBrowserMessage("DOMException", "load blob:http://x/abc failed")).toBe(
      "load <blob> failed",
    );
    expect(scrubBrowserMessage("TypeError", "open C:\\Users\\bob\\tax.pdf")).toBe("open <path>");
  });

  it("drops messages for non-native error names", () => {
    expect(scrubBrowserMessage("CustomerDataError", "contains secret.pdf")).toBeNull();
  });
});

describe("static filter lists", () => {
  it("deny extension frames and ignore noisy network errors", () => {
    expect(DENY_URLS.some((re) => re.test("chrome-extension://abcdef/content.js"))).toBe(true);
    expect(DENY_URLS.some((re) => re.test("moz-extension://abcdef/content.js"))).toBe(true);
    expect(IGNORE_ERRORS).toContain("Failed to fetch");
    expect(IGNORE_ERRORS).toContain("Load failed");
  });
});

describe("buildWebBeforeSend", () => {
  const baseEvent = (): Record<string, any> => ({
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
  });

  it("gates, strips, keeps react componentStack, redacts values", () => {
    const send = buildWebBeforeSend(() => true);
    const out = send(baseEvent(), { originalException: new TypeError("boom /Users/a/b") })!;
    expect(out.request).toBeUndefined();
    expect(out.breadcrumbs).toBeUndefined();
    expect(out.user).toBeUndefined();
    expect(out.contexts.react.componentStack).toBe("at ToolPage");
    expect(out.contexts.device).toBeUndefined();
    expect(out.exception.values[0].value).toBe("boom <path>");
    expect(out.exception.values[0].stacktrace.frames[0].filename).toBe("/assets/app.js");
    expect(out.tags.tool_id).toBe("resize");
    expect(out.tags.drop_me).toBeUndefined();
    expect(buildWebBeforeSend(() => false)(baseEvent(), {})).toBeNull();
  });

  it("falls back to type-only for non-native exceptions without a rebuild", () => {
    const send = buildWebBeforeSend(() => true);
    const custom = Object.assign(new Error("user secret"), { name: "WeirdLibError" });
    const out = send(baseEvent(), { originalException: custom })!;
    expect(out.exception.values[0].value).toBe("TypeError");
  });

  it("enforces the 20-per-hour ceiling", () => {
    const send = buildWebBeforeSend(() => true);
    for (let i = 0; i < 20; i++) expect(send(baseEvent(), {})).not.toBeNull();
    expect(send(baseEvent(), {})).toBeNull();
  });

  it("never throws on malformed events", () => {
    const send = buildWebBeforeSend(() => true);
    expect(() => send({} as Record<string, any>, {})).not.toThrow();
    expect(() => send({ exception: { values: null } } as any, {})).not.toThrow();
  });
});
