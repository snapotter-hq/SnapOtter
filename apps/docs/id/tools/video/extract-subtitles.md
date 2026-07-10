---
description: "Menarik trek subtitle keluar dari video sebagai file SRT."
i18n_source_hash: 48db860f6676
i18n_provenance: human
i18n_output_hash: e099d1fbddcb
---

# Extract Subtitles {#extract-subtitles}

Mengekstrak trek subtitle tersemat dari kontainer video dan mengunduhnya sebagai file SRT.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/extract-subtitles`

Menerima multipart form data dengan file video. Alat ini tidak memiliki pengaturan yang dapat dikonfigurasi.

## Parameters {#parameters}

Alat ini tidak memiliki parameter. Ia mengekstrak trek subtitle pertama yang ditemukan di dalam kontainer video.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/extract-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.srt",
  "originalSize": 12500000,
  "processedSize": 4500
}
```

## Notes {#notes}

- Video harus berisi trek subtitle tersemat. Jika tidak ada trek subtitle yang ditemukan, permintaan akan mengembalikan galat 400.
- Jika video memiliki beberapa trek subtitle, yang pertama akan diekstrak.
- Format keluaran adalah SRT terlepas dari format subtitle asli di dalam kontainer.
