import { defineConfig } from "vitepress";
import llmstxt from "vitepress-plugin-llms";
import { pagefindPlugin } from "vitepress-plugin-pagefind";
import pkg from "../../../package.json";

export default defineConfig({
  title: "SnapOtter",
  description:
    "Documentation for SnapOtter - A Self-Hosted File Manipulation Suite. 240 tools for image, video, audio, PDF, and data processing. Local AI, pipelines, REST API.",
  base: "/",
  appearance: { initialValue: "light" },
  srcDir: ".",
  outDir: "./.vitepress/dist",
  ignoreDeadLinks: [/localhost/],

  sitemap: { hostname: "https://docs.snapotter.com" },

  head: [
    ["meta", { name: "theme-color", content: "#E07832" }],
    ["link", { rel: "preload", href: "/fonts/bricolage-grotesque-var.woff2", as: "font", type: "font/woff2", crossorigin: "" }],
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
      pagefindPlugin({
        btnPlaceholder: "Search",
        placeholder: "Search tools, guides, and the API…",
        emptyText: "No matches found. Try a different term or check the spelling.",
        heading: "{{searchResult}} results",
        // Show a few sub-section matches per page so deep-linked headings surface.
        pageResultCount: 3,
      }),
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
- Tools: \`POST /api/v1/tools/{section}/{toolId}\` (multipart: file + settings JSON)
- Batch: \`POST /api/v1/tools/{section}/{toolId}/batch\` (multiple files, returns ZIP)
- Pipelines: \`POST /api/v1/pipeline/execute\` (chain tools sequentially)
- Interactive API docs on running instance: \`/api/docs\`
- OpenAPI spec on running instance: \`/api/v1/openapi.yaml\`

## Source

- [GitHub](https://github.com/snapotter-hq/snapotter)
- License: AGPLv3 (commercial license also available)
`,
        customTemplateVariables: {
          description:
            "SnapOtter is a self-hosted, open-source file processing platform with 240 tools across image, video, audio, PDF, and data. Includes AI/ML tools. Runs via Docker Compose with GPU auto-detection.",
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
      { text: "Tools", link: "/tools/image/resize" },
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
          { text: "SAML SSO", link: "/guide/saml" },
          { text: "SCIM Provisioning", link: "/guide/scim" },
          { text: "Users, Roles & Permissions", link: "/guide/users-roles" },
          { text: "Database", link: "/guide/database" },
          { text: "Deployment", link: "/guide/deployment" },
          { text: "Security & Hardening", link: "/guide/security" },
          { text: "What SnapOtter collects", link: "/guide/telemetry" },
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
            text: "Image",
            collapsed: false,
            items: [
          {
            text: "Essentials",
            items: [
              { text: "Resize", link: "/tools/image/resize" },
              { text: "Crop", link: "/tools/image/crop" },
              { text: "Rotate & Flip", link: "/tools/image/rotate" },
              { text: "Convert", link: "/tools/image/convert" },
              { text: "Compress", link: "/tools/image/compress" },
            ],
          },
          {
            text: "Optimization",
            items: [
              { text: "Optimize for Web", link: "/tools/image/optimize-for-web" },
              { text: "Remove Metadata", link: "/tools/image/strip-metadata" },
              { text: "Edit Metadata", link: "/tools/image/edit-metadata" },
              { text: "Bulk Rename", link: "/tools/image/bulk-rename" },
              { text: "Image to PDF", link: "/tools/image/image-to-pdf" },
              { text: "Favicon Generator", link: "/tools/image/favicon" },
            ],
          },
          {
            text: "Adjustments",
            items: [
              { text: "Adjust Colors", link: "/tools/image/adjust-colors" },
              { text: "Sharpening", link: "/tools/image/sharpening" },
              { text: "Replace & Invert Color", link: "/tools/image/replace-color" },
              { text: "Color Blindness Simulation", link: "/tools/image/color-blindness" },
              { text: "Duotone", link: "/tools/image/duotone" },
              { text: "Pixelate", link: "/tools/image/pixelate" },
              { text: "Vignette", link: "/tools/image/vignette" },
            ],
          },
          {
            text: "Watermark & Overlay",
            items: [
              { text: "Text Watermark", link: "/tools/image/watermark-text" },
              { text: "Image Watermark", link: "/tools/image/watermark-image" },
              { text: "Text Overlay", link: "/tools/image/text-overlay" },
              { text: "Image Composition", link: "/tools/image/compose" },
              { text: "Meme Generator", link: "/tools/image/meme-generator" },
            ],
          },
          {
            text: "Utilities",
            items: [
              { text: "Image Info", link: "/tools/image/info" },
              { text: "Image Compare", link: "/tools/image/compare" },
              { text: "Find Duplicates", link: "/tools/image/find-duplicates" },
              { text: "Color Palette", link: "/tools/image/color-palette" },
              { text: "QR Code Generator", link: "/tools/image/qr-generate" },
              { text: "HTML to Image", link: "/tools/image/html-to-image" },
              { text: "Barcode Reader", link: "/tools/image/barcode-read" },
              { text: "Image to Base64", link: "/tools/image/image-to-base64" },
              { text: "Histogram", link: "/tools/image/histogram" },
              { text: "LQIP Placeholder", link: "/tools/image/lqip-placeholder" },
              { text: "Barcode Generator", link: "/tools/image/barcode-generate" },
            ],
          },
          {
            text: "Layout",
            items: [
              { text: "Collage / Grid", link: "/tools/image/collage" },
              { text: "Stitch / Combine", link: "/tools/image/stitch" },
              { text: "Image Splitting", link: "/tools/image/split" },
              { text: "Border & Frame", link: "/tools/image/border" },
              { text: "Beautify Screenshot", link: "/tools/image/beautify" },
              { text: "Circle Crop", link: "/tools/image/circle-crop" },
              { text: "Image Pad", link: "/tools/image/image-pad" },
              { text: "Sprite Sheet", link: "/tools/image/sprite-sheet" },
            ],
          },
          {
            text: "Format",
            items: [
              { text: "SVG to Raster", link: "/tools/image/svg-to-raster" },
              { text: "Image to SVG", link: "/tools/image/vectorize" },
              { text: "GIF Tools", link: "/tools/image/gif-tools" },
              { text: "GIF/WebP Converter", link: "/tools/image/gif-webp" },
            ],
          },
          {
            text: "AI Tools",
            items: [
              { text: "Remove Background", link: "/tools/image/remove-background" },
              { text: "Image Upscaling", link: "/tools/image/upscale" },
              { text: "Object Eraser", link: "/tools/image/erase-object" },
              { text: "OCR / Text Extraction", link: "/tools/image/ocr" },
              { text: "Face / PII Blur", link: "/tools/image/blur-faces" },
              { text: "Smart Crop", link: "/tools/image/smart-crop" },
              { text: "Image Enhancement", link: "/tools/image/image-enhancement" },
              { text: "Face Enhancement", link: "/tools/image/enhance-faces" },
              { text: "AI Colorization", link: "/tools/image/colorize" },
              { text: "Noise Removal", link: "/tools/image/noise-removal" },
              { text: "Red Eye Removal", link: "/tools/image/red-eye-removal" },
              { text: "Photo Restoration", link: "/tools/image/restore-photo" },
              { text: "Passport Photo", link: "/tools/image/passport-photo" },
              { text: "Content-Aware Resize", link: "/tools/image/content-aware-resize" },
              { text: "AI Canvas Expand", link: "/tools/image/ai-canvas-expand" },
              { text: "PNG Transparency Fixer", link: "/tools/image/transparency-fixer" },
              { text: "Background Replace", link: "/tools/image/background-replace" },
              { text: "Blur Background", link: "/tools/image/blur-background" },
            ],
          },
            ],
          },
          {
            text: "Video",
            items: [
              { text: "Convert Video", link: "/tools/video/convert-video" },
              { text: "Compress Video", link: "/tools/video/compress-video" },
              { text: "Trim Video", link: "/tools/video/trim-video" },
              { text: "Mute Video", link: "/tools/video/mute-video" },
              { text: "Video to GIF", link: "/tools/video/video-to-gif" },
              { text: "Resize Video", link: "/tools/video/resize-video" },
              { text: "Crop Video", link: "/tools/video/crop-video" },
              { text: "Rotate Video", link: "/tools/video/rotate-video" },
              { text: "Change FPS", link: "/tools/video/change-fps" },
              { text: "Video Color", link: "/tools/video/video-color" },
              { text: "Video Speed", link: "/tools/video/video-speed" },
              { text: "Reverse Video", link: "/tools/video/reverse-video" },
              { text: "Normalize Audio", link: "/tools/video/video-loudnorm" },
              { text: "Aspect Pad", link: "/tools/video/aspect-pad" },
              { text: "Blur Pad", link: "/tools/video/blur-pad" },
              { text: "Watermark Video", link: "/tools/video/watermark-video" },
              { text: "Stabilize Video", link: "/tools/video/stabilize-video" },
              { text: "GIF to Video", link: "/tools/video/gif-to-video" },
              { text: "Video to WebP", link: "/tools/video/video-to-webp" },
              { text: "Video to Frames", link: "/tools/video/video-to-frames" },
              { text: "Merge Videos", link: "/tools/video/merge-videos" },
              { text: "Replace Audio", link: "/tools/video/replace-audio" },
              { text: "Burn Subtitles", link: "/tools/video/burn-subtitles" },
              { text: "Embed Subtitles", link: "/tools/video/embed-subtitles" },
              { text: "Extract Subtitles", link: "/tools/video/extract-subtitles" },
              { text: "Images to Video", link: "/tools/video/images-to-video" },
              { text: "Clean Video Metadata", link: "/tools/video/video-metadata" },
              { text: "Auto Subtitles", link: "/tools/video/auto-subtitles" },
              { text: "Extract Audio", link: "/tools/video/extract-audio" },
            ],
          },
          {
            text: "Audio",
            items: [
              { text: "Convert Audio", link: "/tools/audio/convert-audio" },
              { text: "Trim Audio", link: "/tools/audio/trim-audio" },
              { text: "Volume Adjust", link: "/tools/audio/volume-adjust" },
              { text: "Normalize Audio", link: "/tools/audio/normalize-audio" },
              { text: "Fade Audio", link: "/tools/audio/fade-audio" },
              { text: "Reverse Audio", link: "/tools/audio/reverse-audio" },
              { text: "Audio Speed", link: "/tools/audio/audio-speed" },
              { text: "Pitch Shift", link: "/tools/audio/pitch-shift" },
              { text: "Audio Channels", link: "/tools/audio/audio-channels" },
              { text: "Silence Removal", link: "/tools/audio/silence-removal" },
              { text: "Noise Reduction", link: "/tools/audio/noise-reduction" },
              { text: "Merge Audio", link: "/tools/audio/merge-audio" },
              { text: "Split Audio", link: "/tools/audio/split-audio" },
              { text: "Ringtone Maker", link: "/tools/audio/ringtone-maker" },
              { text: "Waveform Image", link: "/tools/audio/waveform-image" },
              { text: "Audio Metadata", link: "/tools/audio/audio-metadata" },
              { text: "Transcribe Audio", link: "/tools/audio/transcribe-audio" },
            ],
          },
          {
            text: "PDF",
            items: [
              { text: "PDF to Image", link: "/tools/pdf/pdf-to-image" },
              { text: "Merge PDFs", link: "/tools/pdf/merge-pdf" },
              { text: "Split PDF", link: "/tools/pdf/split-pdf" },
              { text: "Compress PDF", link: "/tools/pdf/compress-pdf" },
              { text: "Rotate PDF", link: "/tools/pdf/rotate-pdf" },
              { text: "Extract Pages", link: "/tools/pdf/extract-pages" },
              { text: "Remove Pages", link: "/tools/pdf/remove-pages" },
              { text: "Organize PDF", link: "/tools/pdf/organize-pdf" },
              { text: "Protect PDF", link: "/tools/pdf/protect-pdf" },
              { text: "Unlock PDF", link: "/tools/pdf/unlock-pdf" },
              { text: "Repair PDF", link: "/tools/pdf/repair-pdf" },
              { text: "Web-Optimize PDF", link: "/tools/pdf/linearize-pdf" },
              { text: "Grayscale PDF", link: "/tools/pdf/grayscale-pdf" },
              { text: "PDF/A Convert", link: "/tools/pdf/pdfa-convert" },
              { text: "Crop PDF", link: "/tools/pdf/crop-pdf" },
              { text: "N-up PDF", link: "/tools/pdf/nup-pdf" },
              { text: "Booklet PDF", link: "/tools/pdf/booklet-pdf" },
              { text: "Watermark PDF", link: "/tools/pdf/watermark-pdf" },
              { text: "PDF Page Numbers", link: "/tools/pdf/pdf-page-numbers" },
              { text: "Flatten PDF", link: "/tools/pdf/flatten-pdf" },
              { text: "Redact PDF", link: "/tools/pdf/redact-pdf" },
              { text: "PDF to Text", link: "/tools/pdf/pdf-to-text" },
              { text: "PDF to Word", link: "/tools/pdf/pdf-to-word" },
              { text: "PDF Metadata", link: "/tools/pdf/pdf-metadata" },
              { text: "PDF OCR", link: "/tools/pdf/ocr-pdf" },
            ],
          },
          {
            text: "Files",
            items: [
              { text: "Convert Document", link: "/tools/files/convert-document" },
              { text: "Convert Presentation", link: "/tools/files/convert-presentation" },
              { text: "Convert Spreadsheet", link: "/tools/files/convert-spreadsheet" },
              { text: "Excel to PDF", link: "/tools/files/excel-to-pdf" },
              { text: "Word to PDF", link: "/tools/files/word-to-pdf" },
              { text: "PowerPoint to PDF", link: "/tools/files/powerpoint-to-pdf" },
              { text: "HTML to PDF", link: "/tools/files/html-to-pdf" },
              { text: "Markdown to Word", link: "/tools/files/markdown-to-docx" },
              { text: "Markdown to HTML", link: "/tools/files/markdown-to-html" },
              { text: "Markdown to PDF", link: "/tools/files/markdown-to-pdf" },
              { text: "Convert EPUB", link: "/tools/files/epub-convert" },
              { text: "Convert to EPUB", link: "/tools/files/to-epub" },
              { text: "Chart Maker", link: "/tools/files/chart-maker" },
              { text: "CSV to Excel", link: "/tools/files/csv-excel" },
              { text: "CSV to JSON", link: "/tools/files/csv-json" },
              { text: "JSON to XML", link: "/tools/files/json-xml" },
              { text: "Split CSV", link: "/tools/files/split-csv" },
              { text: "Merge CSVs", link: "/tools/files/merge-csvs" },
              { text: "YAML / JSON", link: "/tools/files/yaml-json" },
              { text: "XML to CSV", link: "/tools/files/xml-to-csv" },
              { text: "Create ZIP", link: "/tools/files/create-zip" },
              { text: "Extract ZIP", link: "/tools/files/extract-zip" },
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
