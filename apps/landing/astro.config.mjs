import sitemap from "@astrojs/sitemap";
import { SUPPORTED_LOCALES } from "@snapotter/shared";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

const LOCALES = SUPPORTED_LOCALES.map((l) => l.code);

// Tool DETAIL pages (/tools/<section>/<tool>/) are English-only, so they have no
// localized variants. Match exactly two path segments after /tools/ (the /tools/
// index and /tools/<section>/ section pages have zero and one, and stay localized).
const TOOL_DETAIL_PATH = /^\/tools\/(?:image|video|audio|pdf|files)\/[^/]+\/$/;

function isToolDetailUrl(url) {
  try {
    return TOOL_DETAIL_PATH.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

export default defineConfig({
  site: "https://snapotter.com",
  output: "static",
  i18n: {
    defaultLocale: "en",
    locales: LOCALES,
    routing: {
      prefixDefaultLocale: false,
    },
  },
  devToolbar: {
    enabled: !process.env.PLAYWRIGHT,
  },
  integrations: [
    sitemap({
      filter: (page) => !page.includes("/404"),
      i18n: {
        defaultLocale: "en",
        locales: Object.fromEntries(LOCALES.map((c) => [c, c])),
      },
      // English-only tool-detail pages have no localized variants, so drop the
      // hreflang alternates the i18n integration would otherwise emit for them
      // (they would point at non-existent /de/tools/<tool>/ URLs). All other
      // pages keep their alternates.
      serialize(item) {
        if (isToolDetailUrl(item.url)) {
          const { links, ...rest } = item;
          return rest;
        }
        return item;
      },
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
    resolve: {
      extensions: [".ts", ".tsx", ".js", ".jsx"],
      conditions: ["import", "module"],
    },
  },
  build: {
    format: "directory",
  },
});
