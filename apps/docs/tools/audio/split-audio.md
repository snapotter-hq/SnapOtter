---
description: Split audio by time intervals, equal parts, or silence detection.
---

# Split Audio

Split an audio file into segments by fixed time intervals, equal parts, or automatic silence detection. Returns a ZIP archive of the segments.

## API Endpoint

`POST /api/v1/tools/audio/split-audio`

Accepts multipart form data with an audio file and a JSON `settings` field.

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | No | `"time"` | Split strategy: `time`, `parts`, `silence` |
| segmentS | number | No | `60` | Segment length in seconds, 1 to 3600 (used when mode is `time`) |
| parts | integer | No | `2` | Number of equal parts, 2 to 20 (used when mode is `parts`) |
| thresholdDb | number | No | `-40` | Silence threshold in dB, -80 to -20 (used when mode is `silence`) |
| minSilenceS | number | No | `0.3` | Minimum silence gap in seconds, 0.1 to 10 (used when mode is `silence`) |

## Example Request

Split into 30-second segments:

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/split-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"mode": "time", "segmentS": 30}'
```

Split by silence detection:

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/split-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"mode": "silence", "thresholdDb": -35, "minSilenceS": 0.5}'
```

## Example Response

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio_parts.zip",
  "originalSize": 4500000,
  "processedSize": 4600000
}
```

## Notes

- The `downloadUrl` points to a ZIP archive containing all segments.
- Only the parameters relevant to the chosen `mode` are used; others are ignored.
- Segment filenames are numbered sequentially (e.g. `part-000.mp3`, `part-001.mp3`).
- Output format matches the input format.
