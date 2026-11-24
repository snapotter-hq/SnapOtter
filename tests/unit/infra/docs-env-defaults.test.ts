// @vitest-environment node
import { globSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BINARY_OVERRIDE_VARS } from "../../../apps/api/src/lib/binary-overrides.js";
import {
  MAX_CPU_UPSCALE_MP,
  MAX_CPU_UPSCALE_OUTPUT_MP,
} from "../../../packages/ai/src/upscaling.js";
import { HW_ACCEL_FAMILIES } from "../../../packages/media-engine/src/encoders.js";

/**
 * The guide's env-var tables are promises, and they drifted quietly. AUTH_ENABLED
 * was documented as defaulting to false when the schema defaults it to true, and
 * SKIP_MUST_CHANGE_PASSWORD was documented as taking "any non-empty value" when
 * it is a two-member enum that kills the process on anything else.
 *
 * So the tables get checked against the three places a default can come from:
 * the Zod schema in apps/api/src/lib/env.ts, the ENV block in docker/Dockerfile,
 * and the shell layer for the handful of vars the entrypoint reads directly.
 */

const ROOT = path.resolve(__dirname, "../../..");
// Both pages carry an env-var table with the same shape. deployment.md kept
// TRUST_PROXY=true in three places after the default moved to a trust list.
const DOCS = ["apps/docs/guide/configuration.md", "apps/docs/guide/deployment.md"];

interface Declared {
  default?: string;
  /** Set when a `.default(...)` exists but its value could not be read. */
  unresolvedDefault?: string;
  enum?: string[];
}

/**
 * Every `NAME: z...` entry in the env schema, with its default and enum members.
 * A default can be a literal or an imported const (TRUST_PROXY holds its own in
 * lib/trust-proxy.ts), so named constants are resolved rather than skipped.
 */
function zodSchema(): Map<string, Declared> {
  const src = readFileSync(path.join(ROOT, "apps/api/src/lib/env.ts"), "utf8");
  const libSrc = globSync("apps/api/src/lib/*.ts", { cwd: ROOT })
    .map((f) => readFileSync(path.join(ROOT, f), "utf8"))
    .join("\n");
  const starts = [...src.matchAll(/^ {4}([A-Z][A-Z0-9_]*):\s*z\b/gm)];
  const out = new Map<string, Declared>();
  starts.forEach((match, i) => {
    const from = match.index ?? 0;
    const to = i + 1 < starts.length ? (starts[i + 1].index ?? src.length) : src.length;
    const chunk = src.slice(from, to);
    const def = chunk.match(/\.default\(\s*("([^"]*)"|[\d_]+|[A-Z][A-Z0-9_]*)\s*\)/);
    const members = chunk.match(/\.enum\(\[([^\]]*)\]\)/);
    let value: string | undefined;
    if (def) {
      if (def[2] !== undefined) value = def[2];
      else if (/^[\d_]+$/.test(def[1])) value = def[1].replace(/_/g, "");
      else value = libSrc.match(new RegExp(`export const ${def[1]} = "([^"]*)"`))?.[1];
    }
    out.set(match[1], {
      default: value,
      unresolvedDefault: def !== null && value === undefined ? def[1] : undefined,
      enum: members ? [...members[1].matchAll(/"([^"]*)"/g)].map((m) => m[1]) : undefined,
    });
  });
  return out;
}

