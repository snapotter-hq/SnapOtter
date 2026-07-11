// scripts/i18n/adapters/landing-ui.mjs
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_DIR = join(__dirname, "../../../apps/landing/src/i18n");

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (err) {
    if (err && err.code === "ENOENT") return null;
    throw err;
  }
}

/**
 * Build the landing UI catalog adapter.
 * Runtime catalog: `<locale>.json` (flat { key: text }).
 * Sidecar metadata: `<locale>.meta.json` ({ key: { sourceHash, provenance, outputHash, stale } }).
 * @param {{ dir?: string }} [opts]
 */
export function makeLandingUiAdapter({ dir = DEFAULT_DIR } = {}) {
  const enPath = join(dir, "en.json");
  return {
    name: "landing-ui",

    async extract() {
      const en = (await readJson(enPath)) ?? {};
      return Object.entries(en).map(([id, sourceText]) => ({
        id,
        sourceText: String(sourceText),
        kind: "text",
      }));
    },

    async load(locale) {
      const catalog = (await readJson(join(dir, `${locale}.json`))) ?? {};
      const meta = (await readJson(join(dir, `${locale}.meta.json`))) ?? {};
      const out = new Map();
      for (const [id, text] of Object.entries(catalog)) {
        const m = meta[id] ?? {};
        out.set(id, {
          text: String(text),
          sourceHash: m.sourceHash ?? "",
          provenance: m.provenance ?? "machine",
          outputHash: m.outputHash ?? "",
          stale: Boolean(m.stale),
        });
      }
      return out;
    },

    async write(locale, entries) {
      const catalog = {};
      const meta = {};
      // Stable key order for reviewable diffs.
      for (const id of [...entries.keys()].sort()) {
        const e = entries.get(id);
        catalog[id] = e.text;
        meta[id] = {
          sourceHash: e.sourceHash,
          provenance: e.provenance,
          outputHash: e.outputHash,
          stale: Boolean(e.stale),
        };
      }
      await writeFile(join(dir, `${locale}.json`), `${JSON.stringify(catalog, null, 2)}\n`);
      await writeFile(join(dir, `${locale}.meta.json`), `${JSON.stringify(meta, null, 2)}\n`);
    },
  };
}

export const adapter = makeLandingUiAdapter();
