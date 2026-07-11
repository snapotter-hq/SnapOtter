---
description: "Pisahkan CSV menjadi berkas-berkas lebih kecil berdasarkan jumlah baris."
i18n_source_hash: a35dce4a99a3
i18n_provenance: human
i18n_output_hash: 8e7485f67004
---

# Pisahkan CSV {#split-csv}

Pisahkan berkas CSV atau TSV besar menjadi berkas-berkas lebih kecil berdasarkan jumlah baris. Mengembalikan arsip ZIP yang berisi bagian-bagiannya.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/split-csv`

Menerima data formulir multipart dengan berkas CSV dan bidang JSON `settings`.

## Parameter {#parameters}

| Parameter | Tipe | Wajib | Bawaan | Deskripsi |
|-----------|------|----------|---------|-------------|
| rowsPerFile | integer | Tidak | `1000` | Jumlah baris data per berkas keluaran (1-1.000.000) |
| keepHeader | boolean | Tidak | `true` | Ulangi baris header di setiap berkas keluaran |

## Contoh Permintaan {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/split-csv \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@large-dataset.csv" \
  -F 'settings={"rowsPerFile": 500, "keepHeader": true}'
```

## Contoh Respons {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/large-dataset_parts.zip",
  "originalSize": 1048576,
  "processedSize": 1050000
}
```

## Catatan {#notes}

- Keluaran selalu berupa arsip ZIP yang berisi bagian-bagian CSV yang dipisahkan, dinamai secara berurutan (mis. `part-1.csv`, `part-2.csv`).
- Ketika `keepHeader` bernilai `true`, setiap bagian menyertakan baris header asli sehingga setiap berkas dapat digunakan secara mandiri.
- Baik berkas CSV maupun TSV diterima sebagai input.
- Jumlah baris hanya merujuk pada baris data; baris header tidak dihitung.
