/**
 * The #1880 requests on a default (non-diagnostic) instance with tracing on.
 * Error events drop `request` outright there; transactions go through
 * buildBeforeSendTransaction(false), which must do the same to real SDK spans,
 * not only to the hand-written fixture in sentry-scrub.test.ts.
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
  harness = await startHarness({ tracing: true, diagnostic: false });
});
afterAll(async () => {
  await harness?.close();
});

describe("a failing request on a default instance, tracing on (#1880)", () => {
  for (const [name, req] of Object.entries(REQUESTS)) {
    it(`sends no request data or secrets for the ${name} request`, async () => {
      const init = typeof req.init === "function" ? req.init() : req.init;
      const { event, transactions, rawRequests } = await harness.send(req.path, init);
      expectNothingCollected(rawRequests);
      expectNoSecrets(event, req.secrets);
      expect(event.request).toBeUndefined();
      for (const t of transactions) {
        expectNoSecrets(t, req.secrets);
        expect(t.request).toBeUndefined();
      }
    });
  }
});

describe("a failing request after analytics is switched off, tracing on, default instance (#1898)", () => {
  it("sends nothing at all: no transaction, no error event, no other envelope", async () => {
    const sent = await harness.sendOptedOut(REQUESTS.login.path, REQUESTS.login.init);
    expect(sent).toEqual([]);
  });

  it("sends again once analytics is back on", async () => {
    const { transactions } = await harness.send(REQUESTS.login.path, REQUESTS.login.init);
    expect(transactions.length).toBeGreaterThan(0);
  });
});
