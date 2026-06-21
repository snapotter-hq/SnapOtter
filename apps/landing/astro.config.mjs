import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://snapotter.com",
  output: "static",
  devToolbar: {
    enabled: !process.env.PLAYWRIGHT,
  },
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
