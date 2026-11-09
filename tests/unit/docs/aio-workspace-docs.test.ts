import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

// #4264: the single-container quick start only mounts /data, but job output
// lives under /tmp/workspace, so it is lost when the container is replaced.
describe("all-in-one install documents where job output lives", () => {
  test("getting-started explains the /tmp/workspace mount for docker run", () => {
    const doc = read("apps/docs/guide/getting-started.md");
    expect(doc).toContain("-v SnapOtter-workspace:/tmp/workspace");
    expect(doc).toMatch(/replac/i);
  });

  test("the volumes table says /data does not hold job output", () => {
    const doc = read("apps/docs/guide/deployment.md");
    expect(doc).toMatch(/\/tmp\/workspace.*job output/i);
  });

  test("DOCKERHUB.md workspace row says job output is lost without a mount", () => {
    expect(read("DOCKERHUB.md")).toMatch(/\/tmp\/workspace.*job output/i);
  });
});
