// Extracts tool metadata from @snapotter/shared into tools-meta.json so the QA
// harness and discovery shards have routing (the /:section/:toolId page route), the input-format
// matrix, execution hints, and AI flags without resolving the workspace package at
// Playwright runtime. Run: npx tsx tests/qa/extract-tools-meta.mts
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildToolsMeta } from "./build-tools-meta.mjs";

const meta = buildToolsMeta();

const outPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "tools-meta.json");
writeFileSync(outPath, `${JSON.stringify(meta, null, 2)}\n`);

const byModality: Record<string, number> = {};
for (const m of meta) byModality[m.modality] = (byModality[m.modality] ?? 0) + 1;
console.log(`wrote ${meta.length} tools to ${outPath}`);
console.log("by modality:", JSON.stringify(byModality));
console.log("AI tools:", meta.filter((m) => m.isAI).length);
