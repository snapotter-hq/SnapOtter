import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import Fastify from "fastify";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  __resetGateForTests,
  __setReaderForTests,
  refreshAnalyticsGate,
} from "../../../apps/api/src/lib/analytics-gate.js";
import { registerPostHogProxy } from "../../../apps/api/src/plugins/posthog-proxy.js";
import { buildTestApp, loginAsAdmin, type TestApp } from "../test-server.js";

interface Captured {
  method: string;
  url: string;
  headers: IncomingHttpHeaders;
  body: string;
}

// A throwaway HTTP server standing in for a PostHog host. Records every request
// it receives so the test can assert exactly what the proxy forwarded.
function fakeUpstream(): { server: Server; received: Captured[]; url: () => string } {
  const received: Captured[] = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c as Buffer));
    req.on("end", () => {
      received.push({
        method: req.method ?? "",
        url: req.url ?? "",
        headers: req.headers,
        body: Buffer.concat(chunks).toString("utf8"),
      });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: 1 }));
    });
  });
  return {
    server,
    received,
    url: () => `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
  };
}

const listen = (s: Server) =>
  new Promise<void>((resolve) => s.listen(0, "127.0.0.1", () => resolve()));
const close = (s: Server) => new Promise<void>((resolve) => s.close(() => resolve()));

describe("PostHog first-party proxy (/ingest)", () => {
  let testApp: TestApp;
  const api = fakeUpstream();
  const assets = fakeUpstream();
  const envKeys = [
    "ANALYTICS_BAKED_OVERRIDE",
    "SNAPOTTER_POSTHOG_UPSTREAM",
    "SNAPOTTER_POSTHOG_ASSETS_UPSTREAM",
  ] as const;
  const savedEnv: Record<string, string | undefined> = {};

  beforeAll(async () => {
    await listen(api.server);
    await listen(assets.server);
    for (const k of envKeys) savedEnv[k] = process.env[k];
    // The proxy reads its upstream at registration, so these must be set before
    // buildTestApp(). The bake override forces analytics on in the test env.
    process.env.ANALYTICS_BAKED_OVERRIDE = "on";
    process.env.SNAPOTTER_POSTHOG_UPSTREAM = api.url();
    process.env.SNAPOTTER_POSTHOG_ASSETS_UPSTREAM = assets.url();
    testApp = await buildTestApp();
  }, 30_000);

  afterEach(() => {
    api.received.length = 0;
    assets.received.length = 0;
    __resetGateForTests();
  });

  afterAll(async () => {
    await testApp.cleanup();
    await close(api.server);
    await close(assets.server);
    for (const k of envKeys) {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    }
    __resetGateForTests();
  }, 10_000);

  it("forwards a capture POST to the ingestion host and strips the app session headers", async () => {
    const payload = JSON.stringify({ api_key: "phc_test", event: "$pageview" });
    const res = await testApp.app.inject({
      method: "POST",
      url: "/ingest/capture/",
      headers: {
        "content-type": "application/json",
        cookie: "snapotter_session=super-secret",
        authorization: "Bearer app-session-token",
      },
      payload,
    });

    expect(res.statusCode).toBe(200);
    expect(assets.received).toHaveLength(0);
    expect(api.received).toHaveLength(1);
    const fwd = api.received[0];
    expect(fwd.method).toBe("POST");
    expect(fwd.url).toBe("/capture/");
    expect(fwd.body).toBe(payload);
    // The app session must never leak to a third party.
    expect(fwd.headers.cookie).toBeUndefined();
    expect(fwd.headers.authorization).toBeUndefined();
  });

  it("routes SDK static assets to the assets host", async () => {
    const res = await testApp.app.inject({ method: "GET", url: "/ingest/static/recorder.js" });
    expect(res.statusCode).toBe(200);
    expect(api.received).toHaveLength(0);
    expect(assets.received).toHaveLength(1);
    expect(assets.received[0].url).toBe("/static/recorder.js");
  });

  it("does not forward any client-IP-bearing header to PostHog", async () => {
    // Every header that can carry an end user's IP must be stripped, so PostHog
    // only ever sees the instance's egress IP (the documented privacy guarantee).
    const ipHeaders = {
      "x-forwarded-for": "9.9.9.9",
      "x-real-ip": "9.9.9.9",
      forwarded: "for=9.9.9.9",
      "true-client-ip": "9.9.9.9",
      "cf-connecting-ip": "9.9.9.9",
    };
    await testApp.app.inject({
      method: "POST",
      url: "/ingest/capture/",
      headers: { "content-type": "application/json", ...ipHeaders },
      payload: "{}",
    });
    expect(api.received).toHaveLength(1);
    const forwarded = api.received[0].headers;
    for (const name of Object.keys(ipHeaders)) {
      expect(forwarded[name], `${name} must not reach PostHog`).toBeUndefined();
    }
  });

  it("returns 204 and forwards nothing when analytics is disabled", async () => {
    __setReaderForTests(() => Promise.resolve(false));
    await refreshAnalyticsGate();
    const res = await testApp.app.inject({
      method: "POST",
      url: "/ingest/capture/",
      payload: "{}",
    });
    expect(res.statusCode).toBe(204);
    expect(api.received).toHaveLength(0);
  });

  it("advertises the proxy path on the analytics config endpoint", async () => {
    const res = await testApp.app.inject({ method: "GET", url: "/api/v1/config/analytics" });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).posthogProxyPath).toBe("/ingest");
  });
});

describe("PostHog proxy upstream failure observability (#788)", () => {
  let deadApp: TestApp;
  const envKeys = [
    "ANALYTICS_BAKED_OVERRIDE",
    "SNAPOTTER_POSTHOG_UPSTREAM",
    "SNAPOTTER_POSTHOG_ASSETS_UPSTREAM",
  ] as const;
  const savedEnv: Record<string, string | undefined> = {};

  beforeAll(async () => {
    // Reserve an ephemeral port, then close the listener so connects to it are
    // refused. 127.0.0.1 (not localhost) keeps it to one address family, so
    // undici surfaces a plain ECONNREFUSED instead of an AggregateError.
    const placeholder = createServer();
    await listen(placeholder);
    const deadPort = (placeholder.address() as AddressInfo).port;
    await close(placeholder);

    for (const k of envKeys) savedEnv[k] = process.env[k];
    process.env.ANALYTICS_BAKED_OVERRIDE = "on";
    process.env.SNAPOTTER_POSTHOG_UPSTREAM = `http://127.0.0.1:${deadPort}`;
    process.env.SNAPOTTER_POSTHOG_ASSETS_UPSTREAM = `http://127.0.0.1:${deadPort}`;
    deadApp = await buildTestApp();
  }, 30_000);

  afterAll(async () => {
    await deadApp.cleanup();
    for (const k of envKeys) {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    }
    __resetGateForTests();
  }, 10_000);

  it("keeps the best-effort 5xx and counts the failure in Prometheus", async () => {
    // Browser behavior unchanged: posthog-js sees a 5xx and retries. GET on
    // purpose: reply-from destroys a streamed request body when the connect
    // fails, and light-my-request turns that into an inject() rejection even
    // though a real socket still receives the 5xx (verified against a live
    // listener). A body-less request exercises the same onError path without
    // tripping the harness artifact.
    for (let i = 0; i < 2; i++) {
      const res = await deadApp.app.inject({
        method: "GET",
        url: "/ingest/decide/?v=3",
      });
      expect(res.statusCode).toBeGreaterThanOrEqual(500);
    }

    // Operator signal: the failure shows up on the admin metrics endpoint,
    // classified by kind, one increment per failed forward.
    const adminToken = await loginAsAdmin(deadApp.app);
    const metrics = await deadApp.app.inject({
      method: "GET",
      url: "/api/v1/metrics",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(metrics.statusCode).toBe(200);
    const series = metrics.body.match(
      /snapotter_posthog_proxy_upstream_errors_total\{kind="refused"\} (\d+)/,
    );
    expect(series, "refused-kind counter series missing from /api/v1/metrics").toBeTruthy();
    expect(Number(series?.[1])).toBeGreaterThanOrEqual(2);
  });

  it("counts a real-socket POST with a body (production traffic shape)", async () => {
    // posthog-js sends POSTs, and POST is where the harness artifact lives, so
    // pin the real behavior over a live socket: the browser gets the terminal
    // 5xx and the counter moves. Guards the manual live-listener verification
    // the GET test's comment refers to.
    const readCount = async (): Promise<number> => {
      const adminToken = await loginAsAdmin(deadApp.app);
      const res = await deadApp.app.inject({
        method: "GET",
        url: "/api/v1/metrics",
        headers: { authorization: `Bearer ${adminToken}` },
      });
      const m = res.body.match(
        /snapotter_posthog_proxy_upstream_errors_total\{kind="refused"\} (\d+)/,
      );
      return m ? Number(m[1]) : 0;
    };

    const before = await readCount();
    await deadApp.app.listen({ port: 0, host: "127.0.0.1" });
    const address = deadApp.app.server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    const res = await fetch(`http://127.0.0.1:${port}/ingest/capture/`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ api_key: "phc_test", event: "$pageview" }),
    });
    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(await res.json()).toEqual({ error: "posthog_upstream_unreachable" });
    expect(await readCount()).toBeGreaterThan(before);
  });
});

