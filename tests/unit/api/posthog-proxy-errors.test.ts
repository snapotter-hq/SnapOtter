import { afterEach, describe, expect, it } from "vitest";
import {
  __resetUpstreamErrorLogThrottleForTests,
  classifyPostHogUpstreamError,
  shouldLogUpstreamError,
} from "../../../apps/api/src/lib/posthog-proxy.js";

// @fastify/reply-from wraps transport failures into typed HTTP errors before
// calling onError, so the classifier keys off the WRAPPER codes it actually
// receives (verified against reply-from v12 source), not raw socket errors:
//   ENOTFOUND / h2 cancel      -> FST_REPLY_FROM_SERVICE_UNAVAILABLE (503)
//   TimeoutError / UND_ERR_HEADERS_TIMEOUT -> FST_REPLY_FROM_GATEWAY_TIMEOUT (504)
//   ECONNRESET                 -> ECONNRESET (500)
//   UND_ERR_SOCKET             -> UND_ERR_SOCKET (500)
//   UND_ERR_CONNECT_TIMEOUT    -> UND_ERR_CONNECT_TIMEOUT (500)
//   everything else (incl. ECONNREFUSED) -> FST_REPLY_FROM_INTERNAL_SERVER_ERROR
//   with the raw message preserved.

const err = (code: string | undefined, message = ""): Error => {
  const e = new Error(message);
  if (code !== undefined) (e as Error & { code?: string }).code = code;
  return e;
};

describe("classifyPostHogUpstreamError", () => {
  it("maps gateway and connect timeouts to timeout", () => {
    expect(classifyPostHogUpstreamError(err("FST_REPLY_FROM_GATEWAY_TIMEOUT"))).toBe("timeout");
    expect(classifyPostHogUpstreamError(err("UND_ERR_CONNECT_TIMEOUT"))).toBe("timeout");
  });

  it("maps the service-unavailable wrapper (DNS failure path) to dns", () => {
    expect(classifyPostHogUpstreamError(err("FST_REPLY_FROM_SERVICE_UNAVAILABLE"))).toBe("dns");
  });

  it("maps reset and undici socket errors to socket", () => {
    expect(classifyPostHogUpstreamError(err("ECONNRESET"))).toBe("socket");
    expect(classifyPostHogUpstreamError(err("UND_ERR_SOCKET"))).toBe("socket");
  });

  it("pulls connection-refused out of the internal-error bucket by message", () => {
    expect(
      classifyPostHogUpstreamError(
        err("FST_REPLY_FROM_INTERNAL_SERVER_ERROR", "connect ECONNREFUSED 3.25.1.9:443"),
      ),
    ).toBe("refused");
  });

  it("maps the stalled-resolver shape (EAI_AGAIN) to dns", () => {
    // Broken container DNS resolves as EAI_AGAIN, not ENOTFOUND, so it lands in
    // the internal-error wrapper instead of the service-unavailable one.
    expect(
      classifyPostHogUpstreamError(
        err("FST_REPLY_FROM_INTERNAL_SERVER_ERROR", "getaddrinfo EAI_AGAIN us.i.posthog.com"),
      ),
    ).toBe("dns");
  });

  it("maps everything else to other", () => {
    expect(classifyPostHogUpstreamError(err("FST_REPLY_FROM_INTERNAL_SERVER_ERROR", "boom"))).toBe(
      "other",
    );
    // A dual-stack refused upstream surfaces as an AggregateError with an empty
    // message, which the wrapper preserves; the code is unrecoverable (no cause
    // chain), so it stays "other" by design. Still counted.
    expect(classifyPostHogUpstreamError(err("FST_REPLY_FROM_INTERNAL_SERVER_ERROR", ""))).toBe(
      "other",
    );
    expect(classifyPostHogUpstreamError(err("FST_REPLY_FROM_BAD_GATEWAY"))).toBe("other");
    expect(classifyPostHogUpstreamError(err(undefined))).toBe("other");
  });
});

describe("shouldLogUpstreamError", () => {
  afterEach(() => {
    __resetUpstreamErrorLogThrottleForTests();
  });

  it("allows the first occurrence of a kind", () => {
    expect(shouldLogUpstreamError("refused", 1_000)).toBe(true);
  });

  it("suppresses repeats of the same kind inside the window", () => {
    expect(shouldLogUpstreamError("refused", 1_000)).toBe(true);
    expect(shouldLogUpstreamError("refused", 1_001)).toBe(false);
    expect(shouldLogUpstreamError("refused", 60_999)).toBe(false);
  });

  it("allows the same kind again once the window has passed", () => {
    expect(shouldLogUpstreamError("refused", 1_000)).toBe(true);
    expect(shouldLogUpstreamError("refused", 61_000)).toBe(true);
  });

  it("throttles kinds independently", () => {
    expect(shouldLogUpstreamError("refused", 1_000)).toBe(true);
    expect(shouldLogUpstreamError("timeout", 1_001)).toBe(true);
  });
});
