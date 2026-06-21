export type IdToSection = Record<string, string>;

// A real toolId must be a full path segment: the char after it is end-of-string
// or a boundary char (so "convert" never matches inside "convert-video", whose
// next char is "-"). ":" lets YAML path keys match (".../resize:"); the backtick
// lets backtick string literals match. ":toolId"/"{toolId}" placeholders never
// appear as real ids in the map, so parametric routes are left untouched.
const BOUNDARY = "(?=$|[/\"'`\\s?#:,)])";

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function rewriteToolPaths(text: string, idToSection: IdToSection): string {
  const ids = Object.keys(idToSection).sort((a, b) => b.length - a.length); // longest first

  // Guard: the transform is idempotent only because no section slug (a value)
  // is also a toolId (a key). Fail loudly if that invariant is ever violated.
  const sections = new Set(Object.values(idToSection));
  for (const id of Object.keys(idToSection)) {
    if (sections.has(id)) {
      throw new Error(
        `rewriteToolPaths: id "${id}" is also a section slug, which would break idempotency`,
      );
    }
  }
  let out = text;
  for (const id of ids) {
    const re = new RegExp(`/api/v1/tools/${escapeRegExp(id)}${BOUNDARY}`, "g");
    out = out.replace(re, `/api/v1/tools/${idToSection[id]}/${id}`);
  }
  return out;
}