/** Values baked into the shipped image, which override the schema defaults. */
function dockerfileEnv(): Map<string, string> {
  const lines = readFileSync(path.join(ROOT, "docker/Dockerfile"), "utf8").split("\n");
  const out = new Map<string, string>();
  let inEnv = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith("ENV ")) inEnv = true;
    else if (!inEnv) continue;
    // Docker drops comment lines inside a continued instruction, so the ENV
    // block carries on past one. Stopping here hid LOGIN_ATTEMPT_LIMIT=30.
    if (line.startsWith("#")) continue;
    const assign = line.replace(/^ENV\s+/, "").match(/^([A-Z][A-Z0-9_]*)=(.*?)\s*\\?$/);
    if (assign) out.set(assign[1], assign[2].replace(/^["']|["']$/g, ""));
    if (!raw.trimEnd().endsWith("\\")) inEnv = false;
  }
  return out;
}

function readAll(patterns: string[]): string {
  return patterns
    .flatMap((p) => globSync(p, { cwd: ROOT }))
    .map((f) => path.join(ROOT, f))
    .filter((f) => statSync(f).isFile())
    .map((f) => readFileSync(f, "utf8"))
    .join("\n");
}

/** Shell layer: vars the container handles before Node ever sees them. */
const SHELL_SRC = readAll(["docker/entrypoint.sh", "docker/embedded-lib.sh", "docker/s6/**/*"]);

/** Application layer: everywhere a parsed env value can be consumed. */
const APP_SRC = readAll([
  "apps/api/src/**/*.ts",
  "apps/web/src/**/*.ts",
  "apps/web/src/**/*.tsx",
  "packages/*/src/**/*.ts",
]);

/** The AI sidecar reads its own knobs from os.environ. Its tests only set them. */
const PYTHON_SRC = globSync("packages/ai/python/**/*.py", {
  cwd: ROOT,
  exclude: (f) => /(^|\/)tests(\/|$)/.test(f),
})
  .map((f) => readFileSync(path.join(ROOT, f), "utf8"))
  .join("\n");

/**
 * Declared is not the same as wired. MAX_SPLIT_GRID sat in the schema and in the
 * docs for releases while the split tool used a hardcoded 100, so a reader could
 * set it and nothing happened.
 */
function isRead(name: string): boolean {
  // doc-engine reads its binary overrides through resolveBin("QPDF_PATH", ...).
  const inApp = new RegExp(
    `\\b(?:env|config)\\.${name}\\b|process\\.env\\.${name}\\b|resolveBin\\(\\s*"${name}"`,
  );
  return (
    inApp.test(APP_SRC) ||
    new RegExp(`\\$\\{?${name}\\b`).test(SHELL_SRC) ||
    new RegExp(`(?:environ\\.get|environ\\[|getenv|_env_[a-z_]+)\\(?\\s*"${name}"`).test(PYTHON_SRC)
  );
}

interface Row {
  doc: string;
  name: string;
  defaultCell: string;
  description: string;
}

function documentedRows(): Row[] {
  const rows: Row[] = [];
  for (const doc of DOCS) {
    for (const line of readFileSync(path.join(ROOT, doc), "utf8").split("\n")) {
      const match = line.match(/^\|\s*`([A-Z][A-Z0-9_]*)`\s*\|([^|]*)\|(.*)\|\s*$/);
      if (match) {
        rows.push({ doc, name: match[1], defaultCell: match[2], description: match[3] });
      }
    }
  }
  return rows;
}

/** Backticked tokens, minus variable names and anything path- or URL-shaped. */
function valueTokens(cell: string): string[] {
  return [...cell.matchAll(/`([^`]+)`/g)]
    .map((m) => m[1])
    .filter((t) => !/^[A-Z][A-Z0-9_*]*$/.test(t) && !/[/.:]/.test(t));
}

const SCHEMA = zodSchema();
const IMAGE = dockerfileEnv();
const ROWS = documentedRows();

describe("guide env-var tables", () => {
  it("parsed all three sources", () => {
    // Without this, an empty parse would make every case below vacuous.
    expect(SCHEMA.size).toBeGreaterThan(80);
    expect(IMAGE.size).toBeGreaterThan(20);
    expect(ROWS.length).toBeGreaterThan(50);
    expect(SCHEMA.get("AUTH_ENABLED")).toEqual({ default: "true", enum: ["true", "false"] });
    expect(APP_SRC.length).toBeGreaterThan(1_000_000);
  });

  it("resolved every schema default it found", () => {
    // A default this parser cannot read is silently exempt from the row checks
    // below, which is how a documented value could go wrong unnoticed.
    const unresolved = [...SCHEMA.entries()]
      .filter(([, d]) => d.unresolvedDefault)
      .map(([name, d]) => `${name}=${d.unresolvedDefault}`);
    expect(unresolved).toEqual([]);
  });

  it("documents no variable that nothing reads", () => {
    expect(ROWS.filter((r) => !isRead(r.name)).map((r) => r.name)).toEqual([]);
  });

  it.each(ROWS.filter((r) => SCHEMA.get(r.name)?.default))(
    "$doc $name shows a default that some source actually produces",
    ({ name, defaultCell }) => {
      const declared = SCHEMA.get(name)?.default;
      const allowed = new Set([declared, IMAGE.get(name)].filter((v) => v !== undefined));
      const shown = [...defaultCell.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
      // An empty-string default is written "(empty)", which carries no token.
      if (declared === "") {
        expect(shown.filter((t) => !allowed.has(t))).toEqual([]);
        return;
      }
      expect(shown.length).toBeGreaterThan(0);
      expect(shown.filter((t) => !allowed.has(t))).toEqual([]);
    },
  );

  it.each(ROWS.filter((r) => SCHEMA.get(r.name)?.enum))(
    "$doc $name only offers values its enum accepts",
    ({ name, defaultCell, description }) => {
      const declared = SCHEMA.get(name);
      const members = declared?.enum ?? [];
      const shown = [...defaultCell.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
      if (declared?.default === undefined && declared?.unresolvedDefault === undefined) {
        // An optional enum (no .default) has no default to show, and its cell
        // must say so rather than name a member (SNAPOTTER_ANALYTICS_DEFAULT, #4910).
        expect(shown).toEqual([]);
        expect(defaultCell.trim()).toBe("(unset)");
      } else {
        // A strict enum has exactly one default and it has to be spelled out;
        // "-" or prose in this cell is how the SKIP_MUST_CHANGE_PASSWORD bug read.
        expect(shown).toHaveLength(1);
        expect(members).toContain(shown[0]);
      }
      expect(valueTokens(description).filter((t) => !members.includes(t))).toEqual([]);
    },
  );
});

/**
 * The published Compose files forward these six from `.env` (#1091), but the
 * guide never named them, so hardware encoding was undiscoverable without
 * reading `.env.example` in the repo (#1307).
 */
describe("engine overrides", () => {
  const ENGINE_VARS = [...BINARY_OVERRIDE_VARS, "SNAPOTTER_HW_ACCEL"];
  const configRows = ROWS.filter((r) => r.doc === "apps/docs/guide/configuration.md");

  it("configuration.md has a row for each one", () => {
    const documented = new Set(configRows.map((r) => r.name));
    expect(ENGINE_VARS.filter((name) => !documented.has(name))).toEqual([]);
  });

  it("the SNAPOTTER_HW_ACCEL row lists exactly the families it accepts", () => {
    const row = configRows.find((r) => r.name === "SNAPOTTER_HW_ACCEL");
    const offered = valueTokens(row?.description ?? "");
    expect(HW_ACCEL_FAMILIES.length).toBeGreaterThan(0);
    expect(HW_ACCEL_FAMILIES.filter((family) => !offered.includes(family))).toEqual([]);
    expect(offered.filter((token) => !HW_ACCEL_FAMILIES.includes(token))).toEqual([]);
  });

  it("every copy-paste Compose file in deployment.md forwards each one", () => {
    const deployment = readFileSync(path.join(ROOT, "apps/docs/guide/deployment.md"), "utf8");
    // Checked per file: the CPU example alone would satisfy a whole-page search
    // while the NVIDIA one, where SNAPOTTER_HW_ACCEL matters, stayed a no-op.
    const composeFiles = [...deployment.matchAll(/```yaml\n([\s\S]*?)```/g)]
      .map((m) => m[1])
      .filter((block) => block.includes("image: snapotter/snapotter"));
    expect(composeFiles).toHaveLength(2);
    const missing = composeFiles.flatMap((block, i) =>
      // Anchored to a live list item, so a commented-out `# - NAME=...` doesn't count.
      ENGINE_VARS.filter(
        (name) => !new RegExp(`^\\s+- ${name}=\\$\\{${name}:-\\}`, "m").test(block),
      ).map((name) => `compose file ${i + 1}: ${name}`),
    );
    expect(missing).toEqual([]);
  });
});

