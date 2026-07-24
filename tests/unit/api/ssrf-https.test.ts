/**
 * Coverage for the HTTPS branch of safeFetch and the DNS-pinning agent.
 *
 * The other ssrf specs exercise validateFetchUrl and the HTTP branch (global
 * fetch, pinned via IP replacement). Neither touches:
 *   - createPinnedAgent's inner pinnedLookup callback (the { all: true } and
 *     single-callback forms) or the https.Agent construction branch, and
 *   - the node:https request path in safeFetch (body assembly, header
 *     flattening, maxBytes enforcement, 204 null-body, redirect + agent
 *     teardown, socket/request errors).
 *
 * We mock node:https.request so no real socket is opened, capturing the pinned
 * agent so its lookup can be driven directly, and we keep the real https.Agent
 * so createPinnedAgent builds a genuine agent that stashes the lookup on
 * agent.options.lookup.
 */
import { EventEmitter } from "node:events";
import type { IncomingMessage } from "node:http";
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { MAX_REDIRECTS, safeFetch } from "../../../apps/api/src/lib/ssrf.js";

// A public IP that safeFetch's SSRF check accepts, so validateFetchUrl passes
// and control reaches the https.request branch. 93.184.216.34 is example.com.
const PUBLIC_HTTPS = "https://93.184.216.34/image.jpg";

type PinnedLookupCallback = (
  err: NodeJS.ErrnoException | null,
  address: string | Array<{ address: string; family: number }>,
  family?: number,
) => void;

interface CapturedRequest {
  url: unknown;
  options: {
    agent?: { options?: { lookup?: unknown } };
    method?: string;
    headers?: Record<string, string>;
    signal?: AbortSignal;
  };
  req: MockClientRequest;
}

// Minimal stand-in for http.ClientRequest: an EventEmitter with the members the
// source touches (on("error"), write, end, destroy).
class MockClientRequest extends EventEmitter {
  writes: unknown[] = [];
  ended = false;
  destroyedWith: Error | undefined;
  write = vi.fn((chunk: unknown) => {
    this.writes.push(chunk);
    return true;
  });
  end = vi.fn(() => {
    this.ended = true;
    return this;
  });
  destroy = vi.fn((err?: Error) => {
    this.destroyedWith = err;
    // Real ClientRequest.destroy(err) surfaces the error via the "error" event,
    // which is exactly how safeFetch's promise rejects (req.on("error", reject)).
    if (err) setImmediate(() => this.emit("error", err));
    return this;
  });
}

// A fake IncomingMessage: EventEmitter carrying statusCode/statusMessage/headers.
function makeIncoming(
  statusCode: number | undefined,
  statusMessage: string,
  headers: IncomingMessage["headers"],
): EventEmitter & Partial<IncomingMessage> {
  const msg = new EventEmitter() as EventEmitter & Partial<IncomingMessage>;
  msg.statusCode = statusCode;
  msg.statusMessage = statusMessage;
  msg.headers = headers;
  return msg;
}

const captured: CapturedRequest[] = [];

// Each queued script decides how one https.request call behaves once its
// callback is invoked: which response to hand back, what chunks to emit, and
// whether to end, error, or leave the transfer to a maxBytes abort.
type ResponseScript = (
  msg: EventEmitter & Partial<IncomingMessage>,
  req: MockClientRequest,
) => void;
let scripts: ResponseScript[] = [];

// mockRequest is referenced inside the vi.mock factory below, which vitest
// hoists above every top-level declaration. A plain `const` would be in its TDZ
// at that point ("Cannot access before initialization"), so it must come from
// vi.hoisted (the repo's node-builtin mock idiom). Its body still closes over
// the module-scope captured/scripts/MockClientRequest/makeIncoming bindings,
// which are only touched at call time (during a test), by which point they are
// initialized.
const mockRequest: Mock = vi.hoisted(() =>
  vi.fn((url: unknown, options: CapturedRequest["options"], callback: (msg: unknown) => void) => {
    const req = new MockClientRequest();
    captured.push({ url, options, req });
    const script = scripts.shift();

    // The response is delivered asynchronously so that safeFetch has attached
    // req.on("error", reject) (which happens after https.request returns)
    // before any error can fire. Deliver the IncomingMessage on the next tick,
    // then run the per-call script that drives data/end/error.
    setImmediate(() => {
      const msg = makeIncoming(200, "OK", {});
      callback(msg);
      script?.(msg, req);
    });

    return req;
  }),
);

vi.mock("node:https", async (importOriginal) => {
  // Loose typing mirrors the repo's node-builtin mock idiom; node:https types
  // model the module as a namespace with no `default`, but ESM interop gives it
  // one at runtime, and the source imports the default. Keep the real https.Agent
  // (createPinnedAgent builds one) and override only request.
  const actual: Record<string, unknown> = await importOriginal();
  const actualDefault = (actual.default ?? {}) as Record<string, unknown>;
  return {
    ...actual,
    default: { ...actualDefault, request: mockRequest },
    request: mockRequest,
  };
});

