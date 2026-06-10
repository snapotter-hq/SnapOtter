/**
 * Minimal valid settings per tool, used by the generated matrices
 * (format-matrix-generated, hostile-inputs) when posting to tool routes.
 *
 * Default is {} (most schemas make every field optional). Tools whose schema
 * rejects {} get an explicit minimal override here. The "defaults are valid"
 * test in format-matrix-generated.test.ts safeParses every entry against the
 * live schema, so a schema change that invalidates an entry fails at PR time
 * and names the tool.
 */
export const TOOL_SETTINGS_OVERRIDES: Record<string, unknown> = {
  resize: { width: 64 },
  crop: { left: 0, top: 0, width: 50, height: 50 },
  convert: { format: "png" },
  "watermark-text": { text: "Test" },
  "text-overlay": { text: "Test" },
  "passport-photo": { countryCode: "us" },
};

export function defaultSettingsFor(toolId: string): unknown {
  return TOOL_SETTINGS_OVERRIDES[toolId] ?? {};
}
