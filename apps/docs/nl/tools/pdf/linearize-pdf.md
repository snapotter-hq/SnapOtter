---
description: "Lineariseer een PDF voor snelle weergave op het web (progressief downloaden)."
i18n_source_hash: 36280b478161
i18n_provenance: human
i18n_output_hash: 1f31a94205e7
---

# Web-Optimize PDF {#web-optimize-pdf}

Lineariseer een PDF zodat deze progressief kan worden gedownload en weergegeven in webbrowsers zonder op het volledige bestand te wachten.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/linearize-pdf`

Accepteert multipart-formuliergegevens met een PDF-bestand. Er is geen veld `settings` vereist.

## Parameters {#parameters}

Dit hulpmiddel heeft geen instellingsparameters. Upload het PDF-bestand direct.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/linearize-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2460000
}
```

## Notes {#notes}

- Linearisatie herschikt de interne structuur van de PDF zodat de eerste pagina kan worden weergegeven voordat het volledige bestand is gedownload.
- Het uitvoerbestand kan iets groter zijn dan de invoer vanwege de toegevoegde linearisatiegegevens.
- Reeds gelineariseerde PDF's worden zonder problemen opnieuw gelineariseerd.
