---
description: "Baca dan tulis metadata dokumen PDF."
i18n_source_hash: 11de4f7991e4
i18n_provenance: machine
i18n_output_hash: f95257211f03
i18n_hash_version: 2
---

# PDF Metadata {#pdf-metadata}

Baca dan perbarui field metadata dokumen PDF seperti judul, penulis, subjek, dan kata kunci, atau hapus seluruh metadata dokumen. Jika tidak ada pengaturan yang diberikan, metadata yang ada dikembalikan tanpa modifikasi.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-metadata`

Menerima data form multipart berisi file PDF dan sebuah field JSON `settings` opsional.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| title | string | No | - | Judul dokumen (maks 500 karakter) |
| author | string | No | - | Penulis dokumen (maks 500 karakter) |
| subject | string | No | - | Subjek dokumen (maks 500 karakter) |
| keywords | string | No | - | Kata kunci dokumen (maks 500 karakter) |
| stripAll | boolean | No | false | Hapus seluruh dictionary Info (tanggal, Creator, Producer, key kustom), setiap stream XMP (dokumen, halaman, gambar), dan semua data aplikasi PieceInfo, lalu tulis field yang diberikan di atas |
| removeAttachments | boolean | No | false | Hapus juga file tersemat: daftar lampiran dokumen, anotasi lampiran file, dan file terkait (`/AF`). Membutuhkan `stripAll` |

Semua parameter bersifat opsional. Field yang dihilangkan dibiarkan tidak berubah kecuali `stripAll` diatur.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf" \
  -F 'settings={"title": "Q2 Report", "author": "Finance Team"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/report.pdf",
  "originalSize": 245000,
  "processedSize": 245200,
  "metadata": {
    "title": "Q2 Report",
    "author": "Finance Team",
    "subject": "",
    "keywords": ""
  }
}
```

## Notes {#notes}

- Format input yang diterima: `.pdf`.
- Ini adalah alat cepat (sinkron) yang mengembalikan hasil secara langsung.
- Field `metadata` dalam respons berisi metadata hasil setelah pembaruan apa pun.
- Untuk membaca metadata tanpa memodifikasinya, hilangkan field `settings` atau kirim objek kosong.
- Setiap field metadata dibatasi hingga 500 karakter.
- Dengan `stripAll`, respons juga membawa `stripped`: key Info yang dihapus (`removed`), apakah stream XMP dokumen dihapus (`xmpRemoved`), level PDF/A yang dinyatakan input (`pdfa`, atau `null`), berapa banyak stream XMP yang dilepas dari halaman, gambar, dan objek lain (`objectXmpRemoved`), berapa banyak dictionary PieceInfo yang dihapus (`pieceInfoRemoved`), dan berapa banyak file tersemat yang dihapus (`attachmentsRemoved`, selalu `0` tanpa `removeAttachments`). Menghapus XMP merusak kesesuaian PDF/A.
- `stripAll` saja mempertahankan lampiran file tersemat, karena menghapusnya mengubah isi dokumen. Tambahkan `removeAttachments` untuk menghapusnya juga. Itu menghapus XML terlampir dari e-invoice ZUGFeRD dan Factur-X dan merusak kesesuaian PDF/A-3.
- Mengirim `removeAttachments` tanpa `stripAll` mengembalikan 400.
