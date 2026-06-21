---
description: View, edit, or strip audio metadata tags (ID3).
---

# Audio Metadata

View, edit, or strip audio metadata tags such as title, artist, and album (ID3 and similar tag formats).

## API Endpoint

`POST /api/v1/tools/audio/audio-metadata`

Accepts multipart form data with an audio file and a JSON `settings` field.

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| strip | boolean | No | `false` | Remove all existing metadata tags |
| title | string | No | - | Set the title tag (max 500 characters) |
| artist | string | No | - | Set the artist tag (max 500 characters) |
| album | string | No | - | Set the album tag (max 500 characters) |

## Example Request

Edit metadata tags:

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/audio-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"title": "My Song", "artist": "Artist Name", "album": "Album Name"}'
```

Strip all metadata:

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/audio-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"strip": true}'
```

## Example Response

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 4480000,
  "metadata": {
    "container": "mp3",
    "durationS": 245.3,
    "bitrateKbps": 192,
    "tags": {
      "title": "My Song",
      "artist": "Artist Name",
      "album": "Album Name"
    }
  }
}
```

## Notes

- The response includes a `metadata` object with container format, duration, bitrate, and current tags.
- When `strip` is `true`, all tag fields are ignored and every existing tag is removed.
- Only the tags you provide are updated; unspecified tags remain unchanged.
- Output format matches the input format.
