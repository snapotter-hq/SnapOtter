---
description: "Melapisi logo atau gambar sebagai watermark dengan posisi, opasitas, dan skala yang dapat dikonfigurasi."
i18n_source_hash: c73ab0ef8ab9
i18n_provenance: human
i18n_output_hash: 62e699511ea6
---

# Image Watermark {#image-watermark}

Melapisi logo atau gambar sekunder sebagai watermark pada gambar dasar. Watermark diskalakan relatif terhadap lebar gambar dasar dan diposisikan di sudut atau tengah.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/watermark-image`

Menerima data formulir multipart dengan **dua** file gambar dan field JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| position | string | No | `"bottom-right"` | Penempatan watermark: `center`, `top-left`, `top-right`, `bottom-left`, `bottom-right` |
| opacity | number | No | `50` | Persentase opasitas watermark (0 hingga 100) |
| scale | number | No | `25` | Lebar watermark sebagai persentase dari lebar gambar utama (1 hingga 100) |

### File Fields {#file-fields}

| Field Name | Required | Description |
|------------|----------|-------------|
| file | Yes | Gambar utama/dasar |
| watermark | Yes | Gambar watermark/logo |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/watermark-image \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F "watermark=@logo.png" \
  -F 'settings={"position": "bottom-right", "opacity": 60, "scale": 20}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2520000
}
```

## Notes {#notes}

- Kedua gambar divalidasi dan didekode (HEIC, RAW, PSD, SVG didukung).
- Watermark diubah ukurannya secara proporsional sehingga lebarnya sama dengan `scale`% dari lebar gambar utama.
- Opasitas diterapkan melalui alpha mask yang dikomposit dengan pemaduan `dest-in`.
- Posisi sudut menggunakan padding 20px dari tepi gambar.
- Jika gambar watermark memiliki transparansi (mis., logo PNG), transparansi tersebut dipertahankan selama pengomposisian.
- Orientasi EXIF diterapkan secara otomatis pada kedua gambar sebelum diproses.