function resetScripts(...next: ResponseScript[]): void {
  scripts = next;
}

// Emit a body then end so safeFetch resolves a normal Response.
function respondWith(
  status: number,
  headers: IncomingMessage["headers"],
  body: Buffer | string = "",
): ResponseScript {
  return (msg) => {
    msg.statusCode = status;
    msg.statusMessage = "";
    msg.headers = headers;
    if (body.length > 0) msg.emit("data", Buffer.from(body));
    msg.emit("end");
  };
}

beforeEach(() => {
  captured.length = 0;
  scripts = [];
  mockRequest.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("safeFetch HTTPS branch", () => {
  it("returns the response body for a direct HTTPS GET", async () => {
    resetScripts(respondWith(200, { "content-type": "image/png" }, "PNGDATA"));

    const res = await safeFetch(PUBLIC_HTTPS);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(await res.text()).toBe("PNGDATA");
    // Went through node:https, not global fetch.
    expect(mockRequest).toHaveBeenCalledTimes(1);
    expect(captured[0].req.ended).toBe(true);
  });

  it("pins DNS to the SSRF-validated IP and keeps the original hostname for SNI", async () => {
    resetScripts(respondWith(200, {}, "ok"));

    await safeFetch(PUBLIC_HTTPS);

    // The URL handed to https.request keeps the hostname (SNI), unlike the HTTP
    // path which swaps in the raw IP.
    expect(String(captured[0].url)).toContain("93.184.216.34");

    // The agent carries the pinned lookup. Drive both callback forms Node uses.
    const lookup = captured[0].options.agent?.options?.lookup as (
      hostname: string,
      opts: { all?: boolean },
      cb: PinnedLookupCallback,
    ) => void;
    expect(typeof lookup).toBe("function");

    const allResult = await new Promise<Array<{ address: string; family: number }>>((resolve) => {
      lookup("93.184.216.34", { all: true }, (_e, addr) =>
        resolve(addr as Array<{ address: string; family: number }>),
      );
    });
    expect(allResult).toEqual([{ address: "93.184.216.34", family: 4 }]);

    const singleResult = await new Promise<{ address: string; family?: number }>((resolve) => {
      lookup("93.184.216.34", {}, (_e, addr, family) =>
        resolve({ address: addr as string, family }),
      );
    });
    expect(singleResult).toEqual({ address: "93.184.216.34", family: 4 });
  });

  it("pins an IPv6 lookup with family 6", async () => {
    resetScripts(respondWith(200, {}, "ok"));

    await safeFetch("https://[2606:4700::1]/image.jpg");

    const lookup = captured[0].options.agent?.options?.lookup as (
      hostname: string,
      opts: { all?: boolean },
      cb: PinnedLookupCallback,
    ) => void;
    const allResult = await new Promise<Array<{ address: string; family: number }>>((resolve) => {
      lookup("2606:4700::1", { all: true }, (_e, addr) =>
        resolve(addr as Array<{ address: string; family: number }>),
      );
    });
    expect(allResult).toEqual([{ address: "2606:4700::1", family: 6 }]);
  });

  it("flattens multi-value response headers (e.g. set-cookie)", async () => {
    resetScripts(
      respondWith(200, { "set-cookie": ["a=1", "b=2"], "content-type": "text/plain" }, "body"),
    );

    const res = await safeFetch(PUBLIC_HTTPS);

    expect(res.headers.getSetCookie()).toEqual(["a=1", "b=2"]);
    expect(res.headers.get("content-type")).toBe("text/plain");
  });

  it("skips headers whose value is undefined", async () => {
    // Node lists a header key with an undefined value; the source guards on
    // `if (value)` so it must not appear on the built Headers.
    resetScripts(
      respondWith(200, { "x-present": "yes", "x-absent": undefined } as IncomingMessage["headers"]),
    );

    const res = await safeFetch(PUBLIC_HTTPS);

    expect(res.headers.get("x-present")).toBe("yes");
    expect(res.headers.has("x-absent")).toBe(false);
  });

  it("passes custom method, headers, and body through to https.request", async () => {
    resetScripts(respondWith(200, {}, "done"));

    await safeFetch(PUBLIC_HTTPS, {
      method: "POST",
      headers: { "X-Custom": "1" },
      body: "payload",
    });

    expect(captured[0].options.method).toBe("POST");
    expect(captured[0].options.headers?.["X-Custom"]).toBe("1");
    expect(captured[0].options.headers?.["User-Agent"]).toBe("SnapOtter/2.0 (file-fetch)");
    // The body is written to the request stream before end().
    expect(captured[0].req.write).toHaveBeenCalledWith("payload");
    expect(captured[0].req.ended).toBe(true);
  });

  it("does not write a request body when none is provided", async () => {
    resetScripts(respondWith(200, {}, "x"));

    await safeFetch(PUBLIC_HTTPS);

    expect(captured[0].req.write).not.toHaveBeenCalled();
    expect(captured[0].req.ended).toBe(true);
  });

  it("returns an empty-body Response for a 204 without throwing", async () => {
    // A 204 is a null-body status; toFetchResponse must pass null, or the
    // Response constructor throws from inside the 'end' handler.
    resetScripts(respondWith(204, {}));

    const res = await safeFetch(PUBLIC_HTTPS);

    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
  });

  it("clamps an out-of-range status code to 502", async () => {
    resetScripts((msg) => {
      msg.statusCode = 999;
      msg.statusMessage = "weird";
      msg.headers = {};
      msg.emit("end");
    });

    const res = await safeFetch(PUBLIC_HTTPS);

    expect(res.status).toBe(502);
  });

  it("rejects when the request emits a socket error", async () => {
    resetScripts((_msg, req) => {
      req.emit("error", new Error("ECONNREFUSED boom"));
    });

    await expect(safeFetch(PUBLIC_HTTPS)).rejects.toThrow("ECONNREFUSED boom");
  });

  it("rejects when the response stream emits an error", async () => {
    resetScripts((msg) => {
      msg.emit("error", new Error("stream reset"));
    });

    await expect(safeFetch(PUBLIC_HTTPS)).rejects.toThrow("stream reset");
  });

  it("aborts and rejects when the response exceeds maxBytes mid-stream", async () => {
    resetScripts((msg, req) => {
      msg.statusCode = 200;
      msg.headers = {};
      // First chunk is under the cap, second pushes over it.
      msg.emit("data", Buffer.alloc(3));
      msg.emit("data", Buffer.alloc(3));
      // After the cap is crossed the source destroys the request; the mock's
      // destroy re-emits "error", which rejects the promise. Nothing else needed.
      expect(req.destroy).toHaveBeenCalled();
    });

    await expect(safeFetch(PUBLIC_HTTPS, { maxBytes: 4 })).rejects.toThrow(
      "Response exceeds maximum size of 4 bytes",
    );
    expect(captured[0].req.destroyedWith?.message).toContain("Response exceeds maximum size");
  });

  it("stays under maxBytes when the body is within the cap", async () => {
    resetScripts((msg) => {
      msg.statusCode = 200;
      msg.headers = {};
      msg.emit("data", Buffer.alloc(2));
      msg.emit("data", Buffer.alloc(2));
      msg.emit("end");
    });

    const res = await safeFetch(PUBLIC_HTTPS, { maxBytes: 10 });

    expect(res.status).toBe(200);
    expect((await res.arrayBuffer()).byteLength).toBe(4);
  });

  it("ignores data/end that arrive after a maxBytes abort (settled guard)", async () => {
    resetScripts((msg, req) => {
      msg.statusCode = 200;
      msg.headers = {};
      msg.emit("data", Buffer.alloc(10)); // over the cap -> settled = true, destroy
      // These late events must be swallowed by the `if (settled) return` guards
      // and must not double-settle the promise.
      msg.emit("data", Buffer.alloc(10));
      msg.emit("end");
      msg.emit("error", new Error("late error that must be ignored"));
      expect(req.destroy).toHaveBeenCalledTimes(1);
    });

    await expect(safeFetch(PUBLIC_HTTPS, { maxBytes: 5 })).rejects.toThrow(
      "Response exceeds maximum size",
    );
  });

  it("follows an HTTPS redirect with a fresh pinned agent per hop", async () => {
    resetScripts(
      respondWith(302, { location: "https://93.184.216.34/final" }),
      respondWith(200, {}, "final-body"),
    );

    const res = await safeFetch(PUBLIC_HTTPS);

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("final-body");
    expect(mockRequest).toHaveBeenCalledTimes(2);

    // Each hop builds its own pinned agent (the source destroys the previous one
    // before continuing), so the two requests carry distinct agent instances.
    expect(captured[0].options.agent).toBeDefined();
    expect(captured[1].options.agent).toBeDefined();
    expect(captured[1].options.agent).not.toBe(captured[0].options.agent);
  });

  it("rejects an HTTPS redirect that points at a private IP", async () => {
    resetScripts(respondWith(302, { location: "https://127.0.0.1/internal" }));

    await expect(safeFetch(PUBLIC_HTTPS)).rejects.toThrow("private");
  });

  it("rejects an HTTPS redirect with no Location header", async () => {
    resetScripts(respondWith(302, {}));

    await expect(safeFetch(PUBLIC_HTTPS)).rejects.toThrow("Redirect without Location header");
  });

  it("throws Too many redirects once the HTTPS chain exceeds MAX_REDIRECTS", async () => {
    const hops: ResponseScript[] = [];
    for (let i = 0; i <= MAX_REDIRECTS; i++) {
      hops.push(respondWith(302, { location: `https://93.184.216.34/hop${i + 1}` }));
    }
    resetScripts(...hops);

    await expect(safeFetch(PUBLIC_HTTPS)).rejects.toThrow("Too many redirects");
    expect(mockRequest).toHaveBeenCalledTimes(MAX_REDIRECTS + 1);
  });
});
