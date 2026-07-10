---
description: "Memotong sebuah klip dari video dengan menentukan waktu mulai dan selesai."
i18n_source_hash: c84481641979
i18n_provenance: human
i18n_output_hash: 5155f2376f3d
---

# Trim Video {#trim-video}

Memotong sebuah klip dari video dengan menentukan waktu mulai dan selesai dalam detik, dengan opsi untuk potongan yang akurat per frame.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/trim-video`

Menerima multipart form data dengan file video dan field JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| startS | number | No | `0` | Waktu mulai dalam detik (harus >= 0) |
| endS | number | Yes | - | Waktu selesai dalam detik (harus setelah startS) |
| precise | boolean | No | `false` | Enkode ulang untuk potongan yang akurat per frame alih-alih pencarian keyframe |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/trim-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"startS": 5, "endS": 30, "precise": true}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 4200000
}
```

## Notes {#notes}

- Ketika `precise` adalah `false` (nilai bawaan), alat menggunakan pencarian keyframe, yang cepat tetapi dapat memulai beberapa frame sebelum waktu yang diminta.
- Menyetel `precise` ke `true` mengenkode ulang segmen untuk batas frame yang tepat, tetapi memakan waktu lebih lama.
- Nilai `endS` harus lebih besar dari `startS`.
