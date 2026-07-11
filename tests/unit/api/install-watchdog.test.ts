import { describe, expect, it } from "vitest";
import { evaluateInstallWatchdog } from "../../../apps/api/src/lib/install-watchdog.js";

const STALL = 20 * 60_000; // 20 min
const MAX = 120 * 60_000; // 2 h

describe("evaluateInstallWatchdog", () => {
  it("does not kill an install making steady progress", () => {
    const now = 1_000_000;
    const v = evaluateInstallWatchdog(now, now - 5_000, now - 60_000, STALL, MAX);
    expect(v.kill).toBe(false);
    expect(v.reason).toBeNull();
  });

  it("kills when no progress frame has arrived within the stall budget", () => {
    const now = 1_000_000;
    const v = evaluateInstallWatchdog(now, now - (STALL + 1), now - (STALL + 1), STALL, MAX);
    expect(v.kill).toBe(true);
    expect(v.reason).toContain("no progress");
  });

  it("does not kill exactly at the stall boundary (strictly greater than)", () => {
    const now = 1_000_000;
    const v = evaluateInstallWatchdog(now, now - STALL, now - STALL, STALL, MAX);
    expect(v.kill).toBe(false);
  });

  it("kills when the absolute time ceiling is exceeded even if progress is recent", () => {
    const now = 1_000_000;
    // Progress 1s ago (not stalled) but the install started > MAX ago.
    const v = evaluateInstallWatchdog(now, now - 1_000, now - (MAX + 1), STALL, MAX);
    expect(v.kill).toBe(true);
    expect(v.reason).toContain("time limit");
  });

  it("prefers the absolute-ceiling reason when both conditions hold", () => {
    const now = 1_000_000;
    const v = evaluateInstallWatchdog(now, now - (STALL + 1), now - (MAX + 1), STALL, MAX);
    expect(v.kill).toBe(true);
    expect(v.reason).toContain("time limit");
  });

  it("treats 0 as disabled for each check independently", () => {
    const now = 1_000_000;
    // Stall disabled, max active: a long stall alone must not kill.
    expect(evaluateInstallWatchdog(now, now - 10 * STALL, now - 1_000, 0, MAX).kill).toBe(false);
    // Max disabled, stall active: an old start alone must not kill.
    expect(evaluateInstallWatchdog(now, now - 1_000, now - 10 * MAX, STALL, 0).kill).toBe(false);
    // Both disabled: never kills.
    expect(evaluateInstallWatchdog(now, now - 10 * STALL, now - 10 * MAX, 0, 0).kill).toBe(false);
  });
});
