// tests/unit/scripts/i18n/landing-ui.test.ts
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeLandingUiAdapter } from "../../../../scripts/i18n/adapters/landing-ui.mjs";
import { hash } from "../../../../scripts/i18n/lib/hash.mjs";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "landing-ui-"));
  await writeFile(
    join(dir, "en.json"),
    JSON.stringify({ "nav.pricing": "Pricing", "nav.docs": "Docs" }, null, 2),
  );
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("landing-ui adapter", () => {
  it("extracts one text unit per English key", async () => {
    const adapter = makeLandingUiAdapter({ dir });
    const units = await adapter.extract();
    expect(units).toHaveLength(2);
    const byId = new Map(units.map((u) => [u.id, u]));
    expect(byId.get("nav.pricing")).toEqual({
      id: "nav.pricing",
      sourceText: "Pricing",
      kind: "text",
    });
  });

  it("write then load round-trips a StoredEntry with inline hashes", async () => {
    const adapter = makeLandingUiAdapter({ dir });
    const entries = new Map([
      [
        "nav.pricing",
        {
          text: "Preise",
          sourceHash: hash("Pricing"),
          provenance: "machine",
          outputHash: hash("Preise"),
          stale: false,
        },
      ],
    ]);
    await adapter.write("de", entries);

    // The runtime catalog is a flat string map, no metadata leaking into it.
    const catalog = JSON.parse(await readFile(join(dir, "de.json"), "utf8"));
    expect(catalog).toEqual({ "nav.pricing": "Preise" });

    const loaded = await adapter.load("de");
    expect(loaded.get("nav.pricing")).toEqual({
      text: "Preise",
      sourceHash: hash("Pricing"),
      provenance: "machine",
      outputHash: hash("Preise"),
      stale: false,
    });
  });

  it("load returns an empty map for a locale with no catalog yet", async () => {
    const adapter = makeLandingUiAdapter({ dir });
    const loaded = await adapter.load("fr");
    expect(loaded.size).toBe(0);
  });
});
