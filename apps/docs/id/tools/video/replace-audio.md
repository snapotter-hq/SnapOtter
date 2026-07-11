---
description: "Mengganti trek audio sebuah video dengan file lain."
i18n_source_hash: fabc2a953103
i18n_provenance: human
i18n_output_hash: 3c52247a7d87
---

# Replace Audio {#replace-audio}

Mengganti trek audio sebuah video dengan file audio. Unggah baik video maupun file audio.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/replace-audio`

Menerima multipart form data dengan tepat dua file: file video diikuti oleh file audio.

## Parameters {#parameters}

Alat ini tidak memiliki parameter pengaturan. Unggah file video dan file audio sebagai dua bagian `file`.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/replace-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F "file=@voiceover.mp3"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 13100000
}
```

## Notes {#notes}

- Tepat dua file harus diunggah: yang pertama harus berupa video, yang kedua harus berupa file audio.
- Jika file audio lebih panjang dari video, ia dipangkas agar sesuai dengan durasi video. Jika lebih pendek, sisa video diputar dalam keheningan.
- Aliran video disalin tanpa enkoding ulang, jadi tidak ada kehilangan kualitas video.
