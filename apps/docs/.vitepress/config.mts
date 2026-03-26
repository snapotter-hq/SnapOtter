import { defineConfig } from "vitepress";

export default defineConfig({
  title: "Stirling Image",
  description: "Documentation for Stirling Image, a self-hosted image processing suite.",
  base: "/Stirling-Image/",
  srcDir: ".",
  outDir: "./.vitepress/dist",

  head: [
    ["meta", { name: "theme-color", content: "#3b82f6" }],
    ["link", { rel: "icon", type: "image/svg+xml", href: "/Stirling-Image/favicon.svg" }],
  ],

  themeConfig: {
    nav: [
      { text: "Home", link: "/" },
      { text: "Guide", link: "/guide/getting-started" },
      { text: "API Reference", link: "/api/rest" },
    ],

    sidebar: [
      {
        text: "Guide",
        items: [
          { text: "Getting started", link: "/guide/getting-started" },
          { text: "Architecture", link: "/guide/architecture" },
          { text: "Configuration", link: "/guide/configuration" },
          { text: "Database", link: "/guide/database" },
          { text: "Deployment", link: "/guide/deployment" },
        ],
      },
      {
        text: "API reference",
        items: [
          { text: "REST API", link: "/api/rest" },
          { text: "Image engine", link: "/api/image-engine" },
          { text: "AI engine", link: "/api/ai" },
        ],
      },
    ],

    socialLinks: [{ icon: "github", link: "https://github.com/siddharthksah/Stirling-Image" }],

    search: {
      provider: "local",
    },

    footer: {
      message: "Released under the MIT License.",
    },

    editLink: {
      pattern: "https://github.com/siddharthksah/Stirling-Image/edit/main/apps/docs/:path",
      text: "Edit this page on GitHub",
    },
  },
});
