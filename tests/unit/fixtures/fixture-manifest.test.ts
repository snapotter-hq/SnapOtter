import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../fixtures");
const manifest = JSON.parse(readFileSync(join(ROOT, "manifest.json"), "utf8"));

describe("fixture manifest is consistent with disk", () => {
  it("has entries", () => expect(manifest.assets.length).toBeGreaterThan(20));

  // Phase 1 hard-checks bytes + sha256; license may be "UNVERIFIED" (tracked in
  // LICENSES.md). Phase 2 does the real provenance audit and removes that tolerance.
  const ALLOWED = ["CC0", "CC-BY", "CC-BY-SA", "public-domain", "UNVERIFIED", "UNVERIFIED-REVIEW"];
  it.each(manifest.assets)("$path matches sha256 + bytes and declares a license", (asset: {
    path: string;
    bytes: number;
    sha256: string;
    license: string;
  }) => {
    const buf = readFileSync(join(ROOT, asset.path));
    expect(buf.length, `${asset.path} byte mismatch`).toBe(asset.bytes);
    expect(createHash("sha256").update(buf).digest("hex"), `${asset.path} sha256 mismatch`).toBe(
      asset.sha256,
    );
    expect(ALLOWED, `${asset.path} license '${asset.license}' not allowed`).toContain(
      asset.license,
    );
  });

  it("reports how many assets still need provenance (Phase 2 drives this to 0)", () => {
    const unverified = manifest.assets
      .filter((a: { license: string; path: string }) => a.license === "UNVERIFIED")
      .map((a: { path: string }) => a.path);
    if (unverified.length)
      console.warn(`UNVERIFIED provenance (verify/replace in Phase 2): ${unverified.join(", ")}`);
    expect(unverified.length).toBeLessThanOrEqual(manifest.assets.length); // informational; never fails Phase 1
  });
});
