---
description: Generate subtitle files from video audio tracks using AI.
---

# Auto Subtitles {#auto-subtitles}

Generate subtitle files from a video's audio track using AI-powered speech recognition (faster-whisper). Supports auto-detection and 10 explicit languages.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/auto-subtitles`

Accepts multipart form data with a video file and a JSON `settings` field. This is an async endpoint - it returns `202 Accepted` immediately and progress is streamed via SSE at `GET /api/v1/jobs/{jobId}/progress`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| language | string | No | `"auto"` | Speech language: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko`, `id`, `th`, `vi` |
| format | string | No | `"srt"` | Output subtitle format: `srt`, `vtt` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/auto-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"language": "en", "format": "srt"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- This is an AI tool that requires the **transcription** feature bundle to be installed. If the bundle is not installed, the API returns `501 Feature Not Installed` with instructions to install it via the admin UI.
- The `auto` language option uses whisper's built-in language detection. Specifying the language explicitly improves accuracy and speed.
- SRT is the most widely supported subtitle format. VTT (WebVTT) is the standard for web video players.
- Progress updates are available via SSE at `GET /api/v1/jobs/{jobId}/progress` until the job completes.
