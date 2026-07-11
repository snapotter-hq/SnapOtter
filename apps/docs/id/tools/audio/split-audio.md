---
description: "Bagi audio berdasarkan interval waktu, bagian yang sama besar, atau deteksi hening."
i18n_source_hash: c062a395dbac
i18n_provenance: human
i18n_output_hash: 58b5ae91712d
---

# Split Audio {#split-audio}

Bagi file audio menjadi segmen berdasarkan interval waktu tetap, bagian yang sama besar, atau deteksi hening otomatis. Mengembalikan arsip ZIP berisi segmen-segmen tersebut.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/split-audio`

Menerima multipart form data berisi file audio dan field JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | No | `"time"` | Strategi pembagian: `time`, `parts`, `silence` |
| segmentS | number | No | `60` | Panjang segmen dalam detik, 1 hingga 3600 (digunakan saat mode adalah `time`) |
| parts | integer | No | `2` | Jumlah bagian yang sama besar, 2 hingga 20 (digunakan saat mode adalah `parts`) |
| thresholdDb | number | No | `-40` | Ambang batas hening dalam dB, -80 hingga -20 (digunakan saat mode adalah `silence`) |
| minSilenceS | number | No | `0.3` | Jeda hening minimum dalam detik, 0.1 hingga 10 (digunakan saat mode adalah `silence`) |

## Example Request {#example-request}

Bagi menjadi segmen 30 detik:

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/split-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"mode": "time", "segmentS": 30}'
```

Bagi berdasarkan deteksi hening:

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/split-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"mode": "silence", "thresholdDb": -35, "minSilenceS": 0.5}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio_parts.zip",
  "originalSize": 4500000,
  "processedSize": 4600000
}
```

## Notes {#notes}

- `downloadUrl` menunjuk ke arsip ZIP yang berisi semua segmen.
- Hanya parameter yang relevan dengan `mode` yang dipilih yang digunakan; parameter lainnya diabaikan.
- Nama file segmen diberi nomor secara berurutan (mis. `part-000.mp3`, `part-001.mp3`).
- Format output menyesuaikan dengan format input.
