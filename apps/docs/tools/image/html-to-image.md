---
description: Capture webpages or HTML snippets as high-quality images with device emulation.
---

# HTML to Image

Capture a webpage URL or raw HTML content as a screenshot image. Supports device emulation (desktop, tablet, mobile), full-page capture, and multiple output formats.

## API Endpoint

`POST /api/v1/tools/image/html-to-image`

Accepts a **JSON body** (not multipart). No file upload is needed.

## Parameters

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

Either `url` or `html` must be provided, but not both.

### Device Presets

| Preset | Width | Height | Mobile UA |
|--------|-------|--------|-----------|
| `desktop` | 1280 | 720 | No |
| `tablet` | 768 | 1024 | No |
| `mobile` | 375 | 812 | Yes |
| `custom` | (user-specified) | (user-specified) | No |

## Example Request

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

## Example Response

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/screenshot.png",
  "originalSize": 0,
  "processedSize": 145000
}
```

## Notes

- Requires Chromium to be installed on the server. Returns HTTP 503 if the browser service is not available.
- URLs are validated against SSRF attacks (private/internal network addresses are blocked).
- This endpoint is rate-limited to 120 requests per hour.
- `originalSize` is always 0 since this tool generates images from URLs/HTML.
- The output filename is `screenshot.<format>`.
- If the page takes too long to load, the request returns HTTP 504 (gateway timeout).
- If the browser service crashes repeatedly, it is temporarily disabled and returns HTTP 503 with code `BROWSER_CRASHED`.
