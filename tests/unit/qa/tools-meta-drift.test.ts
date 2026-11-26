import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildToolsMeta } from "../../qa/build-tools-meta.mts";

describe("tools-meta.json", () => {
  it("matches the tools generated from TOOLS[] so the QA harness sees every tool", () => {
    const committed = JSON.parse(
      readFileSync(join(process.cwd(), "tests/qa/tools-meta.json"), "utf8"),
    );

    expect(committed).toEqual(JSON.parse(JSON.stringify(buildToolsMeta())));
  });
});
