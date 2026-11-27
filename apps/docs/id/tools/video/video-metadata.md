---
description: "Menghapus metadata dari sebuah video dan melaporkan apa yang ditemukan."
i18n_source_hash: 9c0af022032a
i18n_provenance: machine
i18n_output_hash: fb515da5b6ba
i18n_hash_version: 2
---

# Clean Video Metadata {#clean-video-metadata}

Menghapus metadata (tanggal pembuatan, koordinat GPS, model kamera, tag perangkat lunak, dll.) dari sebuah video dan melaporkan apa yang dihapus.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-metadata`

Menerima multipart form data dengan file video. Alat ini tidak memiliki pengaturan yang dapat dikonfigurasi.

## Parameters {#parameters}

Alat ini tidak memiliki parameter. Ia menghapus semua metadata dari kontainer video.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4"
```

## Example Response {#example-response}

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
    ],
    "removed": ["title", "comment", "location", "creation_time"]
  }
}
```

## Notes {#notes}

- `metadata.removed` mencantumkan nama tag kontainer yang dihapus. Nilainya tidak dikembalikan. Array kosong berarti tidak ada yang dihapus.
- Metadata yang dihapus mencakup stempel waktu pembuatan, data GPS/lokasi, info kamera/perangkat, dan tag perangkat lunak.
- Aliran video dan audio disalin tanpa enkoding ulang, jadi tidak ada kehilangan kualitas.
- Berguna untuk privasi sebelum membagikan video secara publik.
