/**
 * First-run analytics consent prompt (#4910), through the real web app.
 *
 * This suite's server answers the prompt in advance (SNAPOTTER_ANALYTICS_DEFAULT=on
 * in playwright.analytics-local.config.ts) so the opt-out specs start from "on".
 * Here the config response is rewritten to the undecided shape the server
 * returns on a fresh install, which is what the web app keys the prompt on.
 * The server side of "undecided sends nothing" is covered by
 * tests/integration/platform/analytics.test.ts.
 */
import type { Page, Route } from "@playwright/test";
import { expect, test } from "./helpers";

const TITLE = "Send anonymous usage stats and crash reports?";

async function serveUndecidedConfig(page: Page): Promise<void> {
  await page.route("**/api/v1/config/analytics", (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        enabled: false,
        posthogApiKey: "",
        posthogHost: "",
        posthogProxyPath: "",
        feedbackSink: false,
        sentryDsn: "",
        sentryDsnWeb: "",
        posthogSampleRate: 0,
        instanceId: "",
        consentPending: true,
      }),
    }),
  );
}

test.describe("First-run analytics consent", () => {
  test("asks the admin with two equal answers and sends nothing until answered", async ({
    loggedInPage: page,
  }) => {
    const external: string[] = [];
    const proxied: string[] = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) external.push(url.href);
      if (url.pathname.includes("/ingest")) proxied.push(url.pathname);
    });
    await serveUndecidedConfig(page);
    await page.goto("/");

    const prompt = page.getByRole("dialog", { name: TITLE });
    await expect(prompt).toBeVisible();
    const send = prompt.getByRole("button", { name: "Send", exact: true });
    const dontSend = prompt.getByRole("button", { name: "Don't send" });
    await expect(send).toBeVisible();
    await expect(dontSend).toBeVisible();
    expect(await send.getAttribute("class")).toBe(await dontSend.getAttribute("class"));
    const [sendBox, dontSendBox] = await Promise.all([send.boundingBox(), dontSend.boundingBox()]);
    expect(sendBox?.width).toBe(dontSendBox?.width);
    await expect(send).not.toBeFocused();
    await expect(dontSend).not.toBeFocused();

    await page.goto("/image/resize");
    await expect(prompt).toBeVisible();
    expect(external).toEqual([]);
    expect(proxied).toEqual([]);

    // The answer is the real instance setting. This server already answered
    // "on", so saving "Send" leaves the other specs' starting state alone.
    const saved = page.waitForRequest(
      (request) =>
        request.method() === "PUT" &&
        request.url().endsWith("/api/v1/settings") &&
        request.postDataJSON()?.analyticsEnabled === "true",
    );
    await page.unroute("**/api/v1/config/analytics");
    await send.click();
    await saved;
    await expect(prompt).toBeHidden();
  });

  test("closing it saves nothing and keeps it closed for this tab", async ({
    loggedInPage: page,
  }) => {
    const writes: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "PUT" && request.url().endsWith("/api/v1/settings")) {
        writes.push(request.postData() ?? "");
      }
    });
    await serveUndecidedConfig(page);
    await page.goto("/");

    const prompt = page.getByRole("dialog", { name: TITLE });
    await expect(prompt).toBeVisible();
    await prompt.getByRole("button", { name: "Close" }).click();
    await expect(prompt).toBeHidden();

    await page.goto("/image/resize");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(prompt).toBeHidden();
    expect(writes).toEqual([]);
  });
});
