---
description: "Hasilkan barcode dalam format Code 128, EAN-13, UPC-A, Code 39, ITF-14, dan Data Matrix."
i18n_source_hash: e84b1df40c7e
i18n_provenance: human
i18n_output_hash: e5c89973d5f0
---

# Generator Barcode {#barcode-generator}

Hasilkan gambar barcode dari input teks. Mendukung format Code 128, EAN-13, UPC-A, Code 39, ITF-14, dan Data Matrix.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/barcode-generate`

Menerima body `application/json` (bukan multipart). Barcode dihasilkan dari teks yang diberikan, bukan dari berkas yang diunggah.

## Parameter {#parameters}

| Parameter | Tipe | Wajib | Bawaan | Deskripsi |
|-----------|------|----------|---------|-------------|
| text | string | Ya | - | Teks untuk dienkode dalam barcode (1-256 karakter) |
| type | string | Tidak | `"code128"` | Format barcode: `code128`, `ean13`, `upca`, `code39`, `itf14`, `datamatrix` |
| scale | integer | Tidak | `3` | Faktor skala gambar (1-8) |
| includeText | boolean | Tidak | `true` | Apakah akan merender teks di bawah barcode |

## Contoh Permintaan {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/barcode-generate \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "5901234123457", "type": "ean13", "scale": 4}'
```

## Contoh Respons {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/barcode.png",
  "originalSize": 0,
  "processedSize": 4520
}
```

## Catatan {#notes}

- Berbeda dari kebanyakan alat, endpoint ini menerima body JSON, bukan data formulir multipart, karena barcode dihasilkan dari teks alih-alih berkas yang diunggah.
- EAN-13 memerlukan tepat 12 atau 13 digit. UPC-A memerlukan tepat 11 atau 12 digit. Jika digit cek dihilangkan, digit tersebut dihitung secara otomatis.
- Code 128 adalah format paling fleksibel dan mendukung seluruh set karakter ASCII.
- Data Matrix menghasilkan barcode 2D yang cocok untuk mengenkode string yang lebih panjang dalam persegi yang kompak.
