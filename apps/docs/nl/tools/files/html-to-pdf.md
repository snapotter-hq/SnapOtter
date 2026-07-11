---
description: "Converteer een HTML-bestand naar PDF."
i18n_source_hash: 20b9ae147db5
i18n_provenance: human
i18n_output_hash: d3bf467dd4f1
---

# HTML to PDF {#html-to-pdf}

Converteer een HTML-bestand naar een opgemaakt PDF-document. Externe bronnen (externe afbeeldingen, stylesheets, scripts) zijn uitgeschakeld voor privacy.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/html-to-pdf`

Accepteert multipart-formulierdata met een HTML-bestand.

## Parameters {#parameters}

Deze tool heeft geen instelbare parameters. Upload een HTML-bestand en het wordt naar PDF geconverteerd.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/html-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@page.html"
```

## Example Response {#example-response}

Retourneert `202 Accepted`. Volg de voortgang via SSE op `/api/v1/jobs/{jobId}/progress`.

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Geaccepteerde invoerformaten: `.html`, `.htm`.
- Externe bronnen (afbeeldingen, stylesheets, scripts waarnaar via URL's wordt verwezen) worden om privacy- en veiligheidsredenen niet opgehaald.
- Inline stijlen en ingesloten afbeeldingen (data-URI's) blijven behouden.
- De conversie wordt uitgevoerd door WeasyPrint op de server.
