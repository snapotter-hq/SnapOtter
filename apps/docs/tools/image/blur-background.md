---
description: Blur the background while keeping the subject sharp using AI.
---

# Blur Background

Blur the background of an image while keeping the subject sharp. The AI model isolates the subject, applies a blur to the original background, and composites the sharp subject on top.

## API Endpoint

`POST /api/v1/tools/blur-background`

Accepts multipart form data with an image file and a JSON `settings` field.

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| intensity | integer | No | `50` | Blur intensity (1-100) |
| feather | integer | No | `0` | Edge feathering radius (0-20) |
| format | string | No | `"png"` | Output format: `png` or `webp` |

## Example Request

```bash
curl -X POST http://localhost:1349/api/v1/tools/blur-background \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"intensity": 75, "feather": 3}'
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
- Higher intensity values produce a stronger blur effect. Values above 80 create a pronounced bokeh-like separation.
- HEIC, RAW, PSD, and SVG inputs are automatically decoded before processing.
