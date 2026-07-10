// SEO job-intent pages: "self-hosted <capability>" content.
// Each entry renders a static page at /self-hosted/<slug> plus a card on the hub.
// Canonical for "self-hosted / private / local <capability>" queries. Cross-links
// sideways to /alternatives/<competitor> and down to /tools/<section>/<tool>.
// Keep competitor claims sourced + dated (mirror the alternatives.ts discipline).

export interface UseCaseFaq {
  q: string;
  a: string;
}
export interface UseCaseSource {
  label: string;
  url: string;
}

export interface UseCase {
  slug: string;
  pageTitle: string; // SEO <title>, the phrase people search
  h1: string;
  metaDescription: string;
  intro: string;
  primaryKeyword: string; // canonical target query, must be unique across entries
  whatYouDoToday: string;
  whyRisky: string; // sourced + dated tone
  howSnapotter: string;
  toolIds: string[]; // must exist in @snapotter/shared TOOLS
  toolRoutes: string[]; // /tools/<section>/<tool> cross-links
  alternativeSlug?: string; // /alternatives/<slug> cross-link when one exists
  docker: string; // command for QuickstartBlock (canonical single-container line)
  curl: string; // REST API example for QuickstartBlock
  isAiBundle: boolean; // show one-time-install note if true
  bundleId?: string; // set iff isAiBundle; a FEATURE_BUNDLES id
  faqs: UseCaseFaq[];
  sources: UseCaseSource[];
  lastReviewed: string; // YYYY-MM-DD
}

export const DOCKER_CMD =
  "docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest";

const REVIEWED = "2026-07-10";

// Build a REST API example for one tool. `isLong` toggles the sync (200 + downloadUrl)
// vs long (202 + SSE) shape. `settings` is omitted from the command when empty, since
// the settings field is optional and each tool applies its own Zod defaults.
function apiExample(opts: {
  isLong: boolean;
  section: string;
  tool: string;
  input: string;
  settings?: string;
}): string {
  const { isLong, section, tool, input, settings } = opts;
  const lines = [
    isLong
      ? "# Process a file over the REST API (long tool: 202, then stream progress)"
      : "# Process a file over the REST API (sync tool: returns a downloadUrl)",
    `curl -s -X POST http://localhost:1349/api/v1/tools/${section}/${tool} \\`,
    '  -H "Authorization: Bearer si_YOUR_KEY" \\',
  ];
  if (settings) {
    lines.push(`  -F "file=@${input}" \\`);
    lines.push(
      isLong
        ? `  -F 'settings=${settings}'   # -> {"jobId":"...","async":true}`
        : `  -F 'settings=${settings}' | jq -r .downloadUrl`,
    );
  } else {
    lines.push(
      isLong
        ? `  -F "file=@${input}"   # -> {"jobId":"...","async":true}`
        : `  -F "file=@${input}" | jq -r .downloadUrl`,
    );
  }
  if (isLong) {
    lines.push("");
    lines.push("curl -N http://localhost:1349/api/v1/jobs/<jobId>/progress   # SSE progress");
  }
  return lines.join("\n");
}

const FULL_API_EXAMPLE = [
  "# 1. Create an API key once (store it; it is shown only once)",
  "curl -s -X POST http://localhost:1349/api/v1/api-keys \\",
  '  -H "Authorization: Bearer $SESSION_TOKEN" \\',
  '  -H "Content-Type: application/json" \\',
  `  -d '{"name":"conversion"}' | jq -r .key   # -> si_...`,
  "",
  "# 2. Compress an image (sync tool: returns a downloadUrl)",
  "curl -s -X POST http://localhost:1349/api/v1/tools/image/compress \\",
  '  -H "Authorization: Bearer si_YOUR_KEY" \\',
  '  -F "file=@photo.jpg" \\',
  `  -F 'settings={"quality":75}' | jq -r .downloadUrl`,
  "",
  "# 3. Download the result",
  'curl -s -o out.jpg "http://localhost:1349<downloadUrl>"',
].join("\n");

