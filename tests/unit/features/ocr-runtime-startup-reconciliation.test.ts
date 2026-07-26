import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(join(process.cwd(), "apps/api/src/index.ts"), "utf8");

describe("OCR runtime startup reconciliation", () => {
  it("reconciles pending activation before ordinary startup continues", () => {
    // "Ordinary startup" begins when the Fastify instance is constructed, so
    // that is the honest end of the recovery window. An earlier version of this
    // test sliced up to `function parseTrustProxy`, which sat there only by
    // accident of ordering; extracting that helper to its own module broke the
    // slice and the assertion started failing for a reason unrelated to OCR.
    const start = source.indexOf("ensureAiDirs();");
    const end = source.indexOf("const app = Fastify({", start);
    const startupRecovery = source.slice(start, end);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(startupRecovery).toContain('runOcrRuntimeMaintenance("reconcile"');
    expect(startupRecovery).not.toContain('runOcrRuntimeMaintenance("gc"');
    expect(startupRecovery).toMatch(/await\s+initialOcrRuntimeReconciliation/);
    expect(startupRecovery).toContain("installLockFd");
  });
});
