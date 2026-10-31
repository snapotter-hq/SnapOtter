import type { Page } from "@playwright/test";
import { expect, mockAiFeaturesInstalled, test, uploadTestImage } from "./helpers";

/**
 * Issue #1674: generate reads the background-removed image analyze stored.
 * When that object is gone the server answers 410 ANALYSIS_EXPIRED, and the
 * panel must analyze the same file again instead of leaving the user with a
 * dead generate button. The feature list and both routes are mocked, so this
 * runs without the AI bundles.
 */

// A 1x1 PNG is enough for the preview canvas.
const PREVIEW =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

const FIRST_JOB = "00000000-0000-4000-8000-000000001674";
const SECOND_JOB = "00000000-0000-4000-8000-000000002674";

function analyzeBody(jobId: string) {
  return {
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
    jobId,
    filename: "photo.png",
  };
}

async function openWithPhoto(page: Page): Promise<void> {
  await mockAiFeaturesInstalled(page, [
    { id: "background-removal", enablesTools: ["passport-photo"] },
    { id: "face-detection", enablesTools: [] },
  ]);
  await page.goto("/image/passport-photo");
  await uploadTestImage(page);
}

/**
 * The first analyze answers FIRST_JOB at once. Later calls wait for
 * `release()` and answer SECOND_JOB, so the test can look at the panel while
 * re-analysis runs, and a re-analysis that shouldn't happen never completes.
 */
async function mockAnalyze(page: Page): Promise<{ calls: () => number; release: () => void }> {
  let calls = 0;
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/v1/tools/image/passport-photo/analyze", async (route) => {
    calls++;
    const jobId = calls === 1 ? FIRST_JOB : SECOND_JOB;
    if (calls > 1) await held;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(analyzeBody(jobId)),
    });
  });
  return { calls: () => calls, release };
}

test.describe("passport-photo generate after the analysis expired (#1674)", () => {
  test("analyzes the photo again, says why, and generates from the new analysis", async ({
    loggedInPage: page,
  }) => {
    const analyze = await mockAnalyze(page);
    const generatedFor: string[] = [];
    await page.route("**/api/v1/tools/image/passport-photo/generate", (route) => {
      const { jobId } = route.request().postDataJSON() as { jobId: string };
      generatedFor.push(jobId);
      if (jobId === FIRST_JOB) {
        return route.fulfill({
          status: 410,
          contentType: "application/json",
          body: JSON.stringify({
            error: "This photo's analysis has expired. Analyze it again, then generate.",
            code: "ANALYSIS_EXPIRED",
          }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          downloadUrl: `/api/v1/download/${jobId}/photo_passport.jpg`,
          dimensions: { width: 600, height: 600 },
          spec: { country: "US", document: "passport" },
        }),
      });
    });

    await openWithPhoto(page);
    const generate = page.getByTestId("passport-photo-generate");
    await expect(generate).toBeVisible();
    expect(analyze.calls()).toBe(1);

    await generate.click();

    const note = page.getByText(
      "The analysis expired, so the photo is being analyzed again. Generate once it's done.",
    );
    await expect(note).toBeVisible();
    await expect.poll(analyze.calls).toBe(2);

    // Once the second analysis lands, the button is back and the note is gone.
    analyze.release();
    await expect(generate).toBeVisible();
    await expect(note).toBeHidden();

    // Generating again uses the new analysis, not the expired one.
    await generate.click();
    await expect(page.getByRole("link", { name: "Download Photo" })).toBeVisible();
    expect(generatedFor).toEqual([FIRST_JOB, SECOND_JOB]);
  });

  test("any other generate failure shows its message and keeps the analysis", async ({
    loggedInPage: page,
  }) => {
    const analyze = await mockAnalyze(page);
    await page.route("**/api/v1/tools/image/passport-photo/generate", (route) =>
      route.fulfill({
        status: 422,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Passport photo generation failed",
          details: "Couldn't get this photo under 1 KB at the required dimensions.",
        }),
      }),
    );

    await openWithPhoto(page);
    const generate = page.getByTestId("passport-photo-generate");
    await expect(generate).toBeVisible();

    await generate.click();

    await expect(
      page.getByText("Couldn't get this photo under 1 KB at the required dimensions."),
    ).toBeVisible();
    // A wrong re-analysis would hang on the held mock and hide the button.
    await expect(generate).toBeVisible();
    expect(analyze.calls()).toBe(1);
  });
});
