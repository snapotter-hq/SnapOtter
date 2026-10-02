import fs from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";
import { expect, test } from "./helpers";

// ---------------------------------------------------------------------------
// File details format label (issue #1783)
//
// The library types PSD, RAW, SVG and EPS uploads from their bytes (#1784),
// and the details panel showed those MIME subtypes upper-cased as the format:
// VND.ADOBE.PHOTOSHOP, X-CANON-CR2, SVG+XML, X-EPS. It shows the format name
// now, and when the name and the bytes disagree, the bytes win.
// ---------------------------------------------------------------------------

const FORMATS = path.join(process.cwd(), "tests", "fixtures", "image", "formats");

async function authHeaders(page: Page): Promise<Record<string, string>> {
  const token = await page
    .evaluate(() => localStorage.getItem("snapotter-token"))
    .catch(() => null);
  return token ? { authorization: `Bearer ${token}` } : {};
}

/** Upload a fixture into the library as `name`; return its stored type. */
async function seed(page: Page, fixture: string, name: string): Promise<string> {
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
  expect(res.status(), await res.text()).toBe(201);
  return ((await res.json()).files[0] as { mimeType: string }).mimeType;
}

test.describe("Library file details format", () => {
  for (const [fixture, ext, label] of [
    ["sample.psd", "psd", "PSD"],
    ["sample.cr2", "cr2", "CR2"],
    ["sample.svg", "svg", "SVG"],
    ["sample.eps", "eps", "EPS"],
    // WebP bytes saved under a .jpg name: the library typed them as WebP.
    ["sample.webp", "jpg", "WEBP"],
  ] as const) {
    test(`shows ${fixture} named .${ext} as ${label}`, async ({ loggedInPage: page }) => {
      await page.goto("/files");
      const stem = `fmt-${label.toLowerCase()}-${ext}-${Date.now()}`;
      const name = `${stem}.${ext}`;
      const mimeType = await seed(page, fixture, name);
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
