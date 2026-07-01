// SEO comparison pages: "open-source alternative to <X>" content.
// Each entry renders a static page at /alternatives/<slug> plus a card on the hub.
// Keep competitor claims sourced, dated, and framed around deployment model,
// data control, and workflow fit instead of brittle point-by-point parity.

export interface ComparisonRow {
  feature: string;
  snapotter: string;
  competitor: string;
  /** true when SnapOtter has the advantage on this row (drives the check styling) */
  snapotterWins: boolean;
}

export interface AltFaq {
  q: string;
  a: string;
}

export interface AlternativeSource {
  label: string;
  url: string;
}

export interface Alternative {
  slug: string;
  /** Competitor brand name, e.g. "Smallpdf" */
  competitor: string;
  /** Short category label for cards, e.g. "PDF tools" */
  category: string;
  /** SEO <title>, written as the phrase people search */
  pageTitle: string;
  /** On-page H1 */
  h1: string;
  /** Meta description */
  metaDescription: string;
  /** One or two sentence lede under the H1 */
  intro: string;
  /** What SnapOtter brings beyond this competitor's single lane */
  breadth: string;
  /** true when the competitor is itself open-source / self-hostable (shifts framing to breadth) */
  competitorOpenSource: boolean;
  /** YYYY-MM-DD date when public vendor pages were last checked */
  lastReviewed: string;
  /** Public pages used to substantiate the comparison */
  sources: AlternativeSource[];
  rows: ComparisonRow[];
  faqs: AltFaq[];
}

const REVIEW_DATE = "2026-07-01";

interface HostedRowsOptions {
  category: string;
  competitorCoverage: string;
  pricing: string;
  fileHandling?: string;
  automation?: string;
}

const hostedRows = ({
  category,
  competitorCoverage,
  pricing,
  fileHandling = "Files are uploaded to a vendor-hosted service for processing",
  automation = "Browser workflow or vendor-managed API, depending on product",
}: HostedRowsOptions): ComparisonRow[] => [
  {
    feature: "Deployment model",
    snapotter: "Self-hosted on your server",
    competitor: "Hosted web service",
    snapotterWins: true,
  },
  {
    feature: "File processing location",
    snapotter: "Your infrastructure",
    competitor: fileHandling,
    snapotterWins: true,
  },
  {
    feature: "Cost control",
    snapotter: "Free AGPLv3; limits are your hardware",
    competitor: pricing,
    snapotterWins: true,
  },
  {
    feature: "Offline / air-gapped use",
    snapotter: "Supported when deployed inside your network",
    competitor: "Designed for browser-based online use",
    snapotterWins: true,
  },
  {
    feature: `Beyond ${category}`,
    snapotter: "Image, video, audio, PDF, and files",
    competitor: competitorCoverage,
    snapotterWins: true,
  },
  {
    feature: "Source and auditability",
    snapotter: "Source available under AGPLv3",
    competitor: "Vendor-operated service; source availability is not the product model",
    snapotterWins: true,
  },
  {
    feature: "Automation",
    snapotter: "REST API and pipelines in your deployment",
    competitor: automation,
    snapotterWins: true,
  },
];

