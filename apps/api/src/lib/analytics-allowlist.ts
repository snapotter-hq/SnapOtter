// Defense in depth: only these keys may leave the server per event, and only as
// primitives. Free-text fields (error_message, params, search query) are never
// allow-listed, so tool settings and filenames cannot reach PostHog.
const ALLOWED: Record<string, ReadonlySet<string>> = {
  tool_used: new Set(["tool_id", "status", "duration_ms", "category", "is_ai_tool", "error_code"]),
  pipeline_executed: new Set([
    "step_count",
    "tool_ids",
    "is_batch",
    "file_count",
    "duration_ms",
    "status",
  ]),
  ai_bundle_action: new Set(["bundle_id", "action", "duration_ms"]),
  instance_started: new Set(["arch", "os_platform", "deploy_mode", "gpu_present"]),
};

function isAllowedValue(value: unknown): boolean {
  if (value === null) return false;
  const t = typeof value;
  if (t === "string" || t === "number" || t === "boolean") return true;
  // tool_ids is an array of strings (low-cardinality ids); allow that one shape.
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

export function sanitizeEventProperties(
  event: string,
  properties: Record<string, unknown>,
): Record<string, unknown> {
  const allow = ALLOWED[event];
  if (!allow) return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (allow.has(key) && isAllowedValue(value)) out[key] = value;
  }
  return out;
}
