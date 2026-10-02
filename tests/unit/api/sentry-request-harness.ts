/**
 * Shared harness for the #1880 request-capture tests: the REAL @sentry/node SDK
 * initialised with instrument.ts's integration list and scrubbers, in
 * diagnostic mode (SNAPOTTER_SENTRY_DIAGNOSTIC=1, the mode that keeps the most)
 * unless a test asks for the default, plus a
 * Fastify server with the real error handler. Every route fails with a 5xx so
 * reportError captures it, and the transport records what would have been sent.
 *
 * The SDK only sets its http integration up once per process, so each test
 * file starts exactly one harness.
 */
import http from "node:http";
import net from "node:net";
import { parse as parseQs } from "node:querystring";
import multipart from "@fastify/multipart";
import * as Sentry from "@sentry/node";
import Fastify from "fastify";
import { expect } from "vitest";
import {
  __resetGateForTests,
  __setReaderForTests,
  analyticsEnabled,
  gatePrimed,
  primeAnalyticsGate,
  refreshAnalyticsGate,
} from "../../../apps/api/src/lib/analytics-gate.js";
import { resetThrottleForTests } from "../../../apps/api/src/lib/error-report.js";
import { buildSentryIntegrations } from "../../../apps/api/src/lib/sentry-integrations.js";
import {
  buildBeforeSend,
  buildBeforeSendTransaction,
} from "../../../apps/api/src/lib/sentry-scrub.js";
import { buildTracesSampler } from "../../../apps/api/src/lib/sentry-tracing.js";
import { registerErrorHandler } from "../../../apps/api/src/plugins/error-handler.js";

export const PASSWORD = "hunter2-correct-horse";
export const SAML_RESPONSE = Buffer.from(
  "<samlp:Response><saml:NameID>alice@example.com</saml:NameID></samlp:Response>",
).toString("base64");
export const API_KEY = "si_0123456789abcdef0123456789abcdef";
export const SESSION = "sess-7f3a9c2e";
export const QUERY_TOKEN = "qtok-5d1e8b";
export const FILE_BYTES = "PRIVATE-FILE-CONTENT-a8c4";
/** The end user's address as a reverse proxy forwards it (TEST-NET-3). */
export const CLIENT_IP = "203.0.113.7";
/** The token a Slack or Discord webhook url carries in its path (#1899). */
export const WEBHOOK_SECRET = "hooksecret-9b2f4e";

/**
 * Every request carries an API key, a session cookie, a forwarded client IP,
 * a Referer still holding a token, and a harmless user agent.
 */
export const SECRET_HEADERS = {
  authorization: `Bearer ${API_KEY}`,
  cookie: `snapotter_session=${SESSION}`,
  "x-forwarded-for": CLIENT_IP,
  referer: `http://snapotter.local/login?mfaToken=${QUERY_TOKEN}`,
  "user-agent": "sentry-capture-test",
};

// An upstream trace that already decided to sample (the trailing "-1").
const SAMPLED_PARENT = "0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-1";

type Payload = Record<string, unknown>;

export interface Sent {
  /** The error event as the transport received it. */
  event: Payload;
  /** Every transaction the transport received for the request. */
  transactions: Payload[];
  /**
   * `request` on each event and transaction as the SDK built it, before our
   * beforeSend hooks ran: what the integrations alone collected.
   */
  rawRequests: Payload[];
}

export interface Harness {
  /** POST to the server and return the one error event and any transactions sent for it. */
  send(path: string, init: RequestInit): Promise<Sent>;
  /**
   * Tracing harnesses only. POST with analytics switched off in Settings, then
   * switch it back on. Resolves once the SDK has built a transaction for the
   * request and returns the type of every envelope item that reached the
   * transport meanwhile, whatever its kind (#1898). reportError skips the
   * error event itself while analytics is off.
   */
  sendOptedOut(path: string, init: RequestInit): Promise<string[]>;
  /** A plain GET that leaves an http breadcrumb behind; its response is ignored. */
  ping(path: string): Promise<void>;
  close(): Promise<void>;
}

