---
description: Convert speech to text with AI-powered transcription.
---

# Transcribe Audio

Convert speech to text using AI-powered transcription (faster-whisper). Supports plain text, SRT, and VTT output formats with automatic or manual language selection.

## API Endpoint

`POST /api/v1/tools/audio/transcribe-audio`

Accepts multipart form data with an audio file and a JSON `settings` field.

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| language | string | No | `"auto"` | Language: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko`, `id`, `th`, `vi` |
| outputFormat | string | No | `"txt"` | Output format: `txt`, `srt`, `vtt` |

## Example Request

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/transcribe-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"language": "en", "outputFormat": "srt"}'
```

## Example Response

This is an async tool. The API returns `202 Accepted` immediately:

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

Track progress via SSE at `GET /api/v1/jobs/{jobId}/progress`. When the job completes, the SSE stream delivers the final result with a `downloadUrl`.

## Notes

- Requires the **transcription** feature bundle to be installed. Returns `501 Not Implemented` if the bundle is not available.
- Uses faster-whisper for transcription. Language `auto` detects the spoken language automatically.
- `srt` and `vtt` formats include timestamps for each segment, suitable for subtitles.
- `txt` format returns plain text without timestamps.
- This is a long-running AI tool; processing time depends on audio length and server hardware.
