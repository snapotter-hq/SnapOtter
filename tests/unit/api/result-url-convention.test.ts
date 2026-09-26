// API responses carry root-relative result URLs ("/api/v1/download/..."),
// whatever BASE_PATH is (#1274). They are persisted with the job, and API
// clients join them onto their own base URL, so baking the deployment path in
// makes them stale after a path change and doubles the prefix for clients.
// The web app resolves them with serverUrl() from apps/web/src/lib/app-url.ts.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const root = new URL("../../../", import.meta.url).pathname;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith(".ts") ? [path] : [];
  });
}

describe("result URL convention", () => {
  // Cookie paths and redirects are browser paths and do carry the prefix;
  // everything under /api/v1/ that goes into a response body must not.
  it("never prefixes /api/v1/ paths with BASE_PATH on the server", () => {
    const offenders = sourceFiles(join(root, "apps/api/src")).flatMap((file) =>
      readFileSync(file, "utf8")
        .split("\n")
        .map((line, index) => ({ line, index }))
        .filter(({ line }) => /BASE_PATH\}\/api\/v1\//.test(line))
        .map(({ index }) => `${relative(root, file)}:${index + 1}`),
    );
    expect(offenders).toEqual([]);
  });
});
