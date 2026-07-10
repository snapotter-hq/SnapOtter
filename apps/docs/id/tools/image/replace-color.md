---
description: "Ganti warna tertentu dalam gambar dengan warna lain atau jadikan transparan."
i18n_source_hash: df55ac451ecb
i18n_provenance: human
i18n_output_hash: 878c14435dbc
---

# Replace & Invert Color {#replace-invert-color}

Ganti piksel yang cocok dengan warna sumber dengan warna target, atau jadikan transparan. Menggunakan jarak Euclidean dalam ruang RGB dengan toleransi yang dapat dikonfigurasi untuk pemaduan mulus di batas warna.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/replace-color`

Menerima multipart form data dengan berkas gambar dan field JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| sourceColor | string | No | `"#FF0000"` | Warna hex yang dicari (format: `#RRGGBB`) |
| targetColor | string | No | `"#00FF00"` | Warna hex pengganti (format: `#RRGGBB`) |
| makeTransparent | boolean | No | `false` | Jadikan piksel yang cocok transparan alih-alih menggantinya dengan warna target |
| tolerance | number | No | `30` | Toleransi pencocokan warna (0 hingga 255). Nilai lebih tinggi mencocokkan rentang warna serupa yang lebih luas |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/replace-color \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"sourceColor": "#FF0000", "targetColor": "#0000FF", "tolerance": 40}'
```

Jadikan latar belakang hijau transparan:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/replace-color \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@greenscreen.png" \
  -F 'settings={"sourceColor": "#00FF00", "makeTransparent": true, "tolerance": 50}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.png",
  "originalSize": 2450000,
  "processedSize": 2100000
}
```

## Notes {#notes}

- Pencocokan warna menggunakan jarak Euclidean dalam ruang RGB, diskalakan oleh `tolerance * sqrt(3)`.
- Pemaduan penggantian proporsional terhadap jarak warna: piksel yang lebih dekat ke warna sumber menerima lebih banyak warna target, menciptakan transisi mulus.
- Saat `makeTransparent` bernilai `true`, output dipaksa ke PNG (atau WebP/AVIF) jika format input tidak mendukung kanal alfa (mis., JPEG).
- Toleransi 0 hanya mencocokkan warna sumber yang persis. Nilai lebih tinggi (50+) akan mencocokkan rentang rona serupa yang lebih luas.
- Format output mengikuti format input kecuali transparansi diperlukan dan format input tidak mendukung alfa.
