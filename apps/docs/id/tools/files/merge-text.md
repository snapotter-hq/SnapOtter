---
description: "Gabungkan beberapa file teks atau Markdown menjadi satu, dengan urutan pilihan Anda."
i18n_source_hash: 9b3ddd1eba68
i18n_provenance: machine
i18n_output_hash: fcb321aff4f2
i18n_hash_version: 2
---

# Gabung File Teks {#merge-text}

Gabungkan beberapa file teks atau Markdown menjadi satu file. File digabung sesuai urutan unggahan, jadi atur ulang urutannya di daftar file sebelum menjalankan jika urutan penting.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/merge-text`

Menerima data formulir multipart dengan dua file teks atau lebih dan string JSON `settings` opsional.

## Parameter {#parameters}

| Parameter | Tipe | Default | Deskripsi |
|-----------|------|---------|-------------|
| `separator` | string | `"blank-line"` | Yang ditempatkan di antara file: `"blank-line"`, `"rule"` (satu baris `---`), atau `"filename-heading"` (nama setiap file sebagai judul) |

## Contoh Permintaan {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/merge-text \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@chapter-1.md" \
  -F "file=@chapter-2.md" \
  -F 'settings={"separator":"filename-heading"}'
```

## Contoh Respons {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/merged.md",
  "originalSize": 8200,
  "processedSize": 8240
}
```

## Catatan {#notes}

- Menerima file `.txt`, `.md`, `.markdown`, `.csv`, dan `.log`, antara 2 hingga 50 per permintaan.
- Setiap file harus berupa teks UTF-8. File biner atau non-UTF-8 ditolak dan namanya muncul dalam pesan galat.
- Jika semua input memiliki ekstensi yang sama, keluaran mempertahankannya (`merged.md`, `merged.log`). Input campuran menghasilkan `merged.txt`.
- Dengan `filename-heading`, keluaran Markdown memakai judul `# name.md`; keluaran teks biasa memakai baris penanda `==> name.txt <==`.
- Baris kosong di akhir setiap file dipangkas agar pemisah berada rapi di antara dokumen. Byte-order mark di awal dibuang.
- File CSV digabung sebagai teks biasa. Gunakan [Gabungkan CSV](./merge-csvs) untuk menggabungkan tabel dengan satu baris header.
- File email `.eml` belum didukung.
