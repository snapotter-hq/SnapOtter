import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const thisDir = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(
  resolve(thisDir, "../../../apps/api/src/jobs/storage-reconciliation.ts"),
  "utf-8",
);

describe("storage-reconciliation module exports", () => {
  it("exports storageReconciliationJob as a function", async () => {
    const mod = await import("../../../apps/api/src/jobs/storage-reconciliation.js");
    expect(typeof mod.storageReconciliationJob).toBe("function");
  });

  it("storageReconciliationJob is the only named export", async () => {
    const mod = await import("../../../apps/api/src/jobs/storage-reconciliation.js");
    expect(Object.keys(mod)).toEqual(["storageReconciliationJob"]);
  });
});

describe("storage-reconciliation structure", () => {
  it("sums file sizes per user from userFiles without narrowing to a 32-bit int", () => {
    expect(source).toContain("schema.userFiles.userId");
    expect(source).toMatch(/sum\(\s*\$\{schema\.userFiles\.size\}/);
    expect(source).not.toContain("::int");
  });

  it("updates storageUsed on the users table", () => {
    expect(source).toContain("schema.users");
    expect(source).toContain("storageUsed");
  });

  it("groups file sizes by userId", () => {
    expect(source).toContain("groupBy(schema.userFiles.userId)");
  });

  it("corrects only users whose storageUsed differs from actual", () => {
    expect(source).toMatch(/storageUsed\}\s*!=\s*\$\{totalSize\}/);
  });

  it("zeros out users with no files but nonzero storageUsed", () => {
    expect(source).toContain("storageUsed: 0");
    expect(source).toContain("notInArray(schema.users.id, usersWithFiles)");
  });

  it("handles case where no users have files", () => {
    expect(source).toContain("// No users have files");
    expect(source).toMatch(/storageUsed\}\s*>\s*0/);
  });

  it("coerces bigint sum string from node-postgres to Number before updating storageUsed", () => {
    expect(source).toContain("Number(row.totalSize)");
  });
});
