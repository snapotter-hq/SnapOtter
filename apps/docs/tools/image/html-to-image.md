---
description: Capture webpages or HTML snippets as high-quality images with device emulation.
---

# HTML to Image {#html-to-image}

Capture a webpage URL or raw HTML content as a screenshot image. Supports device emulation (desktop, tablet, mobile), full-page capture, and multiple output formats.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/html-to-image`

Accepts a **JSON body** (not multipart). No file upload is needed.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| url | string | Conditional | - | URL to capture (must be a valid URL) |
| html | string | Conditional | - | Raw HTML content to render (1 to 5,000,000 characters) |
| format | string | No | `"png"` | Output format: `jpg`, `png`, `webp` |
| quality | number | No | `90` | Output quality for lossy formats (1 to 100) |
| fullPage | boolean | No | `false` | Capture the full scrollable page, not just the viewport |
| devicePreset | string | No | `"desktop"` | Device emulation: `desktop`, `tablet`, `mobile`, `custom` |
| viewportWidth | number | No | `1280` | Custom viewport width in pixels (320 to 3840, used when devicePreset is `custom`) |
| viewportHeight | number | No | `720` | Custom viewport height in pixels (320 to 2160, used when devicePreset is `custom`) |
| clientJobId | string | No | - | Your own job id, so you can open the progress stream before the answer arrives |

Either `url` or `html` must be provided, but not both.

### Device Presets {#device-presets}

| Preset | Width | Height | Mobile UA |
|--------|-------|--------|-----------|
| `desktop` | 1280 | 720 | No |
| `tablet` | 768 | 1024 | No |
| `mobile` | 375 | 812 | Yes |
| `custom` | (user-specified) | (user-specified) | No |

## Example Request {#example-request}

Capture a webpage:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/html-to-image \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com", "format": "png", "fullPage": true, "devicePreset": "desktop"}'
```

Render HTML content:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/html-to-image \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"html": "<div style=\"padding: 20px; background: #f0f0f0;\"><h1>Hello</h1></div>", "format": "png"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/screenshot.png",
  "originalSize": 0,
  "processedSize": 145000
}
```

### Slow pages {#slow-pages}

The capture runs as a queued job. A capture that finishes inside the synchronous wait window answers `200` with the result above. A slower one answers `202` with a job id:

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true,
  "statusUrl": "/api/v1/jobs/a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "progressUrl": "/api/v1/jobs/a1b2c3d4-e5f6-7890-abcd-ef1234567890/progress"
}
```

Follow `progressUrl` (Server-Sent Events) until the job completes. The completed event carries the same result object as the `200` answer. You can cancel the job with `POST /api/v1/jobs/{jobId}/cancel`.

::: warning Changed after 2.3.0
Up to 2.3.0 this endpoint always held the request open until the capture finished and answered `200`. Scripts that only handle `200` should also handle `202`.
:::

## Notes {#notes}

- Requires Chromium to be installed on the server. Returns HTTP 503 if the browser service is not available.
- URLs are validated against SSRF attacks (private/internal network addresses are blocked).
- This endpoint is rate-limited to 120 requests per hour.
- `originalSize` is always 0 since this tool generates images from URLs/HTML.
- The output filename is `screenshot.<format>`.
- If the page takes too long to load, the capture fails with HTTP 504 (gateway timeout).
- If the browser service crashes repeatedly, it is temporarily disabled and the capture fails with HTTP 503 and code `BROWSER_CRASHED`.
- A browser crash (HTTP 503) is retried once before it reports the failure, like other queued image jobs. A page-load timeout is not retried.
- A capture that has already answered `202` reports a failure on its progress stream instead of in the HTTP status.
