import { connectivityClass, isClientAbort, rebuildErrorValue, SafeError } from "@snapotter/shared";
import { describe, expect, it } from "vitest";

const sysErr = (code: string, syscall?: string) =>
  Object.assign(new Error(`${code}: boom /Users/secret/file.png`), { code, syscall });

describe("rebuildErrorValue", () => {
  it("passes SafeError messages through", () => {
    expect(rebuildErrorValue(new SafeError("Storage directory is not writable"))).toBe(
      "Storage directory is not writable",
    );
  });
  it("rebuilds node system errors as code + syscall, no path", () => {
    expect(rebuildErrorValue(sysErr("EACCES", "mkdir"))).toBe("EACCES mkdir");
    expect(rebuildErrorValue(sysErr("ENOSPC"))).toBe("ENOSPC");
  });
  it("resolves a 5-char EPIPE as a node code, not a SQLSTATE", () => {
    expect(rebuildErrorValue(sysErr("EPIPE", "write"))).toBe("EPIPE write");
  });
  it("finds a pg SQLSTATE through a drizzle-style cause chain, never the SQL", () => {
    const pg = Object.assign(new Error('relation "settings" does not exist'), {
      code: "42P01",
      severity: "ERROR",
    });
    const wrapped = Object.assign(new Error('Failed query: select "value" from "settings"'), {
      cause: pg,
    });
    expect(rebuildErrorValue(wrapped)).toBe("pg 42P01");
  });
  it("appends a vetted pg routine when present", () => {
    const pg = Object.assign(new Error("terminating connection due to administrator command"), {
      code: "57P01",
      routine: "ProcessInterrupts",
    });
    expect(rebuildErrorValue(pg)).toBe("pg 57P01 ProcessInterrupts");
  });
  it("keeps only the first token of a redis ReplyError", () => {
    const err = Object.assign(new Error("NOAUTH Authentication required secret-arg"), {
      name: "ReplyError",
    });
    expect(rebuildErrorValue(err)).toBe("reply NOAUTH");
  });
  it("returns bare reply when the ReplyError first token is not code-shaped", () => {
    const err = Object.assign(new Error("user_script:1:attempted-to-index-secret"), {
      name: "ReplyError",
    });
    expect(rebuildErrorValue(err)).toBe("reply");
  });
  it("rebuilds zod errors as issue code + path", () => {
    const err = Object.assign(new Error("big zod dump with received values"), {
      name: "ZodError",
      issues: [{ code: "invalid_type", path: ["settings", "width"] }],
    });
    expect(rebuildErrorValue(err)).toBe("zod invalid_type at settings.width");
  });
  it("replaces unvettable zod path segments with a tilde", () => {
    const err = Object.assign(new Error("dump"), {
      name: "ZodError",
      issues: [{ code: "invalid_type", path: ["files", "user secret.pdf", 0] }],
    });
    expect(rebuildErrorValue(err)).toBe("zod invalid_type at files.~.0");
  });
  it("returns null for unknown errors (caller falls back to type-only)", () => {
    expect(rebuildErrorValue(new Error("user file /tmp/x.pdf broke"))).toBeNull();
    expect(rebuildErrorValue("string")).toBeNull();
    expect(rebuildErrorValue(null)).toBeNull();
  });
  it("discards hostile names on the status branch", () => {
    const err = Object.assign(new Error("upstream said no"), {
      name: "Bad Gateway https://internal.host/path",
      status: 502,
    });
    expect(rebuildErrorValue(err)).toBe("HttpError 502");
  });
  it("returns null for a circular cause chain without hanging", () => {
    const err = new Error("loop") as Error & { cause?: unknown };
    err.cause = err;
    expect(rebuildErrorValue(err)).toBeNull();
  });
});

describe("connectivityClass", () => {
  it("classifies pg-unavailable via SQLSTATE 08/57P and drizzle wrapping", () => {
    const pg = Object.assign(new Error("terminating connection"), { code: "57P01" });
    expect(connectivityClass(Object.assign(new Error("Failed query: x"), { cause: pg }))).toBe(
      "pg-unavailable",
    );
  });
  it("classifies ECONN* under pg when the chain looks like pg, else net", () => {
    const conn = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:5432"), {
      code: "ECONNREFUSED",
    });
    expect(connectivityClass(Object.assign(new Error("Failed query: y"), { cause: conn }))).toBe(
      "pg-unavailable",
    );
    expect(connectivityClass(conn)).toBe("net-unavailable");
  });
  it("classifies ioredis connection loss as redis-unavailable", () => {
    const err = Object.assign(new Error("Connection is closed."), {
      name: "MaxRetriesPerRequestError",
    });
    expect(connectivityClass(err)).toBe("redis-unavailable");
  });
  it("returns null for ordinary errors and ReplyError", () => {
    expect(connectivityClass(new Error("nope"))).toBeNull();
    expect(
      connectivityClass(Object.assign(new Error("ERR unknown command"), { name: "ReplyError" })),
    ).toBeNull();
  });
});

describe("isClientAbort", () => {
  it("matches abort/premature-close/reset shapes", () => {
    expect(isClientAbort(Object.assign(new Error("aborted"), { code: "ECONNRESET" }))).toBe(true);
    expect(
      isClientAbort(
        Object.assign(new Error("premature close"), { code: "ERR_STREAM_PREMATURE_CLOSE" }),
      ),
    ).toBe(true);
    expect(
      isClientAbort(Object.assign(new Error("request aborted"), { name: "RequestAbortedError" })),
    ).toBe(true);
    expect(isClientAbort(new Error("boom"))).toBe(false);
  });
  it("treats a top-level bare ECONNRESET as a client abort", () => {
    const err = Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" });
    expect(isClientAbort(err)).toBe(true);
  });
  it("does not treat a drizzle-wrapped pg ECONNRESET as a client abort", () => {
    const conn = Object.assign(new Error("connect ECONNRESET 127.0.0.1:5432"), {
      code: "ECONNRESET",
    });
    const wrapped = Object.assign(new Error("Failed query: z"), { cause: conn });
    expect(isClientAbort(wrapped)).toBe(false);
    expect(connectivityClass(wrapped)).toBe("pg-unavailable");
  });
});

describe("hostile error shapes", () => {
  it("returns the fallback from all three exports when a cause getter throws", () => {
    const hostile = new Error("boom");
    Object.defineProperty(hostile, "cause", {
      get() {
        throw new Error("gotcha");
      },
    });
    expect(rebuildErrorValue(hostile)).toBeNull();
    expect(connectivityClass(hostile)).toBeNull();
    expect(isClientAbort(hostile)).toBe(false);
  });
});
