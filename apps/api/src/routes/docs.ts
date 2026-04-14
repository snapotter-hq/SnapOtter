import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import scalarPlugin from "@scalar/fastify-api-reference";
import type { FastifyInstance } from "fastify";
import yaml from "js-yaml";

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
  lines.push(`# ${spec.info.title}`);
  lines.push("");
  lines.push(
    "> Self-hosted image processing API with 30+ tools. Resize, compress, convert, remove backgrounds, upscale, run OCR, and more.",
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
  lines.push("- Session token via `POST /api/auth/login` → `Authorization: Bearer <token>`");
  lines.push("- API key (prefixed `si_`) → `Authorization: Bearer si_...`");

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

export async function docsRoutes(app: FastifyInstance): Promise<void> {
  const specPath = resolve(__dirname, "../openapi.yaml");
  const specContent = readFileSync(specPath, "utf-8");
  const spec = yaml.load(specContent) as OpenAPISpec;

  const llmsTxt = generateLlmsTxt(spec);
  const llmsFullTxt = generateLlmsFullTxt(spec);

  app.get("/llms.txt", async (_request, reply) => {
    reply.type("text/plain; charset=utf-8").send(llmsTxt);
  });

  app.get("/llms-full.txt", async (_request, reply) => {
    reply.type("text/plain; charset=utf-8").send(llmsFullTxt);
  });

  app.get("/api/v1/openapi.yaml", async (_request, reply) => {
    reply.type("text/yaml").send(specContent);
  });

  await app.register(scalarPlugin, {
    routePrefix: "/api/docs",
    configuration: {
      content: specContent,
      theme: "default",
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
        }
      `,
      hideDownloadButton: false,
      hideTestRequestButton: true,
      hiddenClients: true,
    },
  });
}
