import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildBeforeSend } from "../../../apps/api/src/lib/sentry-scrub.js";

// Mutation-focused companion to sentry-scrub.test.ts. The base suite proves the
// happy paths; this one pins the exact redaction placeholders, the FNV digest,
// the key/name/code branches, the window reset, and the recursion so the
// corresponding Stryker mutants (StringLiteral, conditional, arithmetic,
// block-removal) all die. It exercises only the public buildBeforeSend surface;
// the private helpers are reached through breadcrumbs (scrubText) and through
// hint.originalException on a frameless event (errorName/errorCode/errorDigest).

type AnyEvent = Record<string, any>;

// FNV-1a 32-bit hex, mirrored from the module, so the tests can assert the exact
// digest a given input must produce (and, by mismatch, that a different input
// produces a different one). Independent reimplementation, not an import.
const fnv = (s: string): string => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
};

// A minimal event carrying one breadcrumb; the exception is frameless so the
// fingerprint branch (which invokes errorName/errorCode/errorDigest) runs.
const framelessEvt = (over: AnyEvent = {}): AnyEvent => ({
  exception: { values: [{ type: "Error", value: "boom" }] },
  ...over,
});

// One breadcrumb through the scrubber; returns the scrubbed message string.
const scrubMessage = (
  send: ReturnType<typeof buildBeforeSend>,
  message: string,
  extra: AnyEvent = {},
): string => {
  const out = send({ breadcrumbs: [{ message, ...extra }] } as AnyEvent, {})!;
  return out.breadcrumbs[0].message;
};

describe("sentry-scrub redaction placeholders (scrubText)", () => {
  let send: ReturnType<typeof buildBeforeSend>;
  beforeEach(() => {
    send = buildBeforeSend(() => true);
  });

  it("replaces a blob ref with the exact <blob> placeholder, leaving surrounding words", () => {
    // Kills BLOB_RE StringLiteral ("<blob>") and the "redact nothing" mutant:
    // the benign words on either side must survive verbatim.
    expect(scrubMessage(send, "before blob:https://x/y after")).toBe("before <blob> after");
  });

  it("replaces an http(s) url with the exact <url> placeholder, leaving surrounding words", () => {
    // Kills URL_RE StringLiteral ("<url>"). Both http and https must match.
    expect(scrubMessage(send, "open http://host/p?token=abc done")).toBe("open <url> done");
    expect(scrubMessage(send, "open https://host/p done")).toBe("open <url> done");
  });

  it("replaces an absolute unix path with the exact <path> placeholder", () => {
    // Kills PATH_RE StringLiteral ("<path>") for the unix arm.
    expect(scrubMessage(send, "read /data/uploads/secret.png ok")).toBe("read <path> ok");
  });

  it("replaces a windows drive path with <path> (covers the [A-Za-z]:\\ alternative)", () => {
    // Kills the windows alternative in PATH_RE; the base suite only hits unix.
    expect(scrubMessage(send, "open C:\\Users\\me\\f.txt ok")).toBe("open <path> ok");
  });

  it("redacts each of the seven sensitive unix roots the pattern lists", () => {
    // Kills mutants that drop any single root from the PATH_RE alternation.
    for (const root of [
      "Users",
      "home",
      "root",
      "data",
      "tmp",
      "var",
      "app",
      "opt",
      "mnt",
      "srv",
    ]) {
      expect(scrubMessage(send, `x /${root}/secret y`)).toBe("x <path> y");
    }
  });

  it("applies blob, url, and path redaction together in one message", () => {
    // Kills any mutant that removes one of the three .replace() calls: all three
    // placeholders must appear, and the exact literals matter.
    expect(scrubMessage(send, "GET https://h/u/p.jpg then /tmp/z and blob:xyz")).toBe(
      "GET <url> then <path> and <blob>",
    );
  });

  it("leaves a benign message with no url/blob/path completely unchanged", () => {
    // Proves the scrub is targeted (kills "redact everything"): the word "app"
    // is a PATH_RE root but only at a path boundary, so plain prose is untouched.
    const benign = "just a normal sentence with the word app inside it";
    expect(scrubMessage(send, benign)).toBe(benign);
  });

  it("scrubs the blob before the url so a blob: url is not half-consumed", () => {
    // Order-dependent: BLOB_RE runs first. If url ran first, "blob:https://x"
    // would leave a dangling "blob:" prefix. Assert the whole thing becomes <blob>.
    expect(scrubMessage(send, "ref blob:https://host/obj end")).toBe("ref <blob> end");
  });
});

