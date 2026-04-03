import { defineConfig } from "vitepress";

export default defineConfig({
  title: "Stirling Image",
  description: "Documentation for Stirling Image, a self-hosted image processing suite.",
  base: "/stirling-image/",
  srcDir: ".",
  outDir: "./.vitepress/dist",
  ignoreDeadLinks: [/localhost/],

  head: [
    ["meta", { name: "theme-color", content: "#3b82f6" }],
    ["link", { rel: "icon", type: "image/svg+xml", href: "/stirling-image/favicon.svg" }],
    ["link", { rel: "llms-txt", href: "/stirling-image/llms.txt" }],
  ],

  themeConfig: {
    logo: "/logo.svg",

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
          { text: "Developer guide", link: "/guide/developer" },
          { text: "Translation guide", link: "/guide/translations" },
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

    search: {
      provider: "local",
    },

    footer: {
      message: 'Released under the <a href="https://github.com/stirling-image/stirling-image/blob/main/LICENSE">AGPLv3 License</a>.',
      copyright:
        'AI-friendly docs available at <a href="/stirling-image/llms.txt">/llms.txt</a> · <a href="/stirling-image/llms-full.txt">/llms-full.txt</a>',
    },

    editLink: {
      pattern: "https://github.com/stirling-image/stirling-image/edit/main/apps/docs/:path",
      text: "Edit this page on GitHub",
    },
  },
});
