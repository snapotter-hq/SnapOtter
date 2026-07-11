---
description: "Memutar klip video secara terbalik."
i18n_source_hash: 98226f4e092d
i18n_provenance: human
i18n_output_hash: 9288194d9456
---

# Reverse Video {#reverse-video}

Memutar klip video secara terbalik. Trek audio juga dibalik.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/reverse-video`

Menerima multipart form data dengan file video. Alat ini tidak memiliki pengaturan yang dapat dikonfigurasi.

## Parameters {#parameters}

Alat ini tidak memiliki parameter. Ia membalik seluruh video.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/reverse-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 12600000
}
```

## Notes {#notes}

- Dibatasi hingga klip dengan durasi maksimum 5 menit. Video yang lebih panjang ditolak dengan galat 400.
- Baik trek video maupun audio dibalik. Untuk membalik video tanpa audio, matikan audionya terlebih dahulu.
