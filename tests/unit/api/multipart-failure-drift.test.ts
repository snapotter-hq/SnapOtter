/**
 * Every route that reads multipart must answer a failed read through
 * multipartFailure(), so an over-limit upload gets 413 instead of a
 * hard-coded 400 (#1341). 42 route files used to spell the 400 out by hand;
 * this fails if one comes back.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROUTES = join(__dirname, "../../../apps/api/src/routes");

function routeFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return routeFiles(path);
    return entry.name.endsWith(".ts") ? [path] : [];
  });
}

describe("multipart read failures go through multipartFailure (#1341)", () => {
  it("no route hard-codes the multipart parse error", () => {
    const offenders = routeFiles(ROUTES).filter((file) =>
      readFileSync(file, "utf8").includes('"Failed to parse multipart request"'),
    );
    expect(offenders.map((f) => f.slice(ROUTES.length + 1))).toEqual([]);
  });
});
