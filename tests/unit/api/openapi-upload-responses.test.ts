/**
 * Routes that read a multipart upload answer a file over the size limit with
 * 413 (#1280, #1341). The API reference has to say so (#1422): in the
 * English spec, in every translated copy (the English spec with translated
 * prose, rebuilt by scripts/i18n; one left behind documents old responses),
 * and in /llms-full.txt, which prints each response's description.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { apiToolPath, SUPPORTED_LOCALES, TOOLS } from "@snapotter/shared";
import Fastify from "fastify";
import { load } from "js-yaml";
import { describe, expect, it, vi } from "vitest";
import { proseFields, setProseField } from "../../../scripts/i18n/adapters/api-spec.mjs";

vi.mock("../../../apps/api/src/config.js", () => ({
  env: { BASE_PATH: "", RATE_LIMIT_PER_MIN: 0 },
}));

import { docsRoutes } from "../../../apps/api/src/routes/docs.js";

const SPEC_DIR = path.resolve(import.meta.dirname, "../../../apps/api/src");
const METHODS = ["get", "post", "put", "patch", "delete"] as const;
const SHARED_413 = { $ref: "#/components/responses/PayloadTooLarge" };

// Routes whose 413 isn't just MAX_UPLOAD_SIZE_MB: OCR caps it at 512 MiB (and
// so do the pipeline and batch routes for OCR input), the library also answers
// 413 for the storage quota, and feature import has its own 20 GiB limit. Each
// documents its own.
const OWN_413 = [
  "POST /api/v1/admin/features/import",
  "POST /api/v1/files/save-result",
  "POST /api/v1/files/upload",
  "POST /api/v1/pipeline/batch",
  "POST /api/v1/pipeline/execute",
  "POST /api/v1/tools/image/ocr",
  "POST /api/v1/tools/pdf/ocr-pdf",
  "POST /api/v1/tools/{section}/{toolId}/batch",
];

// Multipart routes that don't answer 413 yet, so the reference mustn't say
// they do. Drop an entry, and add the 413, with its fix.
const NO_413: Record<string, string> = {
  "POST /api/v1/tools/image/remove-background/effects": "#1660: an over-limit file gets 400",
};

// Catalog tools that make something from settings alone, so take no upload.
const NO_UPLOAD_TOOLS = ["barcode-generate", "html-to-image", "passport-photo", "qr-generate"];

interface Operation {
  requestBody?: { content?: Record<string, unknown> };
  responses?: Record<string, unknown>;
}
interface Spec {
  paths: Record<string, Partial<Record<(typeof METHODS)[number], Operation>>>;
  components?: { responses?: Record<string, { description?: string }> };
  "x-i18n"?: unknown;
}

function readSpec(file: string): Spec {
  return load(readFileSync(path.join(SPEC_DIR, file), "utf8")) as Spec;
}

function multipartOperations(spec: Spec): Array<{ id: string; op: Operation }> {
  const out: Array<{ id: string; op: Operation }> = [];
  for (const [p, methods] of Object.entries(spec.paths)) {
    for (const method of METHODS) {
      const op = methods[method];
      if (op?.requestBody?.content?.["multipart/form-data"]) {
        out.push({ id: `${method.toUpperCase()} ${p}`, op });
      }
    }
  }
  return out;
}

const english = readSpec("openapi.yaml");

describe("upload responses in the API reference (#1422)", () => {
  it("defines the shared over-limit response", () => {
    expect(english.components?.responses?.PayloadTooLarge?.description).toMatch(
      /MAX_UPLOAD_SIZE_MB/,
    );
  });

  it("documents a 413 on every operation that reads a multipart upload", () => {
    const operations = multipartOperations(english);
    expect(operations.length).toBeGreaterThan(250);
    const missing = operations.filter(({ op }) => !op.responses?.["413"]);
    expect(missing.map(({ id }) => id).sort()).toEqual(Object.keys(NO_413).sort());
  });

  it("uses the shared 413 everywhere but the routes with limits of their own", () => {
    const own = multipartOperations(english)
      .filter(({ id }) => !(id in NO_413))
      .filter(({ op }) => !isDeepStrictEqual(op.responses?.["413"], SHARED_413))
      .map(({ id }) => id)
      .sort();
    expect(own).toEqual(OWN_413);
  });

  it("documents every catalog tool's POST as a multipart upload", () => {
    // A tool route documented without its multipart body would slip past the
    // 413 checks above, which only see multipart operations.
    const notUploads = TOOLS.filter((tool) => {
      const op = english.paths[apiToolPath(tool.id)]?.post;
      return !op?.requestBody?.content?.["multipart/form-data"];
    }).map((tool) => tool.id);
    expect(notUploads.sort()).toEqual(NO_UPLOAD_TOOLS);
  });

  it("keeps every translated copy identical to the English spec apart from its prose", () => {
    const expectedFiles = SUPPORTED_LOCALES.filter((l) => l.code !== "en")
      .map((l) => `openapi.${l.code}.yaml`)
      .sort();
    const files = readdirSync(SPEC_DIR)
      .filter((f) => /^openapi\.[A-Za-z-]+\.yaml$/.test(f))
      .sort();
    expect(files).toEqual(expectedFiles);

    const englishProse = proseFields(english);
    for (const file of files) {
      const translated = readSpec(file);
      delete translated["x-i18n"];
      for (const [id, text] of englishProse) setProseField(translated, id, text);
      const drift = Object.keys({ ...english, ...translated }).flatMap((key) => {
        if (key !== "paths") {
          const k = key as keyof Spec;
          return isDeepStrictEqual(translated[k], english[k]) ? [] : [key];
        }
        const paths = new Set([...Object.keys(english.paths), ...Object.keys(translated.paths)]);
        return [...paths].filter((p) => !isDeepStrictEqual(translated.paths[p], english.paths[p]));
      });
      expect(drift, `${file} is behind openapi.yaml; rebuild it`).toEqual([]);
    }
  });

  it("prints a description for every response in /llms-full.txt", async () => {
    const app = Fastify();
    await app.register(docsRoutes);
    const res = await app.inject({ method: "GET", url: "/llms-full.txt" });
    await app.close();
    expect(res.statusCode).toBe(200);

    // "- `413` <dash> <description>", one line per documented response.
    const responseLines = res.body.split("\n").filter((line) => /^- `\d{3}` \S /.test(line));
    expect(responseLines.length).toBeGreaterThan(1000);
    expect(responseLines.filter((line) => /^- `\d{3}` \S\s*$/.test(line))).toEqual([]);

    const resize = res.body.split("### POST /api/v1/tools/image/resize ")[1]?.split("\n### ")[0];
    expect(resize).toMatch(/^- `413` \S .*MAX_UPLOAD_SIZE_MB/m);
  });
});
