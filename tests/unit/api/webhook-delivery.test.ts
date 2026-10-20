import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const safeFetchMock = vi.hoisted(() => vi.fn());

vi.mock("../../../apps/api/src/lib/ssrf.js", () => ({
  safeFetch: safeFetchMock,
}));

describe("webhook delivery", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    safeFetchMock.mockReset();
    safeFetchMock.mockImplementation((url, options) => fetch(url, options));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("delivers a batch of events", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    const { deliverWebhook } = await import("../../../apps/api/src/lib/webhook-delivery.js");
    const result = await deliverWebhook("https://siem.example.com/input", "Bearer test-token", [
      { event: "LOGIN_SUCCESS", timestamp: "2026-01-01T00:00:00Z" },
    ]);

    expect(result.success).toBe(true);
    expect(result.attempts).toBe(1);
    expect(safeFetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe("https://siem.example.com/input");
    expect(opts.headers.Authorization).toBe("Bearer test-token");
    const body = JSON.parse(opts.body);
    expect(body.source).toBe("snapotter");
    expect(body.version).toBe("1");
    expect(body.events).toHaveLength(1);
  });

  it("retries on server error", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 502 })
      .mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    const { deliverWebhook } = await import("../../../apps/api/src/lib/webhook-delivery.js");
    const result = await deliverWebhook("https://siem.example.com/input", "", [{ event: "test" }], {
      maxRetries: 3,
      initialDelayMs: 1,
    });

    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry on 4xx client errors", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 401 });
    vi.stubGlobal("fetch", fetchMock);

    const { deliverWebhook } = await import("../../../apps/api/src/lib/webhook-delivery.js");
    const result = await deliverWebhook("https://siem.example.com/input", "", [{ event: "test" }], {
      maxRetries: 3,
      initialDelayMs: 1,
    });

    expect(result.success).toBe(false);
    expect(result.statusCode).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries on network errors", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("connection refused"))
      .mockRejectedValueOnce(new Error("connection refused"))
      .mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    const { deliverWebhook } = await import("../../../apps/api/src/lib/webhook-delivery.js");
    const result = await deliverWebhook("https://siem.example.com/input", "", [{ event: "test" }], {
      maxRetries: 3,
      initialDelayMs: 1,
    });

    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("fails after exhausting retries", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("down"));
    vi.stubGlobal("fetch", fetchMock);

    const { deliverWebhook } = await import("../../../apps/api/src/lib/webhook-delivery.js");
    const result = await deliverWebhook("https://siem.example.com/input", "", [{ event: "test" }], {
      maxRetries: 2,
      initialDelayMs: 1,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("down");
    expect(result.attempts).toBe(3); // initial + 2 retries
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("omits Authorization header when auth is empty", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    const { deliverWebhook } = await import("../../../apps/api/src/lib/webhook-delivery.js");
    await deliverWebhook("https://example.com", "", [{ event: "test" }]);

    const headers = fetchMock.mock.calls[0][1].headers;
    expect(headers.Authorization).toBeUndefined();
  });

  it("returns error when request times out", async () => {
    const abortError = new Error("The operation was aborted");
    abortError.name = "AbortError";
    const fetchMock = vi.fn().mockRejectedValue(abortError);
    vi.stubGlobal("fetch", fetchMock);

    const { deliverWebhook } = await import("../../../apps/api/src/lib/webhook-delivery.js");
    const result = await deliverWebhook("https://example.com", "", [{ event: "test" }], {
      maxRetries: 0,
      initialDelayMs: 1,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("The operation was aborted");
    expect(result.attempts).toBe(1);
  });

  it("follows exponential backoff delay pattern", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockRejectedValue(new Error("down"));
    vi.stubGlobal("fetch", fetchMock);

    const { deliverWebhook } = await import("../../../apps/api/src/lib/webhook-delivery.js");
    const promise = deliverWebhook("https://example.com", "", [{ event: "test" }], {
      maxRetries: 3,
      initialDelayMs: 1000,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(2000);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    await vi.advanceTimersByTimeAsync(4000);
    expect(fetchMock).toHaveBeenCalledTimes(4);

    const result = await promise;
    expect(result.success).toBe(false);
    expect(result.attempts).toBe(4);
    vi.useRealTimers();
  });

  it("limits retries when maxRetries is 1", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("down"));
    vi.stubGlobal("fetch", fetchMock);

    const { deliverWebhook } = await import("../../../apps/api/src/lib/webhook-delivery.js");
    const result = await deliverWebhook("https://example.com", "", [{ event: "test" }], {
      maxRetries: 1,
      initialDelayMs: 1,
    });

    expect(result.success).toBe(false);
    expect(result.attempts).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("makes no retries when maxRetries is 0", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("down"));
    vi.stubGlobal("fetch", fetchMock);

    const { deliverWebhook } = await import("../../../apps/api/src/lib/webhook-delivery.js");
    const result = await deliverWebhook("https://example.com", "", [{ event: "test" }], {
      maxRetries: 0,
      initialDelayMs: 1,
    });

    expect(result.success).toBe(false);
    expect(result.attempts).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("applies custom initialDelayMs to backoff schedule", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockRejectedValue(new Error("down"));
    vi.stubGlobal("fetch", fetchMock);

    const { deliverWebhook } = await import("../../../apps/api/src/lib/webhook-delivery.js");
    const promise = deliverWebhook("https://example.com", "", [{ event: "test" }], {
      maxRetries: 2,
      initialDelayMs: 500,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(500);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const result = await promise;
    expect(result.success).toBe(false);
    expect(result.attempts).toBe(3);
    vi.useRealTimers();
  });

  it("sends payload with source, version, and events fields", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    const events = [
      { event: "FILE_UPLOADED", userId: "u1" },
      { event: "FILE_DELETED", userId: "u2" },
    ];
    const { deliverWebhook } = await import("../../../apps/api/src/lib/webhook-delivery.js");
    await deliverWebhook("https://example.com/webhook", "", events);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toEqual({
      source: "snapotter",
      version: "1",
      events,
    });
  });

  it("sends Content-Type application/json header", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    const { deliverWebhook } = await import("../../../apps/api/src/lib/webhook-delivery.js");
    await deliverWebhook("https://example.com", "", [{ event: "test" }]);

    const headers = fetchMock.mock.calls[0][1].headers;
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("delivers empty events array", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    const { deliverWebhook } = await import("../../../apps/api/src/lib/webhook-delivery.js");
    const result = await deliverWebhook("https://example.com", "", []);

    expect(result.success).toBe(true);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.events).toEqual([]);
  });

  it("handles very large events array", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    const events = Array.from({ length: 1000 }, (_, i) => ({ event: "BULK_OP", index: i }));
    const { deliverWebhook } = await import("../../../apps/api/src/lib/webhook-delivery.js");
    const result = await deliverWebhook("https://example.com", "", events);

    expect(result.success).toBe(true);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.events).toHaveLength(1000);
  });

  it("sends to URL with path and query components", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    const { deliverWebhook } = await import("../../../apps/api/src/lib/webhook-delivery.js");
    const result = await deliverWebhook(
      "https://api.example.com/v2/webhooks/ingest?source=snapotter",
      "",
      [{ event: "test" }],
    );

    expect(result.success).toBe(true);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://api.example.com/v2/webhooks/ingest?source=snapotter",
    );
  });

  it("passes through Authorization header with Bearer prefix", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    const { deliverWebhook } = await import("../../../apps/api/src/lib/webhook-delivery.js");
    await deliverWebhook("https://example.com", "Bearer sk-live-abc123", [{ event: "test" }]);

    const headers = fetchMock.mock.calls[0][1].headers;
    expect(headers.Authorization).toBe("Bearer sk-live-abc123");
  });

  it("includes statusCode on 5xx failure when maxRetries is 0 (#2557)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    vi.stubGlobal("fetch", fetchMock);

    const { deliverWebhook } = await import("../../../apps/api/src/lib/webhook-delivery.js");
    const result = await deliverWebhook("https://example.com", "", [{ event: "test" }], {
      maxRetries: 0,
      initialDelayMs: 1,
    });

    expect(result).toEqual({
      success: false,
      statusCode: 500,
      error: "HTTP 500",
      attempts: 1,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("includes last statusCode when 5xx or 3xx responses exhaust retries (#2557)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: false, status: 503 });
    vi.stubGlobal("fetch", fetchMock);

    const { deliverWebhook } = await import("../../../apps/api/src/lib/webhook-delivery.js");
    const result = await deliverWebhook("https://example.com", "", [{ event: "test" }], {
      maxRetries: 1,
      initialDelayMs: 1,
    });

    expect(result).toEqual({
      success: false,
      statusCode: 503,
      error: "HTTP 503",
      attempts: 2,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const redirectFetchMock = vi.fn().mockResolvedValue({ ok: false, status: 302 });
    vi.stubGlobal("fetch", redirectFetchMock);

    const redirectResult = await deliverWebhook("https://example.com", "", [{ event: "test" }], {
      maxRetries: 1,
      initialDelayMs: 1,
    });

    expect(redirectResult).toEqual({
      success: false,
      statusCode: 302,
      error: "HTTP 302",
      attempts: 2,
    });
    expect(redirectFetchMock).toHaveBeenCalledTimes(2);
  });

  it("clears statusCode when a 5xx response is followed by a network error on retry, and sets it when a network error is followed by a 5xx (#2557)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 502 })
      .mockRejectedValueOnce(new Error("connection reset"));
    vi.stubGlobal("fetch", fetchMock);

    const { deliverWebhook } = await import("../../../apps/api/src/lib/webhook-delivery.js");
    const result = await deliverWebhook("https://example.com", "", [{ event: "test" }], {
      maxRetries: 1,
      initialDelayMs: 1,
    });

    expect(result).toEqual({
      success: false,
      statusCode: undefined,
      error: "connection reset",
      attempts: 2,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const reverseFetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("connection reset"))
      .mockResolvedValueOnce({ ok: false, status: 504 });
    vi.stubGlobal("fetch", reverseFetchMock);

    const reverseResult = await deliverWebhook("https://example.com", "", [{ event: "test" }], {
      maxRetries: 1,
      initialDelayMs: 1,
    });

    expect(reverseResult).toEqual({
      success: false,
      statusCode: 504,
      error: "HTTP 504",
      attempts: 2,
    });
    expect(reverseFetchMock).toHaveBeenCalledTimes(2);
  });
});
