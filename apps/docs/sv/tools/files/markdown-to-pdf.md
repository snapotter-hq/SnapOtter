---
description: "Konvertera en Markdown-fil till en formaterad PDF."
i18n_source_hash: 18474dc8772a
i18n_provenance: human
i18n_output_hash: e46ce8b159b7
---

# Markdown till PDF {#markdown-to-pdf}

Konvertera en Markdown-fil till ett formaterat PDF-dokument. Fjärresurser är inaktiverade av integritetsskäl.

## API-slutpunkt {#api-endpoint}

`POST /api/v1/tools/files/markdown-to-pdf`

Tar emot multipart-formulärdata med en Markdown-fil.

## Parametrar {#parameters}

Det här verktyget har inga konfigurerbara parametrar. Ladda upp en Markdown-fil så konverteras den till PDF.

## Exempelförfrågan {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/markdown-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.md"
```

## Exempelsvar {#example-response}

Returnerar `202 Accepted`. Följ förloppet via SSE på `/api/v1/jobs/{jobId}/progress`.

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Anteckningar {#notes}

- Godtagna indataformat: `.md`, `.markdown`.
- Fjärresurser (bilder, stilmallar som refereras via URL:er) hämtas inte av integritets- och säkerhetsskäl.
- Markdown renderas först till HTML och konverteras sedan till PDF via WeasyPrint.
- Kodblock, tabeller och andra Markdown-element formateras i PDF-utdata.
