// PUT /v1/settings rejects server-managed and dedicated-endpoint keys. GET can still
// return some of them to a full administrator for status display, so strip them from
// every generic bulk save along with redacted secret masks.
const READONLY_SETTING_KEYS = new Set([
  "instance_id",
  "cookie_secret",
  "sqlite_import",
  "onboarding.firstProcessedAt",
  "scim_token_hash",
  "siem_config",
  "webhook_destinations",
  "ipAllowlist",
  "backup_last_completed",
  "audit_archival_state",
  "siem_last_forwarded_at",
  "siem_consecutive_failures",
]);

export function writableSettings(settings: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(settings).filter(
      ([key, value]) => !READONLY_SETTING_KEYS.has(key) && value !== "********",
    ),
  );
}

// Only the keys this tab actually changed from the snapshot it loaded at mount.
// Saving the whole settings blob lets a value captured at mount clobber another
// admin's concurrent change, most dangerously flipping an instance-wide analytics
// opt-out back on when saving an unrelated field.
export function changedSettings(
  original: Record<string, string>,
  current: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(current)) {
    if (original[key] !== value) out[key] = value;
  }
  return out;
}
