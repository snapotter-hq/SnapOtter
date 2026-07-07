import { expect, test } from "@playwright/test";

test("demo preview uses the real app theme and reaches a tool page", async ({ page }) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];

  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });

  await page.goto("/login");
  await expect(page.getByText("This is a live demo. Processing is disabled.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Login" })).toBeVisible();

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

  await page.getByLabel("Username").fill("demo");
  await page.getByLabel("Password").fill("demo");
  await page.getByRole("button", { name: /^login$/i }).click();

  await page.waitForURL(/\/change-password$/);
  await expect(page.getByRole("heading", { name: "Change your password" })).toBeVisible();

  await page.evaluate(() => {
    localStorage.setItem("snapotter-demo-state", JSON.stringify({ passwordChanged: true }));
  });

  await page.goto("/");
  const allTab = page.getByRole("button", { name: /^All\s*\d+$/ });
  await expect(allTab).toBeVisible();
  const allCount = Number((await allTab.textContent())?.match(/\d+$/)?.[0] ?? 0);
  expect(allCount).toBeGreaterThan(100);

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

  // Seed an authenticated session (past the forced change-password) so we land
  // straight in the app, then open Settings from the avatar menu.
  await page.addInitScript(() => {
    localStorage.setItem("snapotter-token", "demo-token");
    localStorage.setItem("snapotter-demo-state", JSON.stringify({ passwordChanged: true }));
  });

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

test("serves the editor icon asset so the mobile nav icon renders", async ({ request }) => {
  // The mobile bottom-nav editor icon is a CSS mask over /edit-image.png. When
  // that asset was missing from the demo build the mask resolved to nothing and
  // the icon vanished on phones. Guard the asset so it can't regress.
  const response = await request.get("/edit-image.png");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("image");
});
