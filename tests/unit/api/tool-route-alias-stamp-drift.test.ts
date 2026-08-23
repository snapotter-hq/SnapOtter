/**
 * Drift guard for the pre-enqueue alias stamp (#892).
 *
 * Every hand-written tool route that accepts a clientJobId and enqueues via
 * enqueueToolJob must stamp insertToolJobAlias after its multipart parse,
 * or a cancel landing between parse and enqueue finds no pointer and
 * answers {canceled: false} (the gap #886 closed for factory routes).
 * The behavioral ordering is pinned on one route by the integration suite
 * (single-tool-cancel-http.test.ts); this source scan keeps the next
 * custom route from forgetting the stamp entirely.
 *
 * Routes that read clientJobId without calling enqueueToolJob are out of
 * scope: they either use it as the job id itself (pdf-to-image,
 * svg-to-raster) or only for progress frames (passport-photo), so there is
 * no alias row to stamp.
 *
 * Detection boundary: a route that enqueues around enqueueToolJob (raw
 * getQueue().add() or FlowProducer) evades this scan. No tool route does
 * that today; if one appears, extend the predicate along with it.
 */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const thisDir = dirname(fileURLToPath(import.meta.url));
const TOOLS_DIR = join(thisDir, "../../../apps/api/src/routes/tools");

function toolRouteSources(): Array<{ file: string; source: string }> {
  return readdirSync(TOOLS_DIR)
    .filter((f) => f.endsWith(".ts") && f !== "index.ts")
    .map((file) => ({ file, source: readFileSync(join(TOOLS_DIR, file), "utf8") }));
}

describe("custom tool routes stamp the SSE alias pre-enqueue (#892)", () => {
  const routes = toolRouteSources();
  const inScope = routes.filter(
    ({ source }) => source.includes("clientJobId") && source.includes("enqueueToolJob("),
  );

  it("matches the known in-scope routes (guards the detection itself)", () => {
    // If this detection ever stops matching, the main assertion below goes
    // green on an empty set. These three are known members with distinct
    // shapes (gated AI, ungated AI, docs-pool sync) and only leave the set
    // if they move onto createToolRoute.
    const files = inScope.map((r) => r.file);
    expect(files).toContain("ocr.ts");
    expect(files).toContain("upscale.ts");
    expect(files).toContain("sign-pdf.ts");
  });

  it("every clientJobId-accepting route that enqueues also stamps the alias", () => {
    const missing = inScope
      .filter(({ source }) => !/await insertToolJobAlias\(/.test(source))
      .map((r) => r.file);
    expect(missing).toEqual([]);
  });

  it("stamps before the route's own pre-enqueue work, not just somewhere", () => {
    // Presence alone would pass with the stamp moved back down next to
    // enqueueToolJob, which is exactly the #892 window reopened. Every
    // current in-scope route parses saveMode as its first post-parse step,
    // so the stamp preceding that call is the sweep-wide ordering proxy;
    // the behavioral version is pinned on ocr by the integration suite.
    // The import line never contains "parseSaveModeField(", so indexOf
    // finds the first real call.
    const misplaced = inScope
      .filter(({ source }) => source.includes("parseSaveModeField("))
      .filter(({ source }) => {
        const stamp = source.search(/await insertToolJobAlias\(/);
        return stamp === -1 || stamp > source.indexOf("parseSaveModeField(");
      })
      .map((r) => r.file);
    expect(misplaced).toEqual([]);
  });
});
