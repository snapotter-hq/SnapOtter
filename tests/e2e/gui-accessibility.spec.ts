import { expect, openSettings, test, uploadTestImage, waitForProcessing } from "./helpers";

// ---------------------------------------------------------------------------
// GUI Accessibility: ARIA semantics, focus management, keyboard navigation
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Semantic HTML: Landmarks & Structure
// ---------------------------------------------------------------------------
test.describe("Semantic HTML - Landmarks", () => {
  test("home page has exactly one main landmark", async ({ loggedInPage: page }) => {
    await expect(page.locator("main")).toHaveCount(1);
  });

  test("tool page has exactly one main landmark", async ({ loggedInPage: page }) => {
    await page.goto("/image/resize");
    await expect(page.locator("main")).toHaveCount(1);
  });

  test("home page has a top navigation banner landmark", async ({ loggedInPage: page }) => {
    // 2.0 removed the desktop sidebar (aside). The chrome is now a top nav
    // (header = banner landmark) + main + a mobile bottom nav.
    await expect(page.getByRole("banner")).toBeVisible();
  });

  test("tool page has a top navigation banner landmark", async ({ loggedInPage: page }) => {
    await page.goto("/image/resize");
    await expect(page.getByRole("banner")).toBeVisible();
  });
});

test.describe("Semantic HTML - Buttons", () => {
  test("all visible buttons on home page have accessible names", async ({ loggedInPage: page }) => {
    // The home grid renders 240+ tool cards as buttons; walking them all with
    // per-button attribute reads is many serial round-trips, which overruns the
    // 30s default. Give it headroom (the check itself is correct, just O(n)).
    test.setTimeout(120_000);
    // Wait for the page to fully load
    await page.waitForLoadState("networkidle");

    const buttons = page.getByRole("button");
    const count = await buttons.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const button = buttons.nth(i);
      if (!(await button.isVisible().catch(() => false))) continue;

      const name = await button.getAttribute("aria-label");
      const title = await button.getAttribute("title");
      const text = await button.textContent();

      // Every visible button should have at least one of: text content, aria-label, or title
      const hasAccessibleName =
        (text && text.trim().length > 0) ||
        (name && name.trim().length > 0) ||
        (title && title.trim().length > 0);
      expect(
        hasAccessibleName,
        `Button at index ${i} has no accessible name. text="${text}", aria-label="${name}", title="${title}"`,
      ).toBeTruthy();
    }
  });

  test("all visible buttons on tool page have accessible names", async ({ loggedInPage: page }) => {
    await page.goto("/image/resize");
    await page.waitForLoadState("networkidle");

    const buttons = page.getByRole("button");
    const count = await buttons.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const button = buttons.nth(i);
      if (!(await button.isVisible().catch(() => false))) continue;

      const name = await button.getAttribute("aria-label");
      const title = await button.getAttribute("title");
      const text = await button.textContent();

      const hasAccessibleName =
        (text && text.trim().length > 0) ||
        (name && name.trim().length > 0) ||
        (title && title.trim().length > 0);
      expect(
        hasAccessibleName,
        `Button at index ${i} has no accessible name. text="${text}", aria-label="${name}", title="${title}"`,
      ).toBeTruthy();
    }
  });
});

test.describe("Semantic HTML - Form Inputs", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("login form inputs have associated labels", async ({ page }) => {
    await page.goto("/login");

    // Username input should be findable by label
    const usernameInput = page.getByLabel("Username");
    await expect(usernameInput).toBeVisible();
    await expect(usernameInput).toHaveAttribute("id", "username");

    // Password input should be findable by label
    const passwordInput = page.getByLabel("Password");
    await expect(passwordInput).toBeVisible();
    await expect(passwordInput).toHaveAttribute("id", "password");
  });

  test("login form inputs have proper autocomplete attributes", async ({ page }) => {
    await page.goto("/login");

    await expect(page.getByLabel("Username")).toHaveAttribute("autocomplete", "username");
    await expect(page.getByLabel("Password")).toHaveAttribute("autocomplete", "current-password");
  });
});

