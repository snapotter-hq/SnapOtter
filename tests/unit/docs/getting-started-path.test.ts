import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { load } from "js-yaml";
import { describe, expect, test } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

const guide = read("apps/docs/guide/getting-started.md");
const envSchema = read("apps/api/src/lib/env.ts");

function section(id: string): string {
  const start = guide.search(new RegExp(`^##+ .*\\{#${id}\\}$`, "m"));
  expect(start, `missing heading {#${id}}`).toBeGreaterThan(-1);
  const level = guide.slice(start).match(/^#+/)?.[0].length ?? 2;
  const bodyStart = guide.indexOf("\n", start) + 1;
  const next = guide.slice(bodyStart).search(new RegExp(`^#{2,${level}} `, "m"));
  return next === -1 ? guide.slice(start) : guide.slice(start, bodyStart + next);
}

// #5007: the most-read docs page offered five install paths back to back
// before telling anyone how to sign in or what to do next.
describe("getting-started leads with one install path", () => {
  test("quick start is one command, the login, and a tool", () => {
    const quick = section("quick-start");
    expect(quick.match(/```bash/g)).toHaveLength(1);
    expect(quick).toContain("snapotter/snapotter:latest");
    expect(quick).toContain("`admin` / `admin`");
    expect(quick).toMatch(/open a tool/i);
    expect(quick).not.toContain("--gpus");
    expect(quick).not.toContain("ghcr.io");
  });

  test("every other install method sits under Other Ways to Install", () => {
    const order = [
      "quick-start",
      "gpu-acceleration",
      "other-ways-to-install",
      "single-container-compose",
      "docker-compose",
      "ghcr",
      "build-from-source",
      "what-you-can-do",
    ].map((id) => guide.search(new RegExp(`\\{#${id}\\}$`, "m")));
    expect(order.every((i) => i > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  test("the small-hardware callout links the tuning knobs and names only real settings", () => {
    const quick = section("quick-start");
    const callout = quick.match(/::: tip Running on 4 GB[\s\S]*?\n:::/)?.[0];
    expect(callout).toBeDefined();
    expect(callout).toContain("](/guide/low-resource#tuning-knobs)");
    const vars = [...(callout ?? "").matchAll(/-e ([A-Z][A-Z0-9_]+)=/g)].map((m) => m[1]);
    expect(vars.length).toBeGreaterThan(0);
    for (const name of vars) {
      expect(envSchema, `${name} is not an env var the API reads`).toMatch(
        new RegExp(`^\\s+${name}:`, "m"),
      );
    }
  });

  test("never recommends AI_MAX_WORKERS, which the API does not read", () => {
    expect(envSchema).not.toMatch(/^\s+AI_MAX_WORKERS:/m);
    expect(guide).not.toContain("AI_MAX_WORKERS");
  });

  test("GPU has its own section saying what it speeds up and how to check it", () => {
    const gpu = section("gpu-acceleration");
    expect(gpu).toContain("--gpus all");
    expect(gpu).toMatch(/background removal/i);
    expect(gpu).toMatch(/OCR/);
    expect(gpu).toContain("](/guide/deployment#verify-gpu-acceleration)");
    expect(gpu).toContain("](/guide/docker-tags#benchmarks)");
  });
});

// #4823: a Compose file for the single container, not only the full stack.
describe("single-container Compose example", () => {
  test("is the docker run command as one Compose service", () => {
    const block = section("single-container-compose").match(/```yaml\n([\s\S]*?)\n```/)?.[1];
    expect(block).toBeDefined();
    const doc = load(block ?? "") as {
      services: Record<string, Record<string, unknown>>;
      volumes: Record<string, unknown>;
    };
    const services = Object.values(doc.services);
    expect(services).toHaveLength(1);
    const svc = services[0];
    expect(svc.image).toBe("snapotter/snapotter:latest");
    expect(svc.ports).toEqual(["1349:1349"]);
    expect(svc.volumes).toEqual(
      expect.arrayContaining(["SnapOtter-data:/data", "SnapOtter-workspace:/tmp/workspace"]),
    );
    expect(Object.keys(doc.volumes)).toEqual(["SnapOtter-data", "SnapOtter-workspace"]);
    // Embedded mode: setting either of these would switch it off.
    expect(JSON.stringify(svc.environment ?? [])).not.toMatch(/DATABASE_URL|REDIS_URL/);
  });
});
