import { expect, type Page, type Route, test } from "@playwright/test";

/**
 * #4685: with Google Translate on, pressing a button whose icon swaps
 * (meme generator's Generate, OCR's install button) crashed the page with
 * NotFoundError from insertBefore, because the translator had replaced the
 * button's text node. This simulates the translator's DOM rewrite and checks
 * the swap renders instead of the error boundary.
 */

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

async function openMemeEditor(page: Page): Promise<void> {
  await page.goto("/image/meme-generator");
  await page.setInputFiles('input[type="file"]', {
    name: "test.png",
    mimeType: "image/png",
    buffer: PNG_1X1,
  });
  await page.getByTestId("layout-top-bottom").click();
  await expect(page.getByTestId("generate-meme")).toBeEnabled();
}

for (const style of ["google", "in-place"] as const) {
  test(`meme Generate survives a ${style} translator rewrite of its label`, async ({ page }) => {
    const pageErrors: Error[] = [];
    page.on("pageerror", (error) => pageErrors.push(error));

    // Hold the generate request open so the button stays in its busy state.
    let held: Route | null = null;
    await page.route("**/api/v1/tools/image/meme-generator", (route) => {
      held = route;
    });

    await openMemeEditor(page);
    const button = page.getByTestId("generate-meme");

    await button.evaluate((el, mode) => {
      const text = Array.from(el.childNodes).find((n) => n.nodeType === Node.TEXT_NODE);
      if (!text) throw new Error("generate button has no bare text node");
      if (mode === "google") {
        // Google Translate drops the text node for <font><font>…</font></font>.
        document.documentElement.classList.add("translated-ltr");
        const outer = document.createElement("font");
        const inner = document.createElement("font");
        inner.textContent = "Générer";
        outer.appendChild(inner);
        el.replaceChild(outer, text);
      } else {
        const wrapper = document.createElement("ya-tr-span");
        el.replaceChild(wrapper, text);
        wrapper.appendChild(text);
      }
    }, style);

    await button.click();

    await expect(button.locator("svg.animate-spin")).toBeVisible();
    await expect(page.getByText("Something went wrong")).toHaveCount(0);
    expect(pageErrors.filter((e) => e.name === "NotFoundError")).toEqual([]);

    await expect.poll(() => held !== null).toBe(true);
    await (held as Route | null)?.abort();
  });
}
