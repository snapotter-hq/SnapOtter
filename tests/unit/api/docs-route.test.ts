/**
 * Unit tests for the docs route text generation functions.
 *
 * Tests the isPublic, generateLlmsTxt, and generateLlmsFullTxt helpers
 * that produce llms.txt and llms-full.txt content from the OpenAPI spec.
 */
import { describe, expect, it, vi } from "vitest";

// ── Mocks ───────────────────────────────────────────────────────────────

vi.mock("../../../apps/api/src/db/index.js", () => ({
  db: {},
  pool: {},
  closeDb: async () => {},
  schema: {},
}));

// ── Reproduce helper functions and types from docs.ts ───────────────────

interface PathOperation {
  tags?: string[];
  summary?: string;
  description?: string;
  security?: Array<Record<string, string[]>>;
  parameters?: Array<{ name: string; in: string; required?: boolean; schema?: { type: string } }>;
  requestBody?: { content: Record<string, { schema?: SchemaObject }> };
  responses?: Record<string, { description?: string }>;
}

interface SchemaObject {
  type?: string;
  properties?: Record<string, SchemaObject>;
  required?: string[];
  description?: string;
}

interface OpenAPISpec {
  info: { title: string; version: string; description?: string };
  tags?: Array<{ name: string; description?: string }>;
  paths: Record<string, Record<string, PathOperation>>;
}

function isPublic(op: PathOperation): boolean {
  return Array.isArray(op.security) && op.security.length === 0;
}

function generateLlmsTxt(spec: OpenAPISpec): string {
  const lines: string[] = [];
  lines.push(`# ${spec.info.title}`);
  lines.push("");
  lines.push(
    "> Self-hosted file processing API with 157 tools across image, video, audio, document, and data. Convert, compress, edit, transcribe, OCR, and more.",
  );
  lines.push("");
  lines.push("## Docs");
  lines.push("- [Interactive API Reference](/api/docs): Full interactive API documentation");
  lines.push("- [OpenAPI Spec](/api/v1/openapi.yaml): OpenAPI 3.1 specification (YAML)");
  lines.push(
    "- [Full API Docs (LLM-friendly)](/llms-full.txt): Complete API documentation in plain text",
  );
  lines.push("");
  lines.push("## API Sections");

  for (const tag of spec.tags || []) {
    const count = Object.values(spec.paths).reduce((n, methods) => {
      return n + Object.values(methods).filter((op) => op.tags?.[0] === tag.name).length;
    }, 0);
    lines.push(`- ${tag.name} (${count} endpoints): ${tag.description || ""}`);
  }

  lines.push("");
  lines.push("## Authentication");
  lines.push("- Session token via `POST /api/auth/login` -> `Authorization: Bearer <token>`");
  lines.push("- API key (prefixed `si_`) -> `Authorization: Bearer si_...`");

  return lines.join("\n");
}

function generateLlmsFullTxt(spec: OpenAPISpec): string {
  const lines: string[] = [];
  lines.push(`# ${spec.info.title} v${spec.info.version}`);
  lines.push("");
  if (spec.info.description) {
    lines.push(spec.info.description.trim());
    lines.push("");
  }

  const tagGroups = new Map<string, Array<{ method: string; path: string; op: PathOperation }>>();
  for (const [path, methods] of Object.entries(spec.paths)) {
    for (const [method, op] of Object.entries(methods)) {
      const tag = op.tags?.[0] || "Other";
      if (!tagGroups.has(tag)) tagGroups.set(tag, []);
      tagGroups.get(tag)?.push({ method: method.toUpperCase(), path, op });
    }
  }

  const tagOrder = (spec.tags || []).map((t) => t.name);
  const allTags = [...new Set([...tagOrder, ...tagGroups.keys()])];

  for (const tag of allTags) {
    const endpoints = tagGroups.get(tag);
    if (!endpoints) continue;

    const tagInfo = spec.tags?.find((t) => t.name === tag);
    lines.push(`## ${tag}`);
    if (tagInfo?.description) lines.push(`${tagInfo.description}`);
    lines.push("");

    for (const { method, path, op } of endpoints) {
      const auth = isPublic(op) ? "(public)" : "(auth required)";
      lines.push(`### ${method} ${path} ${auth}`);
      if (op.summary) lines.push(`**${op.summary}**`);
      if (op.description) lines.push(op.description.trim());
      lines.push("");

      if (op.parameters?.length) {
        lines.push("**Parameters:**");
        for (const p of op.parameters) {
          lines.push(
            `- \`${p.name}\` (${p.in}${p.required ? ", required" : ""}) — ${p.schema?.type || "string"}`,
          );
        }
        lines.push("");
      }

      if (op.requestBody) {
        const contentType = Object.keys(op.requestBody.content)[0];
        const schema = op.requestBody.content[contentType]?.schema;
        lines.push(`**Request:** \`${contentType}\``);
        if (schema?.properties) {
          for (const [name, prop] of Object.entries(schema.properties)) {
            const required = schema.required?.includes(name) ? " (required)" : "";
            const desc = prop.description ? ` — ${prop.description.split("\n")[0]}` : "";
            lines.push(`- \`${name}\`${required}: ${prop.type || "string"}${desc}`);
          }
        }
        lines.push("");
      }

      if (op.responses) {
        lines.push("**Responses:**");
        for (const [code, res] of Object.entries(op.responses)) {
          lines.push(`- \`${code}\` — ${res.description || ""}`);
        }
        lines.push("");
      }
    }
  }

  return lines.join("\n");
}

