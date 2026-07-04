// PUT /v1/settings rejects server-managed read-only keys (instance_id, cookie_secret)
// with 400 READONLY_SETTING, and GET returns redacted secrets as the literal "********".
// Echoing either back breaks the save or overwrites a real secret with the mask, so strip
// both before any bulk save.
const READONLY_SETTING_KEYS = new Set(["instance_id", "cookie_secret"]);

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
