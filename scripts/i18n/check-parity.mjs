// scripts/i18n/check-parity.mjs
// Parity/staleness gate for the web-surfaces translation pipeline. For every
// registered adapter and every non-en locale, it replays extract() + load() and
// fails if any unit is missing a translation or its stored sourceHash no longer
// matches the current English source (stale). This is the build-time mirror of
// the app's TypeScript key-parity guarantee.
//
// It imports the SAME adapter registry the CLI uses (adapters/registry.mjs), so
// the surface list is defined once and never drifts from translate.mjs.
import { ADAPTERS, resolveSurfaces } from "./adapters/registry.mjs";
import { hash } from "./lib/hash.mjs";
import { localeCodes } from "./lib/shared-i18n.mjs";

/**
 * Validate one adapter's translations against the current English source.
 * A problem is: a locale missing a unit, or a stored sourceHash that no longer
 * matches the current English source hash (stale). Human-refined units still
 * count as stale here: staleness means "needs review", which is exactly what a
 * parity check should flag. `en` is always the source and never a target.
 *
 * An adapter opts into the edited-without-restamp check with
 * `verifiesOutputHash: true`; the landing surfaces have not been audited yet.
 *
 * @param {{ name: string, verifiesOutputHash?: boolean, extract: () => Promise<any[]>, load: (l: string) => Promise<Map<string, any>> }} adapter
 * @param {string[]} locales
 * @returns {Promise<{ ok: boolean, problems: string[] }>}
 */
export async function checkAdapter(adapter, locales) {
  const units = await adapter.extract();
  const sourceHashes = new Map(units.map((u) => [u.id, hash(u.sourceText)]));
  const problems = [];

  for (const locale of locales) {
    if (locale === "en") continue;
    const stored = await adapter.load(locale);
    for (const [id, srcHash] of sourceHashes) {
      const entry = stored.get(id);
      if (!entry) {
        problems.push(`[${adapter.name}] ${locale}: missing translation for unit "${id}"`);
        continue;
      }
      if (entry.sourceHash !== srcHash) {
        problems.push(
          `[${adapter.name}] ${locale}: stale translation for unit "${id}" ` +
            `(stored ${entry.sourceHash || "<none>"}, source ${srcHash})`,
        );
      }
      // collectPending (core.mjs) reads a machine entry whose text no longer
      // matches its output hash as a human edit, so the next import flips it to
      // human. Surface that here, where the PR that edited the body can fix it.
      if (
        adapter.verifiesOutputHash &&
        entry.provenance === "machine" &&
        hash(entry.text) !== entry.outputHash
      ) {
        problems.push(
          `[${adapter.name}] ${locale}: unit "${id}" is stamped machine but its text was edited ` +
            "without restamping (set i18n_provenance: human if intentional, otherwise re-import)",
        );
      }
    }
  }

  return { ok: problems.length === 0, problems };
}

/**
 * Run the parity check across the registered adapters for every non-en locale.
 * `surfaces` narrows the run to those keys; omitted, every surface is checked.
 * @param {{ log?: (msg: string) => void, surfaces?: string[] }} [opts]
 * @returns {Promise<{ ok: boolean, problems: string[] }>}
 */
export async function runParityCheck({ log = () => {}, surfaces = Object.keys(ADAPTERS) } = {}) {
  if (surfaces.length === 0) {
    log("No adapters registered yet. Parity check is a no-op until a surface adapter lands.");
    return { ok: true, problems: [] };
  }

  const locales = localeCodes().filter((c) => c !== "en");
  const problems = [];
  for (const surface of surfaces) {
    const mod = await ADAPTERS[surface]();
    const report = await checkAdapter(mod.adapter, locales);
    problems.push(...report.problems);
    log(`[${surface}] ${report.ok ? "OK" : `${report.problems.length} problem(s)`}`);
  }
  return { ok: problems.length === 0, problems };
}

// Only run the CLI body when invoked directly, not when imported by tests.
if (import.meta.url === `file://${process.argv[1]}`) {
  // --surface=api (or a comma list) gates one surface. An unknown key is an
  // error, not a silent pass, so a typo in a workflow can't turn the gate off.
  const flag = process.argv.slice(2).find((a) => a.startsWith("--surface="));
  const requested = flag ? flag.slice("--surface=".length) : "all";
  const surfaces = [...new Set(resolveSurfaces(requested))];
  if (flag && surfaces.length !== new Set(requested.split(",").map((s) => s.trim())).size) {
    process.stderr.write(
      `Unknown --surface "${requested}". Known surfaces: ${Object.keys(ADAPTERS).join(", ")}\n`,
    );
    process.exit(2);
  }
  runParityCheck({ log: (m) => process.stdout.write(`${m}\n`), surfaces })
    .then((report) => {
      if (!report.ok) {
        process.stderr.write("\nTranslation parity check FAILED:\n");
        for (const p of report.problems) process.stderr.write(`  - ${p}\n`);
        process.stderr.write(
          "\nExport the affected surface/locale (pnpm i18n:translate --export), translate the\n" +
            "pending batch, then import it (--import) and commit the regenerated files.\n",
        );
        process.exit(1);
      }
      process.stdout.write("Translation parity check passed.\n");
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