export async function startHarness({
  tracing,
  diagnostic = true,
}: {
  tracing: boolean;
  diagnostic?: boolean;
}): Promise<Harness> {
  process.env.ANALYTICS_BAKED_OVERRIDE = "on"; // NODE_ENV=test lets the gate turn on
  // reportError reads this too (diagnostic skips its throttle, which send()
  // resets anyway).
  if (diagnostic) process.env.SNAPOTTER_SENTRY_DIAGNOSTIC = "1";
  __setReaderForTests(async () => true);
  await primeAnalyticsGate();

  const events: Payload[] = [];
  const transactions: Payload[] = [];
  const rawRequests: Payload[] = [];
  // Every envelope item type the transport received: events, transactions,
  // sessions, check-ins, client reports, logs, anything.
  const itemTypes: string[] = [];
  // Transactions the SDK built and handed to the hook, sent or not.
  let builtTransactions = 0;
  const recordRaw = (event: { request?: unknown }) => {
    rawRequests.push(JSON.parse(JSON.stringify(event.request ?? {})) as Payload);
  };
  // The same gate instrument.ts passes: primed and the setting on.
  const sentryActive = () => gatePrimed() && analyticsEnabled();
  const beforeSend = buildBeforeSend(sentryActive, diagnostic);
  const beforeSendTransaction = buildBeforeSendTransaction(sentryActive, diagnostic);
  Sentry.init({
    dsn: "https://0123456789abcdef0123456789abcdef@o1.ingest.sentry.io/1",
    sendDefaultPii: false,
    integrations: buildSentryIntegrations(Sentry, tracing),
    ...(tracing ? { tracesSampler: buildTracesSampler(1) as never } : {}),
    sendClientReports: false,
    beforeSend: ((event: Payload, hint: Parameters<typeof beforeSend>[1]) => {
      recordRaw(event);
      return beforeSend(event, hint);
    }) as never,
    beforeSendTransaction: ((event: Payload) => {
      builtTransactions++;
      recordRaw(event);
      return beforeSendTransaction(event);
    }) as never,
    transport: () => ({
      send: async (envelope) => {
        for (const [header, payload] of envelope[1] as unknown as Array<
          [{ type: string }, Payload]
        >) {
          itemTypes.push(header.type);
          const copy = JSON.parse(JSON.stringify(payload)) as Payload;
          if (header.type === "event") events.push(copy);
          if (header.type === "transaction") transactions.push(copy);
        }
        return {} as never;
      },
      flush: async () => true,
    }),
  });

  const app = Fastify();
  await app.register(multipart);
  // Same parser the SAML plugin registers for the IdP's form POST.
  app.addContentTypeParser(
    "application/x-www-form-urlencoded",
    { parseAs: "string" },
    (_request, body, done) => done(null, parseQs(String(body))),
  );
  registerErrorHandler(app);
  const fail = (what: string) => {
    throw new Error(`${what} failed: database unavailable`);
  };
  app.post("/api/auth/login", async (request) => {
    // The route really did get the secret, so the SDK had the chance to keep it.
    expect((request.body as { password?: string }).password).toBe(PASSWORD);
    fail("login");
  });
  app.post("/api/auth/saml/callback", async (request) => {
    expect((request.body as { SAMLResponse?: string }).SAMLResponse).toBe(SAML_RESPONSE);
    fail("saml callback");
  });
  app.post("/api/v1/tools/image/resize", async (request) => {
    const file = await request.file();
    expect((await file?.toBuffer())?.toString()).toBe(FILE_BYTES);
    fail("resize");
  });
  // Stands in for Slack's and Discord's servers. A bare TCP listener, so the
  // SDK records only our outgoing side of the call, as it would in production.
  const hooks = net.createServer((socket) => {
    socket.on("error", () => {}); // a reset client must not crash the fork
    socket.once("data", () => {
      socket.end("HTTP/1.1 204 No Content\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
    });
  });
  await new Promise<void>((resolve) => hooks.listen(0, "127.0.0.1", resolve));
  const hooksBase = `http://127.0.0.1:${(hooks.address() as net.AddressInfo).port}`;
  // Webhook delivery posts through node:http(s) for an https url and fetch for
  // an http one (safeFetch), so make one call each way, then fail.
  app.post("/api/v1/webhooks/test", async () => {
    await new Promise<void>((resolve, reject) => {
      const req = http.request(
        `${hooksBase}/services/T000/B000/${WEBHOOK_SECRET}`,
        { method: "POST" },
        (res) => res.resume().on("end", resolve),
      );
      req.on("error", reject);
      req.end("{}");
    });
    await fetch(`${hooksBase}/api/webhooks/123/${WEBHOOK_SECRET}`, {
      method: "POST",
      body: "{}",
    }).then((r) => r.arrayBuffer());
    fail("webhook test");
  });
  const base = await app.listen({ port: 0, host: "127.0.0.1" });

  return {
    async send(path, init) {
      resetThrottleForTests();
      events.length = 0;
      transactions.length = 0;
      rawRequests.length = 0;
      // With tracing on, arrive inside a sampled upstream trace: the production
      // sampler follows a parent's decision for any request, so this is how a
      // transaction gets recorded for these routes today.
      const headers = tracing
        ? { ...(init.headers as object), "sentry-trace": SAMPLED_PARENT }
        : init.headers;
      const res = await fetch(`${base}${path}`, { method: "POST", ...init, headers });
      expect(res.status).toBe(500);
      // reportError is fire-and-forget from the error handler, and the
      // transaction ends after the response; wait for both to be sent.
      for (
        let i = 0;
        i < 50 && (events.length === 0 || (tracing && transactions.length === 0));
        i++
      ) {
        await Sentry.flush(100);
      }
      expect(events).toHaveLength(1);
      if (tracing) expect(transactions.length).toBeGreaterThan(0);
      return {
        event: events[0] as Payload,
        transactions: [...transactions],
        rawRequests: [...rawRequests],
      };
    },
    async sendOptedOut(path, init) {
      resetThrottleForTests();
      expect(tracing).toBe(true);
      // Drain anything an earlier request left queued before the window opens.
      await Sentry.flush(100);
      itemTypes.length = 0;
      builtTransactions = 0;
      __setReaderForTests(async () => false);
      await refreshAnalyticsGate();
      try {
        const headers = { ...(init.headers as object), "sentry-trace": SAMPLED_PARENT };
        const res = await fetch(`${base}${path}`, { method: "POST", ...init, headers });
        expect(res.status).toBe(500);
        for (let i = 0; i < 50 && builtTransactions === 0; i++) await Sentry.flush(100);
        // The SDK really did build one, so an empty transport means the gate
        // dropped it, not that nothing was ever sampled.
        expect(builtTransactions).toBeGreaterThan(0);
        await Sentry.flush(100);
        return [...itemTypes];
      } finally {
        __setReaderForTests(async () => true);
        await refreshAnalyticsGate();
      }
    },
    async ping(path) {
      await fetch(`${base}${path}`).then((r) => r.arrayBuffer());
    },
    async close() {
      await app.close();
      await new Promise((resolve) => hooks.close(resolve));
      await Sentry.close(0);
      __resetGateForTests();
      delete process.env.ANALYTICS_BAKED_OVERRIDE;
      delete process.env.SNAPOTTER_SENTRY_DIAGNOSTIC;
    },
  };
}

/** Assert a sent payload carries none of the secrets and no body, cookies, or query. */
export function expectNoSecrets(payload: Payload, extra: string[]): void {
  const raw = JSON.stringify(payload);
  for (const secret of [API_KEY, SESSION, QUERY_TOKEN, CLIENT_IP, ...extra]) {
    expect(raw).not.toContain(secret);
  }
  const request = payload.request as Payload | undefined;
  expect(request?.data).toBeUndefined();
  expect(request?.cookies).toBeUndefined();
  expect(request?.query_string).toBeUndefined();
  const headers = (request?.headers ?? {}) as Payload;
  for (const name of Object.keys(headers)) {
    expect(["authorization", "cookie", "set-cookie"]).not.toContain(name.toLowerCase());
  }
}

/**
 * The SDK itself never collected a body, cookies, or the separate
 * query_string, so the beforeSend hooks are a second line for those rather
 * than the only one. (The url's query and the Authorization header are still
 * collected; only the hooks remove them, which expectNoSecrets checks.)
 */
export function expectNothingCollected(rawRequests: Payload[]): void {
  expect(rawRequests.length).toBeGreaterThan(0);
  for (const request of rawRequests) {
    expect(request.data).toBeUndefined();
    expect(request.cookies).toBeUndefined();
    expect(request.query_string).toBeUndefined();
  }
}

/** The three failing requests every harness file runs. */
export const REQUESTS = {
  login: {
    path: `/api/auth/login?token=${QUERY_TOKEN}`,
    init: {
      headers: { ...SECRET_HEADERS, "content-type": "application/json" },
      body: JSON.stringify({ username: "alice", password: PASSWORD }),
    },
    secrets: [PASSWORD],
  },
  saml: {
    path: "/api/auth/saml/callback",
    init: {
      headers: { ...SECRET_HEADERS, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ SAMLResponse: SAML_RESPONSE, RelayState: "/" }).toString(),
    },
    // The full assertion, a prefix that survives truncation, and the identity inside.
    secrets: [SAML_RESPONSE, SAML_RESPONSE.slice(0, 24), "alice@example.com"],
  },
  upload: {
    path: `/api/v1/tools/image/resize?token=${QUERY_TOKEN}`,
    init: (): RequestInit => {
      const form = new FormData();
      form.append("file", new Blob([FILE_BYTES], { type: "image/png" }), "holiday.png");
      form.append("settings", JSON.stringify({ width: 100 }));
      return { headers: SECRET_HEADERS, body: form };
    },
    secrets: [FILE_BYTES, "holiday.png"],
  },
  // A request that posts to a webhook before it fails (#1899).
  webhook: {
    path: "/api/v1/webhooks/test",
    init: { headers: SECRET_HEADERS },
    // Path segments are not listed: the event's stack frames quote this file's
    // source (pre_context), which spells them out.
    secrets: [WEBHOOK_SECRET],
  },
};
