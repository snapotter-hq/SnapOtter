---
description: "Mengonversi GIF animasi menjadi video MP4, WebM, atau MOV."
i18n_source_hash: c3737b31146d
i18n_provenance: human
i18n_output_hash: 835cddac950a
---

# GIF to Video {#gif-to-video}

Mengonversi GIF animasi menjadi file video MP4, WebM, atau MOV yang ringkas.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/gif-to-video`

Menerima multipart form data dengan file GIF dan field JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | No | `"mp4"` | Format keluaran: `mp4`, `webm`, `mov` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/gif-to-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@animation.gif" \
  -F 'settings={"format": "mp4"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/animation.mp4",
  "originalSize": 8500000,
  "processedSize": 950000
}
```

## Notes {#notes}

- Mengonversi GIF ke video biasanya mengurangi ukuran file sebesar 80-90% sambil mempertahankan kualitas visual yang sama.
- Hanya file GIF animasi yang diterima. Gambar statis sebaiknya menggunakan alat Convert gambar.
- MP4 dan MOV menggunakan enkoding H.264, WebM menggunakan VP9.
