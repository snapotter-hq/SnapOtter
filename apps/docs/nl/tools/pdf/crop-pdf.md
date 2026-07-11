---
description: "Snijd alle pagina's van een PDF bij met een uniforme marge."
i18n_source_hash: ffa1a2cee08d
i18n_provenance: human
i18n_output_hash: 7698e91a8208
---

# Crop PDF {#crop-pdf}

Snijd alle pagina's van een PDF bij door een uniforme marge toe te passen, waarbij van elke rand evenveel inhoud wordt weggenomen.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/crop-pdf`

Accepteert multipart-formuliergegevens met een PDF-bestand en een JSON-veld `settings`.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| margin | number | Nee | `20` | Uniforme bijsnijmarge in punten (0-2000) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/crop-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"margin": 50}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2440000
}
```

## Notes {#notes}

- De margewaarde is in PDF-punten (1 punt = 1/72 inch).
- Dezelfde marge wordt toegepast op alle vier de randen van elke pagina.
- Een marge van `0` verwijdert alle bestaande bijsnijmarges en toont de volledige media box.
