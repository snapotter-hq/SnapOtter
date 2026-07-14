import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(join(process.cwd(), "apps/api/src/index.ts"), "utf8");

describe("OCR runtime startup reconciliation", () => {
  it("reconciles pending activation before ordinary startup continues", () => {
    const start = source.indexOf("ensureAiDirs();");
    const end = source.indexOf("function parseTrustProxy", start);
    const startupRecovery = source.slice(start, end);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(startupRecovery).toContain('runOcrRuntimeMaintenance("reconcile"');
    expect(startupRecovery).not.toContain('runOcrRuntimeMaintenance("gc"');
    expect(startupRecovery).toMatch(/await\s+initialOcrRuntimeReconciliation/);
    expect(startupRecovery).toContain("installLockFd");
  });
});
