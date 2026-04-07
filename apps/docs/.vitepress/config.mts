import { defineConfig } from "vitepress";
import llmstxt from "vitepress-plugin-llms";

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

  vite: {
    plugins: [
      llmstxt({
        domain: "https://stirling-image.github.io",
        customLLMsTxtTemplate: `# {title}

{description}

{details}

## Docs

{toc}

## API Quick Reference

- Base URL: \`http://localhost:1349\`
- Auth: Session token via \`POST /api/auth/login\` or API key (\`Authorization: Bearer si_...\`)
- Tools: \`POST /api/v1/tools/{toolId}\` (multipart: file + settings JSON)
- Batch: \`POST /api/v1/tools/{toolId}/batch\` (multiple files, returns ZIP)
- Pipelines: \`POST /api/v1/pipeline/execute\` (chain tools sequentially)
- Interactive API docs on running instance: \`/api/docs\`
- OpenAPI spec on running instance: \`/api/v1/openapi.yaml\`

## Source

- [GitHub](https://github.com/stirling-image/stirling-image)
- License: AGPLv3 (commercial license also available)
`,
        customTemplateVariables: {
          description:
            "Self-hosted, open-source image processing platform with 30+ tools. Runs in a single Docker container. Available as :latest (full, ~11 GB with AI/ML) or :lite (~1.5 GB, image processing only).",
          details:
            "Resize, compress, convert, remove backgrounds, upscale, run OCR, and more - without sending images to external services.",
        },
      }),
    ],
  },

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
          { text: "Docker tags", link: "/guide/docker-tags" },
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
