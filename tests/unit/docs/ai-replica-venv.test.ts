import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The venv lock in packages/ai/src/venv-lock.ts is module state, so it cannot
// hold off AI jobs on a second API replica that shares the data volume. Until
// a cross-replica lease exists, the deployment guide has to tell operators to
// drain the other replicas (#4309).
describe("AI bundle changes across replicas (#4309)", () => {
  it("documents that AI bundle changes need one replica running", () => {
    const deployment = readFileSync(join(process.cwd(), "apps/docs/guide/deployment.md"), "utf8");
    const section = deployment.split("### AI bundle installs with several replicas")[1];
    expect(section).toBeDefined();
    const paragraph = section?.split("\n## ")[0].split("\n### ")[0] ?? "";
    expect(paragraph).toMatch(/stop|scale/i);
    expect(paragraph).toContain("/data/ai/venv");
    expect(paragraph).toMatch(/one replica/i);
  });
});