export const USE_CASES: UseCase[] = [
  {
    slug: "image-compressor",
    pageTitle: "Self-Hosted Image Compressor (Private, No Upload)",
    h1: "A self-hosted image compressor that never uploads your images",
    metaDescription:
      "Compress JPG, PNG, and WebP on your own server. A private, self-hosted image compressor with a REST API. No upload to a third-party service, no per-image limits.",
    intro:
      "TinyPNG and its clones compress your images on their servers. SnapOtter runs the same job on yours, through a UI or a REST API, so the originals never leave your network.",
    primaryKeyword: "self-hosted image compressor",
    whatYouDoToday:
      "You drag images into an online compressor, wait, and download the smaller files. The originals sit on a third-party server for as long as that service chooses to keep them.",
    whyRisky:
      "For public marketing assets that's usually fine. For product screenshots, ID scans, or anything with customer data in frame, you have handed a copy to a vendor whose retention you do not control. Free tiers also cap image count and size, so batch jobs stall.",
    howSnapotter:
      "SnapOtter's compress tool runs on your own instance. Point the UI at a batch or POST files to the API, get back optimized JPG, PNG, or WebP, and nothing leaves the box. The only limit is your hardware.",
    toolIds: ["compress"],
    toolRoutes: ["/tools/image/compress"],
    alternativeSlug: "tinypng",
    docker: DOCKER_CMD,
    curl: apiExample({
      isLong: false,
      section: "image",
      tool: "compress",
      input: "photo.jpg",
      settings: '{"quality":75}',
    }),
    isAiBundle: false,
    faqs: [
      {
        q: "Does it upload my images anywhere?",
        a: "No. Compression runs inside your SnapOtter instance. If you deploy it inside your own network, the images stay there.",
      },
      {
        q: "Which formats does it handle?",
        a: "JPG, PNG, and WebP for compression, with the wider SnapOtter catalog available for conversion in the same deployment.",
      },
      {
        q: "Is there an API for batch jobs?",
        a: "Yes. POST files to /api/v1/tools/image/compress with an si_ API key, or chain compression into a pipeline for whole folders.",
      },
    ],
    sources: [{ label: "TinyPNG", url: "https://tinypng.com" }],
    lastReviewed: REVIEWED,
  },
  {
    slug: "pdf-ocr",
    pageTitle: "Self-Hosted PDF OCR (Private, On-Premise)",
    h1: "Self-hosted PDF OCR that never uploads your documents",
    metaDescription:
      "Make scanned PDFs searchable on your own server. Private, self-hosted OCR with local models and a REST API. Air-gap capable, no per-page fees, no cloud upload.",
    intro:
      "Most OCR services process your documents on their servers. SnapOtter runs OCR locally, so contracts and records stay on infrastructure you control.",
    primaryKeyword: "self-hosted pdf ocr",
    whatYouDoToday:
      "You upload a scanned PDF to an online OCR tool and download searchable text or a tagged PDF. The document leaves your network to get there.",
    whyRisky:
      "Scanned documents are exactly the sensitive kind: contracts, medical records, statements. Online OCR services process and often retain uploads under terms you do not set, which is hard to square with GDPR or HIPAA and impossible to audit.",
    howSnapotter:
      "SnapOtter runs the OCR model inside your instance. Install the OCR bundle once, then it works offline, air-gapped included. The PDF never leaves your network, and there is no per-page charge.",
    toolIds: ["ocr-pdf"],
    toolRoutes: ["/tools/pdf/ocr-pdf"],
    docker: DOCKER_CMD,
    curl: apiExample({
      isLong: true,
      section: "pdf",
      tool: "ocr-pdf",
      input: "scan.pdf",
      settings: '{"language":"en"}',
    }),
    isAiBundle: true,
    bundleId: "ocr",
    faqs: [
      {
        q: "Does it work air-gapped?",
        a: "Yes. After the one-time OCR bundle install, OCR runs entirely offline, so it works in air-gapped and classified networks.",
      },
      {
        q: "Are my documents retained anywhere?",
        a: "No. The PDF is processed inside your instance. There is no auto-save; you choose whether to keep a result.",
      },
      {
        q: "Which languages are supported?",
        a: "The OCR bundle covers a range of languages; pass the target language in the tool settings.",
      },
    ],
    sources: [],
    lastReviewed: REVIEWED,
  },
  {
    slug: "video-converter",
    pageTitle: "Self-Hosted Video Converter (Private, No Upload)",
    h1: "A self-hosted video converter that keeps your footage on your server",
    metaDescription:
      "Convert video formats on your own server. A private, self-hosted video converter with a REST API. No upload to a third-party service, no file-size caps beyond your hardware.",
    intro:
      "CloudConvert and the online transcoders do the work on their servers, which means your footage goes to them first. SnapOtter runs FFmpeg on your own hardware, so the files never leave your network.",
    primaryKeyword: "self-hosted video converter",
    whatYouDoToday:
      "You upload a clip to an online converter, wait for the transcode, and download the result. Large files mean long uploads, and the footage sits on someone else's server while it processes.",
    whyRisky:
      "Video is heavy and often sensitive: raw interviews, internal training, unreleased product footage, camera pulls with people in frame. Online converters process uploads on infrastructure you do not control, and free tiers cap file size and minutes, so real work stalls or forces a paid plan.",
    howSnapotter:
      "SnapOtter transcodes with a static FFmpeg build inside your instance. Convert between MP4, WebM, MOV, MKV, and AVI through the UI or the REST API, with no size cap beyond your disk and no footage leaving the box. Long jobs report progress over a live stream.",
    toolIds: ["convert-video"],
    toolRoutes: ["/tools/video/convert-video"],
    alternativeSlug: "cloudconvert",
    docker: DOCKER_CMD,
    curl: apiExample({
      isLong: true,
      section: "video",
      tool: "convert-video",
      input: "clip.mov",
      settings: '{"format":"mp4"}',
    }),
    isAiBundle: false,
    faqs: [
      {
        q: "Is there a file-size limit?",
        a: "No hard limit from SnapOtter. You are bounded by your own disk and CPU, not by a vendor's plan tier.",
      },
      {
        q: "Does my footage get uploaded anywhere?",
        a: "No. Transcoding runs inside your instance, so the source and output stay on your infrastructure.",
      },
      {
        q: "Which formats are supported?",
        a: "The common web and editing formats via FFmpeg, including MP4, WebM, MOV, MKV, and AVI.",
      },
    ],
    sources: [{ label: "CloudConvert", url: "https://cloudconvert.com" }],
    lastReviewed: REVIEWED,
  },
  {
    slug: "background-removal",
    pageTitle: "Self-Hosted Background Removal (remove.bg Alternative)",
    h1: "Self-hosted background removal that runs on your own hardware",
    metaDescription:
      "Remove image backgrounds on your own server with local AI. A private, self-hosted remove.bg alternative. No per-image credits, no upload to a cloud API.",
    intro:
      "remove.bg does the cutout in the cloud, one credit at a time. SnapOtter runs the same kind of AI locally, so product shots and photos of people never go to a third-party service.",
    primaryKeyword: "self-hosted background removal",
    whatYouDoToday:
      "You upload an image to an online background remover, it returns a cutout, and you pay per image or per credit. Every image you process is sent to the vendor's API first.",
    whyRisky:
      "Background removal usually runs on the images you care about most: product photography before launch, headshots, user-uploaded photos. Sending those to a per-credit cloud API means a third party sees them, and the cost scales with every image at exactly the moment you want to batch thousands.",
    howSnapotter:
      "SnapOtter runs background removal with a local model after a one-time bundle install. Drop images in the UI or POST them to the API, get transparent PNGs back, and nothing leaves your network. No per-image credit, and a GPU is used automatically if you have one.",
    toolIds: ["remove-background"],
    toolRoutes: ["/tools/image/remove-background"],
    alternativeSlug: "removebg",
    docker: DOCKER_CMD,
    curl: apiExample({
      isLong: true,
      section: "image",
      tool: "remove-background",
      input: "photo.jpg",
    }),
    isAiBundle: true,
    bundleId: "background-removal",
    faqs: [
      {
        q: "Does it need a GPU?",
        a: "No. It runs on CPU and uses a GPU automatically if one is available for faster batches.",
      },
      {
        q: "Are my images uploaded anywhere?",
        a: "No. The cutout runs inside your instance, so the images stay on your infrastructure.",
      },
      {
        q: "Is it really free per image?",
        a: "Yes. After the one-time model install there is no per-image charge; you are bounded only by your hardware.",
      },
    ],
    sources: [{ label: "remove.bg", url: "https://www.remove.bg" }],
    lastReviewed: REVIEWED,
  },
  {
    slug: "transcription",
    pageTitle: "Self-Hosted Transcription (Private, Local Whisper)",
    h1: "Self-hosted transcription that keeps recordings on your infrastructure",
    metaDescription:
      "Transcribe audio on your own server with local Whisper models. A private, self-hosted Otter.ai alternative. No upload to a transcription cloud, no per-minute fees.",
    intro:
      "Otter.ai and the online transcribers upload your recordings to their servers to turn them into text. SnapOtter runs Whisper locally, so meetings and interviews stay on infrastructure you control.",
    primaryKeyword: "self-hosted transcription",
    whatYouDoToday:
      "You upload a recording to a transcription service and get text back a few minutes later. The audio, and everything said in it, is processed and stored on the vendor's servers.",
    whyRisky:
      "Recordings are dense with sensitive content: internal meetings, customer calls, interviews, legal discussions. Transcription SaaS processes and retains that audio under terms you do not set, which is a hard fit for confidential or regulated material and impossible to audit after the fact.",
    howSnapotter:
      "SnapOtter transcribes with faster-whisper inside your instance. Install the transcription bundle once, then it runs offline, air-gapped included. The audio never leaves your network, and there is no per-minute charge. Export plain text, SRT, or VTT.",
    toolIds: ["transcribe-audio"],
    toolRoutes: ["/tools/audio/transcribe-audio"],
    alternativeSlug: "otter-ai",
    docker: DOCKER_CMD,
    curl: apiExample({
      isLong: true,
      section: "audio",
      tool: "transcribe-audio",
      input: "meeting.m4a",
      settings: '{"outputFormat":"srt"}',
    }),
    isAiBundle: true,
    bundleId: "transcription",
    faqs: [
      {
        q: "Does it work offline?",
        a: "Yes. After the one-time transcription bundle install it runs fully offline, so recordings never need a network round-trip.",
      },
      {
        q: "Is the audio retained anywhere?",
        a: "No. The recording is processed inside your instance. There is no auto-save; you choose whether to keep the transcript.",
      },
      {
        q: "Which languages and formats?",
        a: "Whisper handles a wide range of languages, with plain text, SRT, or VTT output selected in the tool settings.",
      },
    ],
    sources: [{ label: "Otter.ai", url: "https://otter.ai" }],
    lastReviewed: REVIEWED,
  },
  {
    slug: "file-conversion-api",
    pageTitle: "Self-Hosted File Conversion API (Private, REST)",
    h1: "A self-hosted file conversion API you run yourself",
    metaDescription:
      "A self-hosted REST API for converting and compressing files. OpenAPI 3.1, bearer-key auth, sync and async jobs. The private alternative to a hosted file conversion API.",
    intro:
      "Hosted conversion APIs send every file through their infrastructure and bill per job. SnapOtter gives you the same kind of REST API, running entirely on your own servers.",
    primaryKeyword: "self-hosted file conversion api",
    whatYouDoToday:
      "You wire your app to a hosted conversion API, ship files to it over the network, and pay per conversion. Every file your users touch passes through a third party, and the bill scales with usage.",
    whyRisky:
      "An API in your critical path that ships user files to a vendor is a data-residency and cost problem at once. You inherit their retention terms, their uptime, and their per-job pricing, and you cannot run any of it in an air-gapped or on-prem environment.",
    howSnapotter:
      "SnapOtter exposes a documented REST API: an OpenAPI 3.1 spec at /api/v1/openapi.yaml and interactive docs at /api/docs. Authenticate with an si_ bearer key, POST a file to /api/v1/tools/{section}/{toolId}, and get a downloadUrl back for fast tools or a 202 plus live progress for long ones. It runs in CI, cron, and internal services, on your own hardware.",
    toolIds: ["compress", "convert-video"],
    toolRoutes: ["/tools/image/compress", "/tools/video/convert-video"],
    alternativeSlug: "cloudconvert",
    docker: DOCKER_CMD,
    curl: FULL_API_EXAMPLE,
    isAiBundle: false,
    faqs: [
      {
        q: "Is the API documented?",
        a: "Yes. There is an OpenAPI 3.1 spec at /api/v1/openapi.yaml and an interactive reference at /api/docs.",
      },
      {
        q: "How does authentication work?",
        a: "Create an API key (prefixed si_) and send it as an Authorization: Bearer header. Keys carry scoped permissions.",
      },
      {
        q: "Sync or async?",
        a: "Fast tools return 200 with a downloadUrl. Long tools return 202 and stream progress over server-sent events.",
      },
    ],
    sources: [{ label: "CloudConvert API", url: "https://cloudconvert.com/api/v2" }],
    lastReviewed: REVIEWED,
  },
  {
    slug: "metadata-removal",
    pageTitle: "Self-Hosted Metadata Removal (EXIF, PDF)",
    h1: "Self-hosted metadata removal for images and PDFs",
    metaDescription:
      "Strip EXIF and GPS from images and scrub PDF metadata on your own server. A private, self-hosted metadata remover with a REST API. Batch-ready, no upload.",
    intro:
      "Photos carry GPS coordinates, device IDs, and timestamps. PDFs carry author names and software fingerprints. SnapOtter strips all of it on your own server, before anything gets shared.",
    primaryKeyword: "self-hosted metadata removal",
    whatYouDoToday:
      "You paste a photo or PDF into an online metadata remover to clean it before publishing or sending. To strip the data, you first hand the original, metadata and all, to the tool.",
    whyRisky:
      "Metadata is the leak you forget about: home GPS in a photo, a client's name in a PDF author field, the exact software and version that made a file. Uploading the original to an online scrubber to remove that data means the untouched file, with everything you wanted to hide, reaches a third party first.",
    howSnapotter:
      "SnapOtter strips EXIF and GPS from images and scrubs PDF metadata locally. Clean single files or whole batches through the UI or the REST API, with the originals never leaving your network. For documents that need more than metadata removal, the redact-pdf tool permanently removes the content itself.",
    toolIds: ["strip-metadata", "pdf-metadata"],
    toolRoutes: ["/tools/image/strip-metadata", "/tools/pdf/pdf-metadata"],
    docker: DOCKER_CMD,
    curl: apiExample({
      isLong: false,
      section: "image",
      tool: "strip-metadata",
      input: "photo.jpg",
    }),
    isAiBundle: false,
    faqs: [
      {
        q: "Does it remove GPS location?",
        a: "Yes. Stripping image metadata removes EXIF including GPS coordinates, device info, and timestamps.",
      },
      {
        q: "Can it batch many files?",
        a: "Yes, through a pipeline or the REST API, so you can scrub whole folders in one run.",
      },
      {
        q: "What about redaction?",
        a: "Metadata removal strips hidden data. To remove visible content from a PDF, use the redact-pdf tool, which performs verified true redaction.",
      },
    ],
    sources: [],
    lastReviewed: REVIEWED,
  },
];
