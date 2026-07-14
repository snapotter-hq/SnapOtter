import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(path: string): string {
  return readFileSync(resolve(root, path), "utf8");
}

function workflowJob(workflow: string, name: string, nextName: string): string {
  const start = workflow.indexOf(`  ${name}:\n`);
  const end = workflow.indexOf(`  ${nextName}:\n`, start + name.length + 3);
  expect(start, `${name} should exist in ci.yml`).toBeGreaterThanOrEqual(0);
  expect(end, `${nextName} should follow ${name} in ci.yml`).toBeGreaterThan(start);
  return workflow.slice(start, end);
}

function expectImageMagickExtraCoders(source: string): void {
  expect(source).toContain("libmagickcore-6.q16-7-extra");
  expect(source).toContain("libmagickcore-6.q16-6-extra");
  expect(source).toContain("No supported ImageMagick EXR coder package found");
  expect(source).toContain("convert -list format");
}

describe("cross-platform image decoder dependencies", () => {
  it("installs EXR-capable ImageMagick coders in unit and integration CI", () => {
    const workflow = read(".github/workflows/ci.yml");
    expectImageMagickExtraCoders(workflowJob(workflow, "test-unit", "test-integration"));
    expectImageMagickExtraCoders(workflowJob(workflow, "test-integration", "test-e2e-smoke"));
  });

  it("installs the same coders in production and test containers", () => {
    expectImageMagickExtraCoders(read("docker/Dockerfile"));
    expectImageMagickExtraCoders(read("docker/Dockerfile.test"));
  });
});
