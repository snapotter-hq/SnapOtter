import { BASE_CONFIG, CONVERSION_PRESETS } from "@snapotter/shared";
import { describe, expect, it } from "vitest";
import { MULTI_FILE_TOOLS } from "@/lib/tool-display-modes";

/**
 * Issue #627: image-to-pdf-group presets (jpg-to-pdf, png-to-pdf, ...) combine
 * every uploaded file into one PDF via their own multi-file route, the same
 * as the base image-to-pdf tool. They must stay off the generic per-file
 * batch path, which never registers them (registerImageToPdfRoute bypasses
 * the createToolRoute/registerToolProcessFn registry the batch route depends
 * on) and 404s with `Tool "<id>" not found` if reached with 2+ files.
 */
describe("MULTI_FILE_TOOLS drift (issue #627)", () => {
  it("includes every conversion preset whose base combines inputs into one request", () => {
    for (const preset of CONVERSION_PRESETS) {
      if (BASE_CONFIG[preset.base].group !== "image-to-pdf") continue;
      expect(
        MULTI_FILE_TOOLS.has(preset.id),
        `preset "${preset.id}" (base "${preset.base}") combines inputs but is missing from MULTI_FILE_TOOLS`,
      ).toBe(true);
    }
  });
});
