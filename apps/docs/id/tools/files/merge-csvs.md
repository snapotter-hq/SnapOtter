---
description: "Gabungkan beberapa berkas CSV atau TSV dengan kolom yang cocok menjadi satu."
i18n_source_hash: 109b5f399ac8
i18n_provenance: human
i18n_output_hash: cefbd1f5633d
---

# Gabungkan CSV {#merge-csvs}

Gabungkan beberapa berkas CSV atau TSV dengan kolom yang cocok menjadi satu berkas gabungan. Semua berkas input harus memiliki header kolom yang sama.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/merge-csvs`

Menerima data formulir multipart dengan dua atau lebih berkas CSV. Tidak diperlukan bidang pengaturan.

## Parameter {#parameters}

Alat ini tidak memiliki parameter yang dapat dikonfigurasi. Unggah 2-20 berkas CSV atau TSV dengan header kolom yang cocok.

## Contoh Permintaan {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/merge-csvs \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@january.csv" \
  -F "file=@february.csv" \
  -F "file=@march.csv"
```

## Contoh Respons {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/merged.csv",
  "originalSize": 30000,
  "processedSize": 28500
}
```

## Catatan {#notes}

- Memerlukan antara 2 hingga 20 berkas input.
- Semua berkas harus memiliki header kolom yang sama. Penggabungan akan gagal jika kolom tidak cocok.
- Baris header disertakan sekali dalam keluaran; baris data dari semua berkas digabungkan sesuai urutan pengunggahan.
- Baik berkas CSV maupun TSV diterima, tetapi semua berkas dalam satu permintaan harus menggunakan pembatas yang sama.
