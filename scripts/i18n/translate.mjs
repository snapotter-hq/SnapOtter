// scripts/i18n/translate.mjs
import { runTranslation } from "./core.mjs";
import { makeTranslator } from "./lib/claude.mjs";
import { localeCodes } from "./lib/shared-i18n.mjs";

// Surface adapters are registered here as Plans 02-05 land them.
// Each module must `export const adapter = { name, extract, load, write }`.
const ADAPTERS = {
  // landing-ui: () => import("./adapters/landing-ui.mjs"),
  // landing-seo: () => import("./adapters/landing-seo.mjs"),
  // docs: () => import("./adapters/docs-md.mjs"),
  // api: () => import("./adapters/api-spec.mjs"),
};

function parseArgs(argv) {
  const args = { surface: "all", locale: "all", dryRun: false, help: false };
  for (const a of argv) {
    if (a === "--help" || a === "-h") args.help = true;
    else if (a === "--dry-run") args.dryRun = true;
    else if (a.startsWith("--surface=")) args.surface = a.slice("--surface=".length);
    else if (a.startsWith("--locale=")) args.locale = a.slice("--locale=".length);
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

function resolveSurfaces(spec) {
  const keys = Object.keys(ADAPTERS);
  if (spec === "all") return keys;
  return spec
    .split(",")
    .map((s) => s.trim())
    .filter((k) => keys.includes(k));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(
      [
        "Usage: tsx scripts/i18n/translate.mjs [--surface=all|<name,..>] [--locale=all|<code,..>] [--dry-run]",
        `Surfaces: ${Object.keys(ADAPTERS).join(", ") || "(none registered yet)"}`,
        "Requires ANTHROPIC_API_KEY. Set I18N_MODEL to override the model.",
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

  const translate = args.dryRun
    ? async (units, locale) => new Map(units.map((u) => [u.id, `${locale}:${u.sourceText}`]))
    : makeTranslator();

  for (const surface of surfaces) {
    const mod = await ADAPTERS[surface]();
    const summary = await runTranslation({
      adapter: mod.adapter,
      locales,
      translate,
      log: (m) => process.stdout.write(`${m}\n`),
    });
    console.log(`\n${surface}:`, JSON.stringify(summary, null, 2));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
