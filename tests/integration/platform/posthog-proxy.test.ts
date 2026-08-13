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
import { buildTestApp, type TestApp } from "../test-server.js";

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

describe("PostHog proxy registration", () => {
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
