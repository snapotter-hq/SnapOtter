/**
 * POST /api/v1/files/download streams several library files as one ZIP (#4505).
 * The API reference has to list it (#4890): in the English spec, in every
 * translated copy, and in the Files table of the REST guide.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";
import { SUPPORTED_LOCALES } from "../../../packages/shared/src/i18n/index.js";
import { proseFields } from "../../../scripts/i18n/adapters/api-spec.mjs";
import { hash } from "../../../scripts/i18n/lib/hash.mjs";

const SPEC_DIR = path.resolve(import.meta.dirname, "../../../apps/api/src");
const DOCS_DIR = path.resolve(import.meta.dirname, "../../../apps/docs");
const ROUTE = "/api/v1/files/download";
const SUMMARY_ID = `paths.${ROUTE}.post.summary`;
const LOCALES = SUPPORTED_LOCALES.map((l) => l.code).filter((code) => code !== "en");

interface Media {
  schema?: Record<string, unknown>;
  example?: unknown;
}
interface Operation {
  operationId?: string;
  summary?: string;
  security?: unknown[];
  requestBody?: { required?: boolean; content?: Record<string, Media> };
  responses?: Record<
    string,
    { headers?: Record<string, unknown>; content?: Record<string, Media> }
  >;
}

const englishSpec = () => load(readFileSync(path.join(SPEC_DIR, "openapi.yaml"), "utf8"));
const routeProse = (spec: unknown): [string, string][] =>
  proseFields(spec).filter(
    ([id]: [string, string]) =>
      id.startsWith(`paths.${ROUTE}.`) || id.startsWith("ptr:/paths/~1api~1v1~1files~1download/"),
  );

function bulkDownload(file: string): Operation {
  const spec = load(readFileSync(path.join(SPEC_DIR, file), "utf8")) as {
    paths: Record<string, { post?: Operation }>;
  };
  const op = spec.paths[ROUTE]?.post;
  if (!op) throw new Error(`${file} has no POST ${ROUTE}`);
  return op;
}

const errorBody = (ref: string) => ({
  content: { "application/json": { schema: { $ref: `#/components/schemas/${ref}` } } },
});

describe(`POST ${ROUTE} in the API reference (#4890)`, () => {
  const english = () => bulkDownload("openapi.yaml");

  it("is a Files operation that declares its own security", () => {
    const op = english();
    expect(op.operationId).toBe("bulkDownloadFiles");
    expect(op).toMatchObject({ tags: ["Files"], security: [{ bearerAuth: [] }] });
  });

  it("takes a required body of at least one file id", () => {
    const op = english();
    expect(op.requestBody?.required).toBe(true);
    expect(op.requestBody?.content?.["application/json"]?.schema).toMatchObject({
      type: "object",
      required: ["ids"],
      properties: { ids: { type: "array", minItems: 1, items: { type: "string" } } },
    });
  });

  it("answers a ZIP attachment named files.zip", () => {
    const ok = english().responses?.["200"];
    expect(ok?.content?.["application/zip"]?.schema).toEqual({
      type: "string",
      format: "binary",
    });
    expect(ok?.headers?.["Content-Disposition"]).toMatchObject({
      schema: { type: "string", example: 'attachment; filename="files.zip"' },
    });
  });

  it("documents every error status the route returns", () => {
    const responses = english().responses ?? {};
    expect(responses["400"]).toMatchObject(errorBody("Error"));
    expect(responses["401"]).toMatchObject(errorBody("UnauthorizedError"));
    expect(responses["403"]).toMatchObject(errorBody("ForbiddenError"));
    expect(responses["404"]).toMatchObject(errorBody("Error"));
    expect(responses["429"]).toMatchObject(errorBody("Error"));
  });

  // Structure in every locale copy is held equal to English by
  // openapi-upload-responses.test.ts; this checks every piece of prose was
  // translated from the current English rather than left behind or copied over.
  it.each(LOCALES)("%s prose was translated from the current English", (locale) => {
    const spec = load(readFileSync(path.join(SPEC_DIR, `openapi.${locale}.yaml`), "utf8")) as {
      "x-i18n": {
        entries: Record<string, { sourceHash: string; outputHash: string; stale?: boolean }>;
      };
    };
    const translated = new Map(routeProse(spec));
    const englishProse = routeProse(englishSpec());
    expect(englishProse.length).toBeGreaterThan(0);
    for (const [id, text] of englishProse) {
      const stamp = spec["x-i18n"].entries[id];
      expect(stamp, id).toBeDefined();
      expect(stamp.sourceHash, id).toBe(hash(text));
      expect(stamp.outputHash, id).toBe(hash(translated.get(id) ?? ""));
      expect(stamp.stale, id).toBeUndefined();
    }
    expect(translated.get(SUMMARY_ID)).not.toBe(english().summary);
  });
});

function filesTableRows(relPath: string): string[] {
  const doc = readFileSync(path.join(DOCS_DIR, relPath), "utf8");
  return doc.split("\n").filter((line) => /^\| `[A-Z]+` \| `\/api\/v1\/files[`/]/.test(line));
}

describe(`POST ${ROUTE} in the REST guide (#4890)`, () => {
  const deleteRow = (rows: string[]) =>
    rows.findIndex((row) => row.startsWith("| `DELETE` | `/api/v1/files` |"));
  const downloadRow = (rows: string[]) =>
    rows.findIndex((row) => row.startsWith(`| \`POST\` | \`${ROUTE}\` |`));

  it("lists the route after the bulk delete row in English", () => {
    const rows = filesTableRows("api/rest.md");
    expect(rows[downloadRow(rows)]).toBe(
      `| \`POST\` | \`${ROUTE}\` | Download several files as one ZIP (body: \`{ ids: [...] }\`) |`,
    );
    expect(downloadRow(rows)).toBe(deleteRow(rows) + 1);
  });

  it.each(LOCALES)("%s lists the route after the bulk delete row, translated", (locale) => {
    const rows = filesTableRows(`${locale}/api/rest.md`);
    const english = filesTableRows("api/rest.md");
    expect(deleteRow(rows)).toBeGreaterThanOrEqual(0);
    expect(downloadRow(rows)).toBe(deleteRow(rows) + 1);
    const row = rows[downloadRow(rows)];
    expect(row).toContain("`{ ids: [...] }`");
    expect(row).not.toBe(english[downloadRow(english)]);
  });
});
