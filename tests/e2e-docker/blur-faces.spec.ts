import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

function fixturePath(name: string): string {
  return path.join(process.cwd(), "tests", "fixtures", name);
}

async function uploadFile(page: import("@playwright/test").Page, filePath: string) {
  const fileChooserPromise = page.waitForEvent("filechooser");
  const dropzone = page.locator("[class*='border-dashed']").first();
  await dropzone.click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles(filePath);
  await page.waitForTimeout(1000);
}

test.describe("Blur Faces - HEIC fix and no-face warning", () => {
  test("HEIC image processes without error", async ({ page }) => {
    await page.goto("/blur-faces");
    await uploadFile(page, fixturePath("test-portrait.heic"));

    await page.getByTestId("blur-faces-submit").click();

    // Wait for processing to complete — download button proves it worked
    await expect(page.getByTestId("blur-faces-download")).toBeVisible({ timeout: 120_000 });

    // The old bug showed "cannot identify image" or "Face blur failed"
    await expect(page.locator("text=cannot identify image")).not.toBeVisible();
    await expect(page.locator("text=Face blur failed")).not.toBeVisible();
  });

  test("no-face image shows warning message", async ({ page }) => {
    await page.goto("/blur-faces");
    await uploadFile(page, fixturePath("test-blank.png"));

    await page.getByTestId("blur-faces-submit").click();

    await expect(page.getByText("No faces detected")).toBeVisible({ timeout: 120_000 });
  });

  test("HEIC image via API returns 200", async ({ request }) => {
    // Login to get auth token
    const loginRes = await request.post("/api/auth/login", {
      data: { username: "admin", password: "admin" },
    });
    const { token } = await loginRes.json();

    const response = await request.post("/api/v1/tools/blur-faces", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: {
          name: "test.heic",
          mimeType: "image/heic",
          buffer: fs.readFileSync(fixturePath("test-portrait.heic")),
        },
        settings: JSON.stringify({ blurRadius: 30, sensitivity: 0.5 }),
      },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.downloadUrl).toBeTruthy();
  });
});
