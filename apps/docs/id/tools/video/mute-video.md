---
description: "Menghapus trek audio dari sebuah video."
i18n_source_hash: 9a0c60bbcaa3
i18n_provenance: human
i18n_output_hash: 798031cf35ed
---

# Mute Video {#mute-video}

Menghapus trek audio dari sebuah video, menyisakan hanya aliran visual.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/mute-video`

Menerima multipart form data dengan file video. Alat ini tidak memiliki pengaturan yang dapat dikonfigurasi.

## Parameters {#parameters}

Alat ini tidak memiliki parameter. Ia melepas trek audio dari video yang diunggah.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/mute-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 8900000
}
```

## Notes {#notes}

- Aliran video disalin tanpa enkoding ulang, jadi tidak ada kehilangan kualitas.
- Jika video masukan tidak memiliki trek audio, file dikembalikan tanpa perubahan.
