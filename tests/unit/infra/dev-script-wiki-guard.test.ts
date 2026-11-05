import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * `.local-wiki/` is git-ignored, so on a normal clone the root `dev` script
 * used to print a `cd` error before the app servers had started (#4336). The
 * script is run here with `turbo dev` and the wiki command swapped for
 * stand-ins, so only the guard around the wiki is under test.
 */
const pkg = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../../package.json"), "utf8"));
const devScript: string = pkg.scripts.dev;

function runDev(cwd: string) {
  const script = devScript
    .replace("turbo dev", "true")
    .replace("npm run docs:dev", "echo started > ../wiki-marker");
  return spawnSync("sh", ["-c", `${script}\nwait`], { cwd, encoding: "utf8" });
}

describe("root dev script", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "snapotter-dev-script-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("is quiet and successful when .local-wiki is absent", () => {
    const result = runDev(dir);
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
  });

  it("still starts the wiki when .local-wiki exists", () => {
    mkdirSync(join(dir, ".local-wiki"));
    const result = runDev(dir);
    expect(result.stderr).toBe("");
    expect(readFileSync(join(dir, "wiki-marker"), "utf8").trim()).toBe("started");
  });

  it("keeps wiki:dev as the separate entry point", () => {
    expect(pkg.scripts["wiki:dev"]).toContain(".local-wiki");
  });
});
