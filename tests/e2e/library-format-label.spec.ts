import fs from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";
import { expect, test } from "./helpers";

// ---------------------------------------------------------------------------
// File details format label (issue #1783)
//
// The library types PSD, RAW, SVG and EPS uploads from their bytes (#1784),
// and the details panel showed those MIME subtypes upper-cased as the format:
// VND.ADOBE.PHOTOSHOP, X-DCRAW, SVG+XML, X-EPS. It shows the extension now.
// ---------------------------------------------------------------------------

const FORMATS = path.join(process.cwd(), "tests", "fixtures", "image", "formats");

async function authHeaders(page: Page): Promise<Record<string, string>> {
  const token = await page
    .evaluate(() => localStorage.getItem("snapotter-token"))
    .catch(() => null);
  return token ? { authorization: `Bearer ${token}` } : {};
}

/** Upload a fixture into the library under a unique name; return that name and its stored type. */
async function seed(page: Page, fixture: string, stem: string) {
  const ext = path.extname(fixture);
  const name = `${stem}${ext}`;
  const res = await page.request.post("/api/v1/files/upload", {
    headers: await authHeaders(page),
    multipart: {
      file: {
        name,
        mimeType: "application/octet-stream",
        buffer: fs.readFileSync(path.join(FORMATS, fixture)),
      },
    },
  });
  expect(res.ok()).toBeTruthy();
  const stored = (await res.json()).files[0] as { mimeType: string };
  return { name, mimeType: stored.mimeType };
}

test.describe("Library file details format", () => {
  for (const [fixture, label] of [
    ["sample.psd", "PSD"],
    ["sample.cr2", "CR2"],
    ["sample.svg", "SVG"],
    ["sample.eps", "EPS"],
  ] as const) {
    test(`shows ${fixture} as ${label}`, async ({ loggedInPage: page }) => {
      await page.goto("/files");
      const stem = `fmt-${label.toLowerCase()}-${Date.now()}`;
      const { name, mimeType } = await seed(page, fixture, stem);
      // The repro only means something if the server stored a specific type.
      expect(mimeType).not.toBe("application/octet-stream");

      await page.reload();
      await page.getByPlaceholder("Search files...").fill(stem);
      await page.getByText(name, { exact: true }).first().click();

      const row = page
        .getByText("Format", { exact: true })
        .locator("visible=true")
        .first()
        .locator("..");
      await expect(row).toBeVisible({ timeout: 10_000 });
      await expect(row).toHaveText(`Format${label}`);
    });
  }
});
