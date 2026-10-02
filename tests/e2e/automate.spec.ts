import path from "node:path";
import { expect, getTestImagePath, test } from "./helpers";

test.describe("Automate Page", () => {
  // Retry flaky tests caused by dev server timing
  test.describe.configure({ retries: 3 });

  /**
   * Navigate to /automate and wait for the page to fully render.
   * Uses multiple retry strategies for blank-page flakes.
   */
  async function gotoAutomate(page: import("@playwright/test").Page) {
    const heading = page.getByRole("heading", {
      name: /pipeline builder|automate/i,
    });

    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt === 0) {
        await page.goto("/automate", { waitUntil: "load" });
      } else {
        // On retry, wait then reload
        await page.waitForTimeout(500);
        await page.goto("/automate", { waitUntil: "load" });
      }

      try {
        await expect(heading).toBeVisible({ timeout: 8_000 });
        return; // Page loaded successfully
      } catch {
        // Continue to next attempt
      }
    }

    // Final attempt - let it throw if it fails
    await page.goto("/automate", { waitUntil: "load" });
    await expect(heading).toBeVisible({ timeout: 10_000 });
  }

  /** Wait for pipeline steps to render. */
  async function waitForSteps(page: import("@playwright/test").Page, count: number) {
    await expect(page.getByTitle("Remove")).toHaveCount(count, {
      timeout: 5_000,
    });
  }

  /** Open the tool picker, search for a tool by name, and click it. */
  async function addToolStep(
    page: import("@playwright/test").Page,
    name: string,
    expectedCount: number,
  ) {
    await page.getByPlaceholder("Search tools...").fill(name);
    await page
      .getByRole("button", { name: new RegExp(name, "i") })
      .first()
      .click();
    await waitForSteps(page, expectedCount);
  }

  const testImagePath = getTestImagePath();

  /** Upload the test image via the Dropzone file chooser in the right panel. */
  async function uploadTestFile(page: import("@playwright/test").Page) {
    const fileChooserPromise = page.waitForEvent("filechooser");
    // The Dropzone renders a button labelled "Upload from computer"
    await page.getByRole("button", { name: /upload from computer/i }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(testImagePath);
    await page.waitForTimeout(500);
  }

  // --- Page Rendering ---

  test("automate page renders pipeline builder", async ({ loggedInPage: page }) => {
    await gotoAutomate(page);
    await expect(
      page.getByText(/add tools from the palette|chain tools into a pipeline/i).first(),
    ).toBeVisible();
  });

  test("shows empty state message when no steps", async ({ loggedInPage: page }) => {
    await gotoAutomate(page);
    // The empty-state prompt (t.automate.addToolsPrompt) renders in both the canvas
    // header and the pipeline-builder body when no steps exist, so scope to the first.
    await expect(
      page.getByText(/add tools from the palette|add steps to build your pipeline/i).first(),
    ).toBeVisible();
  });

  test("shows dropzone when no file uploaded", async ({ loggedInPage: page }) => {
    await gotoAutomate(page);
    // The Dropzone section should be visible with its upload button
    await expect(page.locator("section[aria-label='File drop zone']")).toBeVisible();
    await expect(page.getByRole("button", { name: /upload from computer/i })).toBeVisible();
  });

  test("has tool palette search", async ({ loggedInPage: page }) => {
    await gotoAutomate(page);
    await expect(page.getByPlaceholder("Search tools...")).toBeVisible();
  });

  test("has Process button (disabled when no steps or file)", async ({ loggedInPage: page }) => {
    await gotoAutomate(page);
    const processBtn = page.getByRole("button", {
      name: "Process",
      exact: true,
    });
    await expect(processBtn).toBeVisible();
    await expect(processBtn).toBeDisabled();
  });

  test("has Save Pipeline button (disabled when no steps)", async ({ loggedInPage: page }) => {
    await gotoAutomate(page);
    // Save Pipeline button is only rendered when steps > 0, so it should not exist yet
    await expect(page.getByRole("button", { name: "Save" })).not.toBeVisible();

    // Add a step so the button appears
    await addToolStep(page, "Resize", 1);
    await expect(page.getByRole("button", { name: "Save" })).toBeVisible();
  });

  // --- Add Step ---

  test("tool palette is visible with search", async ({ loggedInPage: page }) => {
    await gotoAutomate(page);
    await expect(page.getByPlaceholder("Search tools...")).toBeVisible();
  });

  test("selecting a tool from picker adds a step", async ({ loggedInPage: page }) => {
    await gotoAutomate(page);
    await addToolStep(page, "Resize", 1);
    // Verify empty state is gone
    await expect(
      page.getByText(/add tools from the palette|add steps to build your pipeline/i),
    ).not.toBeVisible();
  });

  test("can add multiple steps", async ({ loggedInPage: page }) => {
    await gotoAutomate(page);
    await addToolStep(page, "Resize", 1);
    await addToolStep(page, "Convert", 2);
  });

  test("can add resize, remove-background, then compress without drops", async ({
    loggedInPage: page,
  }) => {
    await gotoAutomate(page);
    await addToolStep(page, "Resize", 1);
    await addToolStep(page, "Remove Background", 2);
    await addToolStep(page, "Compress", 3);
  });

  // --- Step Controls ---

  test("can remove a step", async ({ loggedInPage: page }) => {
    await gotoAutomate(page);
    await addToolStep(page, "Resize", 1);
    await addToolStep(page, "Compress", 2);

    await page.getByTitle("Remove").first().click();
    await waitForSteps(page, 1);
  });

  // --- File Upload ---

  test("can upload a file via dropzone", async ({ loggedInPage: page }) => {
    await gotoAutomate(page);
    await uploadTestFile(page);

    // File name should be visible in the left panel file info section
    await expect(page.getByText("test-image.png").first()).toBeVisible();
  });

  // --- Save Pipeline ---

  test("Save Pipeline button enables after adding steps", async ({ loggedInPage: page }) => {
    await gotoAutomate(page);
    await addToolStep(page, "Resize", 1);

    await expect(page.getByRole("button", { name: "Save" })).toBeVisible();
  });

  test("clicking Save Pipeline shows name input form", async ({ loggedInPage: page }) => {
    await gotoAutomate(page);
    await addToolStep(page, "Resize", 1);

    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByPlaceholder("Pipeline name")).toBeVisible();
  });

  test("can save a pipeline and see it as a chip", async ({ loggedInPage: page }) => {
    // Clean up stale E2E pipelines from previous runs to avoid overflow hiding new ones
    const apiUrl = process.env.API_URL || "http://localhost:13490";
    const loginRes = await fetch(`${apiUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "admin" }),
    });
    const { token } = await loginRes.json();
    const listRes = await fetch(`${apiUrl}/api/v1/pipeline/list`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const { pipelines } = await listRes.json();
    for (const p of pipelines.filter((p: { name: string }) => p.name.startsWith("E2E Pipeline"))) {
      await fetch(`${apiUrl}/api/v1/pipeline/${p.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
    }

    await gotoAutomate(page);
    await addToolStep(page, "Resize", 1);
    await addToolStep(page, "Compress", 2);

    const uniqueName = `E2E Pipeline ${Date.now()}`;
    await page.getByRole("button", { name: "Save" }).click();
    await page.getByPlaceholder("Pipeline name").fill(uniqueName);
    await page.getByRole("button", { name: "Save", exact: true }).click();

    // The name input should disappear after save completes
    await expect(page.getByPlaceholder("Pipeline name")).not.toBeVisible({
      timeout: 5_000,
    });
    // The saved pipeline should appear by name
    await expect(page.getByText(uniqueName).first()).toBeVisible({
      timeout: 5_000,
    });
  });

  // --- Pipeline Execution ---

  test("Process button enables when steps and file are set", async ({ loggedInPage: page }) => {
    await gotoAutomate(page);
    await addToolStep(page, "Compress", 1);
    await uploadTestFile(page);

    await expect(page.getByRole("button", { name: "Process", exact: true })).toBeEnabled();
  });

  test("executing pipeline shows before/after result", async ({ loggedInPage: page }) => {
    // A two-step pipeline can exceed the default 30s test budget on a busy
    // worker pool; give it room.
    test.setTimeout(90_000);
    await gotoAutomate(page);
    await addToolStep(page, "Remove Image Metadata", 1);
    await addToolStep(page, "Compress", 2);
    // Compress defaults to Target Size mode with an unset (0) size, which is
    // invalid; switch the step to Quality mode so the pipeline has valid
    // settings to run.
    await page.getByRole("button", { name: "Quality", exact: true }).click();
    await uploadTestFile(page);

    await page.getByRole("button", { name: "Process", exact: true }).click();

    // Wait for the before/after slider to appear (indicates processing
    // completed). A two-step pipeline runs both child jobs plus a finalize, so
    // allow a generous window for a busy worker pool.
    const slider = page.locator("[aria-label='Before/after comparison slider']");
    await expect(slider).toBeVisible({ timeout: 60_000 });

    // Should show Original and Processed labels inside the slider
    await expect(page.getByText("Original").first()).toBeVisible();
    await expect(page.getByText("Processed").first()).toBeVisible();
  });

  test("a failed pipeline run shows the failure card", async ({ loggedInPage: page }) => {
    // #1352: the run's entry has to end at "failed", which is what gates the
    // result pane's failure card. The side-panel banner alone used to be the
    // only sign anything went wrong.
    const message = "Step 1 (compress): target size must be positive";
    await page.route("**/api/v1/pipeline/execute", (route) =>
      route.fulfill({
        status: 422,
        contentType: "application/json",
        body: JSON.stringify({ error: message }),
      }),
    );
    await gotoAutomate(page);
    await addToolStep(page, "Compress", 1);
    await uploadTestFile(page);

    await page.getByRole("button", { name: "Process", exact: true }).click();

    // The banner renders the message in a <span>; the failure card is the <p>.
    await expect(page.locator("p", { hasText: message }).filter({ visible: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("button", { name: "Process", exact: true })).toBeEnabled();
  });

  test("a 200 the client cannot read shows the failure card", async ({ loggedInPage: page }) => {
    // #1354: an unparseable body is the one sync outcome that still blames
    // the server, and it has to fail the entry like any other failure.
    const message = "Invalid response from server";
    await page.route("**/api/v1/pipeline/execute", (route) =>
      route.fulfill({ status: 200, contentType: "text/html", body: "<html>not json</html>" }),
    );
    await gotoAutomate(page);
    await addToolStep(page, "Compress", 1);
    await uploadTestFile(page);

    await page.getByRole("button", { name: "Process", exact: true }).click();

    await expect(page.locator("p", { hasText: message }).filter({ visible: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("button", { name: "Process", exact: true })).toBeEnabled();
  });

  test("a failed batch replaces the previous batch's result with the failure card", async ({
    loggedInPage: page,
  }) => {
    // #1699: a batch never reset its entries, so after a good batch a failed
    // one left the old result on screen as if this run had produced it.
    test.setTimeout(90_000);
    const fixture = (name: string) =>
      path.join(process.cwd(), "tests", "fixtures", "image", "valid", name);
    await gotoAutomate(page);
    await addToolStep(page, "Remove Image Metadata", 1);
    const fileChooserPromise = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: /upload from computer/i }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles([fixture("test-100x100.jpg"), fixture("qr-code.png")]);

    const processAll = page.getByRole("button", { name: /^Process all/i });
    await processAll.click();
    const slider = page.locator("[aria-label='Before/after comparison slider']");
    await expect(slider).toBeVisible({ timeout: 60_000 });

    const message = "Step 1 (strip-metadata): the server refused this batch";
    await page.route("**/api/v1/pipeline/batch", (route) =>
      route.fulfill({
        status: 422,
        contentType: "application/json",
        body: JSON.stringify({ error: message }),
      }),
    );
    await processAll.click();

    // The banner renders the message in a <span>; the failure card is the <p>.
    await expect(page.locator("p", { hasText: message }).filter({ visible: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(slider).toHaveCount(0);
    await expect(processAll).toBeEnabled();
  });

  // --- Cancel (#1779) ---

  /** Start a run whose upload the server never answers, and return its cancel button. */
  async function startHeldRun(page: import("@playwright/test").Page) {
    // Never fulfilled: the run stays mid-upload until the cancel settles it.
    await page.route("**/api/v1/pipeline/execute", () => {});
    await gotoAutomate(page);
    await addToolStep(page, "Compress", 1);
    await uploadTestFile(page);
    await page.getByRole("button", { name: "Process", exact: true }).click();
    const cancel = page
      .getByRole("status")
      .getByRole("button", { name: "Cancel", exact: true })
      .filter({ visible: true });
    await expect(cancel).toBeEnabled({ timeout: 15_000 });
    return cancel;
  }

  test("canceling a run the server never saw settles it as canceled", async ({
    loggedInPage: page,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));
    await page.route("**/api/v1/jobs/*/cancel", (route) =>
      route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: "Job not found" }),
      }),
    );
    const cancel = await startHeldRun(page);

    await cancel.click();

    await expect(page.locator("p", { hasText: "Canceled" }).filter({ visible: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("button", { name: "Process", exact: true })).toBeEnabled();
    expect(pageErrors).toEqual([]);
  });

  test("a cancel request that never arrives leaves the run going", async ({
    loggedInPage: page,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));
    let cancelAttempts = 0;
    await page.route("**/api/v1/jobs/*/cancel", (route) => {
      cancelAttempts++;
      return route.abort("failed");
    });
    const cancel = await startHeldRun(page);

    await cancel.click();

    // The run is still the server's to settle: the card stays, and the
    // button comes back for another try, with a line saying why (#1815).
    await expect.poll(() => cancelAttempts).toBe(1);
    await expect(cancel).toBeEnabled();
    await expect(
      page
        .getByRole("status")
        .getByText("Couldn't cancel the run. It's still going, so try again."),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Process", exact: true })).toBeDisabled();
    expect(pageErrors).toEqual([]);
  });

  // #1815: a cancel the server refuses used to look like nothing happened.
  // The route's own refusal is a 200 that says it canceled nothing.
  for (const [label, status, body, message] of [
    [
      "200 canceled:false",
      200,
      { canceled: false },
      "This run can't be canceled now. It's still going.",
    ],
    [
      "403",
      403,
      { error: "refused" },
      "Couldn't cancel: you're signed out or not allowed to stop this run. It's still going.",
    ],
    ["500", 500, { error: "refused" }, "Couldn't cancel the run. It's still going, so try again."],
  ] as const) {
    test(`a cancel refused with ${label} says so and leaves the run going`, async ({
      loggedInPage: page,
    }) => {
      const pageErrors: string[] = [];
      page.on("pageerror", (err) => pageErrors.push(err.message));
      await page.route("**/api/v1/jobs/*/cancel", (route) =>
        route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) }),
      );
      const cancel = await startHeldRun(page);

      await cancel.click();

      await expect(page.getByRole("status").getByText(message, { exact: true })).toBeVisible();
      await expect(cancel).toBeEnabled();
      await expect(page.getByRole("button", { name: "Process", exact: true })).toBeDisabled();
      expect(pageErrors).toEqual([]);
    });
  }

  test("a 200 with no download URL shows the failure card", async ({ loggedInPage: page }) => {
    // #1740: an object with nothing to download used to land as a completed
    // run with no result behind it.
    const message = "Invalid response from server";
    await page.route("**/api/v1/pipeline/execute", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
    );
    await gotoAutomate(page);
    await addToolStep(page, "Compress", 1);
    await uploadTestFile(page);

    await page.getByRole("button", { name: "Process", exact: true }).click();

    await expect(page.locator("p", { hasText: message }).filter({ visible: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("button", { name: "Process", exact: true })).toBeEnabled();
  });
});
