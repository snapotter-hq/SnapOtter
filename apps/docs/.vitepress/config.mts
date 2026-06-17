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
              { text: "Duotone", link: "/tools/duotone" },
              { text: "Pixelate", link: "/tools/pixelate" },
              { text: "Vignette", link: "/tools/vignette" },
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
              { text: "Histogram", link: "/tools/histogram" },
              { text: "LQIP Placeholder", link: "/tools/lqip-placeholder" },
              { text: "Barcode Generator", link: "/tools/barcode-generate" },
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
              { text: "Circle Crop", link: "/tools/circle-crop" },
              { text: "Image Pad", link: "/tools/image-pad" },
              { text: "Sprite Sheet", link: "/tools/sprite-sheet" },
            ],
          },
          {
            text: "Format",
            items: [
              { text: "SVG to Raster", link: "/tools/svg-to-raster" },
              { text: "Image to SVG", link: "/tools/vectorize" },
              { text: "GIF Tools", link: "/tools/gif-tools" },
              { text: "GIF/WebP Converter", link: "/tools/gif-webp" },
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
              { text: "Background Replace", link: "/tools/background-replace" },
              { text: "Blur Background", link: "/tools/blur-background" },
            ],
          },
          {
            text: "Video",
            items: [
              { text: "Convert Video", link: "/tools/convert-video" },
              { text: "Compress Video", link: "/tools/compress-video" },
              { text: "Trim Video", link: "/tools/trim-video" },
              { text: "Mute Video", link: "/tools/mute-video" },
              { text: "Video to GIF", link: "/tools/video-to-gif" },
              { text: "Resize Video", link: "/tools/resize-video" },
              { text: "Crop Video", link: "/tools/crop-video" },
              { text: "Rotate Video", link: "/tools/rotate-video" },
              { text: "Change FPS", link: "/tools/change-fps" },
              { text: "Video Color", link: "/tools/video-color" },
              { text: "Video Speed", link: "/tools/video-speed" },
              { text: "Reverse Video", link: "/tools/reverse-video" },
              { text: "Normalize Audio", link: "/tools/video-loudnorm" },
              { text: "Aspect Pad", link: "/tools/aspect-pad" },
              { text: "Blur Pad", link: "/tools/blur-pad" },
              { text: "Watermark Video", link: "/tools/watermark-video" },
              { text: "Stabilize Video", link: "/tools/stabilize-video" },
              { text: "GIF to Video", link: "/tools/gif-to-video" },
              { text: "Video to WebP", link: "/tools/video-to-webp" },
              { text: "Video to Frames", link: "/tools/video-to-frames" },
              { text: "Merge Videos", link: "/tools/merge-videos" },
              { text: "Replace Audio", link: "/tools/replace-audio" },
              { text: "Burn Subtitles", link: "/tools/burn-subtitles" },
              { text: "Embed Subtitles", link: "/tools/embed-subtitles" },
              { text: "Extract Subtitles", link: "/tools/extract-subtitles" },
              { text: "Images to Video", link: "/tools/images-to-video" },
              { text: "Clean Video Metadata", link: "/tools/video-metadata" },
              { text: "Auto Subtitles", link: "/tools/auto-subtitles" },
              { text: "Extract Audio", link: "/tools/extract-audio" },
            ],
          },
          {
            text: "Audio",
            items: [
              { text: "Convert Audio", link: "/tools/convert-audio" },
              { text: "Trim Audio", link: "/tools/trim-audio" },
              { text: "Volume Adjust", link: "/tools/volume-adjust" },
              { text: "Normalize Audio", link: "/tools/normalize-audio" },
              { text: "Fade Audio", link: "/tools/fade-audio" },
              { text: "Reverse Audio", link: "/tools/reverse-audio" },
              { text: "Audio Speed", link: "/tools/audio-speed" },
              { text: "Pitch Shift", link: "/tools/pitch-shift" },
              { text: "Audio Channels", link: "/tools/audio-channels" },
              { text: "Silence Removal", link: "/tools/silence-removal" },
              { text: "Noise Reduction", link: "/tools/noise-reduction" },
              { text: "Merge Audio", link: "/tools/merge-audio" },
              { text: "Split Audio", link: "/tools/split-audio" },
              { text: "Ringtone Maker", link: "/tools/ringtone-maker" },
              { text: "Waveform Image", link: "/tools/waveform-image" },
              { text: "Audio Metadata", link: "/tools/audio-metadata" },
              { text: "Transcribe Audio", link: "/tools/transcribe-audio" },
            ],
          },
          {
            text: "PDF & Documents",
            items: [
              { text: "PDF to Image", link: "/tools/pdf-to-image" },
              { text: "Merge PDFs", link: "/tools/merge-pdf" },
              { text: "Split PDF", link: "/tools/split-pdf" },
              { text: "Compress PDF", link: "/tools/compress-pdf" },
              { text: "Rotate PDF", link: "/tools/rotate-pdf" },
              { text: "Convert Document", link: "/tools/convert-document" },
              { text: "Convert Presentation", link: "/tools/convert-presentation" },
              { text: "Convert Spreadsheet", link: "/tools/convert-spreadsheet" },
              { text: "Excel to PDF", link: "/tools/excel-to-pdf" },
              { text: "Word to PDF", link: "/tools/word-to-pdf" },
              { text: "Extract Pages", link: "/tools/extract-pages" },
              { text: "Remove Pages", link: "/tools/remove-pages" },
              { text: "Organize PDF", link: "/tools/organize-pdf" },
              { text: "Protect PDF", link: "/tools/protect-pdf" },
              { text: "Unlock PDF", link: "/tools/unlock-pdf" },
              { text: "Repair PDF", link: "/tools/repair-pdf" },
              { text: "Web-Optimize PDF", link: "/tools/linearize-pdf" },
              { text: "Grayscale PDF", link: "/tools/grayscale-pdf" },
              { text: "PDF/A Convert", link: "/tools/pdfa-convert" },
              { text: "Crop PDF", link: "/tools/crop-pdf" },
              { text: "N-up PDF", link: "/tools/nup-pdf" },
              { text: "Booklet PDF", link: "/tools/booklet-pdf" },
              { text: "Watermark PDF", link: "/tools/watermark-pdf" },
              { text: "PDF Page Numbers", link: "/tools/pdf-page-numbers" },
              { text: "Flatten PDF", link: "/tools/flatten-pdf" },
              { text: "Redact PDF", link: "/tools/redact-pdf" },
              { text: "PDF to Text", link: "/tools/pdf-to-text" },
              { text: "PDF to Word", link: "/tools/pdf-to-word" },
              { text: "PDF Metadata", link: "/tools/pdf-metadata" },
              { text: "PowerPoint to PDF", link: "/tools/powerpoint-to-pdf" },
              { text: "HTML to PDF", link: "/tools/html-to-pdf" },
              { text: "Markdown to Word", link: "/tools/markdown-to-docx" },
              { text: "Markdown to HTML", link: "/tools/markdown-to-html" },
              { text: "Markdown to PDF", link: "/tools/markdown-to-pdf" },
              { text: "Convert EPUB", link: "/tools/epub-convert" },
              { text: "Convert to EPUB", link: "/tools/to-epub" },
              { text: "PDF OCR", link: "/tools/ocr-pdf" },
            ],
          },
          {
            text: "Data",
            items: [
              { text: "Chart Maker", link: "/tools/chart-maker" },
              { text: "CSV to Excel", link: "/tools/csv-excel" },
              { text: "CSV to JSON", link: "/tools/csv-json" },
              { text: "JSON to XML", link: "/tools/json-xml" },
              { text: "Split CSV", link: "/tools/split-csv" },
              { text: "Merge CSVs", link: "/tools/merge-csvs" },
              { text: "YAML / JSON", link: "/tools/yaml-json" },
              { text: "XML to CSV", link: "/tools/xml-to-csv" },
              { text: "Create ZIP", link: "/tools/create-zip" },
              { text: "Extract ZIP", link: "/tools/extract-zip" },
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
