// tests/unit/scripts/i18n/landing-seo.test.ts
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeLandingSeoAdapter } from "../../../../scripts/i18n/adapters/landing-seo.mjs";
import { hash } from "../../../../scripts/i18n/lib/hash.mjs";

let dir: string;

const ALTERNATIVES = [
  {
    slug: "smallpdf",
    pageTitle: "Alternative to Smallpdf",
    h1: "The alternative to Smallpdf",
    metaDescription: "Self-hosted PDF tools.",
    intro: "Smallpdf is hosted. SnapOtter is self-hosted.",
    breadth: "One stack, five file types.",
    rows: [{ feature: "Deployment", snapotter: "Self-hosted", competitor: "Hosted" }],
    faqs: [{ q: "Is it free?", a: "Yes, AGPLv3." }],
  },
];

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "landing-seo-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function make() {
  return makeLandingSeoAdapter({
    dir,
    alternatives: ALTERNATIVES,
  });
}

describe("landing-seo adapter", () => {
  it("extracts only alternatives prose units with stable indexed ids", async () => {
    const units = await make().extract();
    const ids = units.map((u) => u.id);
    expect(ids).toContain("alt:smallpdf:h1");
    expect(ids).toContain("alt:smallpdf:metaDescription");
    expect(ids).toContain("alt:smallpdf:rows.0.snapotter");
    expect(ids).toContain("alt:smallpdf:faqs.0.q");
    // Tool-detail pages are English-only, so no seo:* units are extracted.
    expect(ids.some((id) => id.startsWith("seo:"))).toBe(false);
  });

  it("write then load round-trips StoredEntry with inline _sourceHash", async () => {
    const adapter = make();
    const entries = new Map([
      [
        "alt:smallpdf:h1",
        {
          text: "Die Alternative zu Smallpdf",
          sourceHash: hash("The alternative to Smallpdf"),
          provenance: "machine",
          outputHash: hash("Die Alternative zu Smallpdf"),
          stale: false,
        },
      ],
    ]);
    await adapter.write("de", entries);

    const file = JSON.parse(await readFile(join(dir, "alternatives.de.json"), "utf8"));
    expect(file["alt:smallpdf:h1"].text).toBe("Die Alternative zu Smallpdf");
    expect(file["alt:smallpdf:h1"]._sourceHash).toBe(hash("The alternative to Smallpdf"));
    expect(file["alt:smallpdf:h1"].provenance).toBe("machine");

    const loaded = await adapter.load("de");
    expect(loaded.get("alt:smallpdf:h1")).toEqual({
      text: "Die Alternative zu Smallpdf",
      sourceHash: hash("The alternative to Smallpdf"),
      provenance: "machine",
      outputHash: hash("Die Alternative zu Smallpdf"),
      stale: false,
    });
  });

  it("writes alt: ids to alternatives.<locale>.json and never a tool-seo file", async () => {
    const adapter = make();
    await adapter.write(
      "de",
      new Map([
        [
          "alt:smallpdf:intro",
          {
            text: "Smallpdf ist gehostet. SnapOtter ist selbst gehostet.",
            sourceHash: hash("Smallpdf is hosted. SnapOtter is self-hosted."),
            provenance: "machine",
            outputHash: hash("Smallpdf ist gehostet. SnapOtter ist selbst gehostet."),
            stale: false,
          },
        ],
      ]),
    );
    const alt = JSON.parse(await readFile(join(dir, "alternatives.de.json"), "utf8"));
    expect(alt["alt:smallpdf:intro"].text).toBe(
      "Smallpdf ist gehostet. SnapOtter ist selbst gehostet.",
    );
    // No tool-seo file is ever written now that tool-detail pages are English-only.
    await expect(readFile(join(dir, "tool-seo.de.json"), "utf8")).rejects.toThrow();
  });
});
