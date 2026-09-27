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

const DOWNLOAD_PATH = "/api/v1/download";

// Allowlist form of the rule above, for the result URLs that get persisted:
// in server code, every /api/v1/download must open its own string literal
// and must not be appended to or resolved against anything. The BASE_PATH
// line check misses a prefix held in another variable
// (`${prefix}/api/v1/download/...`), an absolute origin
// (`${env.EXTERNAL_URL}/api/...`, `new URL(path, base)`), concatenation, and
// a prefix that biome wraps onto an earlier line (#1297). Whole-line comments
// are skipped; a trailing comment that names the path is flagged, which is
// loud and cheap to reword. Not caught: the path kept in a constant or helper
// and prefixed at the use site, or array joins; none exist today.
function findUnanchoredDownloadPaths(source: string): number[] {
  const lines = source.split("\n");
  const offenders: number[] = [];
  for (const [index, line] of lines.entries()) {
    if (/^\s*(\/\/|\/\*|\*)/.test(line)) continue;
    let at = line.indexOf(DOWNLOAD_PATH);
    while (at !== -1) {
      const opener = line[at - 1];
      const before = [...lines.slice(0, index), line.slice(0, at - 1)].join("\n").trimEnd();
      if (!["'", '"', "`"].includes(opener) || /(\+=?|\bURL\()$/.test(before)) {
        offenders.push(index + 1);
      }
      at = line.indexOf(DOWNLOAD_PATH, at + 1);
    }
  }
  return offenders;
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

  it("starts every server download URL at the root", () => {
    const offenders = sourceFiles(join(root, "apps/api/src")).flatMap((file) =>
      findUnanchoredDownloadPaths(readFileSync(file, "utf8")).map(
        (line) => `${relative(root, file)}:${line}`,
      ),
    );
    expect(offenders).toEqual([]);
  });

  it.each([
    ["a prefix held in another variable", `const u = \`\${prefix}/api/v1/download/\${id}\`;`],
    ["an absolute origin", `const u = \`\${env.EXTERNAL_URL}/api/v1/download/\${id}\`;`],
    ["concatenation onto a prefix", `const u = prefix + "/api/v1/download/" + id;`],
    [
      "concatenation wrapped onto the next line",
      `const u =\n  prefix +\n  "/api/v1/download/" + id;`,
    ],
    [
      "a template whose prefix biome wrapped",
      `const u = \`\${\n  prefix\n}/api/v1/download/\${id}\`;`,
    ],
    ["compound concatenation", `u += "/api/v1/download/" + id;`],
    ["resolution against a base URL", `const u = new URL(\`/api/v1/download/\${id}\`, base);`],
    ["a prefix before a path split at the slash", `const u = \`\${origin}/api/v1/download\` + id;`],
    ["a trailing comment naming the path", `f(); // see /api/v1/download/<id>`],
  ])("flags %s", (_label, snippet) => {
    expect(findUnanchoredDownloadPaths(snippet)).toHaveLength(1);
  });

  it.each([
    ["a root-relative result URL", `downloadUrl: \`/api/v1/download/\${jobId}/\${name}\`,`],
    ["a route registration", `app.get("/api/v1/download/:jobId/:filename", handler);`],
    ["the public-path entry", `const PUBLIC_PATHS = [\n  "/api/v1/download/",\n];`],
    ["a single-quoted literal", `const u = '/api/v1/download/' + id;`],
    ["a whole-line comment", "  // the legacy download URL /api/v1/download/<id>/... works."],
    ["a doc-comment line", " * GET /api/v1/download/:jobId/:filename"],
  ])("allows %s", (_label, snippet) => {
    expect(findUnanchoredDownloadPaths(snippet)).toEqual([]);
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
