// scripts/i18n/adapters/api-spec.mjs
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

const __dirname = dirname(fileURLToPath(import.meta.url));

// The real spec lives next to the API source. Tests pass a `dir` override.
const DEFAULT_DIR = join(__dirname, "../../../apps/api/src");
const HTTP_METHODS = ["get", "post", "put", "patch", "delete", "head", "options"];

// structuredClone is global in Node 22+, used to deep-copy the parsed spec.
const clone = (value) => structuredClone(value);

/**
 * Read and parse the English OpenAPI document.
 * @param {string} dir
 * @returns {any}
 */
function loadEnglishSpec(dir) {
  const raw = readFileSync(join(dir, "openapi.yaml"), "utf8");
  return yaml.load(raw);
}

/**
 * Walk a parsed spec and yield [id, text] for every translatable prose field,
 * in a deterministic order. This is the single source of the id contract used by
 * extract, load, and write.
 * @param {any} spec
 * @returns {Array<[string, string]>}
 */
export function proseFields(spec) {
  const out = [];
  if (typeof spec?.info?.description === "string") {
    out.push(["info.description", spec.info.description]);
  }
  for (const tag of spec?.tags ?? []) {
    if (tag && typeof tag.name === "string" && typeof tag.description === "string") {
      out.push([`tags.${tag.name}.description`, tag.description]);
    }
  }
  for (const [path, methods] of Object.entries(spec?.paths ?? {})) {
    for (const method of HTTP_METHODS) {
      const op = methods?.[method];
      if (!op) continue;
      if (typeof op.summary === "string") {
        out.push([`paths.${path}.${method}.summary`, op.summary]);
      }
      if (typeof op.description === "string") {
        out.push([`paths.${path}.${method}.description`, op.description]);
      }
    }
  }
  return out;
}

/**
 * Set a prose field on a cloned spec by the same id `proseFields` produced.
 * @param {any} spec
 * @param {string} id
 * @param {string} value
 */
export function setProseField(spec, id, value) {
  if (id === "info.description") {
    spec.info.description = value;
    return;
  }
  const tagMatch = id.match(/^tags\.(.+)\.description$/);
  if (tagMatch) {
    const tag = (spec.tags ?? []).find((t) => t?.name === tagMatch[1]);
    if (tag) tag.description = value;
    return;
  }
  // paths.<path>.<method>.<field> where <path> may itself contain dots.
  const pathMatch = id.match(/^paths\.(.+)\.([a-z]+)\.(summary|description)$/);
  if (pathMatch) {
    const [, path, method, field] = pathMatch;
    const op = spec.paths?.[path]?.[method];
    if (op) op[field] = value;
  }
}

/**
 * Build the api-spec adapter.
 * @param {{ dir?: string }} [opts]
 */
export function makeApiSpecAdapter({ dir = DEFAULT_DIR } = {}) {
  return {
    name: "api",
    async extract() {
      const spec = loadEnglishSpec(dir);
      return proseFields(spec).map(([id, sourceText]) => ({ id, sourceText, kind: "text" }));
    },

    async write(locale, entries) {
      const english = loadEnglishSpec(dir);
      const localized = clone(english);
      const stamp = {};

      // Replace only the prose fields that have a translation; anything missing
      // keeps its English text so the document is always complete and valid.
      for (const [id] of proseFields(english)) {
        const entry = entries.get(id);
        if (!entry) continue;
        setProseField(localized, id, entry.text);
        stamp[id] = {
          sourceHash: entry.sourceHash,
          provenance: entry.provenance,
          outputHash: entry.outputHash,
          ...(entry.stale ? { stale: true } : {}),
        };
      }

      localized["x-i18n"] = {
        locale,
        generator: "scripts/i18n/adapters/api-spec.mjs",
        entries: stamp,
      };

      const out = yaml.dump(localized, { lineWidth: -1, noRefs: true });
      writeFileSync(join(dir, `openapi.${locale}.yaml`), out, "utf8");
    },

    async load(locale) {
      const file = join(dir, `openapi.${locale}.yaml`);
      const result = new Map();
      if (!existsSync(file)) return result;
      const spec = yaml.load(readFileSync(file, "utf8"));
      const stamp = spec?.["x-i18n"]?.entries ?? {};
      for (const [id, text] of proseFields(spec)) {
        const meta = stamp[id];
        if (!meta) continue; // untranslated fallback field, not a stored entry
        result.set(id, {
          text,
          sourceHash: meta.sourceHash,
          provenance: meta.provenance === "human" ? "human" : "machine",
          outputHash: meta.outputHash,
          ...(meta.stale ? { stale: true } : {}),
        });
      }
      return result;
    },
  };
}

export const adapter = makeApiSpecAdapter();
