import sitemap from "@astrojs/sitemap";
import { SUPPORTED_LOCALES } from "@snapotter/shared";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";
import { isEnglishOnlyUrl } from "./src/lib/en-only-paths.ts";

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
      filter: (page) => !page.includes("/404"),
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
    resolve: {
      extensions: [".ts", ".tsx", ".js", ".jsx"],
      conditions: ["import", "module"],
    },
  },
  build: {
    format: "directory",
  },
});
