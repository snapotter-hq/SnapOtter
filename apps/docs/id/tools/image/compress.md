---
description: "Kurangi ukuran file gambar berdasarkan level kualitas atau ke ukuran file target."
i18n_source_hash: af4685da7e64
i18n_provenance: human
i18n_output_hash: 327a0ac6cf15
---

# Kompres {#compress}

Kurangi ukuran file gambar dengan menentukan level kualitas atau ukuran file target dalam kilobyte. Alat ini menggunakan pencarian biner iteratif untuk mencapai target ukuran secara akurat.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/compress`

Menerima data formulir multipart dengan file gambar dan field JSON `settings`.

## Parameter {#parameters}

| Parameter | Tipe | Wajib | Default | Deskripsi |
|-----------|------|----------|---------|-------------|
| mode | string | Tidak | `"quality"` | Mode kompresi: `quality` atau `targetSize` |
| quality | number | Tidak | `80` | Level kualitas (1-100). Digunakan ketika mode adalah `quality`. |
| targetSizeKb | number | Tidak | - | Ukuran file target dalam kilobyte. Digunakan ketika mode adalah `targetSize`. |

## Contoh Permintaan {#example-request}

Kompres ke kualitas 60:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compress \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"mode": "quality", "quality": 60}'
```

Kompres ke ukuran target 200 KB:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compress \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"mode": "targetSize", "targetSizeKb": 200}'
```

## Contoh Respons {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 204800
}
```

## Catatan {#notes}

- Dalam mode `quality`, nilai lebih rendah menghasilkan file lebih kecil dengan lebih banyak artefak kompresi. Nilai 80 adalah default yang baik untuk penggunaan web.
- Dalam mode `targetSize`, engine melakukan kompresi iteratif untuk mendekati target semaksimal mungkin tanpa melampauinya.
- Format output sesuai dengan format input. Kompresi diterapkan pada encoding native format tersebut (mis. kualitas JPEG untuk file JPEG, kualitas WebP untuk file WebP).
- Jika kualitas default (80) dapat diterima, Anda dapat menghilangkan parameter `quality` sepenuhnya.
