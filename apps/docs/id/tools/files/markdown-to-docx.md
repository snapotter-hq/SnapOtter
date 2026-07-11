---
description: "Konversi file Markdown ke dokumen Word (DOCX)."
i18n_source_hash: 979cb8ee13f2
i18n_provenance: human
i18n_output_hash: 8e47521a61e3
---

# Markdown to Word {#markdown-to-word}

Konversi file Markdown menjadi dokumen Word (DOCX), mempertahankan heading, daftar, blok kode, dan pemformatan lainnya.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/markdown-to-docx`

Menerima multipart form data berisi file Markdown.

## Parameters {#parameters}

Tool ini tidak memiliki parameter yang dapat dikonfigurasi. Unggah file Markdown dan file tersebut akan dikonversi ke DOCX.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/markdown-to-docx \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@README.md"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/README.docx",
  "originalSize": 4500,
  "processedSize": 18200
}
```

## Notes {#notes}

- Format input yang diterima: `.md`, `.markdown`.
- Ini adalah tool cepat (sinkron) yang mengembalikan hasil secara langsung.
- Heading, tebal, miring, tautan, blok kode, dan daftar dipetakan ke gaya Word.
- Konversi ditangani oleh Pandoc di server.
