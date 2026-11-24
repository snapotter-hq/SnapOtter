import {
  AI_BUNDLE_ACTIONS,
  AI_INSTALL_ERROR_KINDS,
  AUTH_LOGIN_FAILURE_REASONS,
  TOOL_USED_STEPS,
} from "@snapotter/shared";

// Defense in depth: only these keys may leave the server per event, and only as
// primitives. Free-text fields (error_message, params, search query) are never
// allow-listed, so tool settings and filenames cannot reach PostHog.
export const ALLOWED: Record<string, ReadonlySet<string>> = {
  tool_used: new Set([
    "tool_id",
    "status",
    "duration_ms",
    "category",
    "is_ai_tool",
    "is_batch",
    "input_format",
    "output_format",
    "bytes_in",
    "bytes_out",
    "execution_hint",
    "error_code",
    "error_kind",
    "step",
    "app_version",
  ]),
  pipeline_executed: new Set([
    "step_count",
    "tool_ids",
    "is_batch",
    "file_count",
    "duration_ms",
    "status",
    "error_code",
    "app_version",
  ]),
  ai_bundle_action: new Set(["bundle_id", "action", "duration_ms", "error_kind", "app_version"]),
  instance_started: new Set(["arch", "os_platform", "deploy_mode", "gpu_present", "app_version"]),
  auth_login: new Set(["method", "app_version"]),
  auth_login_failed: new Set(["method", "reason", "app_version"]),
};

// Keys whose value must come from a closed set, so a username or an audit
// string passed by mistake is dropped instead of forwarded (#4216).
const ALLOWED_VALUES: Record<string, Record<string, ReadonlySet<string>>> = {
  auth_login_failed: { reason: new Set<string>(AUTH_LOGIN_FAILURE_REASONS) },
  ai_bundle_action: {
    action: new Set<string>(AI_BUNDLE_ACTIONS),
    error_kind: new Set<string>(AI_INSTALL_ERROR_KINDS),
  },
  tool_used: { step: new Set<string>(TOOL_USED_STEPS) },
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
    if (!allow.has(key) || !isAllowedValue(value)) continue;
    const closed = ALLOWED_VALUES[event]?.[key];
    if (closed && !(typeof value === "string" && closed.has(value))) continue;
    out[key] = value;
  }
  return out;
}
