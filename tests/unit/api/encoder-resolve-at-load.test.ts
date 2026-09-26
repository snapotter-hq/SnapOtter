import { readdirSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { setEncoderInventoryForTests } from "../../../packages/media-engine/src/encoders.js";

/**
 * #1270: encoders are resolved when a job builds its command line, never when
 * a module loads. Resolving probes the ffmpeg build and throws for a missing
 * encoder, so a module-level call (a constant arg map built with
 * resolveEncoder, say) would stop the whole API from loading on a lean build,
 * taking down every tool instead of the one that needs the encoder.
 *
 * An empty inventory makes every resolve throw, so importing each module that
 * builds encoder args proves none of them resolves at load.
 */
const API_SRC = join(import.meta.dirname, "../../../apps/api/src");
const TOOL_ROUTES = readdirSync(join(API_SRC, "routes/tools"))
  .filter((f) => f.endsWith(".ts"))
  .map((f) => `routes/tools/${f}`);
const MODULES = [...TOOL_ROUTES, "routes/file-preview.ts", "lib/media-tool.ts"];

afterAll(() => setEncoderInventoryForTests(undefined));

describe("modules that build encoder args (#1270)", () => {
  it("covers every tool route", () => {
    expect(TOOL_ROUTES.length).toBeGreaterThan(100);
  });

  it("do not resolve an encoder at import", async () => {
    setEncoderInventoryForTests(new Set());
    const failures: string[] = [];
    for (const rel of MODULES) {
      try {
        await import(join(API_SRC, rel));
      } catch (err) {
        failures.push(`${rel}: ${(err as Error).message}`);
      }
    }
    expect(failures).toEqual([]);
  }, 120_000);
});