describe("sentry-scrub breadcrumb field handling (scrubBreadcrumb)", () => {
  let send: ReturnType<typeof buildBeforeSend>;
  beforeEach(() => {
    send = buildBeforeSend(() => true);
  });

  it("preserves each of type/category/level/timestamp verbatim", () => {
    // Kills mutants that shorten the copied-key list at L60 or the assignment.
    const out = send(
      {
        breadcrumbs: [
          {
            type: "navigation",
            category: "ui.click",
            level: "warning",
            timestamp: 1234567890,
            message: "hello",
          },
        ],
      } as AnyEvent,
      {},
    )!;
    expect(out.breadcrumbs[0]).toEqual({
      type: "navigation",
      category: "ui.click",
      level: "warning",
      timestamp: 1234567890,
      message: "hello",
    });
  });

  it("keeps http status_code and method but never the url in breadcrumb data", () => {
    // Kills the data-projection mutants: url must be gone, status_code+method kept.
    const out = send(
      {
        breadcrumbs: [
          {
            category: "http",
            data: { url: "https://host/u/secret.jpg", status_code: 404, method: "POST" },
          },
        ],
      } as AnyEvent,
      {},
    )!;
    expect(out.breadcrumbs[0].data).toEqual({ status_code: 404, method: "POST" });
    expect(JSON.stringify(out.breadcrumbs[0])).not.toContain("secret.jpg");
  });

  it("omits breadcrumb data entirely for a non-http category", () => {
    // A console breadcrumb with data must not gain a `data` key (the http-only
    // block at L67 must be gated on category === 'http').
    const out = send(
      {
        breadcrumbs: [{ category: "console", message: "hi", data: { status_code: 200 } }],
      } as AnyEvent,
      {},
    )!;
    expect(out.breadcrumbs[0]).toEqual({ category: "console", message: "hi" });
  });

  it("drops http data when it holds only a url (no safe status_code/method to keep)", () => {
    // Object.keys(safe).length is 0, so no `data` key should be emitted at all.
    const out = send(
      {
        breadcrumbs: [{ category: "http", data: { url: "https://host/x" } }],
      } as AnyEvent,
      {},
    )!;
    expect(out.breadcrumbs[0].data).toBeUndefined();
    expect(out.breadcrumbs[0]).toEqual({ category: "http" });
  });

  it("accepts the {values:[...]} breadcrumb shape as well as a bare array", () => {
    // Kills the block-removal mutant on the wrapped-shape branch (L81-83).
    const out = send(
      {
        breadcrumbs: { values: [{ message: "see /data/x.png", category: "console" }] },
      } as AnyEvent,
      {},
    )!;
    expect(out.breadcrumbs).toEqual({
      values: [{ message: "see <path>", category: "console" }],
    });
  });

  it("returns undefined breadcrumbs for a non-array, non-{values} shape", () => {
    // The final `return undefined` fallthrough (a string breadcrumbs field).
    const out = send({ breadcrumbs: "not-a-list" } as AnyEvent, {})!;
    expect(out.breadcrumbs).toBeUndefined();
  });

  it("drops a null breadcrumb entry (asObj fail-closed) while keeping valid ones", () => {
    // scrubBreadcrumb(null) -> null -> filtered out; the valid entry survives.
    const out = send({ breadcrumbs: [null, { message: "ok" }] } as AnyEvent, {})!;
    expect(out.breadcrumbs).toEqual([{ message: "ok" }]);
  });
});

