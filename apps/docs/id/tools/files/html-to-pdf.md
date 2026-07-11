---
description: "Konversi file HTML ke PDF."
i18n_source_hash: 20b9ae147db5
i18n_provenance: human
i18n_output_hash: 8ea754992c7f
---

# HTML to PDF {#html-to-pdf}

Konversi file HTML menjadi dokumen PDF yang tergaya. Sumber daya jarak jauh (gambar eksternal, stylesheet, skrip) dinonaktifkan demi privasi.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/html-to-pdf`

Menerima multipart form data berisi file HTML.

## Parameters {#parameters}

Tool ini tidak memiliki parameter yang dapat dikonfigurasi. Unggah file HTML dan file tersebut akan dikonversi ke PDF.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/html-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@page.html"
```

## Example Response {#example-response}

Mengembalikan `202 Accepted`. Lacak progres melalui SSE di `/api/v1/jobs/{jobId}/progress`.

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Format input yang diterima: `.html`, `.htm`.
- Sumber daya jarak jauh (gambar, stylesheet, skrip yang dirujuk via URL) tidak diambil demi privasi dan keamanan.
- Gaya inline dan gambar tersemat (data URI) dipertahankan.
- Konversi ditangani oleh WeasyPrint di server.
