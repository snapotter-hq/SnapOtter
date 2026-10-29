// Issue #1657: sidecar failures and fallbacks must reach the bridge as
// {"warning": ...} so LOG_LEVEL=warn keeps them. The Python checks run as a
// stdlib unittest module, the same way install-runtime-python.test.ts runs its suite.

import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { pythonBin } from "../../helpers/python-gate.js";

describe.skipIf(!pythonBin)("sidecar failure log level (#1657)", () => {
  it("emits failures and fallbacks as JSON warnings", { timeout: 60_000 }, () => {
    const res = spawnSync(
      pythonBin as string,
      ["-m", "unittest", "packages.ai.python.tests.test_failure_log_level"],
      { cwd: process.cwd(), encoding: "utf8", timeout: 50_000 },
    );

    const report = `${res.stdout}\n${res.stderr}`.trim().split("\n").slice(-40).join("\n");
    expect(res.error, report).toBeUndefined();
    expect(res.status, report).toBe(0);
    const ran = Number(/^Ran (\d+) tests? in /m.exec(res.stderr)?.[1] ?? 0);
    expect(ran, report).toBeGreaterThan(0);
  });
});
