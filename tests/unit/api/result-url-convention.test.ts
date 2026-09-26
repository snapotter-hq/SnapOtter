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
    return /\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path) ? [path] : [];
  });
}

// Files that read result URLs only from useToolProcessor (already resolved) and
// parse nothing but inspect/analyze responses that carry no URLs.
const WEB_PARSE_ALLOWLIST = new Set([
  "apps/web/src/components/tools/edit-metadata-settings.tsx",
  "apps/web/src/components/tools/image-enhancement-settings.tsx",
  "apps/web/src/components/tools/strip-metadata-settings.tsx",
]);

describe("result URL convention", () => {
  // Cookie paths and redirects are browser paths and do carry the prefix;
  // everything under /api/v1/ that goes into a response body must not.
  it("never prefixes /api/v1/ paths with BASE_PATH on the server", () => {
    const offenders = sourceFiles(join(root, "apps/api/src")).flatMap((file) =>
      readFileSync(file, "utf8")
        .split("\n")
        .map((line, index) => ({ line, index }))
        // Any spelling: `${env.BASE_PATH}/api/v1/`, env.BASE_PATH + "/api/v1/", ...
        .filter(({ line }) => line.includes("BASE_PATH") && line.includes("/api/v1/"))
        .map(({ index }) => `${relative(root, file)}:${index + 1}`),
    );
    expect(offenders).toEqual([]);
  });

  // A web file that parses an API response and reads a result URL out of it
  // must resolve it (resolveServerUrls/serverUrl), or the link 404s only under
  // a subpath. Heuristic by design: a new false positive goes in the allowlist
  // with a reason.
  it("resolves result URLs wherever the web app parses a response", () => {
    const offenders = sourceFiles(join(root, "apps/web/src"))
      .map((file) => relative(root, file))
      .filter((file) => !WEB_PARSE_ALLOWLIST.has(file))
      .filter((file) => {
        const source = readFileSync(join(root, file), "utf8");
        return (
          /\b(downloadUrl|previewUrl|maskUrl|originalUrl|zipUrl|printDownloadUrl)\b/.test(source) &&
          /JSON\.parse\(|\.json\(\)/.test(source) &&
          !/\b(resolveServerUrls|serverUrl)\(/.test(source)
        );
      });
    expect(offenders).toEqual([]);
  });

  it("keeps the web allowlist free of stale entries", () => {
    for (const file of WEB_PARSE_ALLOWLIST) {
      expect(statSync(join(root, file)).isFile(), file).toBe(true);
    }
  });
});
