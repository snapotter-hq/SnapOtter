---
description: "Sesuaikan kecerahan, kontras, saturasi, temperatur, rona, kanal, dan terapkan efek warna."
i18n_source_hash: 41b35fe5c2ba
i18n_provenance: human
i18n_output_hash: bec12c2434ea
---

# Sesuaikan Warna {#adjust-colors}

Alat penyesuaian warna komprehensif yang menggabungkan kecerahan, kontras, eksposur, saturasi, temperatur, tint, rotasi rona, level per kanal, dan efek sekali klik (grayscale, sepia, invert) dalam satu endpoint.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/adjust-colors`

Menerima data formulir multipart dengan berkas gambar dan bidang JSON `settings`.

## Parameter {#parameters}

| Parameter | Tipe | Wajib | Bawaan | Deskripsi |
|-----------|------|----------|---------|-------------|
| brightness | number | Tidak | `0` | Penyesuaian kecerahan (-100 hingga 100) |
| contrast | number | Tidak | `0` | Penyesuaian kontras (-100 hingga 100) |
| exposure | number | Tidak | `0` | Eksposur / gamma midtone (-100 hingga 100) |
| saturation | number | Tidak | `0` | Saturasi warna (-100 hingga 100) |
| temperature | number | Tidak | `0` | Keseimbangan putih: dingin/biru hingga hangat/oranye (-100 hingga 100) |
| tint | number | Tidak | `0` | Pergeseran tint: hijau hingga magenta (-100 hingga 100) |
| hue | number | Tidak | `0` | Rotasi rona dalam derajat (-180 hingga 180) |
| sharpness | number | Tidak | `0` | Kekuatan penajaman (0 hingga 100) |
| red | number | Tidak | `100` | Level kanal merah (0 hingga 200, 100 = tidak berubah) |
| green | number | Tidak | `100` | Level kanal hijau (0 hingga 200, 100 = tidak berubah) |
| blue | number | Tidak | `100` | Level kanal biru (0 hingga 200, 100 = tidak berubah) |
| effect | string | Tidak | `"none"` | Efek warna: `none`, `grayscale`, `sepia`, `invert` |

## Contoh Permintaan {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/adjust-colors \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"brightness": 20, "contrast": 10, "saturation": -30, "effect": "none"}'
```

Terapkan tampilan vintage hangat:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/adjust-colors \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"temperature": 40, "saturation": -15, "contrast": 10, "effect": "sepia"}'
```

## Contoh Respons {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2380000
}
```

## Catatan {#notes}

- Semua parameter bernilai bawaan netral sehingga Anda dapat menyesuaikan hanya yang Anda perlukan.
- Penyesuaian diterapkan dalam urutan ini: kecerahan, kontras, eksposur, saturasi/rona, temperatur/tint, penajaman, kanal, efek.
- Temperatur menggunakan matriks rekombinasi warna 3x3 pada sumbu biru-oranye dan hijau-magenta.
- Eksposur dipetakan ke fungsi gamma Sharp (positif mencerahkan midtone, negatif menggelapkannya).
- Endpoint ini juga merespons pada jalur lama `/api/v1/tools/image/brightness-contrast`, `/api/v1/tools/image/saturation`, `/api/v1/tools/image/color-channels`, dan `/api/v1/tools/image/color-effects`. Semuanya menggunakan skema yang sama.
- Format keluaran mengikuti format input. Input HEIC, RAW, PSD, dan SVG didekode secara otomatis sebelum diproses.
