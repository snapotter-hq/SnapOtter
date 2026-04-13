# REST API

The API server runs on port 1349 by default and serves all endpoints under `/api`.

::: tip Full API Reference
Your Stirling Image instance includes a complete interactive API reference at `/api/docs` (e.g. `http://your-host:1349/api/docs`) with all 80+ endpoints, request/response schemas, and examples.
:::

::: info LLM-friendly docs
Need to feed these docs to an AI assistant? Use [`/llms.txt`](/llms.txt) for an index or [`/llms-full.txt`](/llms-full.txt) for the complete documentation in a single file. On a running instance, these are also available at `/llms.txt` and `/llms-full.txt`.
:::

This page covers the basics of using the API. For per-endpoint details (every parameter, schema, and response), see the interactive docs at `/api/docs`.

## Authentication

Two methods:

1. **Session token** -- `POST /api/auth/login` with `{ "username", "password" }`. Returns a `token`. Pass as `Authorization: Bearer <token>`.
2. **API key** -- Generate via Settings UI or `POST /api/v1/api-keys`. Prefixed with `si_`. Pass as `Authorization: Bearer si_...`.

Public endpoints (no auth required): health check, login, API docs, downloads, job progress.

## Using a tool

Every tool follows the same pattern:

```
POST /api/v1/tools/:toolId
Content-Type: multipart/form-data
```

Send a multipart request with:
- `file` -- the image
- `settings` -- JSON string with tool-specific options

```json
{
  "jobId": "abc123",
  "downloadUrl": "/api/v1/download/abc123/output.png",
  "originalSize": 245000,
  "processedSize": 180000
}
```

### Tool IDs

| Category | Tools |
|----------|-------|
| **Essentials** | `resize`, `crop`, `rotate`, `convert`, `compress` |
| **Optimization** | `strip-metadata`, `edit-metadata`, `bulk-rename`, `image-to-pdf`, `favicon` |
| **Adjustments** | `adjust-colors`, `replace-color` |
| **AI** | `remove-background`, `upscale`, `erase-object`, `ocr`, `blur-faces`, `smart-crop`, `content-aware-resize` |
| **Watermark** | `watermark-text`, `watermark-image`, `text-overlay`, `compose` |
| **Utilities** | `info`, `compare`, `find-duplicates`, `color-palette`, `qr-generate`, `barcode-read` |
| **Layout** | `collage`, `split`, `border`, `stitch` |
| **Format** | `svg-to-raster`, `vectorize`, `gif-tools`, `pdf-to-image` |

Each tool's specific settings are documented in the interactive API reference at `/api/docs` on your running instance.

## Batch processing

```
POST /api/v1/tools/:toolId/batch
```

Send multiple files with the same settings. Returns a ZIP. Use the `X-Job-Id` header to track progress.

## Pipelines

Chain tools into reusable workflows.

```
POST /api/v1/pipeline/execute   -- Run a pipeline (multipart: file + steps JSON)
POST /api/v1/pipeline/batch     -- Run a pipeline across multiple files (returns ZIP)
POST /api/v1/pipeline/save      -- Save a named pipeline
GET  /api/v1/pipeline/list      -- List saved pipelines
GET  /api/v1/pipeline/tools     -- List all pipeline-compatible tool IDs
DELETE /api/v1/pipeline/:id     -- Delete a pipeline
```

Example steps:

```json
[
  { "toolId": "resize", "settings": { "width": 200, "height": 200, "fit": "cover" } },
  { "toolId": "compress", "settings": { "quality": 80 } },
  { "toolId": "convert", "settings": { "format": "webp" } }
]
```

## Progress tracking (SSE)

For long-running jobs (AI tools, batch processing):

```
GET /api/v1/jobs/:jobId/progress
```

Returns a Server-Sent Events stream with `{ status, progress, completedFiles, failedFiles }`.

## Error responses

```json
{ "statusCode": 400, "error": "Bad Request", "message": "Invalid image format" }
```

Status codes: `400` invalid input, `401` not authenticated, `403` not authorized, `413` file too large, `429` rate limited, `500` server error.
