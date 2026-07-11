---
description: "Cap gambar tanda tangan yang diunggah ke PDF menggunakan penempatan halaman yang dinormalisasi."
i18n_source_hash: c28f78c2e7fd
i18n_provenance: human
i18n_output_hash: 80406594e43c
---

# Sign PDF {#sign-pdf}

Cap satu atau lebih gambar PNG tanda tangan yang diunggah ke halaman mana pun dalam PDF. Rute ini menggunakan kontrak multipart khusus karena membutuhkan PDF, satu atau lebih gambar tanda tangan, dan koordinat penempatan.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/sign-pdf`

Menerima data form multipart. PDF dikirim sebagai `file`; tanda tangan dikirim sebagai `sig0`, `sig1`, dan seterusnya; penempatan dikirim dalam field JSON `placements`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | File PDF yang akan ditandatangani |
| sig0 | file | Yes | - | Gambar tanda tangan pertama. Gambar tambahan menggunakan `sig1`, `sig2`, dan seterusnya |
| placements | JSON string | Yes | - | Array objek penempatan: `{ "sig": 0, "page": 0, "x": 0.2, "y": 0.7, "w": 0.25, "h": 0.08 }` |
| clientJobId | string | No | - | UUID opsional untuk pelacakan progres melalui SSE |
| fileId | string | No | - | ID pustaka file opsional untuk menyimpan hasil yang ditandatangani sebagai versi baru |

## Placement Coordinates {#placement-coordinates}

| Field | Type | Description |
|-------|------|-------------|
| sig | integer | Indeks gambar tanda tangan. `0` dipetakan ke `sig0` |
| page | integer | Indeks halaman PDF berbasis nol |
| x | number | Posisi kiri sebagai fraksi halaman |
| y | number | Posisi atas sebagai fraksi halaman |
| w | number | Lebar tanda tangan sebagai fraksi halaman |
| h | number | Tinggi tanda tangan sebagai fraksi halaman |

Koordinat menggunakan titik asal kiri-atas. Nilai mungkin sedikit melampaui tepi halaman; perender PDF memotong cap akhir agar sesuai halaman.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/sign-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@contract.pdf" \
  -F "sig0=@signature.png" \
  -F 'placements=[{"sig":0,"page":0,"x":0.64,"y":0.82,"w":0.22,"h":0.08}]'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/contract_signed.pdf",
  "previewUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/preview.png",
  "originalSize": 245000,
  "processedSize": 249000
}
```

Jika permintaan tidak dapat selesai dalam jendela tunggu sinkron, API mengembalikan:

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

Sambungkan ke `/api/v1/jobs/<jobId>/progress` dan unduh hasilnya saat job selesai.

## Notes {#notes}

- Format input PDF yang diterima: `.pdf`.
- Gambar tanda tangan harus berupa file gambar yang valid, biasanya PNG dengan transparansi.
- Hingga 100 gambar tanda tangan dan 100 penempatan diterima.
- `sign-pdf` adalah rute khusus dan tidak menggunakan field JSON `settings` alat standar.
