// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CONVERSION_PRESETS, TOOLS } from "@snapotter/shared";
import { describe, expect, it } from "vitest";
import { OWN_STORE_TOOL_IDS, WARN_ONLY_TOOL_IDS } from "@/hooks/use-work-in-flight";

/**
 * Drift guard for the navigation guard's blind spot.
 *
 * useWorkInFlight reads the file store, so every tool that runs through
 * useToolProcessor is covered for free. A tool that bypasses it has to be
 * accounted for by hand: either useWorkInFlight reads its store
 * (OWN_STORE_TOOL_IDS) or warns without offering a download
 * (WARN_ONLY_TOOL_IDS), or it is exempt here with a reason. Anything else is a
 * tool that can throw a result away without warning, which is the failure this
 * whole guard exists to prevent.
 *
 * Tools are mapped to their settings component through tool-registry.tsx, which
 * is the real mapping the app uses. The "<toolId>-settings.tsx" filename
 * convention would be cheaper to follow but it is only a convention: crop,
 * adjust-colors and erase-object are already registered through wrappers, and
 * the 83 conversion presets all share one component.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB_SRC = path.resolve(HERE, "../../../apps/web/src");
const REGISTRY = path.join(WEB_SRC, "lib/tool-registry.tsx");
const registrySource = readFileSync(REGISTRY, "utf8");

/**
 * Tools that bypass useToolProcessor and still have nothing for the guard to
 * see. Every entry carries the reason, because "it is on the list" is not one.
 */
const EXEMPT: Record<string, string> = {
  "qr-generate":
    "holds typed config, not a result; the image regenerates client-side the moment the page is open",
  "barcode-generate":
    "holds typed config, not a result; the image regenerates client-side the moment the page is open",
  "watermark-image":
    "hand-rolls its fetch but puts the result in the file store (setProcessedUrl), which the guard already reads",
  compose:
    "hand-rolls its fetch but puts the result in the file store (setProcessedUrl), which the guard already reads",
  stitch:
    "hand-rolls its fetch but puts the result in the file store (setProcessedUrl), which the guard already reads",
  "erase-object":
    "writes its result back onto the file-store entry (updateEntry), which the guard already reads",
  "sign-pdf":
    "writes its result back onto the file-store entry (updateEntry), which the guard already reads",
  "barcode-read":
    "writes the annotated image onto the file-store entry (updateEntry), which the guard already reads; the decoded text beside it is component state (#1111)",
  "bulk-rename":
    "downloads its zip the moment the run finishes, so nothing is left on the page to lose",
  info: "produces no file: it reads metadata out of the input, and re-reads it on demand",
  "color-palette":
    "produces no file: it reads colors out of the input, and re-reads them on demand",
  ocr: "result lives in component state no store exposes, so the guard can only see the run itself, through the file store's processing flag (#1111)",
  favicon:
    "result lives in component state no store exposes, so the guard can only see the run itself, through the file store's processing flag (#1111)",
  "image-to-pdf":
    "result lives in component state no store exposes, so the guard can only see the run itself, through the file store's processing flag (#1111)",
};

/** const X = lazy(() => import("@/components/tools/x-settings")... */
function lazyImportSpecs(): Map<string, string> {
  const specs = new Map<string, string>();
  for (const m of registrySource.matchAll(
    /const\s+(\w+)\s*=\s*lazy\(\(\)\s*=>\s*import\("([^"]+)"\)/g,
  )) {
    specs.set(m[1], m[2]);
  }
  return specs;
}

