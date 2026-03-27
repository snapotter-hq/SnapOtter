# REST API

The API server runs on port 1349 by default and serves all endpoints under `/api`.

::: tip Interactive API Reference
When your Stirling Image instance is running, visit [`/api/docs`](http://localhost:1349/api/docs) for an interactive API reference with full endpoint documentation, request schemas, and response examples.
:::

::: info LLM-friendly docs
Need to feed these docs to an AI assistant? Use [`/llms.txt`](/Stirling-Image/llms.txt) for an index or [`/llms-full.txt`](/Stirling-Image/llms-full.txt) for the complete documentation in a single file. On a running instance, these are also available at `/llms.txt` and `/llms-full.txt`.
:::

The reference below covers the key endpoints. For the complete specification, see the interactive docs.

## Authentication

Requests can be authenticated in two ways:

1. **Session cookie** -- Log in via `POST /api/auth/login` and the server sets a session cookie.
2. **API key** -- Pass an `Authorization: Bearer si_...` header with an API key.

Some endpoints (health check, login, API docs) are public and don't require authentication.

## Tools

### Execute a tool

```
POST /api/v1/tools/:toolId
Content-Type: multipart/form-data
```

Send a multipart request with:
- `file` -- The image file
- `settings` -- JSON string with tool-specific options

Response:

```json
{
  "jobId": "abc123",
  "downloadUrl": "/api/v1/download/abc123/output.png",
  "originalSize": 245000,
  "processedSize": 180000
}
```

### Available tool IDs

**Image operations:** `resize`, `crop`, `rotate`, `flip`, `convert`, `compress`, `strip-metadata`, `border`

**Color:** `color-adjustments`, `grayscale`, `sepia`, `invert`, `color-palette`, `replace-color`

**Text and codes:** `watermark-text`, `watermark-image`, `text-overlay`, `qr-generate`, `barcode-read`, `ocr`

**Composition:** `compose`, `collage`, `split`, `image-to-pdf`

**Analysis:** `info`, `compare`, `find-duplicates`

**Conversion:** `svg-to-raster`, `vectorize`, `favicon`, `gif-tools`

**AI-powered:** `remove-background`, `upscale`, `blur-faces`, `erase-object`, `smart-crop`

**Utility:** `bulk-rename`

### Batch processing

```
POST /api/v1/tools/:toolId/batch
Content-Type: multipart/form-data
```

Send multiple files with the same settings. Returns a ZIP file containing all processed images. The response includes an `X-Job-Id` header you can use to track progress.

## File management

### Upload files

```
POST /api/v1/upload
Content-Type: multipart/form-data
```

Upload one or more images. Returns file identifiers for use with other endpoints.

### Download results

```
GET /api/v1/download/:jobId/:filename
```

Download a processed image by job ID and filename.

## Pipelines

Pipelines chain multiple tools together. The output of each step becomes the input for the next.

### Execute a pipeline

```
POST /api/v1/pipeline/execute
Content-Type: multipart/form-data
```

Body fields:
- `file` -- The input image
- `steps` -- JSON array of `{ "toolId": "resize", "settings": { ... } }` objects

Response includes `jobId`, `downloadUrl`, and details about each completed step.

### Save a pipeline

```
POST /api/v1/pipeline/save
Content-Type: application/json
```

```json
{
  "name": "Thumbnail generator",
  "description": "Resize and compress for web thumbnails",
  "steps": [
    { "toolId": "resize", "settings": { "width": 200, "height": 200, "fit": "cover" } },
    { "toolId": "compress", "settings": { "quality": 80 } },
    { "toolId": "convert", "settings": { "format": "webp" } }
  ]
}
```

### List saved pipelines

```
GET /api/v1/pipeline/list
```

### Delete a pipeline

```
DELETE /api/v1/pipeline/:id
```

## Progress tracking

For long-running jobs (AI operations, batch processing), you can track progress via Server-Sent Events.

```
GET /api/v1/jobs/:jobId/progress
```

The stream emits `JobProgress` objects:

```json
{
  "status": "processing",
  "progress": 45,
  "completedFiles": ["image1.jpg", "image2.jpg"],
  "failedFiles": [],
  "errors": []
}
```

The connection closes automatically 5 seconds after the job completes.

## API keys

### Generate a key

```
POST /api/v1/api-keys
Content-Type: application/json
```

```json
{ "name": "My integration" }
```

Returns the raw key (prefixed with `si_`). This is the only time the full key is shown.

### List keys

```
GET /api/v1/api-keys
```

Returns key metadata (name, prefix, creation date) but not the full key.

### Delete a key

```
DELETE /api/v1/api-keys/:id
```

## Settings

### Get all settings

```
GET /api/v1/settings
```

### Update settings

```
PUT /api/v1/settings
Content-Type: application/json
```

Admin only. Accepts a JSON object of key-value pairs.

## Auth endpoints

### Login

```
POST /api/auth/login
Content-Type: application/json
```

```json
{ "username": "admin", "password": "admin" }
```

Returns a session token and sets a cookie.

### Get current session

```
GET /api/auth/session
```

### Change password

```
POST /api/auth/change-password
Content-Type: application/json
```

```json
{ "currentPassword": "old", "newPassword": "new" }
```

### List users (admin)

```
GET /api/auth/users
```

### Create user (admin)

```
POST /api/auth/register
Content-Type: application/json
```

```json
{ "username": "newuser", "password": "pass", "role": "user" }
```

### Delete user (admin)

```
DELETE /api/auth/users/:id
```

## Health check

```
GET /api/v1/health
```

Returns `200 OK` if the server is running. Used by Docker's health check.

## Rate limiting

All endpoints are rate-limited to `RATE_LIMIT_PER_MIN` requests per minute per IP (default: 100). When exceeded, the server returns `429 Too Many Requests`.

## Error responses

Errors follow a consistent format:

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "Invalid image format"
}
```

Common status codes:
- `400` -- Invalid input (bad format, missing required fields)
- `401` -- Not authenticated
- `403` -- Not authorized (e.g., non-admin trying admin endpoints)
- `413` -- File too large (exceeds `MAX_UPLOAD_SIZE_MB`)
- `429` -- Rate limited
- `500` -- Server error
