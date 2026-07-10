// tests/unit/scripts/i18n/landing-seo.test.ts
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeLandingSeoAdapter } from "../../../../scripts/i18n/adapters/landing-seo.mjs";
import { hash } from "../../../../scripts/i18n/lib/hash.mjs";

let dir: string;

const TOOL_SEO = {
  "jpg-to-png": {
    searchTitle: "JPG to PNG Converter",
    longDescription: "Convert JPG to PNG on your own instance.",
    useCases: ["Convert a JPG file to PNG"],
    features: ["Batch processing"],
    faqs: [{ q: "How do I convert?", a: "Upload then download." }],
  },
};

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

// Tool metadata is provided by shared i18n, never translated here.
const loadToolStrings = async () => ({ "jpg-to-png": { name: "Convert", description: "desc" } });

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "landing-seo-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function make() {
  return makeLandingSeoAdapter({
    dir,
    toolSeo: TOOL_SEO,
    alternatives: ALTERNATIVES,
    loadToolStrings,
  });
}

describe("landing-seo adapter", () => {
  it("extracts prose units with stable indexed ids and never tool name/description", async () => {
    const units = await make().extract();
    const ids = units.map((u) => u.id);
    expect(ids).toContain("seo:jpg-to-png:searchTitle");
    expect(ids).toContain("seo:jpg-to-png:useCases.0");
    expect(ids).toContain("seo:jpg-to-png:faqs.0.q");
    expect(ids).toContain("alt:smallpdf:h1");
    expect(ids).toContain("alt:smallpdf:rows.0.snapotter");
    // Tool name/description are reused from shared i18n, so no unit carries them.
    expect(units.some((u) => u.sourceText === "Convert")).toBe(false);
    expect(units.some((u) => u.sourceText === "desc")).toBe(false);
  });

  it("write then load round-trips StoredEntry with inline _sourceHash", async () => {
    const adapter = make();
    const entries = new Map([
      [
        "seo:jpg-to-png:searchTitle",
        {
          text: "JPG zu PNG Konverter",
          sourceHash: hash("JPG to PNG Converter"),
          provenance: "machine",
          outputHash: hash("JPG zu PNG Konverter"),
          stale: false,
        },
      ],
    ]);
    await adapter.write("de", entries);

    const file = JSON.parse(await readFile(join(dir, "tool-seo.de.json"), "utf8"));
    expect(file["seo:jpg-to-png:searchTitle"].text).toBe("JPG zu PNG Konverter");
    expect(file["seo:jpg-to-png:searchTitle"]._sourceHash).toBe(hash("JPG to PNG Converter"));
    expect(file["seo:jpg-to-png:searchTitle"].provenance).toBe("machine");

    const loaded = await adapter.load("de");
    expect(loaded.get("seo:jpg-to-png:searchTitle")).toEqual({
      text: "JPG zu PNG Konverter",
      sourceHash: hash("JPG to PNG Converter"),
      provenance: "machine",
      outputHash: hash("JPG zu PNG Konverter"),
      stale: false,
    });
  });

  it("routes alt: ids to alternatives.<locale>.json and seo: ids to tool-seo.<locale>.json", async () => {
    const adapter = make();
    await adapter.write(
      "de",
      new Map([
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
      ]),
    );
    const alt = JSON.parse(await readFile(join(dir, "alternatives.de.json"), "utf8"));
    expect(alt["alt:smallpdf:h1"].text).toBe("Die Alternative zu Smallpdf");
    // The seo file should exist but hold no alt entry.
    await expect(readFile(join(dir, "tool-seo.de.json"), "utf8")).resolves.toBe("{}\n");
  });
});
