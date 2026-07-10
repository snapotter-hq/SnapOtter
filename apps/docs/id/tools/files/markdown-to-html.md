---
description: "Konversi file Markdown ke halaman HTML mandiri."
i18n_source_hash: 3ef805e8fc8c
i18n_provenance: human
i18n_output_hash: f31cb7836032
---

# Markdown to HTML {#markdown-to-html}

Konversi file Markdown menjadi halaman HTML mandiri. Gambar jarak jauh yang dirujuk dalam sumber dibiarkan apa adanya pada output.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/markdown-to-html`

Menerima multipart form data berisi file Markdown.

## Parameters {#parameters}

Tool ini tidak memiliki parameter yang dapat dikonfigurasi. Unggah file Markdown dan file tersebut akan dikonversi ke HTML.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/markdown-to-html \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@notes.md"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/notes.html",
  "originalSize": 3200,
  "processedSize": 5800
}
```

## Notes {#notes}

- Format input yang diterima: `.md`, `.markdown`.
- Ini adalah tool cepat (sinkron) yang mengembalikan hasil secara langsung.
- Output berupa halaman HTML mandiri dengan gaya inline.
- URL gambar jarak jauh dalam sumber Markdown dipertahankan apa adanya dan tidak diambil.
