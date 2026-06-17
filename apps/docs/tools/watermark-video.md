---
description: Burn a text watermark onto video frames.
---

# Watermark Video

Burn a text watermark onto every frame of a video with configurable position, size, opacity, and color.

## API Endpoint

`POST /api/v1/tools/watermark-video`

Accepts multipart form data with a video file and a JSON `settings` field.

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| text | string | Yes | - | Watermark text (1-200 characters) |
| position | string | No | `"br"` | Position on the frame: `tl`, `tc`, `tr`, `l`, `c`, `r`, `bl`, `bc`, `br` |
| fontSize | integer | No | `36` | Font size in pixels (8-120) |
| opacity | number | No | `0.5` | Watermark opacity (0.05-1) |
| color | string | No | `"#ffffff"` | Hex color for the text (e.g. `"#ffffff"`) |

### Position Values

- **tl** - Top left, **tc** - Top center, **tr** - Top right
- **l** - Middle left, **c** - Center, **r** - Middle right
- **bl** - Bottom left, **bc** - Bottom center, **br** - Bottom right

## Example Request

```bash
curl -X POST http://localhost:1349/api/v1/tools/watermark-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"text": "PREVIEW", "position": "c", "fontSize": 48, "opacity": 0.3}'
```

## Example Response

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 12400000
}
```

## Notes

- The watermark is permanently rendered into the video frames and cannot be removed after processing.
- The watermark uses a sans-serif font built into FFmpeg.
- For image watermarks, use the image Watermark tool instead.
