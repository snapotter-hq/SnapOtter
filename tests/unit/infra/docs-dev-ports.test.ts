// @vitest-environment node
import { globSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The build-from-source docs told contributors to open port 1349 for five
 * releases. 1349 is the container port; `pnpm dev` binds Vite to 1351, so
 * everyone following those pages hit a dead port.
 *
 * Nothing checked it, so this reads the two ports back out of the code that
 * sets them and holds the docs to that. Restating 1351 as a literal here would
 * just move the drift one file over, so both numbers are parsed.
 */

const ROOT = path.resolve(__dirname, "../../..");

function devServerPort(): number {
  // apps/web/package.json runs a bare `vite`, so the fallback in the config is
  // the port a contributor actually gets.
  const config = readFileSync(path.join(ROOT, "apps/web/vite.config.ts"), "utf8");
  const match = config.match(/port:\s*Number\(process\.env\.PORT\)\s*\|\|\s*(\d+)/);
  if (!match)
    throw new Error("could not read the Vite dev-server port from apps/web/vite.config.ts");
  return Number(match[1]);
}

function apiPort(): number {
  const pkg = JSON.parse(readFileSync(path.join(ROOT, "apps/api/package.json"), "utf8"));
  const match = String(pkg.scripts.dev).match(/\bPORT=(\d+)/);
  if (!match) throw new Error("could not read PORT from the @snapotter/api dev script");
  return Number(match[1]);
}

const WEB = devServerPort();
const API = apiPort();

function docs(pattern: string): string[] {
  const files = globSync(pattern, { cwd: ROOT }).sort();
  if (files.length === 0) throw new Error(`no docs matched ${pattern}`);
  return files;
}

describe("dev-server ports in the build-from-source docs", () => {
  it("reads both ports out of the code that binds them", () => {
    // If either parse silently returned NaN the per-file cases below would
    // compare NaN to NaN and pass on an empty match set.
    expect(Number.isInteger(WEB)).toBe(true);
    expect(Number.isInteger(API)).toBe(true);
    expect(WEB).not.toBe(API);
  });

  // developer.md documents `pnpm dev` end to end, so every localhost port on the
  // page is a dev-server port. All 21 locales carry the same table.
  it.each(docs("apps/docs/**/guide/developer.md"))("%s names only the two dev ports", (file) => {
    const text = readFileSync(path.join(ROOT, file), "utf8");
    const ports = [...text.matchAll(/localhost:(\d+)/g)].map((m) => Number(m[1]));
    expect(ports.length).toBeGreaterThan(0);
    expect([...new Set(ports)].sort()).toEqual([WEB, API].sort());
  });

  // getting-started.md is mostly about the container, so only the bare-URL
  // bullet pair under "Build from Source" is in scope.
  it.each(docs("apps/docs/**/guide/getting-started.md"))(
    "%s points the build-from-source bullets at the dev ports",
    (file) => {
      const lines = readFileSync(path.join(ROOT, file), "utf8").split("\n");
      const bullets = lines
        .map((line) =>
          line.match(/^[-*]\s.*\[http:\/\/localhost:(\d+)\]\(http:\/\/localhost:\1\)\s*$/),
        )
        .filter((m): m is RegExpMatchArray => m !== null)
        .map((m) => Number(m[1]));
      expect(bullets).toEqual([WEB, API]);
    },
  );

  it.each([...docs("apps/docs/**/guide/contributing.md"), "CONTRIBUTING.md"])(
    "%s comments the `pnpm dev` block with the dev ports",
    (file) => {
      const text = readFileSync(path.join(ROOT, file), "utf8");
      const match = text.match(/web on :(\d+), API on :(\d+)/);
      expect(match).not.toBeNull();
      expect([Number(match?.[1]), Number(match?.[2])]).toEqual([WEB, API]);
    },
  );
});
