---
description: "Konversi EPUB ke PDF, DOCX, HTML, atau Markdown."
i18n_source_hash: 7d94fc18ca97
i18n_provenance: human
i18n_output_hash: cf8d4169cf9e
---

# Convert EPUB {#convert-epub}

Konversi e-book EPUB ke PDF, Word (DOCX), HTML, atau Markdown. Sumber daya jarak jauh di dalam buku tidak diambil.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/epub-convert`

Menerima multipart form data berisi file EPUB dan field JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | Yes | - | Format output: `pdf`, `docx`, `html`, `md` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/epub-convert \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@book.epub" \
  -F 'settings={"format": "pdf"}'
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

- Format input yang diterima: `.epub`.
- Sumber daya jarak jauh yang tersemat dalam EPUB (gambar eksternal, font) tidak diambil demi keamanan.
- Kualitas gambar dalam output hasil konversi dapat bervariasi tergantung struktur EPUB.
- Konversi ditangani oleh Pandoc di server.
