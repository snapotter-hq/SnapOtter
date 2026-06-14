import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  site: "https://snapotter.com",
  output: "static",
  integrations: [
    sitemap({
      filter: (page) => !page.includes("/404"),
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
