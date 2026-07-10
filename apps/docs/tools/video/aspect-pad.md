---
description: Add solid-color bars to fit a target aspect ratio.
---

# Aspect Pad {#aspect-pad}

Add solid-color letterbox or pillarbox bars to fit a video into a target aspect ratio without cropping.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/aspect-pad`

Accepts multipart form data with a video file and a JSON `settings` field.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| target | string | No | `"9:16"` | Target aspect ratio: `16:9`, `9:16`, `1:1`, `4:3`, `3:4` |
| color | string | No | `"#000000"` | Hex color for the padding bars (e.g. `"#000000"` for black) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/aspect-pad \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"target": "1:1", "color": "#ffffff"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 13200000
}
```

## Notes {#notes}

- If the video already matches the target aspect ratio, the file is returned unchanged.
- Use `9:16` for vertical/portrait social media formats (TikTok, Reels, Shorts).
- For blurred padding instead of solid color, use the Blur Pad tool.
