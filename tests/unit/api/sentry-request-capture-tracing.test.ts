/**
 * The same failing requests as sentry-request-capture.test.ts with tracing on
 * (SENTRY_TRACES_SAMPLE_RATE set), where every sampled request also becomes a
 * transaction. Transactions skip beforeSend, so before the fix they carried the
 * whole request in any mode: body, cookies, Authorization header, and the query
 * string on the event and in the server span's url attributes (#1880).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  expectNoSecrets,
  expectNothingCollected,
  type Harness,
  REQUESTS,
  startHarness,
} from "./sentry-request-harness.js";

let harness: Harness;
beforeAll(async () => {
  harness = await startHarness({ tracing: true });
});
afterAll(async () => {
  await harness?.close();
});

describe("a failing request on a diagnostic instance, tracing on (#1880)", () => {
  it("keeps the login password and credentials out of the event and transaction", async () => {
    const { event, transactions, rawRequests } = await harness.send(
      REQUESTS.login.path,
      REQUESTS.login.init,
    );
    expectNothingCollected(rawRequests);
    expectNoSecrets(event, REQUESTS.login.secrets);
    for (const t of transactions) expectNoSecrets(t, REQUESTS.login.secrets);
    // The server span still names the route it measured.
    const server = transactions.find((t) => t.transaction === "POST /api/auth/login");
    const data = (server?.contexts as { trace?: { data?: Record<string, unknown> } })?.trace?.data;
    expect(data?.["http.route"]).toBe("/api/auth/login");
    expect(data?.["http.target"]).toBe("/api/auth/login");
  });

  it("keeps the SAMLResponse out of the event and transaction", async () => {
    const { event, transactions, rawRequests } = await harness.send(
      REQUESTS.saml.path,
      REQUESTS.saml.init,
    );
    expectNothingCollected(rawRequests);
    expectNoSecrets(event, REQUESTS.saml.secrets);
    for (const t of transactions) expectNoSecrets(t, REQUESTS.saml.secrets);
  });

  it("keeps an uploaded file out of the event and transaction", async () => {
    const { event, transactions, rawRequests } = await harness.send(
      REQUESTS.upload.path,
      REQUESTS.upload.init(),
    );
    expectNothingCollected(rawRequests);
    expectNoSecrets(event, REQUESTS.upload.secrets);
    for (const t of transactions) expectNoSecrets(t, REQUESTS.upload.secrets);
  });

  it("keeps a webhook token in an outgoing url's path out of spans and breadcrumbs (#1899)", async () => {
    const { event, transactions } = await harness.send(
      REQUESTS.webhook.path,
      REQUESTS.webhook.init,
    );
    expectNoSecrets(event, REQUESTS.webhook.secrets);
    for (const t of transactions) expectNoSecrets(t, REQUESTS.webhook.secrets);
    // The outgoing calls are still in the trace, named by method and host.
    const spans = transactions.flatMap(
      (t) => (t.spans ?? []) as Array<{ op?: string; description?: string }>,
    );
    const client = spans.filter((s) => s.op === "http.client");
    expect(client.length).toBeGreaterThanOrEqual(2);
    for (const s of client) expect(s.description).toMatch(/^POST http:\/\/127\.0\.0\.1:\d+$/);
  });
});

describe("a failing request after analytics is switched off, tracing on, diagnostic instance (#1898)", () => {
  it("sends nothing at all: no transaction, no error event, no other envelope", async () => {
    const sent = await harness.sendOptedOut(REQUESTS.login.path, REQUESTS.login.init);
    expect(sent).toEqual([]);
  });

  it("sends again once analytics is back on", async () => {
    const { transactions } = await harness.send(REQUESTS.login.path, REQUESTS.login.init);
    expect(transactions.length).toBeGreaterThan(0);
  });
});