/**
 * PROCESSING_TIMEOUT_S was documented as the per-request ceiling while only the
 * AI sidecar read it, and the variables that do set job deadlines and the sync
 * window had no row at all (#4300).
 */
describe("job deadlines", () => {
  const configRows = ROWS.filter((r) => r.doc === "apps/docs/guide/configuration.md");

  it("configuration.md documents the variables that bound a job", () => {
    const documented = new Set(configRows.map((r) => r.name));
    const deadlines = ["JOB_TIMEOUT_FAST_S", "JOB_TIMEOUT_LONG_S", "SYNC_WAIT_MS"];
    expect(deadlines.filter((name) => !documented.has(name))).toEqual([]);
  });

  it("PROCESSING_TIMEOUT_S is described as the AI sidecar timeout", () => {
    const row = configRows.find((r) => r.name === "PROCESSING_TIMEOUT_S");
    expect(row?.description).toMatch(/sidecar/i);
    expect(row?.description).not.toMatch(/per request/i);
  });
});

/**
 * packages/ai reads MAX_CPU_UPSCALE_MP straight from process.env, so it has no
 * schema default for the table checks above to compare against. It went
 * undocumented even after #4820 turned an oversized CPU upscale from a refusal
 * into a reduction, so admins had no way to learn the ceiling existed (#5037).
 */
