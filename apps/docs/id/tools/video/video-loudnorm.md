---
description: "Menormalkan volume audio video ke standar siaran."
i18n_source_hash: 078f1e819c9a
i18n_provenance: human
i18n_output_hash: 4c658bcf24f2
---

# Normalize Audio {#normalize-audio}

Menormalkan volume audio video ke standar loudness siaran EBU R128.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-loudnorm`

Menerima multipart form data dengan file video. Alat ini tidak memiliki pengaturan yang dapat dikonfigurasi.

## Parameters {#parameters}

Alat ini tidak memiliki parameter. Ia menerapkan normalisasi loudness EBU R128 ke trek audio.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-loudnorm \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 12500000
}
```

## Notes {#notes}

- Menggunakan filter `loudnorm` FFmpeg yang menargetkan loudness terintegrasi -16 LUFS dengan true peak -1.5 dBTP dan rentang loudness 11 LU (standar siaran EBU R128).
- Sample rate audio sumber dipertahankan pada keluaran.
- Jika video tidak memiliki trek audio, permintaan akan mengembalikan galat 400.
