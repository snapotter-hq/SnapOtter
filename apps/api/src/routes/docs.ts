import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import scalarPlugin, { type FastifyApiReferenceOptions } from "@scalar/fastify-api-reference";
import {
  loadTranslations,
  SECTIONS,
  SUPPORTED_LOCALES,
  TOOLS,
  toolSection,
} from "@snapotter/shared";
import type { FastifyInstance } from "fastify";
import yaml from "js-yaml";
import { generateLocaleLlmsTxt, resolveSpecFile } from "./openapi-i18n.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

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
  const customModes: Record<string, string> = {
    ocr: "sync-json",
    "content-aware-resize": "sync",
    "passport-photo": "two-phase",
  };
  lines.push(`# ${spec.info.title}`);
  lines.push("");
  lines.push(
    "> Self-hosted file processing API with 241 catalog tool routes across image, video, audio, document, and file workflows. Convert, compress, edit, transcribe, OCR, and more.",
  );
  lines.push("");
  lines.push("Base URL: `/api/v1`");
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
  lines.push("## Tools");
  for (const section of SECTIONS) {
    const tools = TOOLS.filter((tool) => toolSection(tool) === section.id);
    lines.push(`- ${section.name} (${tools.length} tools)`);
    for (const tool of tools) {
      const mode = customModes[tool.id] ?? (tool.executionHint === "long" ? "async" : "sync");
      lines.push(`  - ${tool.name} - ${tool.description} (${tool.id}, ${mode})`);
    }
  }

  lines.push("");
  lines.push("## Authentication");
  lines.push("- Session token via `POST /api/auth/login` -> `Authorization: Bearer <token>`");
  lines.push("- API key (prefixed `si_`) -> `Authorization: Bearer si_...`");
  lines.push(
    "- MFA login challenges return `requiresMfa` and must be completed through `/api/auth/mfa/complete`.",
  );
  lines.push("");
  lines.push("## Processing Contract");
  lines.push(
    "- Tool requests use `multipart/form-data` with `file`, optional JSON `settings`, optional `clientJobId`, and optional `fileId`.",
  );
  lines.push(
    "- Fast tools usually return `200` with `jobId`, `downloadUrl`, `originalSize`, and `processedSize`.",
  );
  lines.push(
    "- Any queued tool can return `202` with `jobId` and `async: true` when it is long-running or exceeds the synchronous wait window.",
  );
  lines.push(
    '- Progress streams from `GET /api/v1/jobs/:jobId/progress` as SSE frames with `type: "single"` or `type: "batch"`.',
  );
  lines.push(
    "- Missing AI bundles return `501` with code `FEATURE_NOT_INSTALLED`, feature id, feature name, and estimated size.",
  );
  lines.push("");
  lines.push("## Surrounding APIs");
  lines.push("- Auth: local login, OIDC, SAML, MFA, user administration, sessions.");
  lines.push(
    "- Files: upload, library versions, downloads, thumbnails, file previews, URL import.",
  );
  lines.push(
    "- Workflows: batch routes, pipeline execute/save/list/delete, job cancel and progress.",
  );
  lines.push(
    "- Admin: health, readiness, metrics, log level, support bundle, usage, backup status, feature bundles.",
  );
  lines.push(
    "- Enterprise: audit export, config import/export, IP allowlist, legal hold, SCIM, SIEM, webhooks, GDPR lifecycle, upgrade checks.",
  );

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

  // Group paths by tag
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

/**
 * Read the translated `tools` namespace ({ [toolId]: { name, description } })
 * for a locale from the shared i18n package. Returns {} on any failure so a
 * missing or partial locale never breaks the llms endpoint. `loadTranslations`
 * already falls back to English internally, so a code with no locale module
 * still yields the English tool strings rather than throwing.
 */
async function loadLocaleToolStrings(
  code: string,
): Promise<Record<string, { name: string; description: string }>> {
  try {
    const dict = await loadTranslations(code);
    // The `tools` namespace also carries non-tool sub-keys (e.g. status/label
    // strings) whose shape is wider than { name, description }; the llms
    // generator only reads name/description and ignores the rest, so narrow at
    // this boundary through unknown.
    return (dict?.tools ?? {}) as unknown as Record<string, { name: string; description: string }>;
  } catch {
    return {};
  }
}

