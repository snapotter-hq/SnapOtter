import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const scripts = [
  "tests/e2e-docker/full-tool-audit.mjs",
  "tests/e2e-docker/playwright-gpu-test.mjs",
];

describe("GPU audit script isolation", () => {
  it.each(scripts)("requires caller-owned credentials and uses repository fixtures: %s", (file) => {
    const source = readFileSync(resolve(file), "utf8");

    expect(source).toContain('requiredEnv("QA_PASSWORD")');
    expect(source).toContain("process.env.QA_IMAGE_FIXTURE");
    expect(source).not.toMatch(/const PASSWORD\s*=\s*["'][^"']+["']/);
    expect(source).not.toMatch(/[A-Z]:\/Users\//);
  });

  it("targets an explicitly named QA container without shell interpolation", () => {
    const source = readFileSync(resolve("tests/e2e-docker/full-tool-audit.mjs"), "utf8");

    expect(source).toContain('requiredEnv("QA_CONTAINER_NAME")');
    expect(source).toContain('spawnSync("docker", ["logs", CONTAINER_NAME]');
    expect(source).not.toContain("execSync(");
  });
});
