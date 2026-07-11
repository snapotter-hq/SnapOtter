---
description: "Bak formulieren en annotaties in de pagina-inhoud."
i18n_source_hash: b25c2a2b6f40
i18n_provenance: human
i18n_output_hash: 474ae6ea34fa
---

# Flatten PDF {#flatten-pdf}

Bak interactieve formuliervelden en annotaties in de pagina-inhoud en produceer een statische PDF die er overal hetzelfde uitziet.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/flatten-pdf`

Accepteert multipart-formuliergegevens met een PDF-bestand.

## Parameters {#parameters}

Dit hulpmiddel heeft geen configureerbare parameters. Upload een PDF en alle formulieren en annotaties worden afgevlakt.

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

- Geaccepteerd invoerformaat: `.pdf`.
- Dit is een snel (synchroon) hulpmiddel dat het resultaat direct teruggeeft.
- Formulierveldwaarden blijven behouden als statische tekst in de uitvoer.
- Annotaties (opmerkingen, markeringen, plaknotities) worden onderdeel van de pagina-inhoud en kunnen niet meer worden bewerkt.
