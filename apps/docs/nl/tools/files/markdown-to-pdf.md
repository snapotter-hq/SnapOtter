---
description: "Converteer een Markdown-bestand naar een gestileerde PDF."
i18n_source_hash: 18474dc8772a
i18n_provenance: human
i18n_output_hash: 6196675e3810
---

# Markdown naar PDF {#markdown-to-pdf}

Converteer een Markdown-bestand naar een gestileerd PDF-document. Externe bronnen zijn uitgeschakeld voor privacy.

## API-endpoint {#api-endpoint}

`POST /api/v1/tools/files/markdown-to-pdf`

Accepteert multipart form data met een Markdown-bestand.

## Parameters {#parameters}

Deze tool heeft geen instelbare parameters. Upload een Markdown-bestand en het wordt naar PDF geconverteerd.

## Voorbeeldaanvraag {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/markdown-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.md"
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

- Geaccepteerde invoerformaten: `.md`, `.markdown`.
- Externe bronnen (afbeeldingen, stylesheets waarnaar via URL's wordt verwezen) worden niet opgehaald, om redenen van privacy en veiligheid.
- De Markdown wordt eerst naar HTML gerenderd en vervolgens via WeasyPrint naar PDF geconverteerd.
- Codeblokken, tabellen en andere Markdown-elementen worden gestileerd in de PDF-uitvoer.
