import { BASE_CONFIG, COMPRESS_PRESETS, CONVERSION_PRESETS } from "@snapotter/shared";
import { describe, expect, it } from "vitest";
import { SCRUB_PDF_PRODUCER_TOOLS } from "../../../apps/api/src/lib/pdf-producer.js";

// The worker scrubs by the job's own toolId, and a preset's job carries the
// preset id, not its base's. A preset missing from the set ships the engine's
// "GPL Ghostscript" Producer that the base tool hides (#1070 review).
describe("SCRUB_PDF_PRODUCER_TOOLS covers presets of scrubbed bases", () => {
  it("includes every compress preset whose base is scrubbed", () => {
    const missing = COMPRESS_PRESETS.filter(
      (p) => SCRUB_PDF_PRODUCER_TOOLS.has(p.base) && !SCRUB_PDF_PRODUCER_TOOLS.has(p.id),
    ).map((p) => p.id);
    expect(missing).toEqual([]);
    expect(SCRUB_PDF_PRODUCER_TOOLS.has("compress-pdf-to-1mb")).toBe(true);
  });

  it("includes every image-to-pdf conversion preset", () => {
    const missing = CONVERSION_PRESETS.filter(
      (p) => BASE_CONFIG[p.base]?.group === "image-to-pdf" && !SCRUB_PDF_PRODUCER_TOOLS.has(p.id),
    ).map((p) => p.id);
    expect(missing).toEqual([]);
  });
});
