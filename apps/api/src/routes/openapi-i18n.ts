// apps/api/src/routes/openapi-i18n.ts
import { existsSync } from "node:fs";
import { join } from "node:path";
import { SUPPORTED_LOCALES } from "@snapotter/shared";

const SUPPORTED_CODES = new Set(SUPPORTED_LOCALES.map((l) => l.code));

/**
 * Resolve which OpenAPI spec file to serve for a requested lang.
 * Returns the locale file only when the code is a supported non-English locale
 * AND that file exists; otherwise the English `openapi.yaml`. This keeps the
 * default (no lang / en) response byte-identical to English, preserving the
 * ASCII-only guarantee that strict YAML parsers depend on.
 */
export function resolveSpecFile(dir: string, lang: string | undefined): string {
  const english = join(dir, "openapi.yaml");
  if (!lang || lang === "en" || !SUPPORTED_CODES.has(lang)) return english;
  const localized = join(dir, `openapi.${lang}.yaml`);
  return existsSync(localized) ? localized : english;
}

interface LlmsTag {
  name: string;
  description?: string;
}
interface LlmsPathOp {
  tags?: string[];
}
interface LlmsSpec {
  info: { title: string };
  tags?: LlmsTag[];
  paths: Record<string, Record<string, LlmsPathOp>>;
}
interface LlmsSection {
  id: string;
  name: string;
}
interface LlmsTool {
  id: string;
  executionHint: "fast" | "long";
}

const CUSTOM_MODES: Record<string, string> = {
  "content-aware-resize": "sync",
  "passport-photo": "two-phase",
};

/**
 * Build a localized llms.txt. Tag/section prose comes from the localized spec;
 * tool name/description come from the already-translated shared i18n `tools`
 * namespace (never re-translated here). Falls back to the tool id when a
 * translation is missing so a partially-translated locale still renders.
 */
export function generateLocaleLlmsTxt({
  spec,
  sections,
  toolsBySection,
  toolStrings,
}: {
  spec: LlmsSpec;
  sections: LlmsSection[];
  toolsBySection: Record<string, LlmsTool[]>;
  toolStrings: Record<string, { name: string; description: string }>;
}): string {
  const lines: string[] = [];
  lines.push(`# ${spec.info.title}`);
  lines.push("");
  lines.push("Base URL: `/api/v1`");
  lines.push("");
  lines.push("## API Sections");
  for (const tag of spec.tags ?? []) {
    const count = Object.values(spec.paths).reduce((n, methods) => {
      return n + Object.values(methods).filter((op) => op.tags?.[0] === tag.name).length;
    }, 0);
    lines.push(`- ${tag.name} (${count} endpoints): ${tag.description ?? ""}`);
  }
  lines.push("");
  lines.push("## Tools");
  for (const section of sections) {
    const tools = toolsBySection[section.id] ?? [];
    lines.push(`- ${section.name} (${tools.length} tools)`);
    for (const tool of tools) {
      const mode = CUSTOM_MODES[tool.id] ?? (tool.executionHint === "long" ? "async" : "sync");
      const strings = toolStrings[tool.id];
      const name = strings?.name ?? tool.id;
      const desc = strings?.description ?? "";
      lines.push(`  - ${name} - ${desc} (${tool.id}, ${mode})`);
    }
  }
  return lines.join("\n");
}