describe("sentry-scrub stackless fingerprint digest/name/code", () => {
  let send: ReturnType<typeof buildBeforeSend>;
  beforeEach(() => {
    send = buildBeforeSend(() => true);
  });

  const fp = (hint: AnyEvent): any[] => send(framelessEvt(), hint)!.fingerprint;

  it("digests an Error by its message to the exact FNV-1a hex (kills the hash mutants)", () => {
    // fingerprint[3] must equal fnv("alpha"); any StringLiteral/arithmetic mutant
    // in the FNV loop or the message-extraction branch changes this value.
    const out = fp({ originalException: new Error("alpha") });
    expect(out[3]).toBe(fnv("alpha"));
    expect(out[3]).not.toBe(fnv("beta"));
  });

  it("digests a bare string reason via the string branch (L117)", () => {
    // originalException is a raw string: errorDigest takes `s = err`.
    const out = fp({ originalException: "raw string reason" });
    expect(out[3]).toBe(fnv("raw string reason"));
    // name is the primitive typeof (kills errorName's final `return typeof err`).
    expect(out[1]).toBe("string");
  });

  it("digests an object WITH a string message by that message, not its keys (L118-122)", () => {
    // The ternary must pick the message. Guard both directions: equals the
    // message digest, and differs from the sorted-keys digest.
    const orig = { message: "alpha", other: "beta" };
    const out = fp({ originalException: orig });
    expect(out[3]).toBe(fnv("alpha"));
    expect(out[3]).not.toBe(fnv(["message", "other"].sort().join(",")));
  });

  it("digests an object WITHOUT a string message by its sorted keys (L123-125)", () => {
    // message is a number, so the ternary falls to sorted-key join. Key order in
    // the literal is deliberately unsorted to prove .sort() runs.
    const out = fp({ originalException: { zebra: 1, apple: 2, message: 7 } });
    expect(out[3]).toBe(fnv(["apple", "message", "zebra"].join(",")));
  });

  it("produces the same digest regardless of object key insertion order (.sort() kill)", () => {
    // Two objects, same key set, different insertion order -> identical digest.
    const a = fp({ originalException: { b: 1, a: 2, c: 3 } });
    const b = fp({ originalException: { c: 3, b: 1, a: 2 } });
    expect(a[3]).toBe(b[3]);
    expect(a[3]).toBe(fnv("a,b,c"));
  });

  it("digests a number/undefined original via String(err) to the exact hex (L126)", () => {
    // The final else branch: s = String(err).
    expect(fp({ originalException: 42 })[3]).toBe(fnv("42"));
    expect(fp({ originalException: undefined })[3]).toBe(fnv("undefined"));
  });

  it("digests an Error with an empty message to the FNV offset basis (L116 empty branch)", () => {
    // err.message || "" -> "" -> digest is the untouched offset basis 811c9dc5.
    expect(fp({ originalException: new Error("") })[3]).toBe("811c9dc5");
    expect(fnv("")).toBe("811c9dc5");
  });

  it("names a plain object with a non-empty string name by that name (L97 true branch)", () => {
    const out = fp({ originalException: { name: "CustomError", message: "m" } });
    expect(out[1]).toBe("CustomError");
  });

  it("names a plain object with an empty/absent name 'Object' (L97 false branch)", () => {
    // Empty-string name falls through the `n ? n : "Object"` guard.
    expect(fp({ originalException: { name: "" } })[1]).toBe("Object");
    expect(fp({ originalException: { just: "data" } })[1]).toBe("Object");
  });

  it("names a null original 'null' (the dedicated errorName branch)", () => {
    // hint.originalException === null is distinct from typeof object.
    const out = fp({ originalException: null });
    expect(out[1]).toBe("null");
  });

  it("names an Error whose .name was blanked 'Error' (errorName Error-branch fallback)", () => {
    const e = new Error("x");
    e.name = "";
    expect(fp({ originalException: e })[1]).toBe("Error");
  });

  it("carries a string error code through verbatim (errorCode string branch)", () => {
    const out = fp({
      originalException: Object.assign(new Error("m"), { code: "ERR_FS_FILE_TOO_LARGE" }),
    });
    expect(out[2]).toBe("ERR_FS_FILE_TOO_LARGE");
  });

  it("stringifies a numeric error code (errorCode number branch, L104)", () => {
    // code: 500 (number) -> String(500) === "500".
    const out = fp({ originalException: { message: "m", code: 500 } });
    expect(out[2]).toBe("500");
  });

  it("uses '-' for a missing or non-string/number code (errorCode fallback)", () => {
    expect(fp({ originalException: new Error("m") })[2]).toBe("-");
    // An object code is neither string nor number -> "-".
    expect(fp({ originalException: { message: "m", code: { nested: true } } })[2]).toBe("-");
  });

  it("pins the fingerprint prefix literal and its four-part shape", () => {
    // Kills the StringLiteral mutant on "uncaught" and any array-shape change.
    const out = fp({
      originalException: Object.assign(new TypeError("t"), { code: "ERR_T" }),
    });
    expect(out).toEqual(["uncaught", "TypeError", "ERR_T", fnv("t")]);
  });
});

