---
description: "Ekstrak elemen berulang dari XML ke dalam tabel CSV."
i18n_source_hash: 3ab1019bff8a
i18n_provenance: human
i18n_output_hash: c0b5517a5c0c
---

# XML ke CSV {#xml-to-csv}

Ekstrak elemen berulang dari berkas XML ke dalam tabel CSV datar. Alat ini secara otomatis menemukan larik objek pertama dalam pohon XML dan memetakan setiap elemen ke sebuah baris.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/xml-to-csv`

Menerima data formulir multipart dengan berkas XML. Tidak diperlukan bidang pengaturan.

## Parameter {#parameters}

Alat ini tidak memiliki parameter yang dapat dikonfigurasi. Elemen berulang dideteksi secara otomatis dari struktur XML.

## Contoh Permintaan {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/xml-to-csv \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@catalog.xml"
```

## Contoh Respons {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/catalog.csv",
  "originalSize": 4500,
  "processedSize": 1800
}
```

## Catatan {#notes}

- Hanya berkas `.xml` yang diterima sebagai input.
- Alat ini memindai pohon XML untuk menemukan kumpulan elemen bersaudara berulang pertama dan menggunakannya sebagai baris.
- Setiap nama elemen anak atau atribut yang unik menjadi header kolom CSV.
- Ini adalah konversi satu arah. Untuk konversi JSON/XML dua arah, gunakan alat [JSON ke XML](/id/tools/files/json-xml).
