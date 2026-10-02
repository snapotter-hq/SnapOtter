import { beforeEach, describe, expect, it } from "vitest";
import {
  buildBeforeSend,
  buildBeforeSendTransaction,
} from "../../../apps/api/src/lib/sentry-scrub.js";

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
  it("keeps the raw message and request when diagnostic is on", () => {
    const diag = buildBeforeSend(() => true, true);
    const event = {
      exception: { values: [{ type: "Error", value: "open /data/uploads/a/report.pdf" }] },
      request: { method: "POST", url: "https://host/api/v1/tools/image/rounded-crop" },
    };
    const out = diag(event as never, {
      originalException: new Error("open /data/uploads/a/report.pdf"),
    }) as never as { exception: { values: Array<{ value: string }> }; request?: unknown };
    expect(out.exception.values[0].value).toBe("open /data/uploads/a/report.pdf");
    expect(out.request).toBeDefined();
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
  it("keeps a redacted message for unknown errors", () => {
    const out = send(evt(), { originalException: new Error("user path /tmp/z") })!;
    expect(out.exception.values[0].value).toBe("user path <path>");
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
  it("keeps a vetted python context of frame strings and drops overlong ones", () => {
    const event = {
      ...evt(),
      contexts: {
        python: {
          type: "RuntimeError",
          frames: ["remove_bg.py:88 run", "x".repeat(500)],
        },
      },
    };
    const out = send(event, { originalException: new Error("x") })!;
    expect(out.contexts.python.type).toBe("RuntimeError");
    expect(out.contexts.python.frames).toHaveLength(2);
    expect(out.contexts.python.frames[0]).toBe("remove_bg.py:88 run");
    expect(out.contexts.python.frames[1].length).toBeLessThanOrEqual(200);
  });
  it("enforces the 500-events-per-hour ceiling", () => {
    for (let i = 0; i < 500; i++) expect(send(evt(), {})).not.toBeNull();
    expect(send(evt(), {})).toBeNull();
  });
  it("never throws on malformed events (fail-closed to a scrubbed event)", () => {
    expect(() => send({} as AnyEvent, {})).not.toThrow();
    expect(() => send(evt({ exception: { values: null } }), {})).not.toThrow();
  });

  // Stackless uncaught errors (a non-Error throw/rejection, or a stripped stack)
  // arrive as a bare "Error" with no frames, so Sentry collapses every distinct
  // one into a single ungroupable issue (NODE-1Y). Group them by safe identity.
  const frameless = (msg: string, hint: AnyEvent, over: AnyEvent = {}) =>
    send(evt({ exception: { values: [{ type: "Error", value: msg, ...over }] } }), hint)!;

  it("groups stackless errors by a stable fingerprint: same message groups, different separates", () => {
    const fp = (msg: string) => frameless(msg, { originalException: new Error(msg) }).fingerprint;
    expect(fp("alpha")).toEqual(fp("alpha"));
    expect(fp("alpha")).not.toEqual(fp("beta"));
    // The message itself is never part of the fingerprint (only a one-way hash).
    expect(JSON.stringify(fp("secret /data/user.png"))).not.toContain("secret");
    expect(JSON.stringify(fp("secret /data/user.png"))).not.toContain("user.png");
  });
  it("fingerprints and tags a stackless error by its safe name and code", () => {
    const out = frameless("x is not a function", {
      originalException: Object.assign(new TypeError("x is not a function"), { code: "ERR_X" }),
    });
    expect(out.fingerprint[0]).toBe("uncaught");
    expect(out.fingerprint[1]).toBe("TypeError");
    expect(out.fingerprint[2]).toBe("ERR_X");
    expect(out.tags.error_name).toBe("TypeError");
  });
  it("leaves framed errors on Sentry's default grouping (no custom fingerprint)", () => {
    // evt() carries a real frame; those already group well and must be untouched.
    const out = send(evt(), { originalException: new Error("x") })!;
    expect(out.fingerprint).toBeUndefined();
  });
  it("never overrides a fingerprint already set upstream (e.g. an operational one)", () => {
    const out = frameless(
      "x",
      {
        originalException: Object.assign(new Error("x"), { code: "ENOSPC" }),
      },
      {},
    );
    // set it upstream this time:
    const out2 = send(
      evt({
        exception: { values: [{ type: "Error", value: "x" }] },
        fingerprint: ["operational", "ENOSPC"],
      }),
      { originalException: Object.assign(new Error("x"), { code: "ENOSPC" }) },
    )!;
    expect(out.fingerprint[0]).toBe("uncaught");
    expect(out2.fingerprint).toEqual(["operational", "ENOSPC"]);
  });
  it("handles non-Error rejections (string, object) without throwing and still groups them", () => {
    const s = frameless("x", { originalException: "bare string reason" });
    expect(s.fingerprint[0]).toBe("uncaught");
    expect(s.tags.error_name).toBe("string");
    const o = frameless("x", { originalException: { weird: true, code: 500 } });
    expect(o.fingerprint[0]).toBe("uncaught");
    expect(o.fingerprint[2]).toBe("500");
    expect(o.tags.error_name).toBe("Object");
  });
  it("treats an empty frames array as stackless too", () => {
    const out = frameless(
      "x",
      { originalException: new Error("x") },
      { stacktrace: { frames: [] } },
    );
    expect(out.fingerprint[0]).toBe("uncaught");
  });
});
// #1880: what a request leaves on an event, whatever the mode.
const secretRequest = (): AnyEvent => ({
  method: "POST",
  url: "https://host/api/auth/login?token=qtok#frag",
  query_string: "token=qtok",
  data: '{"password":"hunter2"}',
  cookies: { snapotter_session: "sess" },
  env: { REMOTE_ADDR: "10.0.0.9" },
  headers: {
    Authorization: "Bearer si_secret",
    cookie: "snapotter_session=sess",
    "set-cookie": "a=b",
    "x-forwarded-for": "10.0.0.9",
    "User-Agent": "curl/8",
    "content-type": "application/json",
    "content-length": "22",
    accept: ["text/html"], // not a string: dropped
  },
});

describe("buildBeforeSend diagnostic request scrub (#1880)", () => {
  const diag = () => buildBeforeSend(() => true, true);

  it("keeps only method, the url without its query, and allowlisted headers", () => {
    const out = diag()({ request: secretRequest() } as never, {}) as AnyEvent;
    expect(out.request).toEqual({
      method: "POST",
      url: "https://host/api/auth/login",
      headers: {
        "User-Agent": "curl/8",
        "content-type": "application/json",
        "content-length": "22",
      },
    });
  });
  it("drops a request with nothing safe left, and a malformed one", () => {
    expect(diag()({ request: { data: "x", cookies: {} } } as never, {})?.request).toBeUndefined();
    expect(diag()({ request: "raw" } as never, {})?.request).toBeUndefined();
    expect(diag()({ request: ["x"] } as never, {})?.request).toBeUndefined();
    expect(diag()({ request: { headers: { cookie: "a" } } } as never, {})?.request).toBeUndefined();
  });
  it("strips query strings and secrets from breadcrumb data in both shapes", () => {
    const crumb = {
      category: "http",
      message: "kept raw",
      data: {
        url: "https://idp/token?code=abc",
        "http.query": "?code=abc",
        "http.fragment": "#x",
        "http.method": "POST",
        status_code: 200,
      },
    };
    const want = {
      category: "http",
      message: "kept raw",
      // An http breadcrumb is an outgoing call: origin only (#1899).
      data: { url: "https://idp", "http.method": "POST", status_code: 200 },
    };
    const list = diag()({ breadcrumbs: [crumb, { category: "nodata" }, 7] } as never, {});
    expect(list?.breadcrumbs).toEqual([want, { category: "nodata" }, 7]);
    const wrapped = diag()({ breadcrumbs: { values: [crumb] } } as never, {});
    expect(wrapped?.breadcrumbs).toEqual({ values: [want] });
    expect(diag()({ breadcrumbs: "odd" } as never, {})?.breadcrumbs).toBe("odd");
    expect(diag()({} as never, {})).not.toHaveProperty("breadcrumbs");
  });
});

describe("buildBeforeSendTransaction (#1880)", () => {
  const on = () => true;
  const txn = (): AnyEvent => ({
    transaction: "GET /api/auth/oidc/callback?code=abc",
    request: secretRequest(),
    breadcrumbs: [{ category: "http", data: { url: "https://x/y?t=1", method: "GET" } }],
    contexts: {
      trace: {
        op: "http.server",
        data: {
          "http.url": "http://h/api/auth/oidc/callback?code=abc",
          "http.target": "/api/auth/oidc/callback?code=abc",
          "url.full": "http://h/a?code=abc",
          "url.path": "/a?code=abc",
          url: "http://h/a#frag",
          "http.query": "code=abc",
          "url.query": "code=abc",
          "http.request.body.data": "password=x",
          "http.response.body.data": "{}",
          "http.request.header.authorization": "[Filtered]",
          "http.request.header.cookie.snapotter_session": "[Filtered]",
          "http.response.header.set_cookie": "[Filtered]",
          "http.request.header.proxy_authorization": "[Filtered]",
          "http.response.header.cookie": "[Filtered]",
          "http.request.header.x_forwarded_for": "[Filtered]",
          "http.request.header.referer": "http://h/login?mfaToken=abc#x",
          "url.fragment": "x",
          "http.client_ip": "203.0.113.7",
          "net.peer.ip": "10.0.0.9",
          "net.host.ip": "10.0.0.1",
          "client.address": "203.0.113.7",
          "network.peer.address": "10.0.0.9",
          "net.host.port": 13490,
          "http.request.header.user_agent": "curl/8",
          "http.route": "/api/auth/oidc/callback",
        },
      },
    },
    spans: [
      {
        op: "http.client",
        description: "GET https://idp/token?code=abc",
        data: { "http.query": "x" },
      },
      {
        op: "db",
        description: "SELECT * FROM users WHERE id = ?",
        data: { "db.system": "postgresql" },
      },
      { description: 42 },
      null,
    ],
  });
  const scrubbedTraceData = {
    "http.url": "http://h/api/auth/oidc/callback",
    "http.target": "/api/auth/oidc/callback",
    "url.full": "http://h/a",
    "url.path": "/a",
    url: "http://h/a",
    "http.request.header.referer": "http://h/login",
    "net.host.port": 13490,
    "http.request.header.user_agent": "curl/8",
    "http.route": "/api/auth/oidc/callback",
  };

  it("drops the request and strict-scrubs breadcrumbs by default", () => {
    const out = buildBeforeSendTransaction(on)(txn());
    expect(out.request).toBeUndefined();
    expect(out.breadcrumbs).toEqual([{ category: "http", data: { method: "GET" } }]);
    expect(out.transaction).toBe("GET /api/auth/oidc/callback");
    expect(out.contexts.trace.data).toEqual(scrubbedTraceData);
    expect(out.spans[0]).toEqual({
      op: "http.client",
      description: "GET https://idp",
      data: {},
    });
    // A db statement's "?" is a placeholder, not a query string.
    expect(out.spans[1].description).toBe("SELECT * FROM users WHERE id = ?");
    expect(out.spans[2]).toEqual({ description: 42 });
    expect(out.spans[3]).toBeNull();
  });
  it("keeps the allowlisted request and breadcrumb data in diagnostic mode", () => {
    const out = buildBeforeSendTransaction(on, true)(txn());
    expect(out.request).toEqual({
      method: "POST",
      url: "https://host/api/auth/login",
      headers: {
        "User-Agent": "curl/8",
        "content-type": "application/json",
        "content-length": "22",
      },
    });
    expect(out.breadcrumbs).toEqual([
      { category: "http", data: { url: "https://x", method: "GET" } },
    ]);
    expect(out.contexts.trace.data).toEqual(scrubbedTraceData);
  });
  it("drops the event when the scrub throws instead of letting the SDK resend it raw", () => {
    const hostile = {
      get request(): never {
        throw new Error("boom");
      },
    };
    expect(buildBeforeSendTransaction(on)(hostile as never)).toBeNull();
    expect(buildBeforeSendTransaction(on, true)(hostile as never)).toBeNull();
    expect(buildBeforeSend(() => true, true)(hostile as never, {})).toBeNull();
    expect(buildBeforeSend(() => true)(hostile as never, {})).toBeNull();
  });
  it("drops every transaction while analytics is off, in either mode (#1898)", () => {
    const off = () => false;
    expect(buildBeforeSendTransaction(off)(txn())).toBeNull();
    expect(buildBeforeSendTransaction(off, true)(txn())).toBeNull();
    expect(buildBeforeSendTransaction(off)({})).toBeNull();
  });
  it("reads the gate on every transaction, so a toggle applies without a restart (#1898)", () => {
    let active = true;
    const hook = buildBeforeSendTransaction(() => active);
    expect(hook(txn())).not.toBeNull();
    active = false;
    expect(hook(txn())).toBeNull();
    active = true;
    expect(hook(txn())).not.toBeNull();
  });
  it("drops the transaction when the gate itself throws", () => {
    const broken = () => {
      throw new Error("gate read failed");
    };
    expect(buildBeforeSendTransaction(broken)(txn())).toBeNull();
  });
  it("leaves a non-http transaction name alone and tolerates a bare event", () => {
    const out = buildBeforeSendTransaction(on)({
      transaction: "job resize#2",
      contexts: { trace: { op: "queue.process" } },
    });
    expect(out.transaction).toBe("job resize#2");
    expect(buildBeforeSendTransaction(on)({})).toEqual({ request: undefined });
  });
});

// #1899: an outgoing request's path can be the secret itself. Slack and
// Discord webhook urls carry their token in the path, not the query.
describe("outgoing request urls (#1899)", () => {
  const SLACK = "https://hooks.slack.com/services/T000/B000/XXXXslacksecret";
  const DISCORD = "https://discord.com/api/webhooks/123/discordsecret?wait=true";
  const SECRETS = ["XXXXslacksecret", "discordsecret", "T000", "/api/webhooks"];
  const expectClean = (value: unknown) => {
    const raw = JSON.stringify(value);
    for (const s of SECRETS) expect(raw).not.toContain(s);
  };
  const clientSpan = (url: string, method = "POST"): AnyEvent => {
    const u = new URL(url);
    return {
      op: "http.client",
      description: `${method} ${url}`,
      data: {
        url,
        "url.full": url,
        "http.url": url,
        "url.path": u.pathname,
        "http.target": u.pathname + u.search,
        "url.query": u.search,
        "server.address": u.hostname,
        "http.method": method,
        "http.response.status_code": 200,
      },
    };
  };
  const crumb = (url: string): AnyEvent => ({
    category: "http",
    type: "http",
    data: { url, "http.method": "POST", status_code: 200 },
  });

  it("reduces a diagnostic error event's http breadcrumb url to its origin", () => {
    const out = buildBeforeSend(() => true, true)(
      { breadcrumbs: [crumb(SLACK), crumb(DISCORD)] } as never,
      {},
    ) as AnyEvent;
    expect(out.breadcrumbs).toEqual([
      {
        category: "http",
        type: "http",
        data: { url: "https://hooks.slack.com", "http.method": "POST", status_code: 200 },
      },
      {
        category: "http",
        type: "http",
        data: { url: "https://discord.com", "http.method": "POST", status_code: 200 },
      },
    ]);
  });

  it("reduces http.client spans to method and origin, keeping host, method, and status", () => {
    for (const diagnostic of [false, true]) {
      const out = buildBeforeSendTransaction(
        () => true,
        diagnostic,
      )({
        transaction: "POST /api/v1/settings",
        contexts: { trace: { op: "http.server", data: { "http.target": "/api/v1/settings" } } },
        breadcrumbs: [crumb(SLACK)],
        spans: [clientSpan(SLACK), clientSpan(DISCORD)],
      });
      expectClean(out);
      expect(out.spans[0]).toEqual({
        op: "http.client",
        description: "POST https://hooks.slack.com",
        data: {
          url: "https://hooks.slack.com",
          "url.full": "https://hooks.slack.com",
          "http.url": "https://hooks.slack.com",
          "server.address": "hooks.slack.com",
          "http.method": "POST",
          "http.response.status_code": 200,
        },
      });
      expect(out.spans[1].description).toBe("POST https://discord.com");
      // The API's own server span keeps its path: that url is ours, not a third party's.
      expect(out.transaction).toBe("POST /api/v1/settings");
      expect(out.contexts.trace.data["http.target"]).toBe("/api/v1/settings");
    }
  });

  it("reduces an outgoing request that is itself the transaction's root span", () => {
    const span = clientSpan(SLACK);
    const out = buildBeforeSendTransaction(() => true)({
      transaction: span.description,
      contexts: { trace: { op: "http.client", data: span.data } },
    });
    expectClean(out);
    expect(out.transaction).toBe("POST https://hooks.slack.com");
    expect(out.contexts.trace.data.url).toBe("https://hooks.slack.com");
  });

  it("drops userinfo and keeps a non-default port", () => {
    const out = buildBeforeSendTransaction(() => true)({
      spans: [clientSpan("http://user:pass@hooks.internal:8080/hook/tok")],
    });
    expect(out.spans[0].description).toBe("POST http://hooks.internal:8080");
    expect(out.spans[0].data.url).toBe("http://hooks.internal:8080");
    expect(JSON.stringify(out)).not.toContain("pass");
  });

  it("drops an outgoing url it cannot parse rather than send it whole", () => {
    const out = buildBeforeSendTransaction(() => true)({
      spans: [
        { op: "http.client", description: "GET /relative/tok", data: { url: "/relative/tok" } },
        { op: "http.client", description: "not a url", data: { "url.full": "::bad::" } },
      ],
    });
    expect(out.spans[0]).toEqual({ op: "http.client", description: "GET", data: {} });
    expect(out.spans[1]).toEqual({ op: "http.client", description: "not", data: {} });
    const odd = buildBeforeSendTransaction(() => true)({
      spans: [
        { op: "http.client", description: "POST", data: { "url.full": [SLACK] } },
        { op: "http.client", description: SLACK, data: { url: 42 } },
      ],
    });
    expectClean(odd);
    expect(odd.spans[0]).toEqual({ op: "http.client", description: "POST", data: {} });
    expect(odd.spans[1]).toEqual({
      op: "http.client",
      description: "https://hooks.slack.com",
      data: {},
    });
    const crumbs = buildBeforeSend(() => true, true)(
      {
        breadcrumbs: [{ category: "http", data: { url: "garbage tok", status_code: 0 } }],
      } as never,
      {},
    ) as AnyEvent;
    expect(crumbs.breadcrumbs).toEqual([{ category: "http", data: { status_code: 0 } }]);
  });

  it("leaves non-http breadcrumbs' urls with their path", () => {
    const out = buildBeforeSend(() => true, true)(
      { breadcrumbs: [{ category: "navigation", data: { url: "https://h/a/b?t=1" } }] } as never,
      {},
    ) as AnyEvent;
    expect(out.breadcrumbs).toEqual([{ category: "navigation", data: { url: "https://h/a/b" } }]);
  });
});
