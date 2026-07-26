// @vitest-environment node
import { globSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

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

/**
 * Declared is not the same as wired. MAX_SPLIT_GRID sat in the schema and in the
 * docs for releases while the split tool used a hardcoded 100, so a reader could
 * set it and nothing happened.
 */
function isRead(name: string): boolean {
  const inApp = new RegExp(`\\b(?:env|config)\\.${name}\\b|process\\.env\\.${name}\\b`);
  return inApp.test(APP_SRC) || new RegExp(`\\$\\{?${name}\\b`).test(SHELL_SRC);
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
      const members = SCHEMA.get(name)?.enum ?? [];
      const shown = [...defaultCell.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
      // A strict enum has exactly one default and it has to be spelled out;
      // "-" or prose in this cell is how the SKIP_MUST_CHANGE_PASSWORD bug read.
      expect(shown).toHaveLength(1);
      expect(members).toContain(shown[0]);
      expect(valueTokens(description).filter((t) => !members.includes(t))).toEqual([]);
    },
  );
});
