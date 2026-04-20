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
      name: /automate/i,
    });

    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt === 0) {
        await page.goto("/automate", { waitUntil: "networkidle" });
      } else {
        // On retry, wait then reload
        await page.waitForTimeout(500);
        await page.goto("/automate", { waitUntil: "networkidle" });
      }

      try {
        await expect(heading).toBeVisible({ timeout: 8_000 });
        return; // Page loaded successfully
      } catch {
        // Continue to next attempt
      }
    }

    // Final attempt - let it throw if it fails
    await page.goto("/automate", { waitUntil: "networkidle" });
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
    await page.getByRole("button", { name: /add step/i }).click();
    await expect(page.getByText("Add a step")).toBeVisible();
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
    await expect(page.getByText(/chain tools into a pipeline/i).first()).toBeVisible();
  });

  test("shows empty state message when no steps", async ({ loggedInPage: page }) => {
    await gotoAutomate(page);
    await expect(page.getByText(/add steps to build your pipeline/i)).toBeVisible();
  });

  test("shows dropzone when no file uploaded", async ({ loggedInPage: page }) => {
    await gotoAutomate(page);
    // The Dropzone section should be visible with its upload button
    await expect(page.locator("section[aria-label='File drop zone']")).toBeVisible();
    await expect(page.getByRole("button", { name: /upload from computer/i })).toBeVisible();
  });

  test("has Add Step button", async ({ loggedInPage: page }) => {
    await gotoAutomate(page);
    await expect(page.getByRole("button", { name: /add step/i })).toBeVisible();
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
    await expect(page.getByRole("button", { name: "Save Pipeline" })).not.toBeVisible();

    // Add a step so the button appears
    await addToolStep(page, "Resize", 1);
    await expect(page.getByRole("button", { name: "Save Pipeline" })).toBeVisible();
  });

  // --- Add Step ---

  test("clicking Add Step opens tool picker", async ({ loggedInPage: page }) => {
    await gotoAutomate(page);
    await page.getByRole("button", { name: /add step/i }).click();
    await expect(page.getByText("Add a step")).toBeVisible();
  });

  test("selecting a tool from picker adds a step", async ({ loggedInPage: page }) => {
    await gotoAutomate(page);
    await addToolStep(page, "Resize", 1);
    // Verify empty state is gone
    await expect(page.getByText(/add steps to build your pipeline/i)).not.toBeVisible();
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

    await expect(page.getByRole("button", { name: "Save Pipeline" })).toBeVisible();
  });

  test("clicking Save Pipeline shows name input form", async ({ loggedInPage: page }) => {
    await gotoAutomate(page);
    await addToolStep(page, "Resize", 1);

    await page.getByRole("button", { name: "Save Pipeline" }).click();
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
    await page.getByRole("button", { name: "Save Pipeline" }).click();
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
    await gotoAutomate(page);
    await addToolStep(page, "Remove Metadata", 1);
    await addToolStep(page, "Compress", 2);
    await uploadTestFile(page);

    await page.getByRole("button", { name: "Process", exact: true }).click();

    // Wait for the before/after slider to appear (indicates processing completed)
    const slider = page.locator("[aria-label='Before/after comparison slider']");
    await expect(slider).toBeVisible({ timeout: 30_000 });

    // Should show Original and Processed labels inside the slider
    await expect(page.getByText("Original").first()).toBeVisible();
    await expect(page.getByText("Processed").first()).toBeVisible();
  });
});