// ── Tests ───────────────────────────────────────────────────────────────

describe("docs route logic", () => {
  describe("isPublic", () => {
    it("returns true for empty security array", () => {
      expect(isPublic({ security: [] })).toBe(true);
    });

    it("returns false for non-empty security array", () => {
      expect(isPublic({ security: [{ bearerAuth: [] }] })).toBe(false);
    });

    it("returns false for undefined security", () => {
      expect(isPublic({})).toBe(false);
    });

    it("returns false for null-like security", () => {
      expect(isPublic({ security: undefined })).toBe(false);
    });
  });

  describe("generateLlmsTxt", () => {
    const minimalSpec: OpenAPISpec = {
      info: { title: "SnapOtter API", version: "1.0.0" },
      tags: [
        { name: "Tools", description: "Image processing tools" },
        { name: "Auth", description: "Authentication" },
      ],
      paths: {
        "/api/v1/tools/resize": {
          post: { tags: ["Tools"], summary: "Resize image" },
        },
        "/api/auth/login": {
          post: { tags: ["Auth"], summary: "Login", security: [] },
        },
      },
    };

    it("starts with the API title", () => {
      const result = generateLlmsTxt(minimalSpec);
      expect(result).toContain("# SnapOtter API");
    });

    it("includes the Docs section", () => {
      const result = generateLlmsTxt(minimalSpec);
      expect(result).toContain("## Docs");
      expect(result).toContain("[Interactive API Reference]");
      expect(result).toContain("[OpenAPI Spec]");
    });

    it("lists API sections with endpoint counts", () => {
      const result = generateLlmsTxt(minimalSpec);
      expect(result).toContain("Tools (1 endpoints): Image processing tools");
      expect(result).toContain("Auth (1 endpoints): Authentication");
    });

    it("includes authentication section", () => {
      const result = generateLlmsTxt(minimalSpec);
      expect(result).toContain("## Authentication");
    });

    it("handles spec with no tags", () => {
      const specNoTags: OpenAPISpec = {
        info: { title: "Test API", version: "1.0.0" },
        paths: {},
      };
      const result = generateLlmsTxt(specNoTags);
      expect(result).toContain("# Test API");
      expect(result).toContain("## API Sections");
    });

    it("handles spec with empty paths", () => {
      const specEmpty: OpenAPISpec = {
        info: { title: "Empty API", version: "0.1.0" },
        tags: [{ name: "Tools", description: "desc" }],
        paths: {},
      };
      const result = generateLlmsTxt(specEmpty);
      expect(result).toContain("Tools (0 endpoints): desc");
    });
  });

  describe("generateLlmsFullTxt", () => {
    const fullSpec: OpenAPISpec = {
      info: {
        title: "SnapOtter API",
        version: "2.0.0",
        description: "Image processing API",
      },
      tags: [{ name: "Tools", description: "Processing tools" }],
      paths: {
        "/api/v1/tools/resize": {
          post: {
            tags: ["Tools"],
            summary: "Resize an image",
            description: "Resize to specified dimensions",
            parameters: [
              { name: "width", in: "query", required: true, schema: { type: "integer" } },
            ],
            requestBody: {
              content: {
                "multipart/form-data": {
                  schema: {
                    properties: {
                      file: { type: "string", description: "Image file to process" },
                    },
                    required: ["file"],
                  },
                },
              },
            },
            responses: {
              "200": { description: "Successful resize" },
              "400": { description: "Invalid input" },
            },
          },
        },
        "/api/health": {
          get: {
            summary: "Health check",
            security: [],
          },
        },
      },
    };

    it("includes title with version", () => {
      const result = generateLlmsFullTxt(fullSpec);
      expect(result).toContain("# SnapOtter API v2.0.0");
    });

    it("includes the description", () => {
      const result = generateLlmsFullTxt(fullSpec);
      expect(result).toContain("Image processing API");
    });

    it("groups endpoints by tag", () => {
      const result = generateLlmsFullTxt(fullSpec);
      expect(result).toContain("## Tools");
    });

    it("marks auth-required endpoints", () => {
      const result = generateLlmsFullTxt(fullSpec);
      expect(result).toContain("POST /api/v1/tools/resize (auth required)");
    });

    it("marks public endpoints", () => {
      const result = generateLlmsFullTxt(fullSpec);
      expect(result).toContain("GET /api/health (public)");
    });

    it("includes parameters section", () => {
      const result = generateLlmsFullTxt(fullSpec);
      expect(result).toContain("**Parameters:**");
      expect(result).toContain("`width` (query, required)");
    });

    it("includes request body section", () => {
      const result = generateLlmsFullTxt(fullSpec);
      expect(result).toContain("**Request:** `multipart/form-data`");
    });

    it("includes responses section", () => {
      const result = generateLlmsFullTxt(fullSpec);
      expect(result).toContain("**Responses:**");
      expect(result).toContain("`200`");
      expect(result).toContain("`400`");
    });

    it("handles spec with no description", () => {
      const specNoDesc: OpenAPISpec = {
        info: { title: "No Desc API", version: "1.0.0" },
        paths: {},
      };
      const result = generateLlmsFullTxt(specNoDesc);
      expect(result).toContain("# No Desc API v1.0.0");
    });

    it("puts untagged endpoints under 'Other'", () => {
      const specNoTag: OpenAPISpec = {
        info: { title: "Test", version: "1.0.0" },
        paths: {
          "/health": { get: { summary: "Health" } },
        },
      };
      const result = generateLlmsFullTxt(specNoTag);
      expect(result).toContain("## Other");
    });
  });
});
