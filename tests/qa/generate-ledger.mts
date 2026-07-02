// Generates the master coverage ledger (157 rows, complete by construction) from
// tools-meta.json. Discovery shards update cells; any "pending" cell at the end is
// an explicit, surfaced gap. Run: npx tsx tests/qa/generate-ledger.mts
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

interface ToolMeta {
  id: string;
  name: string;
  modality: string;
  acceptedInputs: string[];
  executionHint: string;
  isAI: boolean;
}

const dir = path.dirname(fileURLToPath(import.meta.url));
const meta: ToolMeta[] = JSON.parse(readFileSync(path.join(dir, "tools-meta.json"), "utf8"));

// Cells: "pending" | "pass" | "fail" | "n/a"; counts are integers.
const tools = meta.map((t) => ({
  toolId: t.id,
  name: t.name,
  modality: t.modality,
  executionHint: t.executionHint,
  isAI: t.isAI,
  acceptedFormats: t.acceptedInputs,
  acceptedFormatCount: t.acceptedInputs.length,
  inputFormatsTested: 0,
  inputFormatsTotal: t.acceptedInputs.length,
  settingsTested: "pending",
  outputFormatsTested: "pending",
  multiFile: "pending",
  inputPreview: "pending",
  outputPreview: "pending",
  download: "pending",
  negativePath: "pending",
  consoleClean: "pending",
  status: "pending",
  bugs: [] as string[],
}));

const out = path.join(dir, "..", "..", "docs", "qa", "coverage-ledger.json");
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(
  out,
  `${JSON.stringify(
    {
      generatedAtNote: "stamp set by harness at run time",
      toolCount: tools.length,
      byModality: tools.reduce<Record<string, number>>((acc, t) => {
        acc[t.modality] = (acc[t.modality] ?? 0) + 1;
        return acc;
      }, {}),
      tools,
    },
    null,
    2,
  )}\n`,
);
console.log(`ledger: ${tools.length} tools -> ${out}`);
