---
description: "Konversi antar format Word, OpenDocument, RTF, dan teks biasa."
i18n_source_hash: 89771292569d
i18n_provenance: human
i18n_output_hash: 172c038b8cec
---

# Convert Document {#convert-document}

Konversi dokumen antar format Word (DOCX), OpenDocument (ODT), RTF, dan teks biasa menggunakan LibreOffice.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/convert-document`

Menerima multipart form data berisi file Word/ODT/RTF/TXT dan field JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | Yes | - | Format output: `docx`, `odt`, `rtf`, `txt` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-document \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.docx" \
  -F 'settings={"format": "odt"}'
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

- Format input yang diterima: `.docx`, `.doc`, `.odt`, `.rtf`, `.txt`.
- Konversi ditangani oleh LibreOffice yang berjalan headless di server.
- Pemformatan kompleks (makro, objek tersemat) mungkin tidak bertahan pada konversi antar format.
- Format output harus berbeda dari format input.
