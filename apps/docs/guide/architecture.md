# Architecture

SnapOtter is a monorepo managed with pnpm workspaces and Turborepo. Everything ships as a single Docker container.

## Project structure

```
snapotter/
├── apps/
│   ├── api/          # Fastify backend
│   ├── web/          # React + Vite frontend
│   └── docs/         # This VitePress site
├── packages/
│   ├── image-engine/ # Sharp-based image operations
│   ├── ai/           # Python AI model bridge
│   └── shared/       # Types, constants, i18n
└── docker/           # Dockerfile and Compose config
```

## Packages

### `@snapotter/image-engine`

The core image processing library built on [Sharp](https://sharp.pixelplumbing.com/). It handles all non-AI operations: resize, crop, rotate, flip, convert, compress, strip metadata, and color adjustments (brightness, contrast, saturation, grayscale, sepia, invert, color channels).

This package has no network dependencies and runs entirely in-process.

### `@snapotter/ai`

A bridge layer that calls Python scripts for ML operations. On first use, the bridge starts a persistent Python dispatcher process that pre-imports heavy libraries (PIL, NumPy, MediaPipe, rembg) so subsequent AI calls skip the import overhead. If the dispatcher is not yet ready, the bridge falls back to spawning a fresh Python subprocess per request.

**Models are not pre-loaded.** Each tool script loads its model weights from disk at request time and discards them when the request finishes. See [Resource footprint](#resource-footprint) for the full memory profile.

Supported operations: background removal (rembg/BiRefNet), upscaling (RealESRGAN), face blur (MediaPipe), face enhancement (GFPGAN/CodeFormer), object erasing (LaMa ONNX), OCR (PaddleOCR/Tesseract), colorization (DDColor), noise removal, red eye removal, photo restoration, passport photo generation, transparency fixing (BiRefNet HR-matting), and content-aware resize (Go caire binary).

Python scripts live in `packages/ai/python/`. The Docker image pre-downloads all model weights during the build so the container works fully offline.

### `@snapotter/shared`

Shared TypeScript types, constants (like `APP_VERSION` and tool definitions), and i18n translation strings used by both the frontend and backend.

## Applications

### API (`apps/api`)

A Fastify v5 server exposing 48 tool routes (33 standard image operations + 15 AI-powered) that handles:
- File uploads, temporary workspace management, and persistent file storage
- User file library with version chains (`user_files` table) -- each processed result links back to its source file and records which tool was applied, with auto-generated thumbnails for the Files page
- Tool execution (routes each tool request to the image engine or AI bridge)
- Pipeline orchestration (chaining multiple tools sequentially)
- Batch processing with concurrency control via p-queue
- User authentication, RBAC (admin/user roles with a full permission set), API key management, and rate limiting
- Teams management -- admin-only CRUD; users are assigned to a team via the `team` field on their profile
- Runtime settings -- a key-value store in the `settings` table that controls `disabledTools`, `enableExperimentalTools`, `loginAttemptLimit`, and other operational knobs without redeploying
- Custom branding -- logo upload endpoint; the uploaded image is stored at `data/branding/logo.png` and served to the frontend
- Swagger/OpenAPI documentation at `/api/docs`
- Serving the built frontend as a SPA in production

Key dependencies: Fastify, Drizzle ORM, better-sqlite3, Sharp, Piscina (worker thread pool), Zod for validation.

The server handles graceful shutdown on SIGTERM/SIGINT: it drains HTTP connections, stops the worker pool, shuts down the Python dispatcher, and closes the database.

### Web (`apps/web`)

A React 19 single-page app built with Vite. Uses Zustand for state management, Tailwind CSS v4 for styling, and Lucide for icons. Communicates with the API over REST and SSE (for progress tracking).

Pages include a tool workspace, a Files page for managing persistent uploads and results, an automation/pipeline builder, and an admin settings panel.

The built frontend gets served by the Fastify backend in production, so there is no separate web server in the Docker container.

### Docs (`apps/docs`)

This VitePress site. Deployed to Cloudflare Pages automatically on push to `main`.

## How a request flows

1. The user picks a tool in the web UI and uploads an image.
2. The frontend sends a multipart POST to `/api/v1/tools/:toolId` with the file and settings.
3. The API route validates the input with Zod, then dispatches processing.
4. For standard tools, the request is offloaded to a Piscina worker thread pool so Sharp operations don't block the main event loop. The worker auto-orients the image based on EXIF metadata, runs the tool's process function, and returns the result. If the worker pool is unavailable, processing falls back to the main thread.
5. For AI tools, the TypeScript bridge sends a request to the persistent Python dispatcher (or spawns a fresh subprocess as fallback), waits for it to finish, and reads the output file.
6. Job progress is persisted to the `jobs` SQLite table so state survives container restarts. Real-time updates are delivered via SSE at `/api/v1/jobs/:jobId/progress`.
7. The API returns a `jobId` and `downloadUrl`. The user downloads the processed image from `/api/v1/download/:jobId/:filename`.

For pipelines, the API feeds the output of each step as input to the next, running them sequentially.

For batch processing, the API uses p-queue with a configurable concurrency limit (`CONCURRENT_JOBS`) and returns a ZIP file with all processed images.

## Resource footprint

SnapOtter is designed for low idle memory use. Nothing is preloaded or kept warm at startup.

### At idle

Only the Node.js/Fastify process is running. Typical idle RAM is **~100-150 MB** (Node.js process + SQLite connection). No Python process, no worker threads, no model weights in memory.

### What starts, and when

| Component | Starts when | Memory while active |
|-----------|-------------|---------------------|
| Fastify server | Container start | ~100-150 MB |
| Piscina worker threads | First standard tool request | Spawned on demand, terminated after **30 s idle** |
| Python dispatcher | First AI tool request | Python interpreter + pre-imported libraries (PIL, NumPy, MediaPipe, rembg) - no model weights |
| AI model weights | During the specific tool's request | Loaded from disk, freed when the request finishes |

### Model loading

All model weight files (totalling several GB) sit on disk in `/opt/models/` at all times. Each AI tool script loads only its own model(s) into memory for the duration of a request, then releases them. Some scripts explicitly call `del model` and `torch.cuda.empty_cache()` after inference to ensure memory is returned immediately.

There is no model cache between requests. Running the same AI tool back-to-back reloads the model each time. This keeps idle memory near zero at the cost of a model-load delay on every AI request.

### First AI request cold start

The Python dispatcher is not running when the container starts. The first AI request triggers two things in parallel: the dispatcher starts warming up in the background, and the request itself falls back to a one-off Python subprocess spawn. Once the dispatcher signals ready, all subsequent AI requests use it directly and skip the subprocess spawn cost.
