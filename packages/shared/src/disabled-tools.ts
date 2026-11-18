import { COMPRESS_PRESET_BY_ID } from "./compress-presets.js";
import { CONVERSION_PRESET_BY_ID } from "./conversion-presets.js";

/** The tool a conversion or compress preset runs, or undefined when the id is not a preset. */
export function presetBaseOf(toolId: string): string | undefined {
  // Object.hasOwn: the lookup tables are plain objects, so "constructor" would
  // otherwise resolve to Object.prototype.constructor.
  if (Object.hasOwn(CONVERSION_PRESET_BY_ID, toolId)) return CONVERSION_PRESET_BY_ID[toolId].base;
  if (Object.hasOwn(COMPRESS_PRESET_BY_ID, toolId)) return COMPRESS_PRESET_BY_ID[toolId].base;
  return undefined;
}

/**
 * Whether the `disabledTools` setting turns this tool off. A preset is off when
 * its own id or its base tool's id is listed, because disabling a base closes
 * every route that runs it (#4288). The API route registration and every web
 * filter share this rule (#4462).
 */
export function isToolDisabled(
  toolId: string,
  disabledTools: ReadonlySet<string> | readonly string[],
): boolean {
  const has = (id: string) =>
    disabledTools instanceof Set
      ? disabledTools.has(id)
      : (disabledTools as readonly string[]).includes(id);
  if (has(toolId)) return true;
  const base = presetBaseOf(toolId);
  return base !== undefined && has(base);
}
