---
description: Replace image background with a solid color or gradient using AI.
---

# Background Replace

Replace the background of an image with a solid color or gradient. The AI model detects the subject, removes the original background, and composites the subject onto your chosen background.

## API Endpoint

`POST /api/v1/tools/background-replace`

Accepts multipart form data with an image file and a JSON `settings` field.

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| backgroundType | string | No | `"color"` | Background mode: `color` or `gradient` |
| color | string | No | `"#ffffff"` | Background hex color (when backgroundType is `color`) |
| gradientColor1 | string | No | - | First gradient hex color |
| gradientColor2 | string | No | - | Second gradient hex color |
| gradientAngle | integer | No | `180` | Gradient angle in degrees (0-360) |
| feather | integer | No | `0` | Edge feathering radius (0-20) |
| format | string | No | `"png"` | Output format: `png` or `webp` |

## Example Request

```bash
curl -X POST http://localhost:1349/api/v1/tools/background-replace \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"backgroundType": "color", "color": "#2563eb", "feather": 2}'
```

## Example Response

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

Track progress via SSE at `GET /api/v1/jobs/{jobId}/progress`. When the job completes, the SSE stream emits a `completed` event with the download URL.

## Notes

- This is an AI-powered tool that returns `202 Accepted` and processes asynchronously. Connect to the SSE endpoint to receive progress updates and the final result.
- Requires the **background-removal** feature bundle to be installed. Returns `501` if the bundle is not available.
- HEIC, RAW, PSD, and SVG inputs are automatically decoded before processing.
- Output defaults to PNG to preserve transparency around the subject.
