---
description: "Converteer Word-, Markdown-, HTML- of platte-tekstbestanden naar EPUB."
i18n_source_hash: 63e1afa91c52
i18n_provenance: human
i18n_output_hash: bb690ea5428b
---

# Converteren naar EPUB {#convert-to-epub}

Converteer Word-documenten, Markdown, HTML of platte-tekstbestanden naar het EPUB-e-boekformaat.

## API-endpoint {#api-endpoint}

`POST /api/v1/tools/files/to-epub`

Accepteert multipart form data met een Word/Markdown/HTML/TXT-bestand.

## Parameters {#parameters}

Deze tool heeft geen instelbare parameters. Upload een document en het wordt naar EPUB geconverteerd.

## Voorbeeldaanvraag {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/to-epub \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@manuscript.docx"
```

## Voorbeeldantwoord {#example-response}

Retourneert `202 Accepted`. Volg de voortgang via SSE op `/api/v1/jobs/{jobId}/progress`.

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Opmerkingen {#notes}

- Geaccepteerde invoerformaten: `.docx`, `.md`, `.html`, `.txt`.
- De EPUB-uitvoer volgt de EPUB 3-specificatie.
- Koppen in het bronddocument worden gebruikt om de inhoudsopgave te genereren.
- De conversie wordt uitgevoerd door Pandoc op de server.
