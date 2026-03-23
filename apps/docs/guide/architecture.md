# Architecture

Stirling Image is a monorepo managed with pnpm workspaces and Turborepo. Everything ships as a single Docker container.

## Project structure

```
Stirling-Image/
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

### `@stirling-image/image-engine`

The core image processing library built on [Sharp](https://sharp.pixelplumbing.com/). It handles all non-AI operations: resize, crop, rotate, flip, convert, compress, strip metadata, and color adjustments (brightness, contrast, saturation, grayscale, sepia, invert, color channels).

This package has no network dependencies and runs entirely in-process.

### `@stirling-image/ai`

A bridge layer that calls Python scripts via child processes. Each AI capability has a TypeScript wrapper that spawns a Python subprocess, passes image data through the filesystem, and returns the result.

Supported operations:
- **Background removal** -- BiRefNet-Lite model via rembg
- **Upscaling** -- RealESRGAN
- **OCR** -- PaddleOCR
- **Face detection/blurring** -- MediaPipe
- **Object erasing (inpainting)** -- LaMa Cleaner

Python scripts live in `packages/ai/python/`. The Docker image pre-downloads all model weights during the build so the container works offline.

### `@stirling-image/shared`

Shared TypeScript types, constants (like `APP_VERSION` and tool definitions), and i18n translation strings used by both the frontend and backend.

## Applications

### API (`apps/api`)

A Fastify v5 server that handles:
- File uploads and temporary workspace management
- Tool execution (routes each tool request to the image engine or AI bridge)
- Pipeline orchestration (chaining multiple tools sequentially)
- Batch processing with concurrency control via p-queue
- User authentication, API key management, and rate limiting
- Swagger/OpenAPI documentation at `/api/docs`
- Serving the built frontend as a SPA in production

Key dependencies: Fastify, Drizzle ORM, better-sqlite3, Sharp, Zod for validation.

### Web (`apps/web`)

A React 19 single-page app built with Vite. Uses Zustand for state management, Tailwind CSS v4 for styling, and Lucide for icons. Communicates with the API over REST and SSE (for progress tracking).

The built frontend gets served by the Fastify backend in production, so there is no separate web server in the Docker container.

### Docs (`apps/docs`)

This VitePress site. Deployed to GitHub Pages automatically on push to `main`.

## How a request flows

1. The user picks a tool in the web UI and uploads an image.
2. The frontend sends a multipart POST to `/api/v1/tools/:toolId` with the file and settings.
3. The API route validates the input with Zod, then calls the appropriate package function -- either `@stirling-image/image-engine` for standard operations or `@stirling-image/ai` for ML tasks.
4. For AI tools, the TypeScript bridge spawns a Python subprocess, waits for it to finish, and reads the output file.
5. The API returns a `jobId` and `downloadUrl`. The frontend can poll `/api/v1/jobs/:jobId/progress` via SSE for real time status on longer tasks.
6. The user downloads the processed image from `/api/v1/download/:jobId/:filename`.

For pipelines, the API feeds the output of each step as input to the next, running them sequentially.

For batch processing, the API uses p-queue with a configurable concurrency limit (`CONCURRENT_JOBS`) and returns a ZIP file with all processed images.