describe("PostHog proxy registration", () => {
  it("keeps upstream failures out of the app's global error handler", async () => {
    // The production app's setErrorHandler treats every >=500 Error as a bug:
    // an error-level log line per event plus a Sentry report. A PostHog outage
    // must not storm that pipeline, so onError replies with a plain terminal
    // payload instead of reply.send(error). buildTestApp installs no error
    // handler, so this guard registers one explicitly and proves it never runs.
    const envKeys = ["ANALYTICS_BAKED_OVERRIDE", "SNAPOTTER_POSTHOG_UPSTREAM"] as const;
    const savedEnv: Record<string, string | undefined> = {};
    for (const k of envKeys) savedEnv[k] = process.env[k];

    const placeholder = createServer();
    await listen(placeholder);
    const deadPort = (placeholder.address() as AddressInfo).port;
    await close(placeholder);

    process.env.ANALYTICS_BAKED_OVERRIDE = "on";
    process.env.SNAPOTTER_POSTHOG_UPSTREAM = `http://127.0.0.1:${deadPort}`;
    const app = Fastify();
    let errorHandlerHits = 0;
    app.setErrorHandler((_error, _request, reply) => {
      errorHandlerHits++;
      reply.code(500).send({ error: "handler-envelope" });
    });
    try {
      await registerPostHogProxy(app);
      await app.ready();
      const res = await app.inject({ method: "GET", url: "/ingest/decide/?v=3" });
      expect(res.statusCode).toBeGreaterThanOrEqual(500);
      expect(JSON.parse(res.body)).toEqual({ error: "posthog_upstream_unreachable" });
      expect(errorHandlerHits, "upstream failure leaked into the global error handler").toBe(0);
    } finally {
      await app.close();
      for (const k of envKeys) {
        if (savedEnv[k] === undefined) delete process.env[k];
        else process.env[k] = savedEnv[k];
      }
      __resetGateForTests();
    }
  });

  it("boots on an app that already defines a root application/json body parser", async () => {
    // The real app (index.ts) registers a custom application/json parser at the
    // root. @fastify/http-proxy is fastify-plugin-wrapped, so a naive registration
    // adds its own json parser to that same root scope and Fastify throws
    // FST_ERR_CTP_ALREADY_PRESENT at boot. buildTestApp does not add that parser,
    // so the integration tests above miss it; this reproduces the real condition.
    const boot = async () => {
      const app = Fastify();
      app.addContentTypeParser("application/json", { parseAs: "string" }, (_req, body, done) =>
        done(null, body),
      );
      await registerPostHogProxy(app);
      await app.ready();
      await app.close();
    };
    await expect(boot()).resolves.toBeUndefined();
  });
});
