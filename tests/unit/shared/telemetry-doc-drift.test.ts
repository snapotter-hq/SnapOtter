// @vitest-environment node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ANALYTICS_EVENTS } from "@snapotter/shared";
import { describe, expect, it } from "vitest";

// Keep the contributor-facing event dictionary honest: every analytics event in
// ANALYTICS_EVENTS must be documented in TELEMETRY.md as a `code-span`. Adding an
// event without documenting it fails here.
describe("TELEMETRY.md event dictionary", () => {
  const doc = readFileSync(
    fileURLToPath(new URL("../../../TELEMETRY.md", import.meta.url)),
    "utf8",
  );

  it("documents every ANALYTICS_EVENTS value", () => {
    const undocumented = Object.values(ANALYTICS_EVENTS).filter(
      (event) => !doc.includes(`\`${event}\``),
    );
    expect(undocumented).toEqual([]);
  });
});
