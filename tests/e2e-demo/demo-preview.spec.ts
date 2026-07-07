import { expect, test } from "@playwright/test";

test("demo boots straight into the dashboard with no login screen", async ({ page }) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];

  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });

  // Visiting the root lands directly on the dashboard, not the login page.
  await page.goto("/");
  await expect(page).toHaveURL(/\/$/);
  // The demo banner is visible and makes clear the admin data is sample data.
  await expect(page.getByText(/live demo/i).first()).toBeVisible();
  await expect(page.getByText(/sample data/i).first()).toBeVisible();

  const theme = await page.evaluate(() => {
    const bannerLink = Array.from(document.querySelectorAll("a")).find((link) =>
      link.textContent?.includes("Self-host SnapOtter"),
    );
    const banner = bannerLink?.closest("div");

    return {
      primary: getComputedStyle(document.documentElement)
        .getPropertyValue("--color-primary")
        .trim(),
      themeColor: document.querySelector('meta[name="theme-color"]')?.getAttribute("content"),
      bannerBackground: banner ? getComputedStyle(banner).backgroundColor : null,
    };
  });

  expect(theme.primary.toLowerCase()).toBe("#e07832");
  expect(theme.themeColor?.toLowerCase()).toBe("#e07832");
  expect(theme.bannerBackground).toBe("rgb(224, 120, 50)");

  // The dashboard tool grid renders without any login/change-password gate.
  const allTab = page.getByRole("button", { name: /^All\s*\d+$/ });
  await expect(allTab).toBeVisible();
  const allCount = Number((await allTab.textContent())?.match(/\d+$/)?.[0] ?? 0);
  expect(allCount).toBeGreaterThan(100);

  // Even hitting /login directly bounces to the dashboard.
  await page.goto("/login");
  await expect(page).toHaveURL(/\/$/);
  await expect(allTab).toBeVisible();

  await page.goto("/image/compress");
  await expect(page.getByRole("heading", { name: "Compress" })).toBeVisible();
  await expect(page.getByText("Drop your files here")).toBeVisible();
  await expect(page.getByRole("button", { name: "Upload from computer" })).toBeVisible();

  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test("admin settings sections render sample data without crashing", async ({ page }) => {
  const pageErrors: string[] = [];
  const crashLog: string[] = [];

  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    // The regression this guards is the "can't access property filter, X is
    // undefined" render crash caught by the error boundary. Flag that class of
    // error specifically rather than every benign console noise.
    if (/filter|is undefined|is not a function|Cannot read|Something went wrong/i.test(text)) {
      crashLog.push(text);
    }
  });

  // No login step needed: the demo is signed in on load. Open Settings from
  // the avatar menu straight away.
  await page.goto("/");
  await page.getByTestId("user-menu").click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();

  // Each section fetches from the mock API and maps arrays; a shape mismatch
  // would blank the section (sample text missing) or throw. Assert the seeded
  // content shows up so both failure modes are caught.
  const sections: Array<[string, string]> = [
    ["People", "emma.whitfield"],
    ["Teams", "Marketing"],
    ["Roles", "Auditor"],
    ["Audit Log", "LOGIN_SUCCESS"],
    ["Usage", "compress-image"],
    ["API Keys", "CI/CD Pipeline"],
  ];

  for (const [tab, sample] of sections) {
    await page.getByRole("button", { name: tab, exact: true }).click();
    await expect(page.getByText(sample).first()).toBeVisible();
  }

  expect(crashLog).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test("mobile bottom nav renders a visible image-editor icon", async ({ page }) => {
  // The editor icon used to be a CSS mask over /edit-image.png and vanished on
  // phones when that asset didn't load. It is now an inline SVG. Render the
  // mobile nav (viewport under the 768px breakpoint) and assert the editor
  // link's icon is actually drawn with a non-zero box.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const editorLink = page.getByRole("link", { name: /editor/i });
  await expect(editorLink).toBeVisible();

  const icon = editorLink.locator("svg");
  await expect(icon).toBeVisible();
  const box = await icon.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(0);
  expect(box?.height ?? 0).toBeGreaterThan(0);
});
