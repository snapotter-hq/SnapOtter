// scripts/i18n/lib/shared-i18n.mjs
import { SUPPORTED_LOCALES } from "../../../packages/shared/src/i18n/index.ts";

/** @returns {string[]} all supported locale codes */
export function localeCodes() {
  return SUPPORTED_LOCALES.map((l) => l.code);
}

/**
 * The exported const name inside a locale file is the code camel-cased:
 * "de" -> "de", "pt-BR" -> "ptBR", "zh-CN" -> "zhCN".
 * @param {string} code
 * @returns {string}
 */
function exportName(code) {
  return code.replace(/-([a-z])/gi, (_m, c) => c.toUpperCase());
}

/**
 * Load the translated `tools` namespace for a locale:
 * { [toolId]: { name, description } }.
 * @param {string} code
 * @returns {Promise<Record<string, { name: string, description: string }>>}
 */
export async function loadToolStrings(code) {
  const mod = await import(`../../../packages/shared/src/i18n/${code}.ts`);
  const dict = mod[exportName(code)];
  if (!dict?.tools) throw new Error(`No tools namespace in locale ${code}`);
  return dict.tools;
}
