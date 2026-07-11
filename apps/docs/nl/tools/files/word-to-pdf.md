---
description: "Converteer Word-documenten naar PDF."
i18n_source_hash: f814ba1a1a53
i18n_provenance: human
i18n_output_hash: 524c16c957a8
---

# Word naar PDF {#word-to-pdf}

Converteer Word-documenten, OpenDocument-tekst, RTF of platte-tekstbestanden naar PDF.

## API-endpoint {#api-endpoint}

`POST /api/v1/tools/files/word-to-pdf`

Accepteert multipart form data met een Word/ODT/RTF/TXT-bestand.

## Parameters {#parameters}

Deze tool heeft geen instelbare parameters. Upload een document en het wordt naar PDF geconverteerd.

## Voorbeeldaanvraag {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/word-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.docx"
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

- Geaccepteerde invoerformaten: `.docx`, `.doc`, `.odt`, `.rtf`, `.txt`.
- De conversie wordt uitgevoerd door LibreOffice, dat headless op de server draait.
- In het document ingebedde lettertypen worden gebruikt indien beschikbaar; anders worden systeemlettertypen vervangen.
- Kopteksten, voetteksten, tabellen en afbeeldingen blijven behouden in de PDF-uitvoer.
