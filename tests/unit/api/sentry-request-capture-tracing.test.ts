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
});
