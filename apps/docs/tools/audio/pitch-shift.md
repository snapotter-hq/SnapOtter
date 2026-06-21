---
description: Raise or lower audio pitch by semitones without changing speed.
---

# Pitch Shift

Raise or lower the pitch of an audio file by a number of semitones without changing its playback speed.

## API Endpoint

`POST /api/v1/tools/audio/pitch-shift`

Accepts multipart form data with an audio file and a JSON `settings` field.

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| semitones | integer | No | `3` | Semitones to shift (-12 to 12). Must be nonzero. |

## Example Request

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/pitch-shift \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"semitones": -5}'
```

## Example Response

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 4500000
}
```

## Notes

- Positive values raise the pitch; negative values lower it.
- A shift of 12 semitones equals one octave up; -12 equals one octave down.
- Playback duration stays the same regardless of the shift amount.
- Output format matches the input format.