describe("sentry-scrub tags fallback on the frameless path (L223)", () => {
  let send: ReturnType<typeof buildBeforeSend>;
  beforeEach(() => {
    send = buildBeforeSend(() => true);
  });

  it("adds error_name to a PRE-EXISTING allowlisted tags object without discarding it", () => {
    // event.tags already exists (asObj is truthy), so the `event.tags = {}`
    // fallback must NOT run: the allowlisted tool_id survives AND error_name is
    // added alongside it. Kills the mutant that always reassigns tags to {}.
    const out = send(framelessEvt({ tags: { tool_id: "resize", secret_tag: "leak" } }), {
      originalException: new TypeError("x"),
    })!;
    expect(out.tags.tool_id).toBe("resize");
    expect(out.tags.error_name).toBe("TypeError");
    expect(out.tags.secret_tag).toBeUndefined();
  });

  it("creates a tags object when the frameless event has none", () => {
    // No tags present: the `if (!asObj(event.tags)) event.tags = {}` branch runs.
    const out = send(framelessEvt(), { originalException: new TypeError("x") })!;
    expect(out.tags).toEqual({ error_name: "TypeError" });
  });
});

describe("sentry-scrub per-hour window reset (L146)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("resets the counter only after strictly MORE than one hour elapses", () => {
    const send = buildBeforeSend(() => true);
    vi.setSystemTime(0);
    // Fill the window to the 500 ceiling.
    for (let i = 0; i < 500; i++) expect(send({} as AnyEvent, {})).not.toBeNull();
    // The 501st in the same window is dropped.
    expect(send({} as AnyEvent, {})).toBeNull();

    // Exactly one hour later: `now - windowStart > HOUR_MS` is false (not >=),
    // so the window has NOT reset and events are still dropped. This kills the
    // `>`-to-`>=` and the subtraction/comparison mutants.
    vi.setSystemTime(3_600_000);
    expect(send({} as AnyEvent, {})).toBeNull();

    // One millisecond past the hour: the window resets and events flow again.
    vi.setSystemTime(3_600_001);
    expect(send({} as AnyEvent, {})).not.toBeNull();
  });
});

describe("sentry-scrub asObj array/primitive rejection (L48)", () => {
  let send: ReturnType<typeof buildBeforeSend>;
  beforeEach(() => {
    send = buildBeforeSend(() => true);
  });

  it("ignores an array supplied where an object context is expected", () => {
    // contexts is an array: asObj must return null (the !Array.isArray guard),
    // so no os/runtime/tool is kept and contexts collapses to undefined.
    const out = send({ contexts: [{ os: { name: "x" } }] } as AnyEvent, {})!;
    expect(out.contexts).toBeUndefined();
  });

  it("ignores an array supplied where the tags object is expected", () => {
    // tags is an array -> asObj null -> the delete loop is skipped, and since
    // this event is framed (default), no error_name is added: tags stays as-is.
    const framed = {
      tags: ["not", "an", "object"],
      exception: {
        values: [{ type: "Error", value: "v", stacktrace: { frames: [{ filename: "a.ts" }] } }],
      },
    } as AnyEvent;
    const out = send(framed, { originalException: new Error("x") })!;
    expect(Array.isArray(out.tags)).toBe(true);
  });

  it("treats a nested array inside contexts.tool as absent (recursion boundary)", () => {
    // tool value that is an array is neither number/boolean nor a short string,
    // so it is dropped; a sibling primitive is kept. Proves targeted filtering
    // survives one level of nesting.
    const out = send({ contexts: { tool: { format: "png", arr: [1, 2, 3] } } } as AnyEvent, {})!;
    expect(out.contexts.tool).toEqual({ format: "png" });
  });
});