/** ["tool-id", { ..., Settings: SomeSettings }] */
function registryEntries(): Map<string, string> {
  const entries = new Map<string, string>();
  for (const m of registrySource.matchAll(/\[\s*"([a-z0-9-]+)",\s*\{[\s\S]*?Settings:\s*(\w+)/g)) {
    entries.set(m[1], m[2]);
  }

  // The conversion presets are generated from shared metadata, all sharing one
  // component. Read that component off the generator rather than assuming it.
  const preset = registrySource.match(/CONVERSION_PRESETS\.map\([\s\S]*?Settings:\s*(\w+)/);
  if (preset) {
    for (const p of CONVERSION_PRESETS) entries.set(p.id, preset[1]);
  }
  return entries;
}

const IMPORT_SPECS = lazyImportSpecs();
const ENTRIES = registryEntries();

function fileFor(importSpec: string): string | null {
  if (!importSpec.startsWith("@/")) return null;
  return path.join(WEB_SRC, `${importSpec.slice(2)}.tsx`);
}

/**
 * The settings component's source file, or null when the registry names
 * something this parse cannot follow.
 *
 * A component registered directly is one lookup. A wrapper or factory defined
 * inside the registry (CropSettingsWrapper, makeColorSettingsComponent) is
 * followed to the component it renders.
 */
function settingsFileFor(toolId: string): string | null {
  const componentName = ENTRIES.get(toolId);
  if (!componentName) return null;

  const direct = IMPORT_SPECS.get(componentName);
  if (direct) return fileFor(direct);

  const body = registrySource.match(new RegExp(`function\\s+${componentName}\\b[\\s\\S]*?\\n}`));
  const rendered = body?.[0].match(/<([A-Z]\w*)\b/)?.[1];
  const wrapped = rendered ? IMPORT_SPECS.get(rendered) : undefined;
  return wrapped ? fileFor(wrapped) : null;
}

/**
 * Whether the tool's run really goes through useToolProcessor, which is what
 * puts it in the file store where the guard can see it.
 *
 * Evidence of a run, not of an import. passport-photo held the hook for its
 * `error` string alone, hand-rolled both of its fetches, and kept the result in
 * a store of its own: a bare name check called that covered while the guard was
 * silent on a generated passport photo (#1122). processFiles and processBatch
 * are the only two ways anything reaches the store.
 */
function usesToolProcessor(file: string): boolean {
  const source = readFileSync(file, "utf8");
  return /\buseToolProcessor\b/.test(source) && /\bprocess(Files|Batch)\b/.test(source);
}

const COVERED = new Set<string>([...OWN_STORE_TOOL_IDS, ...WARN_ONLY_TOOL_IDS]);
const TOOL_IDS = new Set(TOOLS.map((t) => t.id));

describe("navigation guard tool coverage", () => {
  it("maps every tool to a settings component through the registry", () => {
    const unmapped = TOOLS.map((t) => t.id).filter((id) => settingsFileFor(id) === null);

    expect(
      unmapped,
      `These tools have no settings component this test can follow in ${path.relative(process.cwd(), REGISTRY)}. ` +
        "Either the tool is missing a registry entry, or it is registered through a shape the parser does not know.",
    ).toEqual([]);
  });

  it("accounts for every tool that bypasses useToolProcessor", () => {
    const unaccounted: string[] = [];
    for (const tool of TOOLS) {
      const file = settingsFileFor(tool.id);
      if (!file || usesToolProcessor(file)) continue;
      if (COVERED.has(tool.id) || tool.id in EXEMPT) continue;
      unaccounted.push(tool.id);
    }

    expect(
      unaccounted,
      "These tools keep their results outside the file store, so the navigation guard cannot see them. " +
        "Either teach useWorkInFlight to read the tool's store and add it to OWN_STORE_TOOL_IDS, " +
        "or add it to WARN_ONLY_TOOL_IDS if all it can do is warn, " +
        "or add it to EXEMPT here with the reason it has nothing to lose.",
    ).toEqual([]);
  });

  it("guards only real tools", () => {
    const unknown = [...COVERED, ...Object.keys(EXEMPT)].filter((id) => !TOOL_IDS.has(id));

    expect(unknown, "Not tool ids in the shared catalog. Renamed, or removed?").toEqual([]);
  });

  it("gives every exempt tool a reason", () => {
    const empty = Object.entries(EXEMPT)
      .filter(([, reason]) => reason.trim() === "")
      .map(([id]) => id);

    expect(empty, "An exemption without a reason is an undocumented blind spot.").toEqual([]);
  });

  it("keeps the exempt list clear of tools the guard already covers", () => {
    const both = Object.keys(EXEMPT).filter((id) => COVERED.has(id));

    expect(both, "Covered by useWorkInFlight and exempt here. Drop the exemption.").toEqual([]);
  });

  it("drops exemptions for tools that have moved onto useToolProcessor", () => {
    const stale = Object.keys(EXEMPT).filter((id) => {
      const file = settingsFileFor(id);
      return file !== null && usesToolProcessor(file);
    });

    expect(
      stale,
      "These run through useToolProcessor now, so the file store covers them and the exemption is noise.",
    ).toEqual([]);
  });
});
