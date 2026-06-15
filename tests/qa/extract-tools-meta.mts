// Extracts tool metadata from @snapotter/shared into tools-meta.json so the QA
// harness and discovery shards have routing (/:modality/:toolId), the input-format
// matrix, execution hints, and AI flags without resolving the workspace package at
// Playwright runtime. Run: npx tsx tests/qa/extract-tools-meta.mts
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PYTHON_SIDECAR_TOOLS, TOOLS } from "../../packages/shared/src/constants.js";

const ai = new Set<string>(PYTHON_SIDECAR_TOOLS as readonly string[]);

const meta = TOOLS.map((t) => ({
  id: t.id,
  name: t.name,
  modality: t.modality,
  acceptedInputs: t.acceptedInputs,
  executionHint: t.executionHint,
  isAI: ai.has(t.id),
}));

const outPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "tools-meta.json");
writeFileSync(outPath, `${JSON.stringify(meta, null, 2)}\n`);

const byModality: Record<string, number> = {};
for (const m of meta) byModality[m.modality] = (byModality[m.modality] ?? 0) + 1;
console.log(`wrote ${meta.length} tools to ${outPath}`);
console.log("by modality:", JSON.stringify(byModality));
console.log("AI tools:", meta.filter((m) => m.isAI).length);
