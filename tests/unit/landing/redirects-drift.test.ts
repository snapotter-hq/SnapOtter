import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildRedirects,
  REDIRECTS_PATH,
} from "../../../apps/landing/scripts/generate-redirects.mjs";

/**
 * Drift guard: apps/landing/public/_redirects is generated from the shared
 * TOOLS catalog by scripts/generate-redirects.mjs (runs in the landing
 * prebuild) but is committed, so it silently goes stale whenever a tool is
 * added without regenerating it (that is how remove-gif-background's redirects
 * went missing, PR #573). Adding a tool touches @snapotter/shared and runs this
 * suite, so the drift fails here at PR time instead of shipping.
 */
describe("landing _redirects drift", () => {
  it("committed public/_redirects matches the generator output", () => {
    const committed = readFileSync(REDIRECTS_PATH, "utf8");
    expect(
      committed,
      "apps/landing/public/_redirects is stale. Regenerate it with `pnpm --filter @snapotter/landing prebuild` and commit the file.",
    ).toBe(buildRedirects());
  });
});
