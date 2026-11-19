import sitemap from "@astrojs/sitemap";
import { SUPPORTED_LOCALES } from "@snapotter/shared";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";
import { isEnglishOnlyUrl } from "./src/lib/en-only-paths.ts";
import { isNoindexUrl } from "./src/lib/index-policy.ts";

const LOCALES = SUPPORTED_LOCALES.map((l) => l.code);

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
      // Noindexed pages stay out of the sitemap. The integration builds each entry's
      // hreflang links from the filtered list, so no alternate points at one either.
      filter: (page) => !page.includes("/404") && !isNoindexUrl(page),
      i18n: {
        defaultLocale: "en",
        locales: Object.fromEntries(LOCALES.map((c) => [c, c])),
      },
      // English-only pages have no localized variants, so drop the hreflang
      // alternates the i18n integration would otherwise emit for them (they
      // would point at non-existent /de/tools/<tool>/ URLs). All other pages
      // keep their alternates. Same predicate the page head uses.
      serialize(item) {
        if (isEnglishOnlyUrl(item.url)) {
          const { links, ...rest } = item;
          return rest;
        }
        return item;
      },
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
    preview: {
      strictPort: true,
    },
    resolve: {
      extensions: [".ts", ".tsx", ".js", ".jsx"],
      conditions: ["import", "module"],
    },
  },
  build: {
    format: "directory",
  },
});
