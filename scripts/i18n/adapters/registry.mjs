// scripts/i18n/adapters/registry.mjs
// Single source of truth for surface adapters. Both translate.mjs and
// check-parity.mjs import this so the surface list is defined once.
// Surface plans (02-04) uncomment/add their entry as each adapter lands.
export const ADAPTERS = {
  "landing-ui": () => import("./landing-ui.mjs"),
  "landing-seo": () => import("./landing-seo.mjs"),
  docs: () => import("./docs-md.mjs"),
  api: () => import("./api-spec.mjs"),
};

/**
 * @param {string} spec "all" or a comma list of surface keys
 * @returns {string[]} known surface keys
 */
export function resolveSurfaces(spec) {
  const keys = Object.keys(ADAPTERS);
  if (spec === "all") return keys;
  return spec
    .split(",")
    .map((s) => s.trim())
    .filter((k) => keys.includes(k));
}
