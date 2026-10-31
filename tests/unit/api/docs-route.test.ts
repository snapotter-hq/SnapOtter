/**
 * Unit tests for the docs route text generation functions.
 *
 * Tests the isPublic, generateLlmsTxt, and generateLlmsFullTxt helpers
 * that produce llms.txt and llms-full.txt content from the OpenAPI spec.
 */
import { TOOLS } from "@snapotter/shared";
import { describe, expect, it, vi } from "vitest";

// ── Mocks ───────────────────────────────────────────────────────────────

vi.mock("../../../apps/api/src/db/index.js", () => ({
  db: {},
  pool: {},
  closeDb: async () => {},
  schema: {},
}));

import {
  generateLlmsFullTxt,
  generateLlmsTxt,
  isPublic,
  type OpenAPISpec,
} from "../../../apps/api/src/routes/docs.js";

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
        "/api/v1/tools/image/resize": {
          post: { tags: ["Tools"], summary: "Resize image" },
        },
        "/api/auth/login": {
          post: { tags: ["Auth"], summary: "Login", security: [] },
        },
      },
    };

    it("starts with the API title and dynamic catalog tool count", () => {
      const result = generateLlmsTxt(minimalSpec);
      expect(result).toContain("# SnapOtter API");
      expect(result).toContain(`${TOOLS.length} catalog tool routes`);
      expect(result).toContain("Base URL: `/api/v1`");
    });

    it("includes the Docs section", () => {
      const result = generateLlmsTxt(minimalSpec);
      expect(result).toContain("## Docs");
      expect(result).toContain("[Interactive API Reference]");
      expect(result).toContain("[OpenAPI Spec]");
    });

    it("lists API sections with endpoint counts and per-section tool tables", () => {
      const result = generateLlmsTxt(minimalSpec);
      expect(result).toContain("Tools (1 endpoints): Image processing tools");
      expect(result).toContain("Auth (1 endpoints): Authentication");
      expect(result).toContain("## Tools");
      expect(result).toContain("content-aware-resize, sync");
      expect(result).toContain("passport-photo, two-phase");
    });

    it("includes authentication, processing contract, and surrounding APIs sections", () => {
      const result = generateLlmsTxt(minimalSpec);
      expect(result).toContain("## Authentication");
      expect(result).toContain("## Processing Contract");
      expect(result).toContain("## Surrounding APIs");
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
      components: {
        responses: {
          PayloadTooLarge: {
            description: "Upload exceeds configured size limit",
          },
        },
      },
      paths: {
        "/api/v1/tools/image/resize": {
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
              "413": { $ref: "#/components/responses/PayloadTooLarge" },
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
      expect(result).toContain("POST /api/v1/tools/image/resize (auth required)");
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

    it("includes responses section and resolves $ref under components.responses", () => {
      const result = generateLlmsFullTxt(fullSpec);
      expect(result).toContain("**Responses:**");
      expect(result).toContain("`200` — Successful resize");
      expect(result).toContain("`400` — Invalid input");
      expect(result).toContain("`413` — Upload exceeds configured size limit");
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
