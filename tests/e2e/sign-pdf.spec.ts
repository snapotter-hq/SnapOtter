import path from "node:path";
import type { Page } from "@playwright/test";
import { expect, test } from "./helpers";

const PDF_FIXTURE = path.join(
  process.cwd(),
  "tests",
  "fixtures",
  "document",
  "valid",
  "test-3page.pdf",
);

// Reuse an existing small PNG as the uploaded signature image. Any PNG works
// here; the pad's Upload tab accepts image/png,image/jpeg.
const SIGNATURE_PNG = path.join(
  process.cwd(),
  "tests",
  "fixtures",
  "image",
  "valid",
  "test-200x150.png",
);

// The PDF dropzone opens a native file chooser on click rather than exposing a
// persistent <input type="file">, so upload through the chooser event (matches
// pdf-to-image.spec.ts / document-mode.spec.ts).
async function uploadPdf(page: Page): Promise<void> {
  const fileChooserPromise = page.waitForEvent("filechooser");
  const uploadButton = page.getByRole("button", { name: /upload from computer/i }).first();
  if (await uploadButton.isVisible({ timeout: 2000 }).catch(() => false)) {
    await uploadButton.click();
  } else {
    await page.locator("[class*='border-dashed']").first().click();
  }
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles(PDF_FIXTURE);
}

// Open the signature pad, upload a PNG on the Upload tab, and place it. The pad
// drops the signature at page center on "Save & place" (no Konva drag needed).
// This whole path is pure client-side until the user clicks Apply & Download.
async function placeUploadedSignature(page: Page): Promise<void> {
  await page.getByRole("button", { name: "+ New" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Upload", exact: true }).click();
  // The hidden file input only mounts once the Upload tab is active. Scope it to
  // the dialog so it never collides with the tool dropzone's chooser.
  await dialog.locator('input[accept="image/png,image/jpeg"]').setInputFiles(SIGNATURE_PNG);
  const save = dialog.getByRole("button", { name: "Save & place" });
  // The image is read via FileReader, so the button enables a tick after upload.
  await expect(save).toBeEnabled();
  await save.click();
  // The pad closes once the signature is placed onto the canvas.
  await expect(dialog).toBeHidden();
}

test.describe("Sign PDF tool", () => {
  test("places a signature on a PDF (interactive flow)", async ({ loggedInPage: page }) => {
    await page.goto("/pdf/sign-pdf");
    await uploadPdf(page);

    // pdf.js renders the uploaded page into the sign canvas.
    await expect(page.getByTestId("sign-pdf-canvas")).toBeVisible({ timeout: 15_000 });

    // Apply is gated on at least one placement, so it starts disabled.
    const apply = page.getByRole("button", { name: /Apply & Download/ });
    await expect(apply).toBeDisabled();

    await placeUploadedSignature(page);

    // A placement now exists -> Apply becomes enabled. addSignature loads the
    // image asynchronously and only then bumps the count, so toBeEnabled
    // auto-retries until the count propagates to the settings panel.
    await expect(apply).toBeEnabled();
  });

  // Stamping calls the Python sidecar (doc_sign, which needs PyMuPDF). The e2e
  // webServer boots the API with the system Python, which has no PyMuPDF here
  // (and PyMuPDF-less CI shards exist too), so the actual stamp + signed-PDF
  // download cannot succeed in those environments. The integration test
  // (tests/integration/sign-pdf.test.ts) already covers stamping where PyMuPDF
  // is present. Gate this on an explicit flag so the default suite never depends
  // on PyMuPDF.
  test("stamps the PDF and offers a signed download", async ({ loggedInPage: page }) => {
    test.skip(
      !process.env.SIGN_PDF_E2E_STAMP,
      "requires PyMuPDF in the API (set SIGN_PDF_E2E_STAMP=1)",
    );

    await page.goto("/pdf/sign-pdf");
    await uploadPdf(page);
    await expect(page.getByTestId("sign-pdf-canvas")).toBeVisible({ timeout: 15_000 });
    await placeUploadedSignature(page);

    await page.getByRole("button", { name: /Apply & Download/ }).click();
    await expect(page.getByRole("link", { name: /Download signed PDF/ })).toBeVisible({
      timeout: 60_000,
    });
  });
});
