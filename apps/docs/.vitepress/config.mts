import { defineConfig } from "vitepress";
import llmstxt from "vitepress-plugin-llms";

export default defineConfig({
  title: "ashim",
  description: "Documentation for ashim - A Self Hosted Image Manipulator. 45+ tools, local AI, pipelines, REST API.",
  base: "/ashim/",
  srcDir: ".",
  outDir: "./.vitepress/dist",
  ignoreDeadLinks: [/localhost/],

  head: [
    ["meta", { name: "theme-color", content: "#3b82f6" }],
    ["link", { rel: "icon", type: "image/svg+xml", href: "/ashim/favicon.svg" }],
    ["link", { rel: "llms-txt", href: "/ashim/llms.txt" }],
  ],

  vite: {
    plugins: [
      llmstxt({
        domain: "https://ashim-hq.github.io",
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

- [GitHub](https://github.com/ashim-hq/ashim)
- License: AGPLv3 (commercial license also available)
`,
        customTemplateVariables: {
          description:
            "Self-hosted, open-source image processing platform with 45+ tools including AI/ML. Runs in a single Docker container with GPU auto-detection.",
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
          { text: "Contributing", link: "/guide/contributing" },
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
      message:
        'Released under the <a href="https://github.com/ashim-hq/ashim/blob/main/LICENSE">AGPLv3 License</a>.',
      copyright:
        'AI-friendly docs available at <a href="/ashim/llms.txt">/llms.txt</a> · <a href="/ashim/llms-full.txt">/llms-full.txt</a>',
    },

    editLink: {
      pattern: "https://github.com/ashim-hq/ashim/edit/main/apps/docs/:path",
      text: "Edit this page on GitHub",
    },
  },
});
