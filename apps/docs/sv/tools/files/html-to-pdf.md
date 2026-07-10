---
description: "Konvertera en HTML-fil till PDF."
i18n_source_hash: 20b9ae147db5
i18n_provenance: human
i18n_output_hash: fbe1d4f797b2
---

# HTML to PDF {#html-to-pdf}

Konvertera en HTML-fil till ett formaterat PDF-dokument. Fjärresurser (externa bilder, formatmallar, skript) är inaktiverade av integritetsskäl.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/html-to-pdf`

Tar emot multipart-formulärdata med en HTML-fil.

## Parameters {#parameters}

Detta verktyg har inga konfigurerbara parametrar. Ladda upp en HTML-fil så konverteras den till PDF.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/html-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@page.html"
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

- Godkända indataformat: `.html`, `.htm`.
- Fjärresurser (bilder, formatmallar, skript som refereras via URL:er) hämtas inte av integritets- och säkerhetsskäl.
- Infogade stilar och inbäddade bilder (data-URI:er) bevaras.
- Konverteringen hanteras av WeasyPrint på servern.
