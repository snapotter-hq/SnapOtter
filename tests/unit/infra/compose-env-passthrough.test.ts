// biome-ignore-all lint/suspicious/noTemplateCurlyInString: Contract assertions intentionally match Compose interpolation syntax.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { load } from "js-yaml";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The published Compose files list every variable explicitly under
 * `environment:` and use no `env_file:`, so a documented variable with no entry
 * there never enters the container: it stays on the host, whatever an admin
 * puts in `.env`. #1091: `.env.example` tells people to set SNAPOTTER_HW_ACCEL
 * and to point FFMPEG_PATH at their own ffmpeg build, and neither reached the
 * container from `docker compose up`.
 *
 * The engine-override block in `.env.example` is the source of the list here,
 * so a binary override documented there has to be passed through by both
 * published files. Every resolver behind these variables treats an empty
 * string as unset (the binary resolvers via `||`, `requestedFamily` in
 * encoders.ts via a falsy check), so `${NAME:-}` keeps the files inert when
 * the admin sets nothing.
 */

const root = resolve(import.meta.dirname, "../../..");

function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

interface ComposeFile {
  services: Record<string, { environment?: string[] }>;
}

function composeEnv(relativePath: string, service: string): Map<string, string> {
  const parsed = load(read(relativePath)) as ComposeFile;
  const entries = parsed.services[service]?.environment ?? [];
  const map = new Map<string, string>();
  for (const entry of entries) {
    const eq = entry.indexOf("=");
    if (eq > 0) map.set(entry.slice(0, eq), entry.slice(eq + 1));
  }
  return map;
}

/** Variable names in the `# Engine binary overrides` block of `.env.example`. */
function documentedEngineOverrides(): string[] {
  const lines = read(".env.example").split(/\r?\n/);
  const start = lines.findIndex((line) => line.startsWith("# Engine binary overrides"));
  expect(start, ".env.example has an engine-override block").toBeGreaterThanOrEqual(0);
  const names: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (line.trim() === "") break;
    const match = line.match(/^#?\s*([A-Z][A-Z0-9_]*)=/);
    if (match) names.push(match[1]);
  }
  return names;
}

const PUBLISHED_COMPOSE_FILES = ["docker/docker-compose.yml", "docker/docker-compose-gpu.yml"];

/**
 * The floor of the derived list. The block may grow, but a reformat of
 * `.env.example` that the parser cannot read must fail here rather than
 * quietly shrink the contract.
 */
const KNOWN_ENGINE_OVERRIDES = [
  "FFMPEG_PATH",
  "FFPROBE_PATH",
  "QPDF_PATH",
  "SOFFICE_PATH",
  "PDFCPU_PATH",
  "SNAPOTTER_HW_ACCEL",
];

describe("published Compose files pass documented engine overrides through", () => {
  const overrides = documentedEngineOverrides();

  it("reads every known override from the engine-override block", () => {
    expect(overrides).toEqual(expect.arrayContaining(KNOWN_ENGINE_OVERRIDES));
  });

  for (const file of PUBLISHED_COMPOSE_FILES) {
    it(`${file} forwards every engine override from the host with an empty default`, () => {
      const env = composeEnv(file, "SnapOtter");
      const missing = overrides.filter((name) => env.get(name) !== `\${${name}:-}`);
      expect(missing, `${file} must carry NAME=\${NAME:-} for each of these`).toEqual([]);
    });
  }
});

/**
 * The empty default above is only inert because the resolvers treat "" as
 * unset. Pin that for every override the Compose files forward, so a resolver
 * that starts honouring "" as a real value cannot turn the default into a
 * broken binary path or an unknown encoder family.
 */
