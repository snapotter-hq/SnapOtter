---
description: Strip metadata from a video and report what was found.
---

# Clean Video Metadata

Strip metadata (creation date, GPS coordinates, camera model, software tags, etc.) from a video and report what was removed.

## API Endpoint

`POST /api/v1/tools/video/video-metadata`

Accepts multipart form data with a video file. This tool has no configurable settings.

## Parameters

This tool has no parameters. It strips all metadata from the video container.

## Example Request

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4"
```

## Example Response

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip_clean.mp4",
  "originalSize": 12500000,
  "processedSize": 12480000,
  "metadata": {
    "container": "mov,mp4,m4a,3gp,3g2,mj2",
    "durationS": 42.5,
    "bitrateKbps": 2350,
    "streams": [
      { "type": "video", "codec": "h264", "width": 1920, "height": 1080 },
      { "type": "audio", "codec": "aac", "sampleRate": 48000 }
    ]
  }
}
```

## Notes

- Metadata stripped includes creation timestamps, GPS/location data, camera/device info, and software tags.
- The video and audio streams are copied without re-encoding, so there is no quality loss.
- Useful for privacy before sharing videos publicly.
