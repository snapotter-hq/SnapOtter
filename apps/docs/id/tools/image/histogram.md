---
description: "Hasilkan bagan histogram RGB dengan statistik per-channel dari sebuah gambar."
i18n_source_hash: 57aa610206a5
i18n_provenance: human
i18n_output_hash: 3694326d0131
---

# Histogram {#histogram}

Hasilkan bagan histogram RGB dari sebuah gambar. Mengembalikan gambar histogram PNG beserta statistik per-channel dan data histogram 256-bin mentah dalam JSON respons.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/histogram`

Menerima multipart form data dengan file gambar dan sebuah field JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| scale | string | No | `"linear"` | Skala sumbu Y: `linear` atau `log` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/histogram \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"scale": "linear"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/histogram.png",
  "originalSize": 2450000,
  "processedSize": 12000,
  "bins": {
    "r": [0, 12, 45, "... (256 values)"],
    "g": [0, 8, 38, "... (256 values)"],
    "b": [2, 15, 52, "... (256 values)"],
    "lum": [0, 10, 40, "... (256 values)"]
  },
  "stats": {
    "r": { "mean": 128, "median": 132, "stdev": 48.5 },
    "g": { "mean": 119, "median": 121, "stdev": 44.2 },
    "b": { "mean": 105, "median": 108, "stdev": 51.3 },
    "lum": { "mean": 118, "median": 120, "stdev": 45.1 }
  },
  "mean": { "r": 128, "g": 119, "b": 105 },
  "max": { "r": 4200, "g": 3800, "b": 4100 }
}
```

## Notes {#notes}

- `downloadUrl` menunjuk ke bagan histogram PNG yang telah dirender, menampilkan distribusi R, G, B, dan luminansi.
- `bins` berisi array 256-nilai mentah untuk setiap channel (red, green, blue, luminance), cocok untuk merender visualisasi kustom.
- `stats` menyediakan mean, median, dan deviasi standar per channel.
- `mean` dan `max` adalah field ringkas yang kompatibel-mundur.
- Gunakan skala `log` ketika histogram didominasi beberapa puncak dan Anda ingin melihat detail pada bin yang lebih rendah.
- Input HEIC, RAW, PSD, dan SVG di-decode otomatis sebelum analisis.