describe("CPU upscale ceiling", () => {
  const row = ROWS.find(
    (r) => r.doc === "apps/docs/guide/configuration.md" && r.name === "MAX_CPU_UPSCALE_MP",
  );

  it("configuration.md documents it with the default the code uses", () => {
    expect(row).toBeDefined();
    const shown = [...(row?.defaultCell ?? "").matchAll(/`([^`]+)`/g)].map((m) => m[1]);
    expect(shown).toEqual([String(MAX_CPU_UPSCALE_MP)]);
  });

  it("states the output multiple the code applies", () => {
    const multiple = MAX_CPU_UPSCALE_OUTPUT_MP / MAX_CPU_UPSCALE_MP;
    expect(row?.description).toMatch(new RegExp(`\\b${multiple} times\\b`));
    expect(row?.description).toContain(`${MAX_CPU_UPSCALE_OUTPUT_MP} MP by default`);
  });
});

/**
 * low-resource.md told readers to set MAX_VIDEO_DURATION_S while Configuration
 * never named it, and SNAPOTTER_LICENSE_KEY had no row anywhere (#5188). A
 * variable in the schema now needs a row on a reference page or a reason here.
 */
const OFF_THE_REFERENCE_PAGES = new Map([
  ["DATA_DIR", "the image sets it to the /data volume; moving it breaks the volume layout"],
  ["LOG_DIR", "the image sets it under /data; follows DATA_DIR"],
  ["SCRATCH_PATH", "internal scratch space, defaults to the OS temp dir"],
  ["DB_STARTUP_TIMEOUT_MS", "boot retry window for a dependency that is not up yet"],
  [
    "SQLITE_MIGRATE_PATH",
    "1.x import; Embedded mode explains the /data/snapotter.db path in prose",
  ],
  ["INSTALL_STALL_MS", "AI bundle installer watchdog"],
  ["INSTALL_MAX_MS", "AI bundle installer watchdog"],
  ["GDPR_EXPORT_TIMEOUT_MS", "internal deadline for the data export job"],
  ["SNAPOTTER_INSTANCE_ID", "for provisioning tools, set before first boot"],
  ["MAX_SPLIT_GRID", "nothing reads it; see the isRead note above"],
]);

describe("schema coverage", () => {
  const referenceDocs = ["configuration", "oidc", "saml", "scim"].map((page) =>
    readFileSync(path.join(ROOT, `apps/docs/guide/${page}.md`), "utf8"),
  );
  const rowNames = new Set(
    referenceDocs.flatMap((doc) =>
      [...doc.matchAll(/^\|\s*`([A-Z][A-Z0-9_]*)`\s*\|/gm)].map((m) => m[1]),
    ),
  );
  const configNames = new Set(
    ROWS.filter((r) => r.doc === "apps/docs/guide/configuration.md").map((r) => r.name),
  );

  it("every schema variable has a reference row or a reason to stay off", () => {
    const missing = [...SCHEMA.keys()].filter(
      (name) => !rowNames.has(name) && !OFF_THE_REFERENCE_PAGES.has(name),
    );
    expect(missing).toEqual([]);
  });

  it("the reasons list names only schema variables that still have no row", () => {
    const stale = [...OFF_THE_REFERENCE_PAGES.keys()].filter(
      (name) => !SCHEMA.has(name) || rowNames.has(name),
    );
    expect(stale).toEqual([]);
  });

  it("configuration.md has rows for the AI sidecar's own knobs", () => {
    // Python-only, so they never show up in the schema check above.
    const sidecar = ["AI_SESSION_IDLE_TIMEOUT", "AI_SESSION_CACHE_BYTES"];
    expect(sidecar.filter((name) => !configNames.has(name))).toEqual([]);
  });
});
