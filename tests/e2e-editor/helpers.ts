import { test as base, expect, type Page } from "@playwright/test";

export const test = base.extend<{ editorPage: Page }>({
  editorPage: async ({ page }, use) => {
    // Login first
    await page.goto("/login");
    await page.waitForTimeout(1500);
    await page.fill('input[placeholder*="username" i]', "admin");
    await page.fill('input[placeholder*="password" i]', "admin");
    await page.click('button:has-text("Login")');
    await page.waitForURL("**/", { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(1500);
    // Navigate to editor
    await page.goto("/editor");
    await page.waitForTimeout(2000);
    await use(page);
  },
});

export { expect };

export async function createNewDocument(page: Page, _width = 1920, _height = 1080): Promise<void> {
  await page.getByText("New Document").click();
  await page.waitForTimeout(500);
  await page.locator('button:has-text("Create")').click();
  await page.waitForTimeout(2000);
}

export async function waitForCanvas(page: Page): Promise<void> {
  await page.locator("canvas").first().waitFor({ state: "visible", timeout: 10000 });
}

export async function selectTool(page: Page, toolName: string): Promise<void> {
  await page.locator(`[data-tool="${toolName}"]`).click();
  await page.waitForTimeout(300);
}

export async function drawOnCanvas(
  page: Page,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): Promise<void> {
  const canvas = page.locator("canvas").first();
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Canvas not found");
  await page.mouse.move(box.x + x1, box.y + y1);
  await page.mouse.down();
  await page.mouse.move(box.x + x2, box.y + y2, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(300);
}

export async function loadTestImage(page: Page): Promise<void> {
  await page.route("**/test-fixture.png", (route) =>
    route.fulfill({
      path: "tests/fixtures/image/valid/test-200x150.png",
      contentType: "image/png",
    }),
  );
  await page.goto(`/editor?url=${encodeURIComponent("/test-fixture.png")}`);
  await page.waitForTimeout(2000);
}
