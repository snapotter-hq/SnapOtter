/**
 * Chunk groups for every Vite build of the web source (apps/web and apps/demo).
 *
 * @snapotter/shared is one barrel. Left to the default splitter, a module only
 * lazy code uses lands in that lazy chunk, the barrel's chunk imports it back,
 * and the cycle blanks the app on load (#1296). One chunk for the package keeps
 * it acyclic. The locale catalogs stay out: they load one language at a time,
 * and pulling all 21 into this chunk would add megabytes to the first load.
 *
 * tests/unit/web/lazy-chunks-stay-lazy.test.ts builds both apps and checks this.
 */
export const codeSplitting = {
  groups: [{ name: "shared", test: /packages[\\/]shared[\\/]src[\\/](?!i18n[\\/])/ }],
};
