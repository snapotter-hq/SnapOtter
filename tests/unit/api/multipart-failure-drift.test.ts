/**
 * A route that reads multipart must answer a failed read through
 * multipartFailure(), so an over-limit upload gets 413 instead of a
 * hard-coded 400 (#1341). 45 route files spelled a 400 out by hand, two of
 * them with a different error string, so this checks structure (reads
 * multipart, never calls the helper), not one message.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROUTES = join(__dirname, "../../../apps/api/src/routes");

/** Routes that read multipart and answer a failed read another way. */
const HANDLED_ELSEWHERE: Record<string, string> = {
  // Map the error through ocrUploadErrorStatus (lib/ocr-limits.ts), which
  // already answers 413 for an over-limit read and 503 for storage faults.
  "pipeline.ts": "ocrUploadErrorStatus",
  "batch.ts": "ocrUploadErrorStatus",
  "tools/ocr.ts": "ocrUploadErrorStatus",
  "tools/ocr-pdf.ts": "ocrUploadErrorStatus",
  // No catch around the read: the error's own statusCode reaches the error
  // handler, which answers 413 (#1280).
  "files.ts": "error handler",
  "user-files.ts": "error handler",
  "file-preview.ts": "error handler",
};

function routeFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return routeFiles(path);
    return entry.name.endsWith(".ts") ? [path] : [];
  });
}

describe("multipart read failures go through multipartFailure (#1341)", () => {
  const files = routeFiles(ROUTES).map((path) => ({
    name: relative(ROUTES, path),
    src: readFileSync(path, "utf8"),
  }));

  it("every route that reads multipart uses the helper or is listed as handled elsewhere", () => {
    const offenders = files
      .filter(({ src }) => src.includes("request.parts("))
      .filter(({ src }) => !src.includes("multipartFailure("))
      .map(({ name }) => name)
      .filter((name) => !(name in HANDLED_ELSEWHERE));
    expect(offenders).toEqual([]);
  });

  it("the handled-elsewhere list has no stale entries", () => {
    for (const [name, how] of Object.entries(HANDLED_ELSEWHERE)) {
      const file = files.find((f) => f.name === name);
      expect(file, `${name} no longer exists`).toBeDefined();
      expect(file?.src, `${name} no longer reads multipart`).toContain("request.parts(");
      if (how === "ocrUploadErrorStatus") {
        expect(file?.src, `${name} no longer uses ocrUploadErrorStatus`).toContain(
          "ocrUploadErrorStatus(",
        );
      }
    }
  });

  it("no route hard-codes the old multipart parse error", () => {
    const offenders = files
      .filter(({ src }) => src.includes('"Failed to parse multipart request"'))
      .map(({ name }) => name);
    expect(offenders).toEqual([]);
  });
});
