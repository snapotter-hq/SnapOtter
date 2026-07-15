---
description: "Potong gambar dengan menentukan area menggunakan posisi dan dimensi."
i18n_source_hash: 556f37893553
i18n_provenance: human
i18n_output_hash: 9d19b11b1cf9
---

# Potong Gambar {#crop}

Potong gambar dengan mendefinisikan area persegi panjang menggunakan posisi dan ukuran. Mendukung satuan piksel dan persentase.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/crop`

Menerima data formulir multipart dengan file gambar dan field JSON `settings`.

## Parameter {#parameters}

| Parameter | Tipe | Wajib | Default | Deskripsi |
|-----------|------|----------|---------|-------------|
| left | number | Ya | - | Offset X area potong (dari tepi kiri) |
| top | number | Ya | - | Offset Y area potong (dari tepi atas) |
| width | number | Ya | - | Lebar area potong |
| height | number | Ya | - | Tinggi area potong |
| unit | string | Tidak | `"px"` | Satuan untuk nilai: `px` atau `percent` |

## Contoh Permintaan {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/crop \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"left": 100, "top": 50, "width": 800, "height": 600}'
```

Potong menggunakan nilai persentase:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/crop \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"left": 10, "top": 10, "width": 80, "height": 80, "unit": "percent"}'
```

## Contoh Respons {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 1200000
}
```

## Catatan {#notes}

- Area potong harus berada di dalam batas gambar. Jika area melampaui gambar, permintaan akan gagal.
- Saat menggunakan satuan `percent`, nilai merepresentasikan persentase dari dimensi gambar (mis. `left: 10` berarti 10% dari tepi kiri).
- Format output sesuai dengan format input.
- Orientasi EXIF diterapkan otomatis sebelum pemotongan, sehingga koordinat sesuai dengan orientasi yang benar secara visual.
