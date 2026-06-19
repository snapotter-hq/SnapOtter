---
description: Generate a waveform visualization as a PNG image from an audio file.
---

# Waveform Image

Generate a waveform visualization as a PNG image from an audio file, with configurable dimensions and color.

## API Endpoint

`POST /api/v1/tools/waveform-image`

Accepts multipart form data with an audio file and a JSON `settings` field.

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| width | integer | No | `1024` | Image width in pixels (256 to 3840) |
| height | integer | No | `256` | Image height in pixels (64 to 1080) |
| color | string | No | `"#4f46e5"` | Waveform hex color (e.g. `"#4f46e5"`) |

## Example Request

```bash
curl -X POST http://localhost:1349/api/v1/tools/waveform-image \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"width": 1920, "height": 400, "color": "#e07832"}'
```

## Example Response

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.png",
  "originalSize": 4500000,
  "processedSize": 45000
}
```

## Notes

- The output is always a PNG image, regardless of the input audio format.
- The waveform is rendered on a transparent background.
- Useful for thumbnails, social media previews, or embedding in web pages.
