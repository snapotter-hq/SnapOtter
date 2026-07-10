---
description: "Baka in formulär och anteckningar i sidinnehållet."
i18n_source_hash: b25c2a2b6f40
i18n_provenance: human
i18n_output_hash: 228f0a70b0e2
---

# Flatten PDF {#flatten-pdf}

Baka in interaktiva formulärfält och anteckningar i sidinnehållet, vilket skapar en statisk PDF som ser likadan ut överallt.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/flatten-pdf`

Tar emot multipart-formulärdata med en PDF-fil.

## Parameters {#parameters}

Detta verktyg har inga konfigurerbara parametrar. Ladda upp en PDF så plattas alla formulär och anteckningar ut.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/flatten-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@form.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/form.pdf",
  "originalSize": 185000,
  "processedSize": 172000
}
```

## Notes {#notes}

- Godkänt indataformat: `.pdf`.
- Detta är ett snabbt (synkront) verktyg som returnerar resultatet direkt.
- Formulärfältens värden bevaras som statisk text i utdata.
- Anteckningar (kommentarer, markeringar, klisterlappar) blir en del av sidinnehållet och kan inte längre redigeras.
