/**
 * #2108: a file pasted or dropped onto a tool page replaces the loaded one on a
 * single-file tool. Mid-run that either stopped the run (Erase Object, OCR) or
 * landed its result under the new file (resize and most others), with no sign.
 * It is turned away with a message instead, and the run finishes on the file that
 * started it.
 */
import { expect, test, uploadTestImage } from "./helpers";

test.describe("Files dropped or pasted during a run", () => {
  test("a paste mid-run is turned away, says why, and the run finishes", async ({
    loggedInPage: page,
  }) => {
    // Hold the answer back so the paste lands while the request is out.
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/api/v1/tools/image/resize", async (route) => {
      await held;
      await route.continue();
    });

    await page.goto("/image/resize");
    await uploadTestImage(page);
    await page.getByRole("spinbutton", { name: /width/i }).fill("50");
    const requestSent = page.waitForRequest("**/api/v1/tools/image/resize");
    await page.getByRole("button", { name: /^resize$/i }).click();
    await requestSent;

    await page.evaluate(() => {
      const data = new DataTransfer();
      data.items.add(
        new File([new Uint8Array([1, 2, 3])], "pasted-mid-run.png", { type: "image/png" }),
      );
      document.dispatchEvent(
        new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }),
      );
    });

    await expect(
      page.getByText("A run is in progress. Wait for it to finish before adding files."),
    ).toBeVisible();
    await expect(page.getByText("pasted-mid-run.png")).toHaveCount(0);

    release();

    // The run was not stopped: its result lands on the file that started it.
    await expect(page.getByTestId("resize-download")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("pasted-mid-run.png")).toHaveCount(0);
  });

  test("a drop mid-run is turned away, says why, and shows no replace overlay", async ({
    loggedInPage: page,
  }) => {
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/api/v1/tools/image/resize", async (route) => {
      await held;
      await route.continue();
    });

    await page.goto("/image/resize");
    await uploadTestImage(page);
    await page.getByRole("spinbutton", { name: /width/i }).fill("50");
    const requestSent = page.waitForRequest("**/api/v1/tools/image/resize");
    await page.getByRole("button", { name: /^resize$/i }).click();
    await requestSent;

    const files = await page.evaluateHandle(() => {
      const data = new DataTransfer();
      data.items.add(
        new File([new Uint8Array([1, 2, 3])], "dropped-mid-run.png", { type: "image/png" }),
      );
      return data;
    });
    const target = page.getByText(/test-image/i).first();
    await target.dispatchEvent("dragenter", { dataTransfer: files });
    await expect(page.getByText("Drop to replace file")).toHaveCount(0);
    await target.dispatchEvent("drop", { dataTransfer: files });

    await expect(
      page.getByText("A run is in progress. Wait for it to finish before adding files."),
    ).toBeVisible();
    await expect(page.getByText("dropped-mid-run.png")).toHaveCount(0);

    release();
    await expect(page.getByTestId("resize-download")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("dropped-mid-run.png")).toHaveCount(0);
  });

  test("a paste with nothing running still loads the file", async ({ loggedInPage: page }) => {
    await page.goto("/image/resize");
    await uploadTestImage(page);

    await page.evaluate(() => {
      const data = new DataTransfer();
      data.items.add(
        new File([new Uint8Array([1, 2, 3])], "pasted-idle.png", { type: "image/png" }),
      );
      document.dispatchEvent(
        new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }),
      );
    });

    await expect(page.getByText("pasted-idle.png").first()).toBeVisible();
    await expect(
      page.getByText("A run is in progress. Wait for it to finish before adding files."),
    ).toHaveCount(0);
  });
});
