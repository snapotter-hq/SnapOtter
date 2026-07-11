---
description: "Pangkas gambar menjadi lingkaran terpusat dengan sudut transparan."
i18n_source_hash: 06c50ccd96b2
i18n_provenance: human
i18n_output_hash: 47639e7d5704
---

# Pangkas Lingkaran {#circle-crop}

Pangkas gambar menjadi lingkaran terpusat dengan sudut transparan. Mendukung zoom, offset, bingkai, dan ukuran keluaran yang dapat disesuaikan.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/circle-crop`

Menerima data formulir multipart dengan berkas gambar dan bidang JSON `settings`.

## Parameter {#parameters}

| Parameter | Tipe | Wajib | Bawaan | Deskripsi |
|-----------|------|----------|---------|-------------|
| zoom | number | Tidak | `1` | Faktor zoom (1-5); nilai lebih tinggi memangkas lebih rapat |
| offsetX | number | Tidak | `0.5` | Posisi tengah horizontal (0-1) |
| offsetY | number | Tidak | `0.5` | Posisi tengah vertikal (0-1) |
| borderWidth | integer | Tidak | `0` | Lebar bingkai dalam piksel (0-200) |
| borderColor | string | Tidak | `"#ffffff"` | Warna hex bingkai |
| background | string | Tidak | `"transparent"` | Isian sudut: `"transparent"` atau warna hex |
| outputSize | integer | Tidak | - | Dimensi persegi akhir dalam piksel (16-4096) |

## Contoh Permintaan {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/circle-crop \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"zoom": 1.2, "borderWidth": 4, "borderColor": "#333333"}'
```

## Contoh Respons {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.png",
  "originalSize": 2450000,
  "processedSize": 185000
}
```

## Catatan {#notes}

- Keluaran selalu berupa PNG untuk mempertahankan sudut transparan (kecuali `background` diatur ke warna solid).
- Lingkaran diinskripsikan di dalam dimensi terpendek gambar. Gunakan `zoom` untuk memangkas lebih rapat dan `offsetX`/`offsetY` untuk menggeser area yang terlihat.
- Ketika `outputSize` disediakan, hasilnya diubah ukurannya ke dimensi persegi tersebut setelah pemangkasan.
- Input HEIC, RAW, PSD, dan SVG didekode secara otomatis sebelum diproses.
