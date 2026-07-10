// scripts/i18n/translate.mjs
import { mkdirSync } from "node:fs";
import { ADAPTERS, resolveSurfaces } from "./adapters/registry.mjs";
import { collectPending, runTranslation } from "./core.mjs";
import { batchResultTranslator, readDone, writePending } from "./lib/batch.mjs";
import { localeCodes } from "./lib/shared-i18n.mjs";

function parseArgs(argv) {
  const args = {
    surface: "all",
    locale: "all",
    engine: "claude-code",
    mode: "export",
    batchDir: ".i18n-batches",
    help: false,
  };
  for (const a of argv) {
    if (a === "--help" || a === "-h") args.help = true;
    else if (a === "--export") args.mode = "export";
    else if (a === "--import") args.mode = "import";
    else if (a === "--dry-run") args.mode = "dry-run";
    else if (a.startsWith("--engine=")) args.engine = a.slice("--engine=".length);
    else if (a.startsWith("--surface=")) args.surface = a.slice("--surface=".length);
    else if (a.startsWith("--locale=")) args.locale = a.slice("--locale=".length);
    else if (a.startsWith("--batch-dir=")) args.batchDir = a.slice("--batch-dir=".length);
  }
  return args;
}

function resolveLocales(spec) {
  const all = localeCodes().filter((c) => c !== "en");
  if (spec === "all") return all;
  return spec
    .split(",")
    .map((s) => s.trim())
    .filter((c) => all.includes(c));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(
      [
        "Usage: tsx scripts/i18n/translate.mjs --export|--import|--dry-run [options]",
        "  --surface=all|<name,..>   default all",
        "  --locale=all|<code,..>    default all (minus en)",
        "  --engine=claude-code|api  default claude-code (no key). api needs ANTHROPIC_API_KEY.",
        "  --batch-dir=<path>        default .i18n-batches",
        "",
        "Claude Code flow: --export writes pending masked strings; a Claude Code session",
        "translates each <surface>.<locale>.pending.json into <surface>.<locale>.done.json",
        "(keeping every mask token); --import restores, validates, and writes via adapters.",
        `Surfaces: ${Object.keys(ADAPTERS).join(", ") || "(none registered yet)"}`,
      ].join("\n"),
    );
    return;
  }

  const surfaces = resolveSurfaces(args.surface);
  const locales = resolveLocales(args.locale);
  if (surfaces.length === 0) {
    console.log("No adapters registered yet. Nothing to do.");
    return;
  }
  mkdirSync(args.batchDir, { recursive: true });

  for (const surface of surfaces) {
    const mod = await ADAPTERS[surface]();
    const adapter = mod.adapter;

    if (args.mode === "export") {
      const units = await adapter.extract();
      for (const locale of locales) {
        const stored = await adapter.load(locale);
        const { pending } = collectPending(units, stored);
        if (pending.length === 0) continue;
        const path = writePending(args.batchDir, surface, locale, pending);
        console.log(`export ${surface} ${locale}: ${pending.length} -> ${path}`);
      }
      continue;
    }

    if (args.mode === "import") {
      for (const locale of locales) {
        let doneMap;
        try {
          doneMap = readDone(args.batchDir, surface, locale);
        } catch {
          continue; // no done file for this locale yet
        }
        const summary = await runTranslation({
          adapter,
          locales: [locale],
          translate: batchResultTranslator(doneMap),
          log: (m) => process.stdout.write(`${m}\n`),
        });
        console.log(`import ${surface} ${locale}:`, JSON.stringify(summary[locale]));
      }
      continue;
    }

    // dry-run: stub translator, no batch files, proves wiring
    const summary = await runTranslation({
      adapter,
      locales,
      translate: async (units, locale) =>
        new Map(units.map((u) => [u.id, `${locale}:${u.sourceText}`])),
    });
    console.log(`dry-run ${surface}:`, JSON.stringify(summary, null, 2));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
