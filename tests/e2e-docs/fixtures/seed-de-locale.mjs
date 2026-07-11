// tests/e2e-docs/fixtures/seed-de-locale.mjs
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createDocsAdapter } from "../../../scripts/i18n/adapters/docs-md.mjs";

const DOCS = fileURLToPath(new URL("../../../apps/docs", import.meta.url));
// The e2e asserts against these; only they get the [DE] heading prefix. Every
// other file is still written under /de/ (English body) so the seeded German
// tree has no dead internal links and VitePress builds it cleanly.
const PICK = new Set(["index.md", "guide/getting-started.md", "guide/configuration.md"]);

async function main() {
  await rm(join(DOCS, "de"), { recursive: true, force: true });
  const adapter = createDocsAdapter({ root: DOCS });
  const units = await adapter.extract();
  const entries = new Map();
  for (const u of units) {
    // Deterministic pseudo-translation: PICK pages get a [DE] ATX-heading prefix;
    // the rest keep their English body. Masked tokens, anchors, frontmatter, and
    // links stay intact so the write path is exercised exactly as in production.
    const text = PICK.has(u.id)
      ? u.sourceText.replace(/^(#{1,6} )(.+)$/gm, (_m, h, rest) => `${h}[DE] ${rest}`)
      : u.sourceText;
    entries.set(u.id, {
      text,
      sourceHash: "seedhash0001",
      provenance: "machine",
      outputHash: "0".repeat(12),
      stale: false,
    });
  }
  await adapter.write("de", entries);
  console.log(`Seeded ${entries.size} German docs pages (${PICK.size} with [DE] prefix).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
