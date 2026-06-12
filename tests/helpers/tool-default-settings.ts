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
  "trim-video": { startS: 0, endS: 5 },
  "trim-audio": { startS: 0, endS: 5 },
  "split-pdf": { mode: "range", range: "1" },
  "extract-pages": { range: "1" },
  "remove-pages": { pages: "2" },
  "organize-pdf": { order: "1-z" },
  "protect-pdf": { userPassword: "test123" },
  "unlock-pdf": { password: "test123" },
  "watermark-pdf": { text: "CONFIDENTIAL" },
  "redact-pdf": { terms: ["test"] },
  "crop-video": { width: 32, height: 32 },
  "rotate-video": { transform: "cw90" },
  "resize-video": { preset: "720p" },
  "watermark-video": { text: "CONFIDENTIAL" },
  "audio-channels": { mode: "mono-to-stereo" },
};

export function defaultSettingsFor(toolId: string): unknown {
  return TOOL_SETTINGS_OVERRIDES[toolId] ?? {};
}
