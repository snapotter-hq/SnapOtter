---
description: Pull the subtitle track out of a video as an SRT, WebVTT or ASS file.
---

# Extract Subtitles {#extract-subtitles}

Extract the embedded subtitle track from a video container and download it as an SRT, WebVTT or ASS file.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/extract-subtitles`

Accepts multipart form data with a video file and an optional `settings` JSON string.

## Parameters {#parameters}

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `format` | string | `"srt"` | Output format: `srt`, `vtt` (WebVTT) or `ass` |

The first subtitle track found in the video container is extracted.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/extract-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"format":"vtt"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.vtt",
  "originalSize": 12500000,
  "processedSize": 4500
}
```

## Notes {#notes}

- The video must contain an embedded subtitle track. If no subtitle track is found, the request returns a 400 error.
- If the video has multiple subtitle tracks, the first one is extracted.
- Text tracks (SubRip, ASS, mov_text, WebVTT) convert to any of the three output formats. Converting an ASS track to SRT or WebVTT drops its positioning and effects.
- Image-based tracks (Blu-ray PGS, DVD VobSub) can't be turned into text without OCR and return a 422 error.
