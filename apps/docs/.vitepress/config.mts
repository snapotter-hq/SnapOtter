import { defineConfig } from "vitepress";
import llmstxt from "vitepress-plugin-llms";
import pkg from "../../../package.json";

export default defineConfig({
  title: "SnapOtter",
  description:
    "Documentation for SnapOtter - A Self-Hosted File Manipulation Suite. 157 tools for image, video, audio, PDF, and data processing. Local AI, pipelines, REST API.",
  base: "/",
  appearance: { initialValue: "light" },
  srcDir: ".",
  outDir: "./.vitepress/dist",
  ignoreDeadLinks: [/localhost/],

  sitemap: { hostname: "https://docs.snapotter.com" },

  head: [
    ["meta", { name: "theme-color", content: "#3b82f6" }],
    ["link", { rel: "icon", type: "image/png", sizes: "48x48", href: "/favicon.png" }],
    ["link", { rel: "icon", type: "image/x-icon", href: "/favicon.ico" }],
    ["link", { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" }],
    ["link", { rel: "llms-txt", href: "/llms.txt" }],
    ["meta", { property: "og:type", content: "website" }],
    ["meta", { property: "og:site_name", content: "SnapOtter Docs" }],
    ["meta", { property: "og:image", content: "https://docs.snapotter.com/og-image.png" }],
    ["meta", { property: "og:image:width", content: "1280" }],
    ["meta", { property: "og:image:height", content: "640" }],
    ["meta", { property: "og:image:alt", content: "SnapOtter - Self-Hosted File Processing" }],
    ["meta", { property: "og:locale", content: "en_US" }],
    ["meta", { name: "twitter:card", content: "summary_large_image" }],
    ["meta", { name: "twitter:site", content: "@SnapOtterHQ" }],
    ["meta", { name: "twitter:image", content: "https://docs.snapotter.com/og-image.png" }],
  ],

  transformHead({ pageData }) {
    const head: Array<[string, Record<string, string>]> = [];
    const canonicalUrl = `https://docs.snapotter.com/${pageData.relativePath.replace(/(^|\/)index\.md$/, "$1").replace(/\.md$/, "")}`;
    head.push(["meta", { property: "og:url", content: canonicalUrl }]);
    head.push(["meta", { property: "og:title", content: pageData.title }]);
    if (pageData.description) {
      head.push(["meta", { property: "og:description", content: pageData.description }]);
      head.push(["meta", { name: "twitter:description", content: pageData.description }]);
    }
    head.push(["meta", { name: "twitter:title", content: pageData.title }]);
    return head;
  },

  vite: {
    plugins: [
      llmstxt({
        domain: "https://docs.snapotter.com",
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

- [GitHub](https://github.com/snapotter-hq/snapotter)
- License: AGPLv3 (commercial license also available)
`,
        customTemplateVariables: {
          description:
            "SnapOtter is a self-hosted, open-source file processing platform with 157 tools across image, video, audio, PDF, and data. Includes AI/ML tools. Runs via Docker Compose with GPU auto-detection.",
          details:
            "Process images (resize, compress, convert, remove backgrounds, upscale, OCR), videos (trim, merge, subtitles), audio (normalize, transcribe, convert), PDFs (merge, split, watermark, redact), and data files (CSV, JSON, XML conversion) - without sending files to external services.",
        },
      }),
    ],
  },

  themeConfig: {
    logo: "/logo.png",

    nav: [
      { text: "Home", link: "/" },
      { text: "Guide", link: "/guide/getting-started" },
      { text: "Tools", link: "/tools/resize" },
      { text: "API Reference", link: "/api/rest" },
      { text: "Changelog", link: "/changelog" },
      {
        text: `v${pkg.version}`,
        link: "/changelog",
      },
    ],

    sidebar: [
      {
        text: "Guide",
        items: [
          { text: "Getting started", link: "/guide/getting-started" },
          { text: "Architecture", link: "/guide/architecture" },
          { text: "Configuration", link: "/guide/configuration" },
          { text: "OIDC / SSO", link: "/guide/oidc" },
          { text: "Database", link: "/guide/database" },
          { text: "Deployment", link: "/guide/deployment" },
          { text: "Security & Hardening", link: "/guide/security" },
          { text: "Supported Formats", link: "/guide/supported-formats" },
          { text: "Hardware requirements", link: "/guide/deployment#hardware-requirements" },
          { text: "Docker tags", link: "/guide/docker-tags" },
          { text: "Developer guide", link: "/guide/developer" },
          { text: "Translation guide", link: "/guide/translations" },
          { text: "Contributing", link: "/guide/contributing" },
        ],
      },
      {
        text: "Tools",
        items: [
          {
            text: "Essentials",
            items: [
              { text: "Resize", link: "/tools/resize" },
              { text: "Crop", link: "/tools/crop" },
              { text: "Rotate & Flip", link: "/tools/rotate" },
              { text: "Convert", link: "/tools/convert" },
              { text: "Compress", link: "/tools/compress" },
            ],
          },
          {
            text: "Optimization",
            items: [
              { text: "Optimize for Web", link: "/tools/optimize-for-web" },
              { text: "Remove Metadata", link: "/tools/strip-metadata" },
              { text: "Edit Metadata", link: "/tools/edit-metadata" },
              { text: "Bulk Rename", link: "/tools/bulk-rename" },
              { text: "Image to PDF", link: "/tools/image-to-pdf" },
              { text: "Favicon Generator", link: "/tools/favicon" },
            ],
          },
          {
            text: "Adjustments",
            items: [
              { text: "Adjust Colors", link: "/tools/adjust-colors" },
              { text: "Sharpening", link: "/tools/sharpening" },
              { text: "Replace & Invert Color", link: "/tools/replace-color" },
              { text: "Color Blindness Simulation", link: "/tools/color-blindness" },
            ],
          },
          {
            text: "Watermark & Overlay",
            items: [
              { text: "Text Watermark", link: "/tools/watermark-text" },
              { text: "Image Watermark", link: "/tools/watermark-image" },
              { text: "Text Overlay", link: "/tools/text-overlay" },
              { text: "Image Composition", link: "/tools/compose" },
              { text: "Meme Generator", link: "/tools/meme-generator" },
            ],
          },
          {
            text: "Utilities",
            items: [
              { text: "Image Info", link: "/tools/info" },
              { text: "Image Compare", link: "/tools/compare" },
              { text: "Find Duplicates", link: "/tools/find-duplicates" },
              { text: "Color Palette", link: "/tools/color-palette" },
              { text: "QR Code Generator", link: "/tools/qr-generate" },
              { text: "HTML to Image", link: "/tools/html-to-image" },
              { text: "Barcode Reader", link: "/tools/barcode-read" },
              { text: "Image to Base64", link: "/tools/image-to-base64" },
            ],
          },
          {
            text: "Layout",
            items: [
              { text: "Collage / Grid", link: "/tools/collage" },
              { text: "Stitch / Combine", link: "/tools/stitch" },
              { text: "Image Splitting", link: "/tools/split" },
              { text: "Border & Frame", link: "/tools/border" },
              { text: "Beautify Screenshot", link: "/tools/beautify" },
            ],
          },
          {
            text: "Format",
            items: [
              { text: "SVG to Raster", link: "/tools/svg-to-raster" },
              { text: "Image to SVG", link: "/tools/vectorize" },
              { text: "GIF Tools", link: "/tools/gif-tools" },
              { text: "PDF to Image", link: "/tools/pdf-to-image" },
            ],
          },
          {
            text: "AI Tools",
            items: [
              { text: "Remove Background", link: "/tools/remove-background" },
              { text: "Image Upscaling", link: "/tools/upscale" },
              { text: "Object Eraser", link: "/tools/erase-object" },
              { text: "OCR / Text Extraction", link: "/tools/ocr" },
              { text: "Face / PII Blur", link: "/tools/blur-faces" },
              { text: "Smart Crop", link: "/tools/smart-crop" },
              { text: "Image Enhancement", link: "/tools/image-enhancement" },
              { text: "Face Enhancement", link: "/tools/enhance-faces" },
              { text: "AI Colorization", link: "/tools/colorize" },
              { text: "Noise Removal", link: "/tools/noise-removal" },
              { text: "Red Eye Removal", link: "/tools/red-eye-removal" },
              { text: "Photo Restoration", link: "/tools/restore-photo" },
              { text: "Passport Photo", link: "/tools/passport-photo" },
              { text: "Content-Aware Resize", link: "/tools/content-aware-resize" },
              { text: "AI Canvas Expand", link: "/tools/ai-canvas-expand" },
              { text: "PNG Transparency Fixer", link: "/tools/transparency-fixer" },
            ],
          },
          {
            text: "Video, Audio, Document & Data",
            items: [
              { text: "Video tools", link: "/api/rest#video-tools" },
              { text: "Audio tools", link: "/api/rest#audio-tools" },
              { text: "Document tools", link: "/api/rest#document-tools" },
              { text: "Data tools", link: "/api/rest#data-tools" },
            ],
          },
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
      {
        text: "Project",
        items: [{ text: "Changelog", link: "/changelog" }],
      },
    ],

    search: {
      provider: "local",
    },

    footer: {
      message:
        'Released under the <a href="https://github.com/snapotter-hq/snapotter/blob/main/LICENSE">AGPLv3 License</a>.',
      copyright:
        'AI-friendly docs available at <a href="/llms.txt">/llms.txt</a> · <a href="/llms-full.txt">/llms-full.txt</a>',
    },

    socialLinks: [
      { icon: "github", link: "https://github.com/snapotter-hq/snapotter" },
      { icon: "discord", link: "https://discord.gg/hr3s7HPUsr" },
    ],

    editLink: {
      pattern: "https://github.com/snapotter-hq/snapotter/edit/main/apps/docs/:path",
      text: "Edit this page on GitHub",
    },
  },
});