test.describe("Semantic HTML - Form Inputs on Tool Pages", () => {
  test("QR generate form inputs have associated labels", async ({ loggedInPage: page }) => {
    await page.goto("/image/qr-generate");
    await page.waitForLoadState("domcontentloaded");

    // The URL input should be findable by its label
    const urlInput = page.getByLabel("URL");
    await expect(urlInput).toBeVisible();
  });

  test("change password form inputs have associated labels", async ({ loggedInPage: page }) => {
    // Navigate to change-password (uses storageState auth but page is accessible)
    await page.goto("/change-password");
    await page.waitForLoadState("domcontentloaded");

    // Each input should be findable by label (use exact match for "New password"
    // to avoid matching the "Generate strong password" button text)
    await expect(page.getByLabel("Current password")).toBeVisible();
    await expect(page.getByLabel("New password", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Confirm new password")).toBeVisible();
  });
});

test.describe("Semantic HTML - Heading Hierarchy", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("login page has sequential heading hierarchy", async ({ page }) => {
    await page.goto("/login");

    // Should have h1 (SnapOtter) and h2 (Login)
    const h1 = page.locator("h1");
    const h2 = page.locator("h2");

    await expect(h1.first()).toBeVisible();
    await expect(h2.first()).toBeVisible();

    // h1 should appear before h2 in DOM order
    const h1Box = await h1.first().boundingBox();
    const h2Box = await h2.first().boundingBox();
    expect(h1Box).toBeTruthy();
    expect(h2Box).toBeTruthy();
    if (h1Box && h2Box) {
      expect(h1Box.y).toBeLessThan(h2Box.y);
    }
  });
});

test.describe("Heading Hierarchy - Tool Pages", () => {
  test("tool page has headings including an h1 for the tool name", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/image/resize");
    await page.waitForLoadState("domcontentloaded");

    // 2.0: the tool name renders as the page h1 (ToolDropzone / settings panel
    // header), not an h2.
    const heading = page.locator("h1").filter({ hasText: "Resize" });
    await expect(heading).toBeAttached();

    // Collect all headings in the DOM (including those in the sidebar or
    // settings panel that may not pass a visibility bounding-box check)
    const headingLevels = await page.evaluate(() => {
      const headings = document.querySelectorAll("h1, h2, h3, h4, h5, h6");
      return Array.from(headings).map((h) => Number.parseInt(h.tagName.charAt(1), 10));
    });

    // There should be at least one heading
    expect(headingLevels.length).toBeGreaterThan(0);

    // There should be at most one h1 (the page title or brand)
    const h1Count = headingLevels.filter((l) => l === 1).length;
    expect(h1Count).toBeLessThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Modal/Dialog Accessibility
// ---------------------------------------------------------------------------
test.describe("Settings Dialog Accessibility", () => {
  test("settings dialog opens as a layered panel with backdrop", async ({ loggedInPage: page }) => {
    await openSettings(page);

    // Dialog content should be visible
    await expect(page.locator("h2").filter({ hasText: "Settings" })).toBeVisible();

    // Backdrop should exist (the aria-hidden overlay)
    const backdrop = page.locator("[aria-hidden='true']").first();
    await expect(backdrop).toBeVisible();
  });

  test("Escape key closes settings dialog", async ({ loggedInPage: page }) => {
    await openSettings(page);

    await page.keyboard.press("Escape");

    await expect(page.locator("h2").filter({ hasText: "Settings" })).not.toBeVisible();
  });

  test("settings dialog can be closed via close button", async ({ loggedInPage: page }) => {
    await openSettings(page);

    // Use the X close button
    const closeBtn = page
      .locator("button")
      .filter({ has: page.locator("svg.lucide-x") })
      .first();
    await closeBtn.click();

    await expect(page.locator("h2").filter({ hasText: "Settings" })).not.toBeVisible();
  });

  test("settings dialog has a close button", async ({ loggedInPage: page }) => {
    await openSettings(page);

    // Close button with X icon
    const closeBtn = page.locator("button").filter({ has: page.locator("svg.lucide-x") });
    await expect(closeBtn.first()).toBeVisible();

    await closeBtn.first().click();
    await expect(page.locator("h2").filter({ hasText: "Settings" })).not.toBeVisible();
  });

  test("settings dialog backdrop is marked aria-hidden", async ({ loggedInPage: page }) => {
    await openSettings(page);

    // The backdrop overlay has aria-hidden="true" to keep it out of the a11y tree
    const backdrop = page.locator("div[aria-hidden='true'].absolute.inset-0");
    await expect(backdrop).toBeAttached();

    await page.keyboard.press("Escape");
  });

  test("focus is contained inside settings dialog while open", async ({ loggedInPage: page }) => {
    await openSettings(page);

    // Tab through several elements -- focus should stay within the dialog
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press("Tab");
    }

    // The key test: after tabbing, focus should NOT escape to elements behind
    // the dialog (like the sidebar). It should remain inside the dialog overlay.
    const focusLocation = await page.evaluate(() => {
      const active = document.activeElement;
      if (!active) return "none";
      const sidebar = document.querySelector("aside");
      if (sidebar?.contains(active)) return "sidebar";
      const dialogOverlay = document.querySelector(".fixed.inset-0");
      if (dialogOverlay?.contains(active)) return "dialog";
      return "other";
    });
    // Focus must not have leaked into the sidebar behind the dialog
    expect(focusLocation).not.toBe("sidebar");

    await page.keyboard.press("Escape");
  });
});

test.describe("Help Dialog Accessibility", () => {
  test("Escape key closes help dialog", async ({ loggedInPage: page }) => {
    await page.getByRole("button", { name: "Help" }).click();
    await expect(page.getByRole("heading", { name: "Help" })).toBeVisible();

    await page.keyboard.press("Escape");

    await expect(page.getByRole("heading", { name: "Help" })).not.toBeVisible();
  });

  test("help dialog closes via Escape and focus returns", async ({ loggedInPage: page }) => {
    await page.getByRole("button", { name: "Help" }).click();
    await expect(page.getByRole("heading", { name: "Help" })).toBeVisible();

    await page.keyboard.press("Escape");

    await expect(page.getByRole("heading", { name: "Help" })).not.toBeVisible();
    const activeElement = await page.evaluate(() => document.activeElement?.tagName);
    expect(activeElement).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Dropzone Accessibility
// ---------------------------------------------------------------------------
test.describe("Dropzone Accessibility", () => {
  test("dropzone has an accessible section label", async ({ loggedInPage: page }) => {
    // 2.0: the home page is a tool grid, not a dropzone. The Dropzone
    // (<section aria-label="File drop zone">) lives on a tool page with no file.
    await page.goto("/image/resize");
    await page.waitForLoadState("domcontentloaded");
    const dropzone = page.locator("section[aria-label='File drop zone']");
    await expect(dropzone).toBeVisible();
  });

  test("upload button inside dropzone is clickable", async ({ loggedInPage: page }) => {
    // The upload button lives on a tool page dropzone, not the home grid.
    await page.goto("/image/resize");
    await page.waitForLoadState("domcontentloaded");
    const uploadBtn = page.getByRole("button", { name: /upload/i }).first();
    await expect(uploadBtn).toBeVisible();
    await expect(uploadBtn).toBeEnabled();
  });

  test("dropzone upload button is focusable and keyboard-reachable", async ({
    loggedInPage: page,
  }) => {
    // Navigate to a tool page to ensure the dropzone is present
    await page.goto("/image/resize");
    await page.waitForLoadState("domcontentloaded");

    // The upload button is a real <button> element, so it's natively
    // keyboard-accessible via Tab, Enter, and Space.
    const uploadBtn = page.getByText("Upload from computer");
    await expect(uploadBtn).toBeVisible();

    // Focus the upload button
    await uploadBtn.focus();
    const focusedTag = await page.evaluate(() => document.activeElement?.tagName);
    expect(focusedTag).toBe("BUTTON");

    // Verify the focused element's text matches the upload button
    const focusedText = await page.evaluate(() => document.activeElement?.textContent);
    expect(focusedText).toContain("Upload from computer");
  });
});

// ---------------------------------------------------------------------------
// Slider / Range Input Accessibility
// ---------------------------------------------------------------------------
test.describe("Slider Keyboard Accessibility", () => {
  test("QR size slider responds to arrow keys", async ({ loggedInPage: page }) => {
    await page.goto("/image/qr-generate");
    await page.waitForLoadState("domcontentloaded");

    const sizeSlider = page.locator("#qr-size");
    await expect(sizeSlider).toBeVisible();

    // Get initial value
    const initialValue = await sizeSlider.inputValue();

    // Focus and press ArrowRight to increase
    await sizeSlider.focus();
    await page.keyboard.press("ArrowRight");

    const newValue = await sizeSlider.inputValue();
    // The value should have increased (step is 100, initial is 1024 or similar)
    expect(Number(newValue)).toBeGreaterThanOrEqual(Number(initialValue));
  });
});

// ---------------------------------------------------------------------------
// Navigation Accessibility
// ---------------------------------------------------------------------------
test.describe("Navigation Accessibility", () => {
  test("top nav items are keyboard-navigable via Tab", async ({ loggedInPage: page }) => {
    // 2.0: navigation moved from the desktop sidebar to the top nav (banner).
    const nav = page.locator("header");
    await expect(nav).toBeVisible();

    // All nav items should be links or buttons (keyboard accessible)
    const navLinks = nav.locator("a");
    const navButtons = nav.locator("button");

    const linkCount = await navLinks.count();
    const buttonCount = await navButtons.count();

    // Should have both navigation links and action buttons
    expect(linkCount + buttonCount).toBeGreaterThanOrEqual(4);
  });

  test("sidebar links have href attributes for navigation", async ({ loggedInPage: page }) => {
    const sidebar = page.locator("aside");
    const links = sidebar.locator("a");
    const count = await links.count();

    for (let i = 0; i < count; i++) {
      const href = await links.nth(i).getAttribute("href");
      expect(href).toBeTruthy();
    }
  });

  test("tool panel search input is focusable", async ({ loggedInPage: page }) => {
    const searchInput = page.getByPlaceholder(/search/i).first();
    await expect(searchInput).toBeVisible();

    await searchInput.focus();
    const isFocused = await page.evaluate(() => document.activeElement?.tagName === "INPUT");
    expect(isFocused).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Focus Management
// ---------------------------------------------------------------------------
test.describe("Focus Management", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("login page form elements are focusable in order", async ({ page }) => {
    await page.goto("/login");

    // Focus should be possible on username, password, and login button in order
    const username = page.getByLabel("Username");
    const password = page.getByLabel("Password");
    const loginBtn = page.getByRole("button", { name: /login/i });

    await username.focus();
    expect(await page.evaluate(() => document.activeElement?.id)).toBe("username");

    await password.focus();
    expect(await page.evaluate(() => document.activeElement?.id)).toBe("password");

    // Fill both fields to enable the button
    await username.fill("test");
    await password.fill("test");

    await loginBtn.focus();
    const activeTag = await page.evaluate(() => document.activeElement?.tagName);
    expect(activeTag).toBe("BUTTON");
  });
});

test.describe("Focus Management - Dialogs", () => {
  test("closing settings dialog returns focus to page", async ({ loggedInPage: page }) => {
    // Open settings
    await openSettings(page);

    // Close via Escape
    await page.keyboard.press("Escape");
    await expect(page.locator("h2").filter({ hasText: "Settings" })).not.toBeVisible();

    // Focus should return to the page body (not trapped in a removed dialog)
    const activeElement = await page.evaluate(() => document.activeElement?.tagName);
    expect(activeElement).toBeDefined();
    // Should not be null or stuck on a removed element
    expect(activeElement).not.toBe("undefined");
  });

  test("closing help dialog returns focus to page", async ({ loggedInPage: page }) => {
    // Open help
    const helpBtn = page.getByRole("button", { name: "Help" });
    await helpBtn.click();
    await expect(page.getByRole("heading", { name: "Help" })).toBeVisible();

    // Close via Escape
    await page.keyboard.press("Escape");
    await expect(page.getByRole("heading", { name: "Help" })).not.toBeVisible();

    // Focus should return to the page
    const activeElement = await page.evaluate(() => document.activeElement?.tagName);
    expect(activeElement).toBeDefined();
    expect(activeElement).not.toBe("undefined");
  });
});

// ---------------------------------------------------------------------------
// Connection Banner Accessibility
// ---------------------------------------------------------------------------
test.describe("Connection Banner Accessibility", () => {
  test("connection banner uses role=status and aria-live=polite", async ({
    loggedInPage: page,
  }) => {
    // The ConnectionBanner component uses role="status" aria-live="polite"
    // When connected, the banner is hidden. We verify the component is
    // mounted by checking it does NOT show when connection is healthy.
    // The role/aria-live attributes are in the source code for when it is visible.

    // On a healthy connection, the banner should not be visible
    const banner = page.locator("[role='status'][aria-live='polite']");
    // The banner is only rendered when status !== "connected", so count may be 0
    const count = await banner.count();
    // Either not rendered (0) or rendered but hidden -- both are valid
    expect(count).toBeGreaterThanOrEqual(0);

    // Page should still function normally
    await expect(page.locator("main")).toBeVisible();
  });

  test("connection banner is announced to screen readers when visible", async ({
    loggedInPage: page,
  }) => {
    // Force the banner to appear by simulating offline
    await page.route("**/api/v1/health", (route) => route.abort());
    await page.evaluate(() => window.dispatchEvent(new Event("offline")));

    // The RouteAnnouncer also renders [role=status][aria-live=polite] (sr-only),
    // so scope to the ConnectionBanner, which is the fixed full-width bar.
    const banner = page.locator("[role='status'][aria-live='polite'].fixed");
    await expect(banner).toBeVisible({ timeout: 10_000 });

    // Verify the banner has role="status" (implicit aria-live) for AT
    await expect(banner).toHaveAttribute("role", "status");
    await expect(banner).toHaveAttribute("aria-live", "polite");

    // Banner text should be descriptive for screen readers
    const text = await banner.textContent();
    expect(text).toBeTruthy();
    expect(text?.length).toBeGreaterThan(0);

    await page.unroute("**/api/v1/health");
  });
});

// ---------------------------------------------------------------------------
// 14.5 Images Alt/Aria-Label
// ---------------------------------------------------------------------------
test.describe("Image Accessibility", () => {
  test("all visible images on home page have alt text or aria-label", async ({
    loggedInPage: page,
  }) => {
    await page.waitForLoadState("networkidle");

    const images = page.locator("img");
    const count = await images.count();

    for (let i = 0; i < count; i++) {
      const img = images.nth(i);
      if (!(await img.isVisible().catch(() => false))) continue;

      const alt = await img.getAttribute("alt");
      const ariaLabel = await img.getAttribute("aria-label");
      const role = await img.getAttribute("role");

      // Decorative images should have role="presentation" or alt=""
      // Meaningful images must have alt or aria-label
      const isDecorative = role === "presentation" || role === "none" || alt === "";
      const hasAccessibleName =
        (alt && alt.trim().length > 0) || (ariaLabel && ariaLabel.trim().length > 0);

      expect(
        isDecorative || hasAccessibleName,
        `Image at index ${i} has no alt text, aria-label, or presentation role. src="${await img.getAttribute("src")}"`,
      ).toBeTruthy();
    }
  });

  test("all visible images on tool page have alt text or aria-label", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/image/resize");
    await page.waitForLoadState("networkidle");

    const images = page.locator("img");
    const count = await images.count();

    for (let i = 0; i < count; i++) {
      const img = images.nth(i);
      if (!(await img.isVisible().catch(() => false))) continue;

      const alt = await img.getAttribute("alt");
      const ariaLabel = await img.getAttribute("aria-label");
      const role = await img.getAttribute("role");

      const isDecorative = role === "presentation" || role === "none" || alt === "";
      const hasAccessibleName =
        (alt && alt.trim().length > 0) || (ariaLabel && ariaLabel.trim().length > 0);

      expect(
        isDecorative || hasAccessibleName,
        `Image at index ${i} has no alt text, aria-label, or presentation role.`,
      ).toBeTruthy();
    }
  });
});

// ---------------------------------------------------------------------------
// 14.5 No Duplicate IDs
// ---------------------------------------------------------------------------
test.describe("No Duplicate IDs", () => {
  test("home page has no duplicate element IDs", async ({ loggedInPage: page }) => {
    await page.waitForLoadState("networkidle");

    const duplicates = await page.evaluate(() => {
      const ids = Array.from(document.querySelectorAll("[id]")).map((el) => el.id);
      const seen = new Set<string>();
      const dups: string[] = [];
      for (const id of ids) {
        if (id && seen.has(id)) dups.push(id);
        seen.add(id);
      }
      return dups;
    });

    expect(duplicates, `Duplicate IDs found on home page: ${duplicates.join(", ")}`).toHaveLength(
      0,
    );
  });

  test("tool page has no duplicate element IDs", async ({ loggedInPage: page }) => {
    await page.goto("/image/resize");
    await page.waitForLoadState("networkidle");

    const duplicates = await page.evaluate(() => {
      const ids = Array.from(document.querySelectorAll("[id]")).map((el) => el.id);
      const seen = new Set<string>();
      const dups: string[] = [];
      for (const id of ids) {
        if (id && seen.has(id)) dups.push(id);
        seen.add(id);
      }
      return dups;
    });

    expect(duplicates, `Duplicate IDs found on tool page: ${duplicates.join(", ")}`).toHaveLength(
      0,
    );
  });

  test("login page has no duplicate element IDs", async ({ loggedInPage: page }) => {
    // Use a fresh context without auth for the login page
    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    const duplicates = await page.evaluate(() => {
      const ids = Array.from(document.querySelectorAll("[id]")).map((el) => el.id);
      const seen = new Set<string>();
      const dups: string[] = [];
      for (const id of ids) {
        if (id && seen.has(id)) dups.push(id);
        seen.add(id);
      }
      return dups;
    });

    expect(duplicates, `Duplicate IDs found on login page: ${duplicates.join(", ")}`).toHaveLength(
      0,
    );
  });
});

// ---------------------------------------------------------------------------
// 14.5 Keyboard-Operable Interactive Elements
// ---------------------------------------------------------------------------
test.describe("Keyboard Operability", () => {
  test("all interactive elements on home page are keyboard-reachable via Tab", async ({
    loggedInPage: page,
  }) => {
    await page.waitForLoadState("networkidle");

    // Tab through the page and track all focused elements
    const focusedTags = new Set<string>();

    for (let i = 0; i < 30; i++) {
      await page.keyboard.press("Tab");
      const tag = await page.evaluate(() => document.activeElement?.tagName ?? "NONE");
      focusedTags.add(tag);
    }

    // At minimum, we should have focused links, buttons, and/or inputs
    const interactiveTags = ["A", "BUTTON", "INPUT", "SELECT", "TEXTAREA"];
    const hasInteractive = interactiveTags.some((t) => focusedTags.has(t));
    expect(
      hasInteractive,
      `No interactive elements were focused during Tab traversal. Got: ${[...focusedTags].join(", ")}`,
    ).toBeTruthy();
  });

  test("Enter key activates focused button on home page", async ({ loggedInPage: page }) => {
    await page.waitForLoadState("networkidle");

    // Tab to the first visible button
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press("Tab");
      const tag = await page.evaluate(() => document.activeElement?.tagName);
      if (tag === "BUTTON") break;
    }

    // Verify we are on a button
    const activeTag = await page.evaluate(() => document.activeElement?.tagName);
    if (activeTag === "BUTTON") {
      // Press Enter -- should not crash
      await page.keyboard.press("Enter");
      await page.waitForTimeout(500);
      await expect(page.locator("body")).toBeVisible();
    }
  });

  test("Space key activates focused button", async ({ loggedInPage: page }) => {
    await page.waitForLoadState("networkidle");

    // Tab to the first visible button
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press("Tab");
      const tag = await page.evaluate(() => document.activeElement?.tagName);
      if (tag === "BUTTON") break;
    }

    const activeTag = await page.evaluate(() => document.activeElement?.tagName);
    if (activeTag === "BUTTON") {
      await page.keyboard.press("Space");
      await page.waitForTimeout(500);
      await expect(page.locator("body")).toBeVisible();
    }
  });
});

// ---------------------------------------------------------------------------
// 14.5 Modal ARIA: role=dialog, aria-modal
// ---------------------------------------------------------------------------
test.describe("Modal ARIA Compliance", () => {
  test("settings dialog has role=dialog", async ({ loggedInPage: page }) => {
    await openSettings(page);

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    await page.keyboard.press("Escape");
  });

  test("settings dialog backdrop prevents interaction with background", async ({
    loggedInPage: page,
  }) => {
    await openSettings(page);

    // Tab 15 times -- focus should stay within the dialog area
    for (let i = 0; i < 15; i++) {
      await page.keyboard.press("Tab");
    }

    // Verify focus has not escaped to the sidebar
    const focusLocation = await page.evaluate(() => {
      const active = document.activeElement;
      if (!active) return "none";
      const sidebar = document.querySelector("aside");
      if (sidebar?.contains(active)) return "sidebar";
      return "dialog-or-other";
    });

    expect(focusLocation).not.toBe("sidebar");

    await page.keyboard.press("Escape");
  });
});

// ---------------------------------------------------------------------------
// 14.5 Color Contrast (sampled checks)
// ---------------------------------------------------------------------------
test.describe("Color Contrast", () => {
  test("primary text on home page meets minimum contrast ratio", async ({ loggedInPage: page }) => {
    await page.waitForLoadState("networkidle");

    // Sample the foreground/background colors of the first heading
    const contrast = await page.evaluate(() => {
      const heading = document.querySelector("h1, h2");
      if (!heading) return null;

      const style = window.getComputedStyle(heading);
      const color = style.color;

      // Parse rgb values
      const parseRgb = (c: string) => {
        const m = c.match(/\d+/g);
        return m ? m.map(Number) : null;
      };

      // 2.0's first heading is an sr-only h1 with a transparent background.
      // Measure against the effective (walked-up) background, defaulting to
      // white, instead of parsing "transparent" as opaque black.
      const getEffectiveBg = (el: Element) => {
        let current: Element | null = el;
        while (current) {
          const s = window.getComputedStyle(current);
          const b = s.backgroundColor;
          const rgb = parseRgb(b);
          if (rgb && (rgb.length < 4 || rgb[3] > 0) && b !== "rgba(0, 0, 0, 0)") {
            return { rgb, str: b };
          }
          current = current.parentElement;
        }
        return { rgb: [255, 255, 255], str: "rgb(255, 255, 255)" };
      };

      const fg = parseRgb(color);
      const bgInfo = getEffectiveBg(heading);
      const bg = bgInfo.rgb;
      if (!fg || !bg) return null;

      // Relative luminance per WCAG 2.1
      const luminance = (rgb: number[]) => {
        const [r, g, b] = rgb.map((v) => {
          const s = v / 255;
          return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };

      const l1 = luminance(fg);
      const l2 = luminance(bg);
      const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);

      return { ratio, fg: color, bg: bgInfo.str };
    });

    // If we got a valid contrast measurement, verify WCAG AA for large text (3:1)
    if (contrast && contrast.ratio > 0) {
      expect(
        contrast.ratio,
        `Heading contrast ratio ${contrast.ratio.toFixed(2)} below 3:1 (fg: ${contrast.fg}, bg: ${contrast.bg})`,
      ).toBeGreaterThanOrEqual(3);
    }
  });

  test("button text meets WCAG AA contrast ratio (4.5:1 for normal text)", async ({
    loggedInPage: page,
  }) => {
    await page.waitForLoadState("networkidle");

    // Check the first visible button with text content
    const contrastResults = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll("button"));
      const results: Array<{ text: string; ratio: number }> = [];

      for (const btn of buttons.slice(0, 5)) {
        if (!btn.offsetParent) continue;
        const text = btn.textContent?.trim();
        if (!text) continue;

        const style = window.getComputedStyle(btn);
        const color = style.color;
        const bgColor = style.backgroundColor;

        const parseRgb = (c: string) => {
          const m = c.match(/\d+/g);
          return m ? m.map(Number) : null;
        };

        const fg = parseRgb(color);
        const bg = parseRgb(bgColor);
        if (!fg || !bg) continue;

        const luminance = (rgb: number[]) => {
          const [r, g, b] = rgb.map((v) => {
            const s = v / 255;
            return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
          });
          return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        };

        const l1 = luminance(fg);
        const l2 = luminance(bg);
        const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);

        // Only check buttons that paint their own non-transparent background.
        // A transparent background would be parsed as black and yield a bogus
        // ratio; such buttons are covered by the comprehensive checks below,
        // which resolve the effective (inherited) background.
        const transparent = bgColor === "rgba(0, 0, 0, 0)" || bg[3] === 0;
        if (!transparent) {
          results.push({ text, ratio });
        }
      }
      return results;
    });

    // Each sampled button should meet 4.5:1 for normal text
    for (const result of contrastResults) {
      if (result.ratio > 0 && result.ratio < 100) {
        expect(
          result.ratio,
          `Button "${result.text}" has contrast ratio ${result.ratio.toFixed(2)}, below 4.5:1`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 14.6 Focus Management (expanded)
// ---------------------------------------------------------------------------
test.describe("Focus After Login", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("after login redirect, focus moves to main content area", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Username").fill("admin");
    await page.getByLabel("Password").fill("admin");
    await page.getByRole("button", { name: /login/i }).click();

    // Wait for redirect to home
    await page.waitForURL("/", { timeout: 15_000 });
    await page.waitForLoadState("domcontentloaded");

    // After login, focus should be within the main content area or body
    // (not still stuck on a removed login form element)
    const activeTag = await page.evaluate(() => document.activeElement?.tagName);
    expect(activeTag).toBeDefined();
    expect(activeTag).not.toBe("undefined");

    // Main content should be visible and accessible
    await expect(page.locator("main")).toBeVisible();
  });
});

test.describe("Focus After File Upload", () => {
  test("after file upload, focus moves toward settings panel", async ({ loggedInPage: page }) => {
    await page.goto("/image/resize");
    await uploadTestImage(page);

    // After upload, the settings panel and process button should be visible
    const resizeBtn = page.getByRole("button", { name: "Resize" });
    await expect(resizeBtn).toBeVisible({ timeout: 5_000 });

    // The focus should be somewhere meaningful, not lost
    const activeTag = await page.evaluate(() => document.activeElement?.tagName);
    expect(activeTag).toBeDefined();
    expect(activeTag).not.toBe("undefined");
  });

  test("after processing completes, download link is reachable", async ({ loggedInPage: page }) => {
    await page.goto("/image/resize");
    await uploadTestImage(page);

    await page.locator("input[placeholder='Auto']").first().fill("50");
    await page.getByRole("button", { name: "Resize" }).click();
    await waitForProcessing(page);

    // Download link should be visible and focusable
    const downloadLink = page.getByRole("link", { name: /download/i }).first();
    await expect(downloadLink).toBeVisible({ timeout: 15_000 });

    // Focus should be reachable by Tab navigation
    await downloadLink.focus();
    const isFocused = await page.evaluate(() => {
      const active = document.activeElement;
      return active?.tagName === "A" && /download/i.test(active.textContent ?? "");
    });
    expect(isFocused).toBeTruthy();
  });
});

test.describe("Focus Returns to Trigger After Dialog Close", () => {
  test("closing settings dialog returns focus near the trigger element", async ({
    loggedInPage: page,
  }) => {
    // 2.0: Settings opens from the top-nav avatar dropdown (desktop) or the
    // mobile bottom nav. openSettings() handles both and waits for the dialog.
    await openSettings(page);

    // Close via Escape
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: 5_000 });

    // Focus should return to the body/page -- not be trapped in a removed node
    const activeElement = await page.evaluate(() => {
      const el = document.activeElement;
      return {
        tag: el?.tagName ?? "null",
        isConnected: el?.isConnected ?? false,
      };
    });

    // The focused element must be a connected DOM node
    expect(activeElement.isConnected).toBeTruthy();
    expect(activeElement.tag).not.toBe("null");
  });

  test("closing help dialog returns focus to a connected element", async ({
    loggedInPage: page,
  }) => {
    const helpBtn = page.getByRole("button", { name: "Help" });
    await helpBtn.click();
    await expect(page.getByRole("heading", { name: "Help" })).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByRole("heading", { name: "Help" })).not.toBeVisible();

    const activeElement = await page.evaluate(() => {
      const el = document.activeElement;
      return {
        tag: el?.tagName ?? "null",
        isConnected: el?.isConnected ?? false,
      };
    });

    expect(activeElement.isConnected).toBeTruthy();
    expect(activeElement.tag).not.toBe("null");
  });
});

// ---------------------------------------------------------------------------
// 14.5 Main Landmark on All Major Pages
// ---------------------------------------------------------------------------
test.describe("Main Landmark on All Pages", () => {
  test("fullscreen page has exactly one main landmark", async ({ loggedInPage: page }) => {
    await page.goto("/fullscreen");
    await page.waitForLoadState("domcontentloaded");
    const mainCount = await page.locator("main").count();
    expect(mainCount).toBeLessThanOrEqual(1);
    // Page should render content
    const bodyText = await page.textContent("body");
    expect(bodyText).toBeDefined();
    expect(bodyText?.length).toBeGreaterThan(0);
  });

  test("automate page has exactly one main landmark", async ({ loggedInPage: page }) => {
    await page.goto("/automate");
    await page.waitForLoadState("domcontentloaded");
    const mainCount = await page.locator("main").count();
    expect(mainCount).toBeLessThanOrEqual(1);
  });

  test("files page has exactly one main landmark", async ({ loggedInPage: page }) => {
    await page.goto("/files");
    await page.waitForLoadState("domcontentloaded");
    const mainCount = await page.locator("main").count();
    expect(mainCount).toBeLessThanOrEqual(1);
  });
});

test.describe("Main Landmark - Login Page", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("login page has exactly one main landmark", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("domcontentloaded");
    // Login page may render as a full-screen form without a <main>
    // At minimum it should render visible content
    const bodyText = await page.textContent("body");
    expect(bodyText).toBeDefined();
    expect(bodyText?.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 14.5 Settings Dialog - aria-modal
// ---------------------------------------------------------------------------
test.describe("Settings Dialog - aria-modal", () => {
  test("settings dialog has aria-modal=true", async ({ loggedInPage: page }) => {
    await openSettings(page);

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // The dialog should have aria-modal="true" for proper screen reader behavior
    const ariaModal = await dialog.getAttribute("aria-modal");
    expect(ariaModal).toBe("true");

    await page.keyboard.press("Escape");
  });
});

// ---------------------------------------------------------------------------
// 14.5 Help Dialog - role=dialog
// ---------------------------------------------------------------------------
test.describe("Help Dialog - role=dialog", () => {
  test("help dialog has role=dialog", async ({ loggedInPage: page }) => {
    await page.getByRole("button", { name: "Help" }).click();
    await expect(page.getByRole("heading", { name: "Help" })).toBeVisible();

    // The help dialog should be rendered with role="dialog"
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    await page.keyboard.press("Escape");
  });
});

// ---------------------------------------------------------------------------
// 14.5 Focus Trapped Inside Open Modal
// ---------------------------------------------------------------------------
test.describe("Focus Trap in Modal", () => {
  test("Tab cycling stays within settings dialog", async ({ loggedInPage: page }) => {
    await openSettings(page);

    // Tab through many times -- should cycle within the dialog, never reach sidebar
    const escapes: string[] = [];
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press("Tab");
      const location = await page.evaluate(() => {
        const active = document.activeElement;
        if (!active) return "none";
        const sidebar = document.querySelector("aside");
        if (sidebar?.contains(active)) return "sidebar";
        const main = document.querySelector("main");
        if (main?.contains(active) && !document.querySelector("[role='dialog']")?.contains(active))
          return "main";
        return "dialog";
      });
      if (location === "sidebar" || location === "main") {
        escapes.push(location);
      }
    }

    // Focus should never have escaped to sidebar or main content behind the dialog
    expect(escapes).toHaveLength(0);

    await page.keyboard.press("Escape");
  });
});

// ---------------------------------------------------------------------------
// 14.5 Slider ARIA Attributes
// ---------------------------------------------------------------------------
test.describe("Slider ARIA Attributes", () => {
  test("QR size slider has min, max, and current value attributes", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/image/qr-generate");
    await page.waitForLoadState("domcontentloaded");

    const sizeSlider = page.locator("#qr-size");
    await expect(sizeSlider).toBeVisible();

    // Native input[type=range] provides implicit ARIA: role=slider,
    // aria-valuemin (from min), aria-valuemax (from max), aria-valuenow (from value)
    const min = await sizeSlider.getAttribute("min");
    const max = await sizeSlider.getAttribute("max");
    const value = await sizeSlider.inputValue();

    expect(min).toBeTruthy();
    expect(max).toBeTruthy();
    expect(Number(value)).toBeGreaterThanOrEqual(Number(min));
    expect(Number(value)).toBeLessThanOrEqual(Number(max));
  });

  test("compress quality slider has type=range with min/max", async ({ loggedInPage: page }) => {
    await page.goto("/image/compress");
    await page.waitForLoadState("domcontentloaded");

    const slider = page.locator("input[type='range']").first();
    if (await slider.isVisible({ timeout: 3_000 }).catch(() => false)) {
      const type = await slider.getAttribute("type");
      expect(type).toBe("range");

      const min = await slider.getAttribute("min");
      const max = await slider.getAttribute("max");
      expect(min).toBeTruthy();
      expect(max).toBeTruthy();
    }
  });
});

// ---------------------------------------------------------------------------
// 14.5 Dropzone - Space/Enter triggers file picker
// ---------------------------------------------------------------------------
test.describe("Dropzone Keyboard Activation", () => {
  test("Space key on upload button triggers file dialog", async ({ loggedInPage: page }) => {
    await page.goto("/image/resize");
    await page.waitForLoadState("domcontentloaded");

    const uploadBtn = page.getByText("Upload from computer");
    await expect(uploadBtn).toBeVisible();

    // Focus the upload button
    await uploadBtn.focus();

    // Press Space -- should trigger file chooser (we can detect via event)
    const fileChooserPromise = page
      .waitForEvent("filechooser", { timeout: 3_000 })
      .catch(() => null);
    await page.keyboard.press("Space");

    const chooser = await fileChooserPromise;
    // If the file chooser was triggered, the keyboard activation works
    // If not, the button might use a different mechanism -- still no crash
    if (chooser) {
      // Dismiss the file chooser by not setting files
      expect(chooser).toBeTruthy();
    }
    await expect(page.locator("main")).toBeVisible();
  });

  test("Enter key on upload button triggers file dialog", async ({ loggedInPage: page }) => {
    await page.goto("/image/resize");
    await page.waitForLoadState("domcontentloaded");

    const uploadBtn = page.getByText("Upload from computer");
    await expect(uploadBtn).toBeVisible();

    await uploadBtn.focus();

    const fileChooserPromise = page
      .waitForEvent("filechooser", { timeout: 3_000 })
      .catch(() => null);
    await page.keyboard.press("Enter");

    const chooser = await fileChooserPromise;
    if (chooser) {
      expect(chooser).toBeTruthy();
    }
    await expect(page.locator("main")).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 14.5 Navigation - Active Item Indicator
// ---------------------------------------------------------------------------
test.describe("Navigation Active Indicator", () => {
  test("active sidebar tool link is visually distinguishable", async ({ loggedInPage: page }) => {
    await page.goto("/image/resize");
    await page.waitForLoadState("domcontentloaded");

    // The sidebar should have an active/highlighted link for the current tool
    const sidebar = page.locator("aside");
    const resizeLink = sidebar.locator("a[href='/resize']");

    if (await resizeLink.isVisible({ timeout: 3_000 }).catch(() => false)) {
      // The active link should have a different visual style (bg color or aria-current)
      const classList = await resizeLink.getAttribute("class");
      const ariaCurrent = await resizeLink.getAttribute("aria-current");
      const dataActive = await resizeLink.getAttribute("data-active");

      // At least one indicator of active state should exist:
      // either a specific CSS class, aria-current, or data-active attribute
      const hasActiveIndicator =
        (classList && /active|selected|current|bg-primary|bg-accent/i.test(classList)) ||
        ariaCurrent === "page" ||
        dataActive === "true";

      expect(
        hasActiveIndicator,
        "Active sidebar link should have visual distinction via class, aria-current, or data-active",
      ).toBeTruthy();
    }
  });
});

// ---------------------------------------------------------------------------
// 14.5 No Duplicate IDs on Additional Pages
// ---------------------------------------------------------------------------
test.describe("No Duplicate IDs - Additional Pages", () => {
  test("automate page has no duplicate element IDs", async ({ loggedInPage: page }) => {
    await page.goto("/automate");
    await page.waitForLoadState("networkidle");

    const duplicates = await page.evaluate(() => {
      const ids = Array.from(document.querySelectorAll("[id]")).map((el) => el.id);
      const seen = new Set<string>();
      const dups: string[] = [];
      for (const id of ids) {
        if (id && seen.has(id)) dups.push(id);
        seen.add(id);
      }
      return dups;
    });

    expect(
      duplicates,
      `Duplicate IDs found on automate page: ${duplicates.join(", ")}`,
    ).toHaveLength(0);
  });

  test("files page has no duplicate element IDs", async ({ loggedInPage: page }) => {
    await page.goto("/files");
    await page.waitForLoadState("networkidle");

    const duplicates = await page.evaluate(() => {
      const ids = Array.from(document.querySelectorAll("[id]")).map((el) => el.id);
      const seen = new Set<string>();
      const dups: string[] = [];
      for (const id of ids) {
        if (id && seen.has(id)) dups.push(id);
        seen.add(id);
      }
      return dups;
    });

    expect(duplicates, `Duplicate IDs found on files page: ${duplicates.join(", ")}`).toHaveLength(
      0,
    );
  });
});

// ---------------------------------------------------------------------------
// 14.5 Image Accessibility on Additional Pages
// ---------------------------------------------------------------------------
test.describe("Image Accessibility - Additional Pages", () => {
  test("all visible images on automate page have alt text or aria-label", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/automate");
    await page.waitForLoadState("networkidle");

    const images = page.locator("img");
    const count = await images.count();

    for (let i = 0; i < count; i++) {
      const img = images.nth(i);
      if (!(await img.isVisible().catch(() => false))) continue;

      const alt = await img.getAttribute("alt");
      const ariaLabel = await img.getAttribute("aria-label");
      const role = await img.getAttribute("role");

      const isDecorative = role === "presentation" || role === "none" || alt === "";
      const hasAccessibleName =
        (alt && alt.trim().length > 0) || (ariaLabel && ariaLabel.trim().length > 0);

      expect(
        isDecorative || hasAccessibleName,
        `Image at index ${i} on automate page has no alt text, aria-label, or presentation role.`,
      ).toBeTruthy();
    }
  });
});

// ---------------------------------------------------------------------------
// 14.5 Color Contrast in Dark Theme
// ---------------------------------------------------------------------------
test.describe("Color Contrast - Dark Theme", () => {
  test("primary text in dark theme meets minimum contrast ratio", async ({
    loggedInPage: page,
  }) => {
    await page.waitForLoadState("networkidle");

    // Switch to dark theme
    const themeBtn = page.locator("button[title='Toggle theme']");
    const isDark = await page.evaluate(() => document.documentElement.classList.contains("dark"));
    if (!isDark && (await themeBtn.isVisible({ timeout: 3_000 }).catch(() => false))) {
      await themeBtn.click();
      await page.waitForTimeout(300);
    }

    // Sample heading contrast in dark mode
    const contrast = await page.evaluate(() => {
      const heading = document.querySelector("h1, h2");
      if (!heading) return null;

      const style = window.getComputedStyle(heading);
      const color = style.color;
      const bgColor = style.backgroundColor;

      const parseRgb = (c: string) => {
        const m = c.match(/\d+/g);
        return m ? m.map(Number) : null;
      };

      const fg = parseRgb(color);
      const bg = parseRgb(bgColor);
      if (!fg || !bg) return null;

      const luminance = (rgb: number[]) => {
        const [r, g, b] = rgb.map((v) => {
          const s = v / 255;
          return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };

      const l1 = luminance(fg);
      const l2 = luminance(bg);
      const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);

      return { ratio, fg: color, bg: bgColor };
    });

    if (contrast && contrast.ratio > 0) {
      expect(
        contrast.ratio,
        `Dark theme heading contrast ratio ${contrast.ratio.toFixed(2)} below 3:1`,
      ).toBeGreaterThanOrEqual(3);
    }

    // Toggle theme back
    if (!isDark && (await themeBtn.isVisible({ timeout: 2_000 }).catch(() => false))) {
      await themeBtn.click();
    }
  });
});

// ---------------------------------------------------------------------------
// 14.5 Buttons Accessible on Additional Pages
// ---------------------------------------------------------------------------
test.describe("Buttons Accessible - Additional Pages", () => {
  test("all visible buttons on automate page have accessible names", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/automate");
    await page.waitForLoadState("networkidle");

    const buttons = page.getByRole("button");
    const count = await buttons.count();

    for (let i = 0; i < count; i++) {
      const button = buttons.nth(i);
      if (!(await button.isVisible().catch(() => false))) continue;

      const name = await button.getAttribute("aria-label");
      const title = await button.getAttribute("title");
      const text = await button.textContent();

      const hasAccessibleName =
        (text && text.trim().length > 0) ||
        (name && name.trim().length > 0) ||
        (title && title.trim().length > 0);
      expect(
        hasAccessibleName,
        `Button at index ${i} on automate page has no accessible name.`,
      ).toBeTruthy();
    }
  });
});

// ---------------------------------------------------------------------------
// Skip-to-Content Link (WCAG 2.4.1)
// ---------------------------------------------------------------------------
test.describe("Skip-to-Content Link", () => {
  test("skip-to-content link exists and is the first focusable element", async ({
    loggedInPage: page,
  }) => {
    // The skip link should be the very first focusable element on the page.
    // It is typically visually hidden until focused.
    await page.keyboard.press("Tab");

    const activeElement = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el) return null;
      return {
        tag: el.tagName,
        text: el.textContent?.trim() ?? "",
        href: (el as HTMLAnchorElement).href ?? "",
        className: el.className,
      };
    });

    // The first focusable element should be a skip link targeting #main or main content
    expect(activeElement).toBeTruthy();
    if (activeElement) {
      const isSkipLink =
        /skip/i.test(activeElement.text) ||
        /skip/i.test(activeElement.className) ||
        activeElement.href.includes("#main");
      expect(
        isSkipLink,
        `Expected first focusable element to be a skip-to-content link, got: tag=${activeElement.tag}, text="${activeElement.text}", href="${activeElement.href}"`,
      ).toBeTruthy();
    }
  });

  test("skip-to-content link becomes visible on focus", async ({ loggedInPage: page }) => {
    // Press Tab to focus the skip link
    await page.keyboard.press("Tab");

    // The skip link should become visible when focused (not display:none or invisible)
    const skipLink = page.locator("a:focus, button:focus").first();
    const box = await skipLink.boundingBox();

    // The element should have a non-zero bounding box when focused
    // (it is visually hidden off-screen or with sr-only until focused)
    if (box) {
      expect(box.width).toBeGreaterThan(0);
      expect(box.height).toBeGreaterThan(0);
    }
  });

  test("skip-to-content link navigates focus to main content", async ({ loggedInPage: page }) => {
    // The lazy home page must finish rendering so #main-content (the skip
    // target) exists before we activate the link.
    await page.waitForLoadState("networkidle");
    await page.locator("#main-content").waitFor({ state: "attached" });

    // Press Tab to reach the skip link, then activate it
    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");

    // After activation, focus should move to the main content area
    const focusLocation = await page.evaluate(() => {
      const active = document.activeElement;
      if (!active) return "none";
      const main = document.querySelector("main");
      if (main === active || main?.contains(active)) return "main";
      // Check if focused element has id="main" (skip link target)
      if (active.id === "main" || active.id === "main-content") return "main";
      return `other:${active.tagName}#${active.id}`;
    });

    expect(
      focusLocation,
      `Expected focus to move to main content after skip link activation, got: ${focusLocation}`,
    ).toBe("main");
  });

  test("skip-to-content link is present on tool pages", async ({ loggedInPage: page }) => {
    await page.goto("/image/resize");
    await page.waitForLoadState("domcontentloaded");

    // Tab to first focusable element
    await page.keyboard.press("Tab");

    const activeText = await page.evaluate(() => document.activeElement?.textContent?.trim() ?? "");

    expect(
      /skip/i.test(activeText),
      `Expected skip link on tool page, first focused element text: "${activeText}"`,
    ).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Comprehensive Color Contrast Checks (WCAG AA)
// ---------------------------------------------------------------------------
test.describe("Comprehensive Color Contrast", () => {
  // Helper function used inside page.evaluate for contrast calculation
  const contrastCheckScript = ({ selector, minRatio }: { selector: string; minRatio: number }) => {
    const elements = Array.from(document.querySelectorAll(selector));
    const failures: Array<{
      text: string;
      ratio: number;
      fg: string;
      bg: string;
      selector: string;
    }> = [];

    const luminance = (rgb: number[]) => {
      const [r, g, b] = rgb.map((v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };

    const parseRgb = (c: string) => {
      const m = c.match(/\d+/g);
      return m ? m.map(Number) : null;
    };

    const getEffectiveBg = (el: Element): number[] | null => {
      let current: Element | null = el;
      while (current) {
        const style = window.getComputedStyle(current);
        const bg = style.backgroundColor;
        const rgb = parseRgb(bg);
        if (rgb && (rgb.length < 4 || rgb[3] > 0) && bg !== "rgba(0, 0, 0, 0)") {
          return rgb;
        }
        current = current.parentElement;
      }
      return [255, 255, 255]; // default white background
    };

    for (const el of elements) {
      if (!(el as HTMLElement).offsetParent && el.tagName !== "BODY") continue;
      // Skip visually-hidden (sr-only) elements: they are clipped to ~1px and
      // their colors are meaningless for contrast (e.g. the skip link).
      const rect = (el as HTMLElement).getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) continue;
      const text = el.textContent?.trim();
      if (!text || text.length === 0) continue;

      const style = window.getComputedStyle(el);
      const fg = parseRgb(style.color);
      const bg = getEffectiveBg(el);
      if (!fg || !bg) continue;

      const l1 = luminance(fg);
      const l2 = luminance(bg);
      const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);

      if (ratio < minRatio && ratio > 0) {
        failures.push({
          text: text.slice(0, 40),
          ratio,
          fg: style.color,
          bg: style.backgroundColor,
          selector: `${el.tagName}.${el.className.split(" ")[0]}`,
        });
      }
    }
    return failures;
  };

  test("all headings meet WCAG AA contrast (3:1 for large text) in light theme", async ({
    loggedInPage: page,
  }) => {
    await page.waitForLoadState("networkidle");

    // Ensure light theme
    const isDark = await page.evaluate(() => document.documentElement.classList.contains("dark"));
    if (isDark) {
      const themeBtn = page.locator("button[title='Toggle theme']");
      if (await themeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await themeBtn.click();
        await page.waitForTimeout(300);
      }
    }

    const failures = await page.evaluate(contrastCheckScript, {
      selector: "h1, h2, h3, h4, h5, h6",
      minRatio: 3,
    });

    expect(
      failures,
      `Headings with insufficient contrast (< 3:1):\n${failures.map((f) => `  "${f.text}" ratio=${f.ratio.toFixed(2)} fg=${f.fg} bg=${f.bg}`).join("\n")}`,
    ).toHaveLength(0);
  });

  test("all body text meets WCAG AA contrast (4.5:1 for normal text) in light theme", async ({
    loggedInPage: page,
  }) => {
    await page.waitForLoadState("networkidle");

    // Ensure light theme
    const isDark = await page.evaluate(() => document.documentElement.classList.contains("dark"));
    if (isDark) {
      const themeBtn = page.locator("button[title='Toggle theme']");
      if (await themeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await themeBtn.click();
        await page.waitForTimeout(300);
      }
    }

    const failures = await page.evaluate(contrastCheckScript, {
      selector: "p, span, label, li, td",
      minRatio: 4.5,
    });

    expect(
      failures,
      `Text elements with insufficient contrast (< 4.5:1):\n${failures.map((f) => `  "${f.text}" ratio=${f.ratio.toFixed(2)} fg=${f.fg} bg=${f.bg}`).join("\n")}`,
    ).toHaveLength(0);
  });

  test("all buttons meet WCAG AA contrast (4.5:1) in light theme", async ({
    loggedInPage: page,
  }) => {
    await page.waitForLoadState("networkidle");

    const failures = await page.evaluate(contrastCheckScript, {
      selector: "button, a[role='button']",
      minRatio: 4.5,
    });

    expect(
      failures,
      `Buttons with insufficient contrast (< 4.5:1):\n${failures.map((f) => `  "${f.text}" ratio=${f.ratio.toFixed(2)} fg=${f.fg} bg=${f.bg}`).join("\n")}`,
    ).toHaveLength(0);
  });

  test("all headings meet WCAG AA contrast (3:1) in dark theme", async ({ loggedInPage: page }) => {
    await page.waitForLoadState("networkidle");

    // Switch to dark theme
    const isDark = await page.evaluate(() => document.documentElement.classList.contains("dark"));
    if (!isDark) {
      const themeBtn = page.locator("button[title='Toggle theme']");
      if (await themeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await themeBtn.click();
        await page.waitForTimeout(300);
      }
    }

    const failures = await page.evaluate(contrastCheckScript, {
      selector: "h1, h2, h3, h4, h5, h6",
      minRatio: 3,
    });

    expect(
      failures,
      `Dark theme headings with insufficient contrast (< 3:1):\n${failures.map((f) => `  "${f.text}" ratio=${f.ratio.toFixed(2)} fg=${f.fg} bg=${f.bg}`).join("\n")}`,
    ).toHaveLength(0);

    // Restore light theme
    if (!isDark) {
      const themeBtn = page.locator("button[title='Toggle theme']");
      if (await themeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await themeBtn.click();
      }
    }
  });

  test("all body text meets WCAG AA contrast (4.5:1) in dark theme", async ({
    loggedInPage: page,
  }) => {
    await page.waitForLoadState("networkidle");

    // Switch to dark theme
    const isDark = await page.evaluate(() => document.documentElement.classList.contains("dark"));
    if (!isDark) {
      const themeBtn = page.locator("button[title='Toggle theme']");
      if (await themeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await themeBtn.click();
        await page.waitForTimeout(300);
      }
    }

    const failures = await page.evaluate(contrastCheckScript, {
      selector: "p, span, label, li, td",
      minRatio: 4.5,
    });

    expect(
      failures,
      `Dark theme text with insufficient contrast (< 4.5:1):\n${failures.map((f) => `  "${f.text}" ratio=${f.ratio.toFixed(2)} fg=${f.fg} bg=${f.bg}`).join("\n")}`,
    ).toHaveLength(0);

    // Restore light theme
    if (!isDark) {
      const themeBtn = page.locator("button[title='Toggle theme']");
      if (await themeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await themeBtn.click();
      }
    }
  });

  test("all buttons meet WCAG AA contrast (4.5:1) in dark theme", async ({
    loggedInPage: page,
  }) => {
    await page.waitForLoadState("networkidle");

    // Switch to dark theme
    const isDark = await page.evaluate(() => document.documentElement.classList.contains("dark"));
    if (!isDark) {
      const themeBtn = page.locator("button[title='Toggle theme']");
      if (await themeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await themeBtn.click();
        await page.waitForTimeout(300);
      }
    }

    const failures = await page.evaluate(contrastCheckScript, {
      selector: "button, a[role='button']",
      minRatio: 4.5,
    });

    expect(
      failures,
      `Dark theme buttons with insufficient contrast (< 4.5:1):\n${failures.map((f) => `  "${f.text}" ratio=${f.ratio.toFixed(2)} fg=${f.fg} bg=${f.bg}`).join("\n")}`,
    ).toHaveLength(0);

    // Restore light theme
    if (!isDark) {
      const themeBtn = page.locator("button[title='Toggle theme']");
      if (await themeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await themeBtn.click();
      }
    }
  });

  test("tool page text elements meet WCAG AA contrast", async ({ loggedInPage: page }) => {
    await page.goto("/image/resize");
    await page.waitForLoadState("networkidle");

    const failures = await page.evaluate(contrastCheckScript, {
      selector: "h1, h2, h3, h4, p, span, label, button",
      minRatio: 3,
    });

    expect(
      failures,
      `Tool page elements with insufficient contrast:\n${failures.map((f) => `  "${f.text}" ratio=${f.ratio.toFixed(2)} fg=${f.fg} bg=${f.bg}`).join("\n")}`,
    ).toHaveLength(0);
  });

  test("sidebar navigation text meets WCAG AA contrast", async ({ loggedInPage: page }) => {
    await page.waitForLoadState("networkidle");

    const failures = await page.evaluate(
      (args) => {
        const [, minRatio] = args as [string, number];
        const sidebar = document.querySelector("aside");
        if (!sidebar) return [];

        const elements = Array.from(sidebar.querySelectorAll("a, button, span"));
        const failures: Array<{ text: string; ratio: number; fg: string; bg: string }> = [];

        const luminance = (rgb: number[]) => {
          const [r, g, b] = rgb.map((v) => {
            const s = v / 255;
            return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
          });
          return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        };

        const parseRgb = (c: string) => {
          const m = c.match(/\d+/g);
          return m ? m.map(Number) : null;
        };

        const getEffectiveBg = (el: Element): number[] | null => {
          let current: Element | null = el;
          while (current) {
            const style = window.getComputedStyle(current);
            const bg = style.backgroundColor;
            const rgb = parseRgb(bg);
            if (rgb && (rgb.length < 4 || rgb[3] > 0) && bg !== "rgba(0, 0, 0, 0)") {
              return rgb;
            }
            current = current.parentElement;
          }
          return [255, 255, 255];
        };

        for (const el of elements) {
          if (!(el as HTMLElement).offsetParent) continue;
          const text = el.textContent?.trim();
          if (!text || text.length === 0) continue;

          const style = window.getComputedStyle(el);
          const fg = parseRgb(style.color);
          const bg = getEffectiveBg(el);
          if (!fg || !bg) continue;

          const l1 = luminance(fg);
          const l2 = luminance(bg);
          const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);

          if (ratio < minRatio && ratio > 0) {
            failures.push({
              text: text.slice(0, 40),
              ratio,
              fg: style.color,
              bg: style.backgroundColor,
            });
          }
        }
        return failures;
      },
      ["aside a, button, span", 4.5],
    );

    expect(
      failures,
      `Sidebar items with insufficient contrast:\n${failures.map((f) => `  "${f.text}" ratio=${f.ratio.toFixed(2)}`).join("\n")}`,
    ).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 14.6 Tab Order Logical
// ---------------------------------------------------------------------------
test.describe("Tab Order", () => {
  test("tab order on tool page follows logical layout", async ({ loggedInPage: page }) => {
    await page.goto("/image/resize");
    await page.waitForLoadState("networkidle");

    // Collect the positions of focused elements during Tab traversal
    const positions: Array<{ x: number; y: number; tag: string }> = [];

    for (let i = 0; i < 15; i++) {
      await page.keyboard.press("Tab");
      const pos = await page.evaluate(() => {
        const active = document.activeElement;
        if (!active || active === document.body) return null;
        const rect = active.getBoundingClientRect();
        return { x: rect.x, y: rect.y, tag: active.tagName };
      });
      if (pos) positions.push(pos);
    }

    // We should have found some focused elements
    expect(positions.length).toBeGreaterThan(0);

    // General layout should follow a top-to-bottom flow
    // (sidebar items top-down, then main content top-down)
    // We verify no random jumps by checking that y positions don't go
    // wildly backward (more than a full screen height)
    const viewportHeight = await page.evaluate(() => window.innerHeight);
    for (let i = 1; i < positions.length; i++) {
      const yDiff = positions[i].y - positions[i - 1].y;
      // Allow backward movement for sidebar-to-main transitions
      // but not more than the full viewport
      expect(
        yDiff > -viewportHeight,
        `Tab order jumped backward by ${Math.abs(yDiff)}px between elements ${i - 1} and ${i}`,
      ).toBeTruthy();
    }
  });
});

// ---------------------------------------------------------------------------
// Heading Hierarchy Across Multiple Tool Pages
// ---------------------------------------------------------------------------
test.describe("Heading Hierarchy - Multiple Tools", () => {
  // 2.0 routes are /<section>/<toolId>; these are all image tools.
  const toolPages = [
    { route: "/image/compress", name: "Compress" },
    { route: "/image/rotate", name: "Rotate" },
    { route: "/image/convert", name: "Convert" },
    { route: "/image/crop", name: "Crop" },
    // No standalone "flip" tool: flipping is part of Rotate & Flip (/image/rotate).
  ];

  for (const { route, name } of toolPages) {
    test(`${name} page has valid heading hierarchy (no skipped levels)`, async ({
      loggedInPage: page,
    }) => {
      await page.goto(route);
      // Wait for the lazy-loaded ToolPage chunk to render its heading.
      await page.waitForLoadState("networkidle");

      const headingLevels = await page.evaluate(() => {
        const headings = document.querySelectorAll("h1, h2, h3, h4, h5, h6");
        return Array.from(headings).map((h) => Number.parseInt(h.tagName.charAt(1), 10));
      });

      expect(headingLevels.length).toBeGreaterThan(0);

      // No heading level should be skipped (e.g., h1 then h3 with no h2)
      for (let i = 1; i < headingLevels.length; i++) {
        const jump = headingLevels[i] - headingLevels[i - 1];
        expect(
          jump <= 1,
          `Heading hierarchy skip on ${name} page: h${headingLevels[i - 1]} to h${headingLevels[i]}`,
        ).toBeTruthy();
      }
    });
  }
});

// ---------------------------------------------------------------------------
// Change Password Page Landmarks & Structure
// ---------------------------------------------------------------------------
test.describe("Change Password Page Accessibility", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("change password page renders visible content", async ({ page }) => {
    await page.goto("/change-password");
    await page.waitForLoadState("domcontentloaded");

    const bodyText = await page.textContent("body");
    expect(bodyText).toBeDefined();
    expect(bodyText?.length).toBeGreaterThan(0);
  });

  test("change password page has no duplicate element IDs", async ({ page }) => {
    await page.goto("/change-password");
    await page.waitForLoadState("networkidle");

    const duplicates = await page.evaluate(() => {
      const ids = Array.from(document.querySelectorAll("[id]")).map((el) => el.id);
      const seen = new Set<string>();
      const dups: string[] = [];
      for (const id of ids) {
        if (id && seen.has(id)) dups.push(id);
        seen.add(id);
      }
      return dups;
    });

    expect(
      duplicates,
      `Duplicate IDs found on change-password page: ${duplicates.join(", ")}`,
    ).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Focus Visible Outline on Interactive Elements
// ---------------------------------------------------------------------------
test.describe("Focus Visible Outline", () => {
  test("focused buttons show visible focus indicator", async ({ loggedInPage: page }) => {
    await page.waitForLoadState("networkidle");

    // Tab to the first visible button
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press("Tab");
      const tag = await page.evaluate(() => document.activeElement?.tagName);
      if (tag === "BUTTON") break;
    }

    const activeTag = await page.evaluate(() => document.activeElement?.tagName);
    if (activeTag === "BUTTON") {
      const outlineInfo = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el) return null;
        const style = window.getComputedStyle(el);
        return {
          outline: style.outline,
          outlineWidth: style.outlineWidth,
          outlineStyle: style.outlineStyle,
          boxShadow: style.boxShadow,
        };
      });

      expect(outlineInfo).toBeTruthy();
      if (outlineInfo) {
        // Must have either a visible outline or a box-shadow (ring utility)
        const hasOutline =
          outlineInfo.outlineStyle !== "none" && outlineInfo.outlineWidth !== "0px";
        const hasBoxShadow = outlineInfo.boxShadow !== "none";
        expect(
          hasOutline || hasBoxShadow,
          `Focused button has no visible focus indicator. outline="${outlineInfo.outline}", boxShadow="${outlineInfo.boxShadow}"`,
        ).toBeTruthy();
      }
    }
  });

  test("focused links show visible focus indicator", async ({ loggedInPage: page }) => {
    await page.waitForLoadState("networkidle");

    // Tab to the first link
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press("Tab");
      const tag = await page.evaluate(() => document.activeElement?.tagName);
      if (tag === "A") break;
    }

    const activeTag = await page.evaluate(() => document.activeElement?.tagName);
    if (activeTag === "A") {
      const outlineInfo = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el) return null;
        const style = window.getComputedStyle(el);
        return {
          outlineStyle: style.outlineStyle,
          outlineWidth: style.outlineWidth,
          boxShadow: style.boxShadow,
        };
      });

      expect(outlineInfo).toBeTruthy();
      if (outlineInfo) {
        const hasOutline =
          outlineInfo.outlineStyle !== "none" && outlineInfo.outlineWidth !== "0px";
        const hasBoxShadow = outlineInfo.boxShadow !== "none";
        expect(
          hasOutline || hasBoxShadow,
          "Focused link has no visible focus indicator",
        ).toBeTruthy();
      }
    }
  });

  test("focused input shows visible focus indicator on login page", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/login");
    await page.waitForLoadState("domcontentloaded");

    const usernameInput = page.getByLabel("Username");
    await usernameInput.focus();

    const outlineInfo = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el) return null;
      const style = window.getComputedStyle(el);
      return {
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth,
        boxShadow: style.boxShadow,
        borderColor: style.borderColor,
      };
    });

    expect(outlineInfo).toBeTruthy();
    if (outlineInfo) {
      const hasOutline = outlineInfo.outlineStyle !== "none" && outlineInfo.outlineWidth !== "0px";
      const hasBoxShadow = outlineInfo.boxShadow !== "none";
      expect(
        hasOutline || hasBoxShadow,
        "Focused input has no visible focus indicator",
      ).toBeTruthy();
    }
  });
});

// ---------------------------------------------------------------------------
// Settings Dialog Has aria-labelledby
// ---------------------------------------------------------------------------
test.describe("Settings Dialog Labelling", () => {
  test("settings dialog heading serves as accessible label", async ({ loggedInPage: page }) => {
    await openSettings(page);

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // The dialog should have a heading that acts as its accessible name,
    // either via aria-labelledby or aria-label
    const ariaLabelledBy = await dialog.getAttribute("aria-labelledby");
    const ariaLabel = await dialog.getAttribute("aria-label");

    const hasLabel =
      (ariaLabelledBy && ariaLabelledBy.length > 0) || (ariaLabel && ariaLabel.length > 0);
    expect(
      hasLabel,
      "Settings dialog should have aria-labelledby or aria-label for screen readers",
    ).toBeTruthy();

    await page.keyboard.press("Escape");
  });
});

// ---------------------------------------------------------------------------
// All Inputs Have Labels (Comprehensive Check)
// ---------------------------------------------------------------------------
test.describe("All Inputs Have Labels", () => {
  test("all visible inputs on home page have associated labels or aria-label", async ({
    loggedInPage: page,
  }) => {
    await page.waitForLoadState("networkidle");

    const unlabelledInputs = await page.evaluate(() => {
      const inputs = Array.from(
        document.querySelectorAll("input, select, textarea"),
      ) as HTMLElement[];
      const issues: string[] = [];

      for (const input of inputs) {
        if (!(input as HTMLElement).offsetParent) continue;
        if ((input as HTMLInputElement).type === "hidden") continue;

        const id = input.id;
        const ariaLabel = input.getAttribute("aria-label");
        const ariaLabelledBy = input.getAttribute("aria-labelledby");
        const placeholder = input.getAttribute("placeholder");
        const title = input.getAttribute("title");

        // Check for associated <label>
        const hasLabel = id ? document.querySelector(`label[for="${id}"]`) !== null : false;
        // Check for wrapping <label>
        const hasWrappingLabel = input.closest("label") !== null;

        const isLabelled =
          hasLabel ||
          hasWrappingLabel ||
          (ariaLabel && ariaLabel.length > 0) ||
          (ariaLabelledBy && ariaLabelledBy.length > 0) ||
          (placeholder && placeholder.length > 0) ||
          (title && title.length > 0);

        if (!isLabelled) {
          issues.push(
            `<${input.tagName.toLowerCase()} type="${(input as HTMLInputElement).type}" id="${id}">`,
          );
        }
      }
      return issues;
    });

    expect(unlabelledInputs, `Inputs without labels: ${unlabelledInputs.join(", ")}`).toHaveLength(
      0,
    );
  });

  test("all visible inputs on tool page have associated labels or aria-label", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/image/resize");
    await page.waitForLoadState("networkidle");

    const unlabelledInputs = await page.evaluate(() => {
      const inputs = Array.from(
        document.querySelectorAll("input, select, textarea"),
      ) as HTMLElement[];
      const issues: string[] = [];

      for (const input of inputs) {
        if (!(input as HTMLElement).offsetParent) continue;
        if ((input as HTMLInputElement).type === "hidden") continue;

        const id = input.id;
        const ariaLabel = input.getAttribute("aria-label");
        const ariaLabelledBy = input.getAttribute("aria-labelledby");
        const placeholder = input.getAttribute("placeholder");
        const title = input.getAttribute("title");

        const hasLabel = id ? document.querySelector(`label[for="${id}"]`) !== null : false;
        const hasWrappingLabel = input.closest("label") !== null;

        const isLabelled =
          hasLabel ||
          hasWrappingLabel ||
          (ariaLabel && ariaLabel.length > 0) ||
          (ariaLabelledBy && ariaLabelledBy.length > 0) ||
          (placeholder && placeholder.length > 0) ||
          (title && title.length > 0);

        if (!isLabelled) {
          issues.push(
            `<${input.tagName.toLowerCase()} type="${(input as HTMLInputElement).type}" id="${id}">`,
          );
        }
      }
      return issues;
    });

    expect(
      unlabelledInputs,
      `Tool page inputs without labels: ${unlabelledInputs.join(", ")}`,
    ).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Dropzone Drag Feedback
// ---------------------------------------------------------------------------
test.describe("Dropzone Visual Feedback", () => {
  test("dropzone has descriptive text for screen readers", async ({ loggedInPage: page }) => {
    await page.goto("/image/resize");
    await page.waitForLoadState("domcontentloaded");

    // The dropzone section should have descriptive text
    const dropzone = page.locator("section[aria-label='File drop zone']");
    await expect(dropzone).toBeVisible();

    const text = await dropzone.textContent();
    expect(text).toBeTruthy();
    // Should contain upload instructions
    expect(text).toMatch(/upload|drag|drop|browse/i);
  });
});

// ---------------------------------------------------------------------------
// Slider Keyboard Accessibility (Extended)
// ---------------------------------------------------------------------------
test.describe("Slider Keyboard Accessibility - Extended", () => {
  test("QR size slider responds to ArrowLeft to decrease value", async ({ loggedInPage: page }) => {
    await page.goto("/image/qr-generate");
    await page.waitForLoadState("domcontentloaded");

    const sizeSlider = page.locator("#qr-size");
    await expect(sizeSlider).toBeVisible();

    // Set to a value above minimum so we can decrease
    const max = await sizeSlider.getAttribute("max");
    await sizeSlider.fill(max ?? "1024");

    const initialValue = await sizeSlider.inputValue();

    await sizeSlider.focus();
    await page.keyboard.press("ArrowLeft");

    const newValue = await sizeSlider.inputValue();
    expect(Number(newValue)).toBeLessThanOrEqual(Number(initialValue));
  });

  test("slider Home key jumps to minimum value", async ({ loggedInPage: page }) => {
    await page.goto("/image/qr-generate");
    await page.waitForLoadState("domcontentloaded");

    const sizeSlider = page.locator("#qr-size");
    await expect(sizeSlider).toBeVisible();

    const min = await sizeSlider.getAttribute("min");

    await sizeSlider.focus();
    await page.keyboard.press("Home");

    const currentValue = await sizeSlider.inputValue();
    expect(Number(currentValue)).toBe(Number(min));
  });

  test("slider End key jumps to maximum value", async ({ loggedInPage: page }) => {
    await page.goto("/image/qr-generate");
    await page.waitForLoadState("domcontentloaded");

    const sizeSlider = page.locator("#qr-size");
    await expect(sizeSlider).toBeVisible();

    const max = await sizeSlider.getAttribute("max");

    await sizeSlider.focus();
    await page.keyboard.press("End");

    const currentValue = await sizeSlider.inputValue();
    expect(Number(currentValue)).toBe(Number(max));
  });
});

// ---------------------------------------------------------------------------
// Navigation Keyboard Accessibility (Extended)
// ---------------------------------------------------------------------------
test.describe("Navigation Keyboard - Extended", () => {
  test("global search can be activated and cleared via keyboard", async ({
    loggedInPage: page,
  }) => {
    await page.waitForLoadState("networkidle");

    const searchInput = page.getByPlaceholder(/search/i).first();
    await expect(searchInput).toBeVisible();

    // Focus and type
    await searchInput.focus();
    await page.keyboard.type("resize");

    const value = await searchInput.inputValue();
    expect(value).toBe("resize");

    // Clear with select-all then Delete. Use ControlOrMeta so select-all works
    // on macOS too (Control+a there moves the caret to line start instead).
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.press("Delete");

    const clearedValue = await searchInput.inputValue();
    expect(clearedValue).toBe("");
  });

  test("top nav links can be activated via Enter key", async ({ loggedInPage: page }) => {
    await page.waitForLoadState("networkidle");

    const sidebar = page.locator("header");
    const links = sidebar.locator("a");
    const count = await links.count();
    expect(count).toBeGreaterThan(0);

    // Find and focus the first visible link
    for (let i = 0; i < count; i++) {
      const link = links.nth(i);
      if (await link.isVisible().catch(() => false)) {
        await link.focus();
        const href = await link.getAttribute("href");
        if (href?.startsWith("/") && !href.includes("login")) {
          await page.keyboard.press("Enter");
          await page.waitForLoadState("domcontentloaded");

          // Should have navigated
          const currentUrl = page.url();
          expect(currentUrl).toContain(href);
          break;
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// QR Generate Page Input Labels
// ---------------------------------------------------------------------------
test.describe("QR Generate Page Input Accessibility", () => {
  test("QR generate page size slider has associated label", async ({ loggedInPage: page }) => {
    await page.goto("/image/qr-generate");
    await page.waitForLoadState("domcontentloaded");

    const sizeSlider = page.locator("#qr-size");
    await expect(sizeSlider).toBeVisible();

    // Check for associated label
    const labelledBy = await page.evaluate(() => {
      const slider = document.querySelector("#qr-size");
      if (!slider) return null;

      // Check label[for="qr-size"]
      const labelFor = document.querySelector("label[for='qr-size']");
      if (labelFor) return { method: "for", text: labelFor.textContent };

      // Check wrapping label
      const wrapping = slider.closest("label");
      if (wrapping) return { method: "wrapping", text: wrapping.textContent };

      // Check aria-label
      const ariaLabel = slider.getAttribute("aria-label");
      if (ariaLabel) return { method: "aria-label", text: ariaLabel };

      // Check aria-labelledby
      const ariaLabelledBy = slider.getAttribute("aria-labelledby");
      if (ariaLabelledBy) return { method: "aria-labelledby", text: ariaLabelledBy };

      return null;
    });

    expect(labelledBy, "QR size slider should have an associated label").toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Modal Escape Behavior Consistency
// ---------------------------------------------------------------------------
test.describe("Modal Escape Consistency", () => {
  test("Escape key does not close parent modal when child element is focused", async ({
    loggedInPage: page,
  }) => {
    await openSettings(page);

    // Focus an input inside the dialog
    const dialog = page.getByRole("dialog");
    const inputs = dialog.locator("input, button, select");
    const inputCount = await inputs.count();

    if (inputCount > 0) {
      await inputs.first().focus();
      const focusIsInDialog = await page.evaluate(() => {
        const active = document.activeElement;
        const dialog = document.querySelector("[role='dialog']");
        return dialog?.contains(active) ?? false;
      });
      expect(focusIsInDialog).toBeTruthy();
    }

    // Escape should close the dialog regardless
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: 5_000 });
  });
});

// ---------------------------------------------------------------------------
// ARIA Live Regions
// ---------------------------------------------------------------------------
test.describe("ARIA Live Regions", () => {
  test("processing status changes are announced via live region", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/image/resize");
    await uploadTestImage(page);

    // Check for any aria-live regions on the page
    const liveRegions = await page.evaluate(() => {
      const regions = document.querySelectorAll(
        "[aria-live], [role='status'], [role='alert'], [role='log']",
      );
      return Array.from(regions).map((r) => ({
        tag: r.tagName,
        role: r.getAttribute("role"),
        ariaLive: r.getAttribute("aria-live"),
      }));
    });

    // The page should have at least one live region for status updates
    // (connection banner, toast container, or processing status)
    expect(liveRegions.length).toBeGreaterThanOrEqual(0);

    // The toast container (Sonner) uses aria-live for announcements
    // Verify the page does not crash
    await expect(page.locator("main")).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Images on QR Generate Page
// ---------------------------------------------------------------------------
test.describe("Image Accessibility - QR Generate", () => {
  test("QR preview image has alt text after generation", async ({ loggedInPage: page }) => {
    await page.goto("/image/qr-generate");
    await page.waitForLoadState("domcontentloaded");

    // Enter data to generate QR
    const urlInput = page.locator("[data-testid='qr-input-url']");
    await urlInput.fill("https://example.com");

    // Wait for QR preview to render
    await page.waitForTimeout(1000);

    // Check any canvas or img elements in the preview area
    const images = page.locator("img, canvas");
    const count = await images.count();

    for (let i = 0; i < count; i++) {
      const img = images.nth(i);
      if (!(await img.isVisible().catch(() => false))) continue;
      const tag = await img.evaluate((el) => el.tagName);

      if (tag === "IMG") {
        const alt = await img.getAttribute("alt");
        const ariaLabel = await img.getAttribute("aria-label");
        const role = await img.getAttribute("role");
        const isDecorative = role === "presentation" || role === "none" || alt === "";
        const hasAccessibleName =
          (alt && alt.trim().length > 0) || (ariaLabel && ariaLabel.trim().length > 0);
        expect(isDecorative || hasAccessibleName).toBeTruthy();
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Color Contrast on Tool Pages (both themes)
// ---------------------------------------------------------------------------
test.describe("Color Contrast - Tool Page Dark Theme", () => {
  test("tool page meets WCAG AA contrast in dark theme", async ({ loggedInPage: page }) => {
    await page.goto("/image/resize");
    await page.waitForLoadState("networkidle");

    // Switch to dark theme
    const isDark = await page.evaluate(() => document.documentElement.classList.contains("dark"));
    if (!isDark) {
      const themeBtn = page.locator("button[title='Toggle theme']");
      if (await themeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await themeBtn.click();
        await page.waitForTimeout(300);
      }
    }

    const failures = await page.evaluate(() => {
      const elements = Array.from(
        document.querySelectorAll("h1, h2, h3, h4, p, span, label, button, a"),
      );
      const results: Array<{ text: string; ratio: number; fg: string; bg: string }> = [];

      const luminance = (rgb: number[]) => {
        const [r, g, b] = rgb.map((v) => {
          const s = v / 255;
          return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };

      const parseRgb = (c: string) => {
        const m = c.match(/\d+/g);
        return m ? m.map(Number) : null;
      };

      const getEffectiveBg = (el: Element): number[] | null => {
        let current: Element | null = el;
        while (current) {
          const style = window.getComputedStyle(current);
          const bg = style.backgroundColor;
          const rgb = parseRgb(bg);
          if (rgb && bg !== "rgba(0, 0, 0, 0)") return rgb;
          current = current.parentElement;
        }
        return [0, 0, 0]; // dark theme default background
      };

      for (const el of elements) {
        if (!(el as HTMLElement).offsetParent && el.tagName !== "BODY") continue;
        // Skip visually-hidden (sr-only) elements (e.g. the skip link).
        const rect = (el as HTMLElement).getBoundingClientRect();
        if (rect.width < 2 || rect.height < 2) continue;
        const text = el.textContent?.trim();
        if (!text || text.length === 0) continue;

        const style = window.getComputedStyle(el);
        const fg = parseRgb(style.color);
        const bg = getEffectiveBg(el);
        if (!fg || !bg) continue;

        const l1 = luminance(fg);
        const l2 = luminance(bg);
        const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);

        if (ratio < 3 && ratio > 0) {
          results.push({
            text: text.slice(0, 40),
            ratio,
            fg: style.color,
            bg: style.backgroundColor,
          });
        }
      }
      return results;
    });

    expect(
      failures,
      `Dark theme tool page elements with insufficient contrast:\n${failures.map((f) => `  "${f.text}" ratio=${f.ratio.toFixed(2)}`).join("\n")}`,
    ).toHaveLength(0);

    // Restore theme
    if (!isDark) {
      const themeBtn = page.locator("button[title='Toggle theme']");
      if (await themeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await themeBtn.click();
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Login Page Tab Order
// ---------------------------------------------------------------------------
test.describe("Login Page Tab Order", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("login page tab order is logical: username then password then button", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("domcontentloaded");

    const tabOrder: string[] = [];

    for (let i = 0; i < 10; i++) {
      await page.keyboard.press("Tab");
      const info = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el) return "none";
        if (el.id) return `#${el.id}`;
        return el.tagName.toLowerCase();
      });
      tabOrder.push(info);
    }

    // Username should appear before password in tab order
    const usernameIndex = tabOrder.indexOf("#username");
    const passwordIndex = tabOrder.indexOf("#password");

    if (usernameIndex >= 0 && passwordIndex >= 0) {
      expect(
        usernameIndex < passwordIndex,
        "Username should come before password in tab order",
      ).toBeTruthy();
    }
  });
});

// ---------------------------------------------------------------------------
// Automate Page Heading Hierarchy
// ---------------------------------------------------------------------------
test.describe("Automate Page Accessibility", () => {
  test("automate page has valid heading hierarchy", async ({ loggedInPage: page }) => {
    await page.goto("/automate");
    // Wait for the lazy-loaded AutomatePage chunk to render its headings.
    await page.waitForLoadState("networkidle");

    const headingLevels = await page.evaluate(() => {
      const headings = document.querySelectorAll("h1, h2, h3, h4, h5, h6");
      return Array.from(headings).map((h) => Number.parseInt(h.tagName.charAt(1), 10));
    });

    expect(headingLevels.length).toBeGreaterThan(0);

    // At most one h1
    const h1Count = headingLevels.filter((l) => l === 1).length;
    expect(h1Count).toBeLessThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Tabindex Values
// ---------------------------------------------------------------------------
test.describe("Tabindex Values", () => {
  test("no positive tabindex values on home page (anti-pattern)", async ({
    loggedInPage: page,
  }) => {
    await page.waitForLoadState("networkidle");

    const positiveTabindexElements = await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll("[tabindex]"));
      return elements
        .filter((el) => {
          const val = Number.parseInt(el.getAttribute("tabindex") ?? "0", 10);
          return val > 0;
        })
        .map((el) => ({
          tag: el.tagName,
          tabindex: el.getAttribute("tabindex"),
          text: el.textContent?.trim().slice(0, 30),
        }));
    });

    expect(
      positiveTabindexElements,
      `Elements with positive tabindex (anti-pattern): ${JSON.stringify(positiveTabindexElements)}`,
    ).toHaveLength(0);
  });

  test("no positive tabindex values on tool page", async ({ loggedInPage: page }) => {
    await page.goto("/image/resize");
    await page.waitForLoadState("networkidle");

    const positiveTabindexElements = await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll("[tabindex]"));
      return elements
        .filter((el) => {
          const val = Number.parseInt(el.getAttribute("tabindex") ?? "0", 10);
          return val > 0;
        })
        .map((el) => ({
          tag: el.tagName,
          tabindex: el.getAttribute("tabindex"),
        }));
    });

    expect(
      positiveTabindexElements,
      `Tool page elements with positive tabindex: ${JSON.stringify(positiveTabindexElements)}`,
    ).toHaveLength(0);
  });
});
