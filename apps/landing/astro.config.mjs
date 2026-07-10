import sitemap from "@astrojs/sitemap";
import { SUPPORTED_LOCALES } from "@snapotter/shared";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

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
