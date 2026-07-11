// scripts/i18n/lib/slugify.mjs

// Exact port of the slugify VitePress uses (mdit-vue @mdit-vue/shared). Keeping
// this identical means the {#anchor} we inject equals the auto-slug VitePress
// would produce, so pre-existing #deep-links keep resolving after we add
// explicit anchors. Regexes copied verbatim from vitepress/dist/node, with
// explicit unicode escapes for the control and combining ranges.
// biome-ignore lint/suspicious/noControlCharactersInRegex: byte-exact port of mdit-vue slugify; the control-char range is required for VitePress anchor parity.
const rControl = /[\u0000-\u001f]/g;
const rSpecial = /[\s~`!@#$%^&*()\-_+=[\]{}|\\;:"'“”‘’<>,.?/]+/g;
const rCombining = /[\u0300-\u036f]/g;

/**
 * @param {string} str
 * @returns {string}
 */
export function slugify(str) {
  return String(str)
    .normalize("NFKD")
    .replace(rCombining, "")
    .replace(rControl, "")
    .replace(rSpecial, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/^(\d)/, "_$1")
    .toLowerCase();
}
