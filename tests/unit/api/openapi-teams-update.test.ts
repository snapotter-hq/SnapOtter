/**
 * PUT /api/v1/teams/:id takes a partial update, { name?, storageQuota?,
 * retentionHours? } with at least one present and no other keys (#1906, #2005).
 * The spec is what a client generates its request from, so it has to say so in
 * the English copy and in every translated copy (#2011).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { SUPPORTED_LOCALES } from "@snapotter/shared";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";
import { hash } from "../../../scripts/i18n/lib/hash.mjs";

const SPEC_DIR = path.resolve(import.meta.dirname, "../../../apps/api/src");
const SUMMARY_ID = "paths./api/v1/teams/{id}.put.summary";
const LOCALES = SUPPORTED_LOCALES.map((l) => l.code).filter((code) => code !== "en");

interface Operation {
  summary?: string;
  requestBody?: {
    required?: boolean;
    content?: { "application/json"?: { schema?: Record<string, unknown> } };
  };
  responses?: Record<string, unknown>;
}

function putTeam(file: string): Operation {
  const spec = load(readFileSync(path.join(SPEC_DIR, file), "utf8")) as {
    paths: Record<string, { put?: Operation }>;
  };
  const op = spec.paths["/api/v1/teams/{id}"]?.put;
  if (!op) throw new Error(`${file} has no PUT /api/v1/teams/{id}`);
  return op;
}

const english = putTeam("openapi.yaml");
const bodySchema = english.requestBody?.content?.["application/json"]?.schema ?? {};

describe("PUT /api/v1/teams/{id} in the API reference (#2011)", () => {
  it("no longer calls the operation a rename", () => {
    expect(english.summary).not.toMatch(/rename/i);
  });

  it("does not make name mandatory", () => {
    expect(bodySchema).not.toHaveProperty("required");
  });

  it("declares the three fields the route accepts, the quotas as nullable integers", () => {
    const properties = bodySchema.properties as Record<string, unknown>;
    expect(Object.keys(properties).sort()).toEqual(["name", "retentionHours", "storageQuota"]);
    expect(properties.name).toEqual({ type: "string" });
    for (const key of ["storageQuota", "retentionHours"]) {
      expect(properties[key]).toMatchObject({ type: ["integer", "null"], minimum: 1 });
    }
  });

  // storageQuota is bytes (compared against summed storageUsed), not the MB the
  // env var and settings UI use, and null means "no limit" or "instance
  // default", so a client has to be told which (#2011 review).
  it("says what unit the quotas use and what null does", () => {
    const properties = bodySchema.properties as Record<string, { description?: string }>;
    expect(properties.storageQuota.description).toMatch(/bytes/);
    expect(properties.storageQuota.description).toMatch(/null removes/);
    expect(properties.retentionHours.description).toMatch(/hours/i);
    expect(properties.retentionHours.description).toMatch(/FILE_MAX_AGE_HOURS/);
  });

  it("requires at least one field and rejects unknown keys", () => {
    expect(bodySchema.minProperties).toBe(1);
    expect(bodySchema.additionalProperties).toBe(false);
  });

  it("documents the 400 the route returns for a bad or empty body", () => {
    expect(english.responses?.["400"]).toMatchObject({
      content: {
        "application/json": { schema: { $ref: "#/components/schemas/Error" } },
      },
    });
  });

  // The structure in every locale copy is held equal to English by
  // openapi-upload-responses.test.ts. The summary is the prose that changed: a
  // translation left over from "Rename a team" would still say rename in the
  // locale's own words, and only the pipeline's stamp can tell. The sourceHash
  // says it was translated from the current English; the outputHash says the
  // text next to it is the text that was stamped, so editing the stamp without
  // the summary (or the reverse) fails.
  it.each(LOCALES)("%s summary was translated from the current English summary", (locale) => {
    const spec = load(readFileSync(path.join(SPEC_DIR, `openapi.${locale}.yaml`), "utf8")) as {
      "x-i18n": {
        entries: Record<string, { sourceHash: string; outputHash: string; stale?: boolean }>;
      };
    };
    const stamp = spec["x-i18n"].entries[SUMMARY_ID];
    expect(stamp.sourceHash).toBe(hash(english.summary ?? ""));
    expect(stamp.outputHash).toBe(hash(putTeam(`openapi.${locale}.yaml`).summary ?? ""));
    expect(stamp.stale).toBeUndefined();
  });
});
