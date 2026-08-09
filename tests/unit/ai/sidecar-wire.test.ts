import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

function pythonAvailable(): boolean {
  try {
    execFileSync("python3", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

// The dispatcher's structured-error envelope is what bridge.ts parses into a
// Python traceback context. Guard the PRODUCER end by running the real dispatcher
// through a throwaway failing script and asserting a clean, redacted envelope.
// Runs in CI (ubuntu has python3); skipped only where python3 is genuinely absent.
describe("sidecar dispatcher wire (real python)", () => {
  it.runIf(pythonAvailable())("emits a redacted envelope with clean script frames", () => {
    const script = resolve(here, "../../../packages/ai/python/test_sidecar_wire.py");
    const out = execFileSync("python3", [script], { encoding: "utf8" });
    expect(out).toContain("WIRE OK");
  });
});
