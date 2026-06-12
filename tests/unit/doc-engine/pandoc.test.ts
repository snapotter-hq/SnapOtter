import { readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pandocAvailable, runPandoc } from "@snapotter/doc-engine";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe("pandocAvailable", () => {
  it("returns a boolean without throwing", () => {
    expect(typeof pandocAvailable()).toBe("boolean");
  });
});

describe.skipIf(!pandocAvailable())("runPandoc (requires pandoc)", () => {
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "pandoc-test-"));
  });

  afterAll(async () => {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  it("converts a trivial markdown file to html", async () => {
    const mdPath = join(tmpDir, "test.md");
    const htmlPath = join(tmpDir, "test.html");
    await writeFile(mdPath, "# Hello\n\nWorld\n");
    await runPandoc(mdPath, htmlPath, { extraArgs: ["--standalone"] });
    const html = readFileSync(htmlPath, "utf8");
    expect(html).toContain("Hello");
    expect(html).toContain("<");
  }, 30_000);
});
