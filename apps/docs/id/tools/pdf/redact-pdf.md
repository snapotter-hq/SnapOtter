---
description: "Hapus permanen kemunculan teks dari PDF (redaksi asli terverifikasi)."
i18n_source_hash: 296ad2a701b2
i18n_provenance: human
i18n_output_hash: eeca5fcb3d0b
---

# Redact PDF {#redact-pdf}

Hapus secara permanen kemunculan teks yang ditentukan dari PDF menggunakan redaksi asli terverifikasi. Teks yang diredaksi dihapus sepenuhnya dari file, bukan sekadar ditutup dengan kotak hitam.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/redact-pdf`

Menerima data form multipart berisi file PDF dan sebuah field JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| terms | string[] | Yes | - | String teks yang akan diredaksi (1-50 term, masing-masing hingga 200 karakter) |
| caseSensitive | boolean | No | `false` | Apakah pencocokan peka huruf besar-kecil |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/redact-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@contract.pdf" \
  -F 'settings={"terms": ["John Doe", "555-0123"], "caseSensitive": false}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/contract.pdf",
  "originalSize": 245000,
  "processedSize": 243000,
  "found": 7
}
```

## Notes {#notes}

- Format input yang diterima: `.pdf`.
- Ini adalah alat cepat (sinkron) yang mengembalikan hasil secara langsung.
- Ini melakukan redaksi asli: teks yang cocok dihapus dari aliran konten PDF, tidak sekadar dikaburkan secara visual.
- Field `found` dalam respons menunjukkan berapa banyak kemunculan yang diredaksi.
- Anda dapat meredaksi hingga 50 term dalam satu permintaan.
