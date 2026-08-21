import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const thisDir = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(thisDir, "../../../apps/api/src/jobs/enqueue.ts"), "utf-8");

describe("enqueue module exports", () => {
  it("exports enqueueToolJob as a function", async () => {
    const mod = await import("../../../apps/api/src/jobs/enqueue.js");
    expect(typeof mod.enqueueToolJob).toBe("function");
  });

  it("exports waitForJob as a function", async () => {
    const mod = await import("../../../apps/api/src/jobs/enqueue.js");
    expect(typeof mod.waitForJob).toBe("function");
  });

  it("exports closeQueueEvents as a function", async () => {
    const mod = await import("../../../apps/api/src/jobs/enqueue.js");
    expect(typeof mod.closeQueueEvents).toBe("function");
  });

  it("exports getFlowProducer as a function", async () => {
    const mod = await import("../../../apps/api/src/jobs/enqueue.js");
    expect(typeof mod.getFlowProducer).toBe("function");
  });

  it("exports closeFlowProducer as a function", async () => {
    const mod = await import("../../../apps/api/src/jobs/enqueue.js");
    expect(typeof mod.closeFlowProducer).toBe("function");
  });

  it("does not export computeDeleteAfter (private function)", async () => {
    const mod = await import("../../../apps/api/src/jobs/enqueue.js");
    expect(mod).not.toHaveProperty("computeDeleteAfter");
  });
});

// computeDeleteAfter is a private async function that cannot be imported
// directly. The following tests verify its logic by inspecting the source
// to confirm the correct feature gates, thresholds, and computation.
describe("computeDeleteAfter logic (source verification)", () => {
  it("function is defined as async", () => {
    expect(source).toMatch(/async function computeDeleteAfter\(/);
  });

  it("gates on team_retention_overrides enterprise feature", () => {
    // The gate goes through the shared isEnterpriseFeatureEnabled helper (#868);
    // the regex spans the line break biome inserts on the wrapped call.
    expect(source).toMatch(/isEnterpriseFeatureEnabled\(\s*"team_retention_overrides"/);
  });

  it("returns early when feature is not enabled", () => {
    expect(source).toMatch(/if\s*\(!isTeamRetentionEnabled\)\s*return/);
  });

  it("looks up the user's team from the users table", () => {
    expect(source).toContain("schema.users.team");
    expect(source).toContain("eq(schema.users.id, userId)");
  });

  it("returns early when user has no team", () => {
    expect(source).toMatch(/!userRow\[0\]\.team\)\s*return/);
  });

  it("reads retentionHours from the teams table", () => {
    expect(source).toContain("schema.teams.retentionHours");
    expect(source).toContain("eq(schema.teams.id, userRow[0].team)");
  });

  it("falls back to FILE_MAX_AGE_HOURS when team has no retentionHours", () => {
    expect(source).toContain("env.FILE_MAX_AGE_HOURS");
  });

  it("computes deleteAfter as retentionHours converted to milliseconds from now", () => {
    expect(source).toMatch(/retentionHours\s*\*\s*60\s*\*\s*60\s*\*\s*1000/);
    expect(source).toMatch(/new Date\(Date\.now\(\)\s*\+\s*retentionHours/);
  });

  it("updates the job row with the computed deleteAfter", () => {
    expect(source).toContain("db.update(schema.jobs).set({ deleteAfter })");
    expect(source).toContain("eq(schema.jobs.id, jobId)");
  });

  it("is called fire-and-forget from enqueueToolJob", () => {
    expect(source).toMatch(/void computeDeleteAfter\(data\.jobId, data\.userId\)\.catch/);
  });
});
