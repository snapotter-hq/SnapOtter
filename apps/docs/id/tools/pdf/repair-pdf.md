---
description: "Coba perbaiki PDF yang rusak atau korup."
i18n_source_hash: 864073a2f09f
i18n_provenance: human
i18n_output_hash: 79ffed775a51
---

# Repair PDF {#repair-pdf}

Coba perbaiki PDF yang rusak atau korup dengan merekonstruksi struktur internalnya.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/repair-pdf`

Menerima data form multipart berisi file PDF. Tidak diperlukan field `settings`.

## Parameters {#parameters}

Alat ini tidak memiliki parameter pengaturan. Unggah file PDF yang rusak secara langsung.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/repair-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@damaged.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/damaged.pdf",
  "originalSize": 2450000,
  "processedSize": 2400000
}
```

## Notes {#notes}

- Validasi struktural dilewati pada input untuk memungkinkan file yang cacat lolos.
- Perbaikan bersifat upaya terbaik; file yang rusak parah mungkin tidak dapat dipulihkan sepenuhnya.
- PDF yang diperbaiki mungkin sedikit berbeda ukurannya dari aslinya karena tabel referensi silang yang direkonstruksi.
