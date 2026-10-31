// The repo's helper scripts and Playwright harness files are plain .mjs (and one
// plain .js worker) with no declaration files, and the test tsconfig does not
// enable allowJs. Declaring the patterns types those imports as any without
// hiding errors in the code around them.
declare module "*.mjs";
declare module "*/_worker.js";

// apps/landing loads its locale catalogs through Vite's import.meta.glob. The
// real types live in vite/client, which the root test tsconfig cannot resolve,
// so declare only the eager form the landing code uses.
interface ImportMeta {
  glob<T = unknown>(
    pattern: string | string[],
    options?: { eager?: boolean; import?: string },
  ): Record<string, T>;
}
