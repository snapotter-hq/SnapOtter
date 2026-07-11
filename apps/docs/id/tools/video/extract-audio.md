---
description: "Menarik trek audio keluar dari sebuah video."
i18n_source_hash: f5b8330a5f89
i18n_provenance: human
i18n_output_hash: 0b4eec43daee
---

# Extract Audio {#extract-audio}

Mengekstrak trek audio dari file video dan menyimpannya sebagai MP3, WAV, M4A, atau OGG.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/extract-audio`

Menerima multipart form data dengan file video dan field JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | No | `"mp3"` | Format audio keluaran: `mp3`, `wav`, `m4a`, `ogg` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/extract-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"format": "mp3"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp3",
  "originalSize": 12500000,
  "processedSize": 3200000
}
```

## Notes {#notes}

- Jika video tidak memiliki trek audio, permintaan akan mengembalikan galat 400.
- MP3 bersifat lossy tetapi kompatibel secara luas. WAV bersifat lossless tetapi berukuran besar. M4A (AAC) menawarkan keseimbangan yang baik antara kualitas dan ukuran. OGG tersedia untuk alur kerja codec terbuka.
- Ketika audio sumber sudah AAC dan format keluaran adalah M4A, aliran audio disalin tanpa enkoding ulang.
