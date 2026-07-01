const DISCUSSIONS_BASE = "https://github.com/snapotter-hq/snapotter/discussions/new";
const MAX_QUERY_LEN = 200;

/** Collapse whitespace/newlines and clamp length so the query is URL-safe. */
function sanitizeQuery(query: string): string {
  return query.replace(/\s+/g, " ").trim().slice(0, MAX_QUERY_LEN);
}

/**
 * Build a prefilled GitHub Discussions (Ideas) URL for a missing-tool request.
 * The repo routes feature requests to Discussions/Ideas (blank issues are off),
 * so this is the canonical target. `category=ideas` is the guaranteed floor;
 * `title`/`body` are best-effort prefill.
 */
export function buildToolRequestDiscussionUrl(query: string): string {
  const q = sanitizeQuery(query);
  const title = `Tool request: ${q}`;
  const body = [
    `I searched SnapOtter for "${q}" and could not find a tool for it.`,
    "",
    "What I'm trying to do:",
    "",
    "(describe your use case)",
    "",
    "_Submitted from in-app search._",
  ].join("\n");
  const params = new URLSearchParams({ category: "ideas", title, body });
  return `${DISCUSSIONS_BASE}?${params.toString()}`;
}
