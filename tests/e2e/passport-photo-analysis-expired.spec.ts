import type { Page } from "@playwright/test";
import { expect, test, uploadTestImage } from "./helpers";

/**
 * Issue #1674: generate reads the background-removed image analyze stored.
 * When that object is gone the server answers 410 ANALYSIS_EXPIRED, and the
 * panel must analyze the same file again instead of leaving the user with a
 * dead generate button. Both routes are mocked, so this runs without the AI
 * bundles.
 */

// A 1x1 PNG is enough for the preview canvas.
const PREVIEW =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

const ANALYZE_BODY = {
  preview: PREVIEW,
  landmarks: {
    leftEye: { x: 0.42, y: 0.4 },
    rightEye: { x: 0.58, y: 0.4 },
    eyeCenter: { x: 0.5, y: 0.4 },
    chin: { x: 0.5, y: 0.62 },
    forehead: { x: 0.5, y: 0.25 },
    crown: { x: 0.5, y: 0.18 },
    nose: { x: 0.5, y: 0.5 },
    faceCenterX: 0.5,
  },
  imageWidth: 900,
  imageHeight: 1200,
  jobId: "00000000-0000-4000-8000-000000001674",
  filename: "photo.png",
};

async function mockAnalyze(page: Page): Promise<() => number> {
  let calls = 0;
  await page.route("**/api/v1/tools/image/passport-photo/analyze", (route) => {
    calls++;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(ANALYZE_BODY),
    });
  });
  return () => calls;
}

async function mockGenerate(page: Page, status: number, body: object): Promise<void> {
  await page.route("**/api/v1/tools/image/passport-photo/generate", (route) =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) }),
  );
}

test.describe("passport-photo generate after the analysis expired (#1674)", () => {
  test("analyzes the photo again and says why", async ({ loggedInPage: page }) => {
    const analyzeCalls = await mockAnalyze(page);
    await mockGenerate(page, 410, {
      error: "This photo's analysis has expired. Analyze it again, then generate.",
      code: "ANALYSIS_EXPIRED",
    });

    await page.goto("/image/passport-photo");
    await uploadTestImage(page);
    const generate = page.getByTestId("passport-photo-generate");
    await expect(generate).toBeVisible();
    expect(analyzeCalls()).toBe(1);

    await generate.click();

    await expect(
      page.getByText(
        "The analysis expired, so the photo is being analyzed again. Generate once it's done.",
      ),
    ).toBeVisible();
    await expect.poll(analyzeCalls).toBe(2);
    await expect(generate).toBeVisible();
  });

  test("any other generate failure shows its message and keeps the analysis", async ({
    loggedInPage: page,
  }) => {
    const analyzeCalls = await mockAnalyze(page);
    await mockGenerate(page, 422, {
      error: "Passport photo generation failed",
      details: "Couldn't get this photo under 1 KB at the required dimensions.",
    });

    await page.goto("/image/passport-photo");
    await uploadTestImage(page);
    const generate = page.getByTestId("passport-photo-generate");
    await expect(generate).toBeVisible();

    await generate.click();

    await expect(
      page.getByText("Couldn't get this photo under 1 KB at the required dimensions."),
    ).toBeVisible();
    await expect(generate).toBeVisible();
    expect(analyzeCalls()).toBe(1);
  });
});
