---
description: "Ubah ukuran setiap halaman PDF menjadi A4, Letter, label pengiriman 4x6 inci, atau ukuran kustom."
i18n_source_hash: 9db88016c07b
i18n_provenance: machine
i18n_output_hash: 09cfd891ce76
i18n_hash_version: 2
---

# Resize PDF Pages {#resize-pdf-pages}

Ubah ukuran halaman untuk setiap halaman dalam PDF. Konten diskalakan agar muat di halaman baru dan diletakkan di tengah, sehingga teks, seni vektor, dan barcode tetap tajam. Gunakan untuk mengubah label pengiriman menjadi halaman 4x6 inci untuk printer thermal, atau memindahkan dokumen antara A4 dan US Letter.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/resize-pdf-pages`

Menerima multipart form data berisi file PDF dan field JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| pageSize | string | No | `"4x6in"` | Ukuran target: `4x6in`, `100x150mm`, `a4`, `a5`, `a6`, `letter`, `legal`, atau `custom` |
| width | number | No | `4` | Lebar halaman kustom, dipakai saat `pageSize` adalah `custom` |
| height | number | No | `6` | Tinggi halaman kustom, dipakai saat `pageSize` adalah `custom` |
| unit | string | No | `"in"` | Satuan untuk ukuran kustom: `in` atau `mm` |
| keepOrientation | boolean | No | `false` | Putar ukuran target agar sesuai dengan orientasi setiap halaman, bukan memaksakan lebar kali tinggi |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/resize-pdf-pages \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@label.pdf" \
  -F 'settings={"pageSize": "4x6in"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/label_resized.pdf",
  "originalSize": 84200,
  "processedSize": 85100
}
```

## Notes {#notes}

- Halaman diskalakan agar muat, tidak pernah diregangkan. Bila rasio aspek berbeda, ruang yang tersisa dibiarkan kosong.
- Mengubah ukuran tidak memotong. Label yang dicetak di seperempat halaman Letter atau A4 tetap hanya mengisi seperempat halaman baru.
- Ukuran kustom harus 0,5-200 inci (12,7-5080 mm) pada setiap sisi.
- Halaman diubah ukurannya dari crop box-nya bila ada, sehingga halaman yang sudah dipotong hanya mempertahankan wilayah yang dipotong.
