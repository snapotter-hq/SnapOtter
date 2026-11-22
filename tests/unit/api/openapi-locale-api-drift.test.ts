// tests/unit/api/openapi-locale-api-drift.test.ts
import { describe, expect, it } from "vitest";
import { SUPPORTED_LOCALES } from "../../../packages/shared/src/i18n/index.js";
import { makeApiSpecAdapter } from "../../../scripts/i18n/adapters/api-spec.mjs";
import { hash } from "../../../scripts/i18n/lib/hash.mjs";

const LOCALES = SUPPORTED_LOCALES.map((l) => l.code).filter((c) => c !== "en");

// Units that drifted from the English spec and were re-translated in #4948:
// whole operations that were added or rewritten, plus single properties added
// to older operations. pdf-to-markdown is left to its own docs change.
// resize-pdf-pages landed after that refresh and was translated in #5254.
const DRIFTED_OPERATIONS = [
  "/api/v1/tools/image/passport-photo/generate",
  "/api/v1/tools/image/vectorize",
  "/api/v1/tools/image/html-to-image",
  "/api/v1/tools/video/convert-subtitles",
  "/api/v1/tools/files/base64",
  "/api/v1/tools/files/proportion-calculator",
  "/api/v1/tools/pdf/resize-pdf-pages",
];
const DRIFTED_UNITS = [
  "ptr:/paths/~1api~1v1~1features/get/responses/200/content/application~1json/schema/properties/upscaleCpuMaxMp/description",
  "ptr:/paths/~1api~1v1~1roles~1{id}/delete/responses/200/content/application~1json/schema/properties/reassignedUsers/description",
  ...["text-overlay", "heic-to-jpg", "heic-to-png", "heic-to-avif", "heic-to-pdf"].map(
    (tool) =>
      `ptr:/paths/~1api~1v1~1tools~1image~1${tool}/post/requestBody/content/multipart~1form-data/schema/properties/${tool === "text-overlay" ? "settings" : "file"}/description`,
  ),
  ...["trim-video", "images-to-video"].map(
    (tool) =>
      `ptr:/paths/~1api~1v1~1tools~1video~1${tool}/post/requestBody/content/multipart~1form-data/schema/properties/settings/description`,
  ),
];

const pointerPrefix = (path: string) => `ptr:/paths/${path.replace(/\//g, "~1")}/`;
const isDrifted = (id: string) =>
  DRIFTED_UNITS.includes(id) ||
  DRIFTED_OPERATIONS.some(
    (op) => id.startsWith(`paths.${op}.`) || id.startsWith(pointerPrefix(op)),
  );

describe("translated OpenAPI specs track the current English for the #4948 units", () => {
  const adapter = makeApiSpecAdapter();

  it("matches every listed unit to a unit in the English spec", async () => {
    const ids = new Set((await adapter.extract()).map((u: { id: string }) => u.id));
    for (const id of DRIFTED_UNITS) expect(ids.has(id), id).toBe(true);
    for (const op of DRIFTED_OPERATIONS) {
      expect(
        [...ids].some((id) => id.startsWith(`paths.${op}.`)),
        op,
      ).toBe(true);
    }
  });

  // A missing stamp means the locale shows English; a sourceHash that is not the
  // current English hash means the translation describes an older spec; an
  // outputHash that does not match the text means it was edited by hand after
  // the pipeline wrote it, which the next import reclassifies as human (#5012).
  it.each(LOCALES)("%s stamps each unit with the current English hash", async (locale) => {
    const units = (await adapter.extract()).filter((u: { id: string }) => isDrifted(u.id));
    const stored = await adapter.load(locale);
    const problems: string[] = [];
    for (const unit of units) {
      const entry = stored.get(unit.id);
      if (!entry) problems.push(`${unit.id}: missing`);
      else if (entry.sourceHash !== hash(unit.sourceText)) problems.push(`${unit.id}: stale`);
      else if (entry.outputHash !== hash(entry.text)) problems.push(`${unit.id}: hand-edited`);
      else if (entry.stale) problems.push(`${unit.id}: marked stale`);
    }
    expect(problems).toEqual([]);
    expect(units.length).toBeGreaterThanOrEqual(DRIFTED_UNITS.length + DRIFTED_OPERATIONS.length);
  });
});
