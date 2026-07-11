---
description: "Konvertera en Markdown-fil till ett Word-dokument (DOCX)."
i18n_source_hash: 979cb8ee13f2
i18n_provenance: human
i18n_output_hash: bf458a81c00e
---

# Markdown to Word {#markdown-to-word}

Konvertera en Markdown-fil till ett Word-dokument (DOCX) och bevara rubriker, listor, kodblock och annan formatering.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/markdown-to-docx`

Tar emot multipart-formulärdata med en Markdown-fil.

## Parameters {#parameters}

Detta verktyg har inga konfigurerbara parametrar. Ladda upp en Markdown-fil så konverteras den till DOCX.

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

- Godkända indataformat: `.md`, `.markdown`.
- Detta är ett snabbt (synkront) verktyg som returnerar resultatet direkt.
- Rubriker, fetstil, kursiv, länkar, kodblock och listor mappas till Word-stilar.
- Konverteringen hanteras av Pandoc på servern.
