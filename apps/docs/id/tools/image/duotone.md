---
description: "Terapkan efek duotone dua warna dengan warna bayangan dan sorotan kustom."
i18n_source_hash: ab99c4f0152c
i18n_provenance: human
i18n_output_hash: f4bfce768b25
---

# Duotone {#duotone}

Terapkan efek duotone dua warna pada gambar. Gambar diubah menjadi grayscale, lalu dipetakan ke gradien antara warna bayangan (nada gelap) dan warna sorotan (nada terang).

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/duotone`

Menerima data formulir multipart dengan file gambar dan field JSON `settings`.

## Parameter {#parameters}

| Parameter | Tipe | Wajib | Default | Deskripsi |
|-----------|------|----------|---------|-------------|
| shadow | string | Tidak | `"#1e3a8a"` | Warna hex bayangan (diterapkan pada nada gelap) |
| highlight | string | Tidak | `"#fbbf24"` | Warna hex sorotan (diterapkan pada nada terang) |
| intensity | integer | Tidak | `100` | Intensitas efek (0-100); 0 mengembalikan gambar asli, 100 menerapkan duotone penuh |

## Contoh Permintaan {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/duotone \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"shadow": "#0f172a", "highlight": "#f97316", "intensity": 80}'
```

## Contoh Respons {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 1870000
}
```

## Catatan {#notes}

- Format output sesuai dengan format input. Input HEIC, RAW, PSD, dan SVG didekode otomatis sebelum diproses.
- `intensity` kurang dari 100 memadukan hasil duotone dengan gambar asli, memungkinkan efek yang lebih halus.
- Kombinasi duotone populer meliputi navy/emas, teal/coral, dan ungu/pink.