describe("engine resolvers treat an empty override as unset", () => {
  const saved = new Map<string, string | undefined>();

  afterEach(() => {
    for (const [name, value] of saved) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    saved.clear();
    vi.resetModules();
  });

  function setVar(name: string, value: string): void {
    if (!saved.has(name)) saved.set(name, process.env[name]);
    process.env[name] = value;
  }

  function setEmpty(name: string): void {
    setVar(name, "");
  }

  it("media-engine falls back to $PATH lookup for FFMPEG_PATH and FFPROBE_PATH", async () => {
    setEmpty("FFMPEG_PATH");
    setEmpty("FFPROBE_PATH");
    vi.resetModules();
    const { resolveFfmpeg, resolveFfprobe } = await import(
      "../../../packages/media-engine/src/binaries.js"
    );
    expect(resolveFfmpeg()).not.toBe("");
    expect(resolveFfprobe()).not.toBe("");
  });

  it("doc-engine falls back to $PATH lookup for QPDF_PATH, SOFFICE_PATH and PDFCPU_PATH", async () => {
    setEmpty("QPDF_PATH");
    setEmpty("SOFFICE_PATH");
    setEmpty("PDFCPU_PATH");
    vi.resetModules();
    const { resolveQpdf, resolveSoffice, resolvePdfcpu } = await import(
      "../../../packages/doc-engine/src/binaries.js"
    );
    expect(resolveQpdf()).not.toBe("");
    expect(resolveSoffice()).not.toBe("");
    expect(resolvePdfcpu()).not.toBe("");
  });

  it("media-engine reports no requested family for an empty SNAPOTTER_HW_ACCEL", async () => {
    setEmpty("SNAPOTTER_HW_ACCEL");
    vi.resetModules();
    const { hwAccelStatus } = await import("../../../packages/media-engine/src/encoders.js");
    expect(hwAccelStatus().requested).toBeNull();
  });

  /**
   * The other half of the pass-through: a value the admin sets in `.env` has
   * to win over the $PATH lookup. Sentinel paths never spawn anything because
   * the resolvers short-circuit on the override, so this holds on CI shards
   * without the binaries too.
   */
  it("media-engine prefers a set FFMPEG_PATH and FFPROBE_PATH over $PATH", async () => {
    setVar("FFMPEG_PATH", "/nonexistent/sentinel-ffmpeg");
    setVar("FFPROBE_PATH", "/nonexistent/sentinel-ffprobe");
    vi.resetModules();
    const { resolveFfmpeg, resolveFfprobe } = await import(
      "../../../packages/media-engine/src/binaries.js"
    );
    expect(resolveFfmpeg()).toBe("/nonexistent/sentinel-ffmpeg");
    expect(resolveFfprobe()).toBe("/nonexistent/sentinel-ffprobe");
  });

  it("doc-engine prefers a set QPDF_PATH, SOFFICE_PATH and PDFCPU_PATH over $PATH", async () => {
    setVar("QPDF_PATH", "/nonexistent/sentinel-qpdf");
    setVar("SOFFICE_PATH", "/nonexistent/sentinel-soffice");
    setVar("PDFCPU_PATH", "/nonexistent/sentinel-pdfcpu");
    vi.resetModules();
    const { resolveQpdf, resolveSoffice, resolvePdfcpu } = await import(
      "../../../packages/doc-engine/src/binaries.js"
    );
    expect(resolveQpdf()).toBe("/nonexistent/sentinel-qpdf");
    expect(resolveSoffice()).toBe("/nonexistent/sentinel-soffice");
    expect(resolvePdfcpu()).toBe("/nonexistent/sentinel-pdfcpu");
  });

  it("media-engine reports the family a set SNAPOTTER_HW_ACCEL names", async () => {
    setVar("SNAPOTTER_HW_ACCEL", "nvenc");
    vi.resetModules();
    const encoders = await import("../../../packages/media-engine/src/encoders.js");
    // An empty inventory keeps the status call from probing a real ffmpeg.
    encoders.setEncoderInventoryForTests(new Set());
    const status = encoders.hwAccelStatus();
    expect(status.requested).toBe("nvenc");
    expect(status.recognized).toBe(true);
  });
});
