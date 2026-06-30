import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const dockerfile = readFileSync(resolve(here, "../../../docker/Dockerfile"), "utf8");

function stageBody(stageName: string): string {
  const lines = dockerfile.split(/\r?\n/);
  const start = lines.findIndex((line) =>
    new RegExp(`^FROM\\s+.*\\s+AS\\s+${stageName}$`).test(line),
  );
  expect(start).toBeGreaterThanOrEqual(0);

  const next = lines.findIndex((line, index) => index > start && /^FROM\s+/.test(line));
  return lines.slice(start, next === -1 ? undefined : next).join("\n");
}

describe("Dockerfile build args", () => {
  it("keeps the Pandoc version default in the production stage", () => {
    const production = stageBody("production");
    const argMatch = production.match(/^ARG PANDOC_VERSION=(.+)$/m);

    expect(argMatch?.[1]).toMatch(/^\d+\.\d+(?:\.\d+)?$/);
    expect(production.indexOf("ARG PANDOC_VERSION=")).toBeLessThan(
      production.indexOf("pandoc-${PANDOC_VERSION}"),
    );
  });

  it("keeps the amd64 CUDA base on the cu126 runtime family", () => {
    const baseLine = dockerfile
      .split(/\r?\n/)
      .find((line) => line.includes(" AS base-linux-amd64"));

    expect(baseLine).toContain("nvidia/cuda:12.6.");
    expect(baseLine).toContain("cudnn-runtime-ubuntu24.04");
    expect(baseLine).not.toContain("nvidia/cuda:12.9.");
  });
});