export async function docsRoutes(app: FastifyInstance): Promise<void> {
  const specPath = resolve(__dirname, "../openapi.yaml");
  const specContent = readFileSync(specPath, "utf-8");
  const spec = yaml.load(specContent) as OpenAPISpec;
  const specDir = dirname(specPath); // apps/api/src

  const llmsTxt = generateLlmsTxt(spec);
  const llmsFullTxt = generateLlmsFullTxt(spec);

  app.get("/llms.txt", async (_request, reply) => {
    reply.type("text/plain; charset=utf-8").send(llmsTxt);
  });

  app.get("/llms-full.txt", async (_request, reply) => {
    reply.type("text/plain; charset=utf-8").send(llmsFullTxt);
  });

  app.get<{ Querystring: { lang?: string } }>("/api/v1/openapi.yaml", async (request, reply) => {
    const file = resolveSpecFile(specDir, request.query.lang);
    // English default is byte-identical to the file read at startup, preserving
    // the ASCII-only guarantee; localized files are UTF-8 and only served with ?lang.
    const body = file === specPath ? specContent : readFileSync(file, "utf-8");
    reply.type("text/yaml; charset=utf-8").send(body);
  });

  // Localized llms.txt for every supported non-English locale. Tag/section prose
  // comes from the localized spec (English fallback when absent); tool name and
  // description reuse the app's translated `tools` namespace. English keeps the
  // richer /llms.txt above; these locale variants are a lean, LLM-friendly index.
  const toolsBySection = SECTIONS.map((section) => ({
    section,
    tools: TOOLS.filter((tool) => toolSection(tool) === section.id),
  }));

  for (const localeInfo of SUPPORTED_LOCALES) {
    if (localeInfo.code === "en") continue;
    const code = localeInfo.code;
    app.get(`/llms.${code}.txt`, async (_request, reply) => {
      const file = resolveSpecFile(specDir, code);
      const localeSpec =
        file === specPath ? spec : (yaml.load(readFileSync(file, "utf-8")) as OpenAPISpec);
      const toolStrings = await loadLocaleToolStrings(code);
      const body = generateLocaleLlmsTxt({
        spec: localeSpec,
        sections: SECTIONS.map((s) => ({ id: s.id, name: s.name })),
        toolsBySection: Object.fromEntries(
          toolsBySection.map(({ section, tools }) => [
            section.id,
            tools.map((t) => ({ id: t.id, executionHint: t.executionHint })),
          ]),
        ),
        toolStrings,
      });
      reply.type("text/plain; charset=utf-8").send(body);
    });
  }

  // Scalar's "Ask AI" (Agent Scalar), "Generate MCP", "Open API Client", and
  // the Configure/Share/Deploy toolbar are all Scalar cloud features: they
  // upload or link the OpenAPI document to scalar.com, which the docs CSP
  // blocks by design (self-hosted docs make no external calls). Hide them
  // instead of shipping dead UI. `agent` is a source-level key the plugin's
  // configuration type doesn't list yet, hence the widened type.
  const configuration: NonNullable<FastifyApiReferenceOptions["configuration"]> & {
    agent?: { disabled?: boolean };
  } = {
    content: specContent,
    pageTitle: "SnapOtter API Reference",
    agent: { disabled: true },
    mcp: { disabled: true },
    hideClientButton: true,
    showDeveloperTools: "never",
    theme: "default",
    // Scalar's default typography loads Inter/JetBrains Mono from
    // fonts.scalar.com at page load. Disable it and pin both font variables
    // to local system stacks so the docs page makes no third-party requests
    // (the docs CSP font-src is 'self' data: accordingly).
    withDefaultFonts: false,
    customCss: `
        :root {
          --scalar-color-1: #09090b;
          --scalar-color-2: #3f3f46;
          --scalar-color-3: #71717a;
          --scalar-color-accent: #2563eb;
          --scalar-background-1: #ffffff;
          --scalar-background-2: #f4f4f5;
          --scalar-background-3: #e4e4e7;
          --scalar-border-color: #e4e4e7;
          --scalar-font: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          --scalar-font-code: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
        }
        /* Hide the "Powered by Scalar" sidebar footer link. Scalar exposes no
           config flag for it (unlike the cloud buttons disabled above). */
        a[href^="https://www.scalar.com"],
        a[href^="https://scalar.com"] {
          display: none !important;
        }
      `,
    hideDownloadButton: false,
    hideTestRequestButton: true,
    hiddenClients: true,
  };

  // i18n scope: the OpenAPI spec CONTENT is localized (served via
  // /api/v1/openapi.yaml?lang=<code> and per-locale /llms.<code>.txt above).
  // The Scalar interactive UI chrome (nav, auth panel, buttons) is NOT
  // localized: @scalar/fastify-api-reference exposes no locale option and bakes
  // its content at registration, so the shell stays English by design. This is
  // a documented limitation, not a gap to fix here. See the web-surfaces i18n
  // spec, "API reference (Scalar), scoped".
  await app.register(scalarPlugin, {
    routePrefix: "/api/docs",
    configuration,
  });
}
