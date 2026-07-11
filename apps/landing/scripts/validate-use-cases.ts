// Build-time integrity check for use-cases.ts. Run via tsx; wired into landing prebuild.
import { TOOLS, toolSection } from "@snapotter/shared";
import { ALTERNATIVES } from "../src/data/alternatives.ts";
import { USE_CASES } from "../src/data/use-cases.ts";

// Mirror of FEATURE_BUNDLES ids in packages/shared/src/features.ts.
const VALID_BUNDLES = new Set([
  "background-removal",
  "face-detection",
  "object-eraser-colorize",
  "upscale-enhance",
  "photo-restoration",
  "ocr",
  "transcription",
]);

const TOOL_IDS = new Set(TOOLS.map((t) => t.id));
const ALT_SLUGS = new Set(ALTERNATIVES.map((a) => a.slug));
const SECTION = /^\/tools\/(image|video|audio|pdf|files)\/([a-z0-9-]+)$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const errors: string[] = [];
const seenSlug = new Set<string>();
const seenKeyword = new Set<string>();

for (const uc of USE_CASES) {
  const at = `use-case "${uc.slug}"`;
  if (seenSlug.has(uc.slug)) errors.push(`${at}: duplicate slug`);
  seenSlug.add(uc.slug);
  if (seenKeyword.has(uc.primaryKeyword))
    errors.push(`${at}: duplicate primaryKeyword "${uc.primaryKeyword}"`);
  seenKeyword.add(uc.primaryKeyword);

  for (const id of uc.toolIds) {
    if (!TOOL_IDS.has(id)) errors.push(`${at}: toolId "${id}" not in TOOLS`);
  }
  if (uc.toolIds.length !== uc.toolRoutes.length)
    errors.push(
      `${at}: toolIds (${uc.toolIds.length}) and toolRoutes (${uc.toolRoutes.length}) differ in length`,
    );
  uc.toolRoutes.forEach((route, i) => {
    const m = route.match(SECTION);
    if (!m) {
      errors.push(`${at}: toolRoute "${route}" is malformed`);
      return;
    }
    const tool = TOOLS.find((t) => t.id === m[2]);
    if (!tool) {
      errors.push(`${at}: toolRoute "${route}" ends in unknown toolId "${m[2]}"`);
      return;
    }
    // The page zips toolRoutes[i] with toolIds[i] by index and links to the route,
    // so a wrong section (404) or a desynced pair (mislabeled link) must fail the build.
    if (toolSection(tool) !== m[1])
      errors.push(`${at}: toolRoute "${route}" should use section "${toolSection(tool)}"`);
    if (uc.toolIds[i] !== m[2])
      errors.push(
        `${at}: toolRoutes[${i}] "${route}" does not match toolIds[${i}] "${uc.toolIds[i]}"`,
      );
  });
  if (uc.alternativeSlug && !ALT_SLUGS.has(uc.alternativeSlug))
    errors.push(`${at}: alternativeSlug "${uc.alternativeSlug}" not in ALTERNATIVES`);

  if (uc.isAiBundle !== Boolean(uc.bundleId))
    errors.push(`${at}: isAiBundle and bundleId disagree`);
  if (uc.bundleId && !VALID_BUNDLES.has(uc.bundleId))
    errors.push(`${at}: bundleId "${uc.bundleId}" is not a known bundle`);

  if (!DATE.test(uc.lastReviewed)) errors.push(`${at}: lastReviewed not YYYY-MM-DD`);
}

if (errors.length > 0) {
  console.error(`use-cases.ts validation failed:\n - ${errors.join("\n - ")}`);
  process.exit(1);
}
console.log(`use-cases.ts OK (${USE_CASES.length} entries)`);
