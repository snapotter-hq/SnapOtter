---
description: Mux a subtitle track into the video container.
---

# Embed Subtitles

Mux a subtitle file into the video container as a soft subtitle track that viewers can toggle on or off.

## API Endpoint

`POST /api/v1/tools/embed-subtitles`

Accepts multipart form data with a video file and a subtitle file, plus a JSON `settings` field.

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| language | string | No | `"eng"` | ISO 639-2/B language code (3 lowercase letters, e.g. `"eng"`, `"fra"`, `"deu"`) |

## Example Request

```bash
curl -X POST http://localhost:1349/api/v1/tools/embed-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F "file=@subtitles.srt" \
  -F 'settings={"language": "fra"}'
```

## Example Response

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 12520000
}
```

## Notes

- Upload two files: the first must be a video, the second must be a subtitle file (.srt, .vtt, or .ass).
- Embedded (soft) subtitles can be toggled by the viewer in their media player. For permanently visible subtitles, use the Burn Subtitles tool instead.
- The language code is stored as metadata in the container and helps media players label the subtitle track.
