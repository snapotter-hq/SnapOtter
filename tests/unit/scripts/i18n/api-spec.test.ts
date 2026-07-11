// tests/unit/scripts/i18n/api-spec.test.ts
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import yaml from "js-yaml";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeApiSpecAdapter } from "../../../../scripts/i18n/adapters/api-spec.mjs";
import { hash } from "../../../../scripts/i18n/lib/hash.mjs";

// A tiny OpenAPI 3.1 document exercising every translatable prose family:
// info.description, a tag description, and an op summary + description.
// A schema description and a parameter name are present to prove they are NOT extracted.
const FIXTURE = {
  openapi: "3.1.0",
  info: { title: "Test API", version: "1.0.0", description: "Root prose to translate." },
  tags: [{ name: "Tools", description: "Tag prose to translate." }],
  paths: {
    "/api/v1/tools/image/resize": {
      post: {
        operationId: "resizeImage",
        tags: ["Tools"],
        summary: "Resize",
        description: "Resize an image to specific dimensions.",
        parameters: [{ name: "width", in: "query", schema: { type: "integer" } }],
        responses: { "200": { description: "Processed image (stays English)." } },
      },
    },
  },
  components: {
    schemas: {
      ToolResponse: {
        type: "object",
        properties: { jobId: { type: "string", description: "Schema prose stays English." } },
      },
    },
  },
};

let dir: string;
let specPath: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "api-spec-i18n-"));
  specPath = join(dir, "openapi.yaml");
  writeFileSync(specPath, yaml.dump(FIXTURE, { lineWidth: -1 }), "utf8");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("api-spec adapter extract", () => {
  it("yields exactly the prose fields with stable pointer ids", async () => {
    const adapter = makeApiSpecAdapter({ dir });
    const units = await adapter.extract();
    const byId = new Map(units.map((u) => [u.id, u]));

    expect([...byId.keys()].sort()).toEqual(
      [
        "info.description",
        "paths./api/v1/tools/image/resize.post.description",
        "paths./api/v1/tools/image/resize.post.summary",
        "tags.Tools.description",
      ].sort(),
    );

    expect(byId.get("info.description")?.sourceText).toBe("Root prose to translate.");
    expect(byId.get("tags.Tools.description")?.sourceText).toBe("Tag prose to translate.");
    expect(byId.get("paths./api/v1/tools/image/resize.post.summary")?.sourceText).toBe("Resize");
    expect(byId.get("paths./api/v1/tools/image/resize.post.description")?.sourceText).toBe(
      "Resize an image to specific dimensions.",
    );
  });

  it("does not extract schema, parameter, response, or operationId text", async () => {
    const adapter = makeApiSpecAdapter({ dir });
    const ids = (await adapter.extract()).map((u) => u.id);
    expect(ids.some((id) => id.includes("responses"))).toBe(false);
    expect(ids.some((id) => id.includes("parameters"))).toBe(false);
    expect(ids.some((id) => id.includes("schemas"))).toBe(false);
    expect(ids.some((id) => id.includes("operationId"))).toBe(false);
  });

  it("marks every unit as text kind (spec prose, not markdown structure)", async () => {
    const adapter = makeApiSpecAdapter({ dir });
    for (const unit of await adapter.extract()) {
      expect(unit.kind).toBe("text");
    }
  });
});

describe("api-spec adapter write/load round-trip", () => {
  it("writes a locale spec that is English with only prose fields replaced", async () => {
    const adapter = makeApiSpecAdapter({ dir });
    const entries = new Map([
      [
        "paths./api/v1/tools/image/resize.post.summary",
        {
          text: "Groesse aendern",
          sourceHash: hash("Resize"),
          provenance: "machine" as const,
          outputHash: hash("Groesse aendern"),
        },
      ],
    ]);
    await adapter.write("de", entries);

    // biome-ignore lint/suspicious/noExplicitAny: parsed YAML fixture assertions
    const written = yaml.load(readFileSync(join(dir, "openapi.de.yaml"), "utf8")) as any;
    // Translated prose replaced.
    expect(written.paths["/api/v1/tools/image/resize"].post.summary).toBe("Groesse aendern");
    // Untranslated prose falls back to English (we only supplied one entry).
    expect(written.info.description).toBe("Root prose to translate.");
    // Schemas, parameters, responses, operationId are byte-for-byte English.
    expect(written.components.schemas.ToolResponse.properties.jobId.description).toBe(
      "Schema prose stays English.",
    );
    expect(written.paths["/api/v1/tools/image/resize"].post.parameters[0].name).toBe("width");
    expect(written.paths["/api/v1/tools/image/resize"].post.responses["200"].description).toBe(
      "Processed image (stays English).",
    );
    expect(written.paths["/api/v1/tools/image/resize"].post.operationId).toBe("resizeImage");
  });

  it("stamps an x-i18n map with the source and output hashes", async () => {
    const adapter = makeApiSpecAdapter({ dir });
    const entry = {
      text: "Groesse aendern",
      sourceHash: hash("Resize"),
      provenance: "machine" as const,
      outputHash: hash("Groesse aendern"),
    };
    await adapter.write("de", new Map([["paths./api/v1/tools/image/resize.post.summary", entry]]));

    // biome-ignore lint/suspicious/noExplicitAny: parsed YAML fixture assertions
    const written = yaml.load(readFileSync(join(dir, "openapi.de.yaml"), "utf8")) as any;
    expect(written["x-i18n"].locale).toBe("de");
    const stamped = written["x-i18n"].entries["paths./api/v1/tools/image/resize.post.summary"];
    expect(stamped.sourceHash).toBe(hash("Resize"));
    expect(stamped.outputHash).toBe(hash("Groesse aendern"));
    expect(stamped.provenance).toBe("machine");
  });

  it("load() reconstructs the same StoredEntries write() persisted", async () => {
    const adapter = makeApiSpecAdapter({ dir });
    const entries = new Map([
      [
        "tags.Tools.description",
        {
          text: "Werkzeuge",
          sourceHash: hash("Tag prose to translate."),
          provenance: "human" as const,
          outputHash: hash("Werkzeuge"),
          stale: true,
        },
      ],
    ]);
    await adapter.write("de", entries);

    const loaded = await adapter.load("de");
    const got = loaded.get("tags.Tools.description");
    expect(got?.text).toBe("Werkzeuge");
    expect(got?.sourceHash).toBe(hash("Tag prose to translate."));
    expect(got?.provenance).toBe("human");
    expect(got?.outputHash).toBe(hash("Werkzeuge"));
    expect(got?.stale).toBe(true);
  });

  it("load() returns an empty Map when the locale spec is absent", async () => {
    const adapter = makeApiSpecAdapter({ dir });
    const loaded = await adapter.load("fr");
    expect(loaded.size).toBe(0);
  });
});
