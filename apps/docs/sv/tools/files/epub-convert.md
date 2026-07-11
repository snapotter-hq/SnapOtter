---
description: "Konvertera en EPUB till PDF, DOCX, HTML eller Markdown."
i18n_source_hash: 7d94fc18ca97
i18n_provenance: human
i18n_output_hash: b9a115201af2
---

# Convert EPUB {#convert-epub}

Konvertera en EPUB-e-bok till PDF, Word (DOCX), HTML eller Markdown. Fjärresurser inuti boken hämtas inte.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/epub-convert`

Tar emot multipart-formulärdata med en EPUB-fil och ett JSON-fält `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | Yes | - | Utdataformat: `pdf`, `docx`, `html`, `md` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/epub-convert \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@book.epub" \
  -F 'settings={"format": "pdf"}'
```

## Example Response {#example-response}

Returnerar `202 Accepted`. Följ förloppet via SSE på `/api/v1/jobs/{jobId}/progress`.

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Godkänt indataformat: `.epub`.
- Fjärresurser som är inbäddade i EPUB:en (externa bilder, teckensnitt) hämtas inte av säkerhetsskäl.
- Bildkvaliteten i den konverterade utdatan kan variera beroende på EPUB-strukturen.
- Konverteringen hanteras av Pandoc på servern.
