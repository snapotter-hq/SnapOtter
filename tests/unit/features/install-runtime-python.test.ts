// Issue #1563: packages/ai/python/tests/test_install_runtime.py covers the
// Accurate OCR installer (extraction, signed modes, activation, rollback) but
// nothing ran it, so a change that broke installs in the container could merge
// green. The CI runners have python3 but no pytest, and the suite is plain
// unittest over the standard library, so this spec runs it and fails on any
// failing case.

import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { pythonBin } from "../../helpers/python-gate.js";

// The container runs the installer on Python 3.11 (arm64) or 3.12 (amd64).
function pythonVersion(): [number, number] | null {
  if (!pythonBin) return null;
  const res = spawnSync(pythonBin, ["-c", "import sys; print(*sys.version_info[:2])"], {
    encoding: "utf8",
  });
  if (res.status !== 0) return null;
  const [major, minor] = res.stdout.trim().split(" ").map(Number);
  return [major ?? 0, minor ?? 0];
}

const version = pythonVersion();
const supported = version !== null && (version[0] > 3 || (version[0] === 3 && version[1] >= 11));
// A local box with an old python3 may skip; CI must not quietly lose the check.
const required = process.env.CI === "true";

describe.skipIf(!supported && !required)("install_runtime.py unittest suite (#1563)", () => {
  it("passes every installer test", { timeout: 150_000 }, () => {
    expect(supported, `CI needs Python 3.11+ for this suite, found ${version?.join(".")}`).toBe(
      true,
    );
    const res = spawnSync(
      pythonBin as string,
      ["-m", "unittest", "packages.ai.python.tests.test_install_runtime"],
      { cwd: process.cwd(), encoding: "utf8", timeout: 120_000 },
    );

    // unittest reports on stderr; keep the tail so a failure names its test.
    const report = `${res.stdout}\n${res.stderr}`.trim().split("\n").slice(-60).join("\n");
    expect(res.error, report).toBeUndefined();
    expect(res.status, report).toBe(0);
    const ran = Number(/^Ran (\d+) tests? in /m.exec(res.stderr)?.[1] ?? 0);
    expect(ran, report).toBeGreaterThan(0);
  });
});