export const ALTERNATIVES: Alternative[] = [
  {
    slug: "smallpdf",
    competitor: "Smallpdf",
    category: "PDF tools",
    pageTitle: "The Open-Source, Self-Hosted Alternative to Smallpdf",
    h1: "The open-source, self-hosted alternative to Smallpdf",
    metaDescription:
      "Smallpdf is a hosted PDF toolkit. SnapOtter runs PDF merge, split, compress, convert, OCR, and more on your own server, with 200+ extra tools across five file types.",
    intro:
      "Smallpdf is a polished hosted PDF suite. SnapOtter is the self-hosted alternative for teams that want PDF tools to run on infrastructure they control, without sending sensitive documents to a third-party PDF service.",
    breadth:
      "Smallpdf is focused on PDFs, which is exactly what many people need. SnapOtter covers that lane with merge, split, compress, convert, redact, OCR, and more, then adds image, video, audio, and file workflows in the same deployment.",
    competitorOpenSource: false,
    lastReviewed: REVIEW_DATE,
    sources: [
      { label: "Smallpdf tools", url: "https://smallpdf.com/pdf-tools" },
      { label: "Smallpdf pricing", url: "https://smallpdf.com/pricing" },
    ],
    rows: hostedRows({
      category: "PDFs",
      competitorCoverage: "PDF workflow suite",
      pricing: "Free and paid plans with plan-specific features",
    }),
    faqs: [
      {
        q: "Is there a free, self-hosted alternative to Smallpdf?",
        a: "Yes. SnapOtter is open source under AGPLv3 and runs on your own server with Docker. It covers merge, split, compress, convert, protect, redact, watermark, page numbers, and OCR, with no per-file fee from SnapOtter.",
      },
      {
        q: "Do my documents get uploaded anywhere?",
        a: "SnapOtter processes files on the machine you run it on. If you deploy it inside your own network, files stay inside that deployment instead of going to a third-party PDF service.",
      },
      {
        q: "Does SnapOtter do more than PDFs?",
        a: "Yes. Beyond PDF tools, SnapOtter handles image, video, audio, and file tasks too, so one deployment can cover several day-to-day file workflows.",
      },
    ],
  },
  {
    slug: "ilovepdf",
    competitor: "iLovePDF",
    category: "PDF tools",
    pageTitle: "The Open-Source, Self-Hosted Alternative to iLovePDF",
    h1: "The open-source, self-hosted alternative to iLovePDF",
    metaDescription:
      "iLovePDF is an online PDF service. SnapOtter gives teams self-hosted PDF tools plus image, video, audio, and file workflows in one open-source stack.",
    intro:
      "iLovePDF is a hosted PDF service for fast browser-based document work. SnapOtter is the self-hosted alternative when you want the same kind of PDF workflow to run on your own server.",
    breadth:
      "iLovePDF is strong for online PDF tasks. SnapOtter pairs PDF tools with image, video, audio, and file tools, so the same deployment handles a contract, a screen recording, and a podcast edit.",
    competitorOpenSource: false,
    lastReviewed: REVIEW_DATE,
    sources: [
      { label: "iLovePDF tools", url: "https://www.ilovepdf.com/" },
      { label: "iLovePDF pricing", url: "https://www.ilovepdf.com/pricing" },
    ],
    rows: hostedRows({
      category: "PDFs",
      competitorCoverage: "PDF workflow suite",
      pricing: "Free and premium plans with plan-specific features",
    }),
    faqs: [
      {
        q: "What's a self-hosted alternative to iLovePDF?",
        a: "SnapOtter. It is open source under AGPLv3, deploys with Docker, and gives you merge, split, compress, convert, protect, OCR, and related PDF workflows on your own hardware.",
      },
      {
        q: "Is SnapOtter free?",
        a: "The open-source edition is free. A paid enterprise tier adds controls like SSO and audit logging, but the file tools live in the open-source stack.",
      },
    ],
  },
  {
    slug: "tinypng",
    competitor: "TinyPNG",
    category: "Image compression",
    pageTitle: "The Open-Source, Self-Hosted Alternative to TinyPNG",
    h1: "The open-source, self-hosted alternative to TinyPNG",
    metaDescription:
      "TinyPNG compresses images online and through Tinify's API. SnapOtter compresses and converts images on your own server, with broader file workflows in one stack.",
    intro:
      "TinyPNG is a focused online image compressor. SnapOtter is the self-hosted alternative for teams that want compression, conversion, resize, metadata, and other image work to run locally.",
    breadth:
      "TinyPNG is excellent when the job is image compression. SnapOtter compresses PNG, JPEG, WebP, and AVIF, then keeps going with resize, crop, conversion, watermarking, metadata tools, video, audio, PDF, and file workflows.",
    competitorOpenSource: false,
    lastReviewed: REVIEW_DATE,
    sources: [{ label: "TinyPNG / Tinify", url: "https://tinypng.com/" }],
    rows: hostedRows({
      category: "image compression",
      competitorCoverage: "Image compression and Tinify API workflows",
      pricing: "Free web use and paid/developer API options",
    }),
    faqs: [
      {
        q: "Is there a self-hosted TinyPNG alternative?",
        a: "Yes. SnapOtter runs image compression locally, so the practical limit is your deployment hardware rather than a third-party image service quota.",
      },
      {
        q: "Which formats can SnapOtter compress?",
        a: "PNG, JPEG, WebP, and AVIF, with conversion between formats. SnapOtter also reads many input formats, including camera RAW formats.",
      },
    ],
  },
  {
    slug: "cloudconvert",
    competitor: "CloudConvert",
    category: "File conversion",
    pageTitle: "The Open-Source, Self-Hosted Alternative to CloudConvert",
    h1: "The open-source, self-hosted alternative to CloudConvert",
    metaDescription:
      "CloudConvert is a hosted conversion platform with an API. SnapOtter converts image, video, audio, PDF, and data files on your own server with open-source pipelines.",
    intro:
      "CloudConvert is a mature hosted converter and API. SnapOtter is the self-hosted alternative when conversion should happen inside your own infrastructure, with pipelines you control.",
    breadth:
      "CloudConvert is broad and API-friendly for conversion. SnapOtter converts across image, video, audio, PDF, and data formats, then adds compression, editing, OCR, transcription, and local pipelines.",
    competitorOpenSource: false,
    lastReviewed: REVIEW_DATE,
    sources: [
      { label: "CloudConvert product", url: "https://cloudconvert.com/" },
      { label: "CloudConvert pricing", url: "https://cloudconvert.com/pricing" },
    ],
    rows: hostedRows({
      category: "file conversion",
      competitorCoverage: "Hosted conversion across many file categories",
      pricing: "Usage-based and plan-based cloud pricing",
      automation: "Hosted API and browser workflows",
    }),
    faqs: [
      {
        q: "Can I self-host a CloudConvert alternative?",
        a: "Yes. SnapOtter is open source and runs on Docker. It converts image, video, audio, PDF, and data formats locally, with no per-conversion billing from SnapOtter.",
      },
      {
        q: "Does SnapOtter convert video and audio too?",
        a: "Yes. SnapOtter uses FFmpeg under the hood for video and audio, alongside Sharp for images and qpdf, LibreOffice, and related tools for documents.",
      },
    ],
  },
  {
    slug: "tinywow",
    competitor: "TinyWow",
    category: "Hosted online toolbox",
    pageTitle: "The Open-Source, Self-Hosted Alternative to TinyWow",
    h1: "The open-source, self-hosted alternative to TinyWow",
    metaDescription:
      "TinyWow is a broad hosted toolbox for PDF, image, video, AI writing, and file tasks. SnapOtter is the self-hosted alternative for private file workflows.",
    intro:
      "TinyWow is a broad hosted toolbox for quick PDF, image, video, AI writing, and file tasks. SnapOtter is the self-hosted alternative for teams that want everyday file utilities on infrastructure they control.",
    breadth:
      "TinyWow is convenient when you want a quick browser tool and do not want to install anything. SnapOtter is built for the other side of that tradeoff: private deployments, internal workflows, repeatable pipelines, and local file processing across image, video, audio, PDF, and files.",
    competitorOpenSource: false,
    lastReviewed: REVIEW_DATE,
    sources: [
      { label: "TinyWow tools", url: "https://tinywow.com/tools" },
      { label: "TinyWow support plans", url: "https://tinywow.com/support-tinywow" },
      { label: "TinyWow file deletion policy", url: "https://tinywow.com/your-data" },
    ],
    rows: [
      {
        feature: "Deployment model",
        snapotter: "Self-hosted on your server",
        competitor: "Hosted online toolbox",
        snapotterWins: true,
      },
      {
        feature: "File processing location",
        snapotter: "Your infrastructure",
        competitor: "Uploads to TinyWow servers; TinyWow says files are deleted after 1 hour",
        snapotterWins: true,
      },
      {
        feature: "Tool coverage",
        snapotter: "Image, video, audio, PDF, and files",
        competitor: "PDF, image, video, AI writing, and file utilities",
        snapotterWins: false,
      },
      {
        feature: "Cost control",
        snapotter: "Free AGPLv3; limits are your hardware",
        competitor: "Free tools plus paid supporter/content plans",
        snapotterWins: true,
      },
      {
        feature: "Offline / air-gapped use",
        snapotter: "Supported when deployed inside your network",
        competitor: "Designed for browser-based online use",
        snapotterWins: true,
      },
      {
        feature: "Source and auditability",
        snapotter: "Source available under AGPLv3",
        competitor: "Vendor-operated service; source availability is not the product model",
        snapotterWins: true,
      },
      {
        feature: "Automation",
        snapotter: "REST API and pipelines in your deployment",
        competitor: "Primarily quick web-tool workflows",
        snapotterWins: true,
      },
    ],
    faqs: [
      {
        q: "Is SnapOtter a TinyWow clone?",
        a: "No. TinyWow is a broad hosted web toolbox. SnapOtter is a self-hosted file-processing suite for teams that want private deployment, source visibility, APIs, and pipelines.",
      },
      {
        q: "Should I use TinyWow or SnapOtter?",
        a: "Use TinyWow for quick one-off browser tasks where hosted processing is acceptable. Use SnapOtter when files are sensitive, workflows repeat, or your organization needs processing to happen on infrastructure it controls.",
      },
      {
        q: "Does SnapOtter replace TinyWow's AI writing tools?",
        a: "Not directly. SnapOtter focuses on file manipulation: images, video, audio, PDFs, documents, archives, and data files. It is a better fit when the file-processing layer matters more than writing templates.",
      },
    ],
  },
  {
    slug: "adobe-acrobat-online",
    competitor: "Adobe Acrobat online",
    category: "PDF tools",
    pageTitle: "The Open-Source, Self-Hosted Alternative to Adobe Acrobat Online",
    h1: "The open-source, self-hosted alternative to Adobe Acrobat online",
    metaDescription:
      "Adobe Acrobat online is a hosted PDF toolset from Adobe. SnapOtter gives teams self-hosted PDF tools and broader file workflows with open-source deployment.",
    intro:
      "Adobe Acrobat online is a polished hosted PDF workflow from the company behind PDF. SnapOtter is the self-hosted alternative for teams that need PDF work to stay on their own infrastructure.",
    breadth:
      "Adobe Acrobat online is strong for PDF editing, signing, conversion, and Acrobat subscriptions. SnapOtter is not trying to replace the entire Adobe ecosystem; it gives teams self-hosted PDF tools plus image, video, audio, and file workflows in one open-source stack.",
    competitorOpenSource: false,
    lastReviewed: REVIEW_DATE,
    sources: [
      { label: "Adobe Acrobat online", url: "https://www.adobe.com/acrobat/online.html" },
      { label: "Adobe Acrobat pricing", url: "https://www.adobe.com/acrobat/pricing.html" },
      {
        label: "Adobe online PDF editor",
        url: "https://www.adobe.com/acrobat/online/pdf-editor.html",
      },
    ],
    rows: hostedRows({
      category: "PDFs",
      competitorCoverage: "PDF, e-signature, AI, and Acrobat account workflows",
      pricing: "Free online tools, trials, and paid Acrobat plans",
      fileHandling: "Adobe says online editor files are handled by Adobe servers",
    }),
    faqs: [
      {
        q: "Is SnapOtter a replacement for Adobe Acrobat Pro?",
        a: "Not for every Acrobat workflow. SnapOtter is best when you need self-hosted PDF processing, conversion, OCR, compression, page operations, and automation. Acrobat remains a deep desktop and cloud document platform.",
      },
      {
        q: "Why choose SnapOtter over Adobe Acrobat online?",
        a: "Choose SnapOtter when deployment control, source visibility, air-gapped use, or repeatable file pipelines matter more than Adobe account features and the wider Acrobat ecosystem.",
      },
    ],
  },
  {
    slug: "freeconvert",
    competitor: "FreeConvert",
    category: "File conversion",
    pageTitle: "The Open-Source, Self-Hosted Alternative to FreeConvert",
    h1: "The open-source, self-hosted alternative to FreeConvert",
    metaDescription:
      "FreeConvert converts and compresses files online. SnapOtter is the self-hosted alternative for image, video, audio, PDF, and file conversion on your own server.",
    intro:
      "FreeConvert is a broad hosted converter for browser-based file conversion and compression. SnapOtter is the self-hosted alternative when you want those file operations to run inside your own deployment.",
    breadth:
      "FreeConvert is useful for quick online conversions across many categories. SnapOtter covers conversion too, then adds local image tools, video/audio workflows, PDFs, archives, data tools, APIs, and pipelines.",
    competitorOpenSource: false,
    lastReviewed: REVIEW_DATE,
    sources: [
      { label: "FreeConvert product", url: "https://www.freeconvert.com/" },
      { label: "FreeConvert pricing", url: "https://www.freeconvert.com/pricing" },
    ],
    rows: hostedRows({
      category: "file conversion",
      competitorCoverage: "Online conversion and compression across many formats",
      pricing: "Free web tier plus paid plans for larger or higher-priority workloads",
      fileHandling:
        "Files are uploaded to FreeConvert; FreeConvert says converted files are automatically deleted after a few hours",
    }),
    faqs: [
      {
        q: "Can SnapOtter replace FreeConvert?",
        a: "For many image, video, audio, PDF, archive, and data conversions, yes. SnapOtter is strongest when you want the converter deployed privately instead of using a hosted web service.",
      },
      {
        q: "Does SnapOtter support large files?",
        a: "SnapOtter's practical limits come from your server, storage, memory, and configured runtime limits. That makes it a better fit when you want to tune capacity yourself.",
      },
    ],
  },
  {
    slug: "convertio",
    competitor: "Convertio",
    category: "File conversion",
    pageTitle: "The Open-Source, Self-Hosted Alternative to Convertio",
    h1: "The open-source, self-hosted alternative to Convertio",
    metaDescription:
      "Convertio is a cloud file converter with browser tools and an API. SnapOtter is the self-hosted alternative for private conversion workflows and local pipelines.",
    intro:
      "Convertio is a cloud converter for browser-based file conversion across many formats. SnapOtter is the self-hosted alternative when you want conversion jobs to stay inside your own infrastructure.",
    breadth:
      "Convertio is convenient for quick conversions and developer API use. SnapOtter keeps conversion local and adds broader file processing: compression, editing, OCR, transcription, PDF operations, and repeatable pipelines.",
    competitorOpenSource: false,
    lastReviewed: REVIEW_DATE,
    sources: [
      { label: "Convertio product", url: "https://convertio.co/" },
      {
        label: "Convertio free-tier limits",
        url: "https://support.convertio.co/hc/en-us/articles/360004386774-Free-tier-limit-for-file-conversions",
      },
    ],
    rows: hostedRows({
      category: "file conversion",
      competitorCoverage: "Cloud conversion across 300+ formats and API workflows",
      pricing: "Free tier with file and credit limits plus premium plans",
      fileHandling:
        "Cloud conversion; Convertio says uploaded files are deleted instantly and converted files after 24 hours",
      automation: "Hosted conversion API and browser workflows",
    }),
    faqs: [
      {
        q: "What is a self-hosted Convertio alternative?",
        a: "SnapOtter gives you a Docker-deployable converter and file-processing suite. Instead of sending files to a cloud converter, your server runs the conversion pipeline.",
      },
      {
        q: "Does SnapOtter have an API?",
        a: "Yes. SnapOtter includes REST APIs and pipeline support so teams can automate file workflows inside their own environment.",
      },
    ],
  },
  {
    slug: "online-convert",
    competitor: "Online-Convert",
    category: "File conversion",
    pageTitle: "The Open-Source, Self-Hosted Alternative to Online-Convert",
    h1: "The open-source, self-hosted alternative to Online-Convert",
    metaDescription:
      "Online-Convert converts video, image, audio, document, ebook, and archive files online. SnapOtter is the self-hosted alternative for private file workflows.",
    intro:
      "Online-Convert is a long-running hosted converter for many file categories. SnapOtter is the self-hosted alternative for teams that want conversion and processing to happen on their own server.",
    breadth:
      "Online-Convert covers many conversion categories and has an API ecosystem through API2Convert. SnapOtter is built for private deployments where conversion, compression, PDF work, audio/video processing, and local AI tools sit in one stack.",
    competitorOpenSource: false,
    lastReviewed: REVIEW_DATE,
    sources: [
      { label: "Online-Convert product", url: "https://www.online-convert.com/" },
      { label: "Online-Convert pricing", url: "https://www.online-convert.com/pricing" },
      { label: "API2Convert", url: "https://www.api2convert.com/" },
    ],
    rows: hostedRows({
      category: "file conversion",
      competitorCoverage: "Online converters for media, documents, ebooks, and archives",
      pricing: "Free trial, credit packages, subscriptions, and enterprise options",
      fileHandling: "Browser uploads to Online-Convert/API2Convert cloud services",
      automation: "Hosted API2Convert API and browser workflows",
    }),
    faqs: [
      {
        q: "Why choose SnapOtter over Online-Convert?",
        a: "Choose SnapOtter when privacy, internal deployment, open-source code, or air-gapped file processing matters. Choose Online-Convert when you prefer a hosted converter with no server to maintain.",
      },
      {
        q: "Does SnapOtter cover more than conversion?",
        a: "Yes. SnapOtter includes conversion, compression, editing, OCR, transcription, PDF operations, metadata tools, archives, data tools, and pipelines.",
      },
    ],
  },
  {
    slug: "otter-ai",
    competitor: "Otter.ai",
    category: "Transcription",
    pageTitle: "The Open-Source, Self-Hosted Alternative to Otter.ai",
    h1: "The open-source, self-hosted alternative to Otter.ai",
    metaDescription:
      "Otter.ai transcribes meetings in the cloud. SnapOtter runs speech-to-text on your own CPU or NVIDIA CUDA GPU with local Whisper models and no audio upload.",
    intro:
      "Otter.ai is a hosted meeting transcription platform. SnapOtter is the self-hosted alternative when you want transcription to run on your own CPU or NVIDIA CUDA GPU with local models.",
    breadth:
      "Otter.ai is built around meetings, notes, and collaboration. SnapOtter focuses on local speech-to-text plus the rest of an audio workflow: trim, normalize, noise reduction, format conversion, video subtitles, image, PDF, and file tools.",
    competitorOpenSource: false,
    lastReviewed: REVIEW_DATE,
    sources: [
      { label: "Otter.ai product", url: "https://otter.ai/" },
      { label: "Otter.ai pricing", url: "https://otter.ai/pricing" },
      { label: "Otter.ai free plan", url: "https://otter.ai/start-for-free" },
    ],
    rows: hostedRows({
      category: "transcription",
      competitorCoverage: "Meeting notes, AI summaries, collaboration, and transcription",
      pricing: "Free and paid plans with minute/import limits by plan",
      fileHandling: "Audio and meeting content is processed by the hosted Otter.ai service",
      automation: "Hosted app integrations and meeting workflows",
    }),
    faqs: [
      {
        q: "Is there a self-hosted Otter.ai alternative?",
        a: "Yes. SnapOtter runs transcription locally with Whisper models on your own CPU or NVIDIA CUDA GPU. It is better suited to private audio and video files than meeting-agent collaboration.",
      },
      {
        q: "Do I need a GPU?",
        a: "A GPU is faster, but transcription also runs on CPU. The models install on demand the first time you use the feature.",
      },
    ],
  },
  {
    slug: "stirling-pdf",
    competitor: "Stirling-PDF",
    category: "Self-hosted PDF",
    pageTitle: "SnapOtter vs Stirling-PDF: Self-Hosted File Tools Compared",
    h1: "SnapOtter vs Stirling-PDF",
    metaDescription:
      "Stirling-PDF is a strong self-hosted PDF toolkit. SnapOtter covers PDFs too, plus image, video, audio, and file tools in one stack. Both are open source.",
    intro:
      "Stirling-PDF and SnapOtter are both self-hosted and open source, so files stay on your server either way. The difference is scope: Stirling-PDF focuses on PDFs, while SnapOtter spans all five file types.",
    breadth:
      "If you only ever touch PDFs, Stirling-PDF is excellent and worth a look. If you also resize images, convert video, transcribe audio, or batch files, SnapOtter handles all of it in one deployment instead of running several tools side by side.",
    competitorOpenSource: true,
    lastReviewed: REVIEW_DATE,
    sources: [
      { label: "Stirling-PDF GitHub", url: "https://github.com/Stirling-Tools/stirling-pdf" },
      { label: "Stirling-PDF docs", url: "https://docs.stirlingpdf.com/" },
    ],
    rows: [
      {
        feature: "Self-hosted",
        snapotter: "Yes",
        competitor: "Yes",
        snapotterWins: false,
      },
      {
        feature: "Open source",
        snapotter: "Yes, AGPLv3",
        competitor: "Yes",
        snapotterWins: false,
      },
      {
        feature: "Primary focus",
        snapotter: "Full file workflow across five types",
        competitor: "PDF workflows",
        snapotterWins: true,
      },
      {
        feature: "Tool count",
        snapotter: "241",
        competitor: "60+ PDF operations",
        snapotterWins: true,
      },
      {
        feature: "Local AI (OCR, transcription, upscaling)",
        snapotter: "OCR, transcription, upscaling, and more",
        competitor: "PDF-oriented OCR workflows",
        snapotterWins: true,
      },
      {
        feature: "Layer-based image editor",
        snapotter: "Yes",
        competitor: "Not its focus",
        snapotterWins: true,
      },
      {
        feature: "Pipelines and batch processing",
        snapotter: "Yes",
        competitor: "PDF automation workflows",
        snapotterWins: false,
      },
    ],
    faqs: [
      {
        q: "Is SnapOtter a replacement for Stirling-PDF?",
        a: "It can be, if you want one stack for more than PDFs. SnapOtter's PDF coverage is broad, and it adds image, video, audio, and file tools. For a PDF-only setup, Stirling-PDF is a solid, focused choice.",
      },
      {
        q: "Are both free and open source?",
        a: "Both projects are open source and self-hostable. SnapOtter is AGPLv3 and adds an optional paid enterprise tier for SSO, audit logging, and similar controls.",
      },
    ],
  },
  {
    slug: "convertx",
    competitor: "ConvertX",
    category: "Self-hosted conversion",
    pageTitle: "SnapOtter vs ConvertX: Self-Hosted File Tools Compared",
    h1: "SnapOtter vs ConvertX",
    metaDescription:
      "ConvertX is a self-hosted file converter for 1000+ formats. SnapOtter converts too, and adds editing, compression, OCR, and transcription across five modalities.",
    intro:
      "ConvertX and SnapOtter are both self-hosted and open source. ConvertX is built around format conversion; SnapOtter does conversion plus the rest of a file workflow.",
    breadth:
      "ConvertX is a focused converter and handles a huge list of formats. SnapOtter converts as well, then adds compression, editing, redaction, OCR, transcription, and pipelines, so it fits when conversion is one step among many.",
    competitorOpenSource: true,
    lastReviewed: REVIEW_DATE,
    sources: [{ label: "ConvertX GitHub", url: "https://github.com/c4illin/ConvertX" }],
    rows: [
      {
        feature: "Self-hosted",
        snapotter: "Yes",
        competitor: "Yes",
        snapotterWins: false,
      },
      {
        feature: "Open source",
        snapotter: "Yes, AGPLv3",
        competitor: "Yes",
        snapotterWins: false,
      },
      {
        feature: "Primary focus",
        snapotter: "Full file workflow across five types",
        competitor: "Format conversion",
        snapotterWins: true,
      },
      {
        feature: "Beyond conversion",
        snapotter: "Compress, edit, redact, OCR, transcribe",
        competitor: "Conversion-centered workflow",
        snapotterWins: true,
      },
      {
        feature: "Tool count",
        snapotter: "241",
        competitor: "1000+ conversion formats",
        snapotterWins: false,
      },
      {
        feature: "Local AI tools",
        snapotter: "OCR, transcription, upscaling, and more",
        competitor: "Not a primary focus",
        snapotterWins: true,
      },
      {
        feature: "Layer-based image editor",
        snapotter: "Yes",
        competitor: "Not a primary focus",
        snapotterWins: true,
      },
    ],
    faqs: [
      {
        q: "Should I use SnapOtter or ConvertX?",
        a: "If you mainly need format conversion across many formats, ConvertX is a clean, focused option. If you also edit, compress, redact, OCR, or transcribe, SnapOtter does all of that in one stack.",
      },
      {
        q: "Do both keep files on my server?",
        a: "Yes. Both are self-hosted, so files stay on your infrastructure. The difference is breadth, not where your data lives.",
      },
    ],
  },
];
