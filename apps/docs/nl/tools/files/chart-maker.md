---
description: "Maak staaf-, lijn- of taartdiagrammen van CSV- of JSON-data."
i18n_source_hash: d3c39384457b
i18n_provenance: human
i18n_output_hash: 9092a99e8c0e
---

# Chart Maker {#chart-maker}

Maak staaf-, lijn- of taartdiagrammen van CSV- of JSON-data. Retourneert een PNG-afbeelding van het weergegeven diagram.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/chart-maker`

Accepteert multipart-formulierdata met een CSV- of JSON-bestand en een JSON-veld `settings`.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| kind | string | Nee | `"bar"` | Diagramtype: `bar`, `line`, `pie` |
| title | string | Nee | - | Diagramtitel (max. 120 tekens) |
| width | integer | Nee | `960` | Diagrambreedte in pixels (320-2048) |
| height | integer | Nee | `540` | Diagramhoogte in pixels (240-1536) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/chart-maker \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@sales.csv" \
  -F 'settings={"kind": "line", "title": "Monthly Sales", "width": 960, "height": 540}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/sales_chart.png",
  "originalSize": 1024,
  "processedSize": 48500
}
```

## Notes {#notes}

- De invoer moet een `.csv`- of `.json`-bestand zijn. CSV-bestanden moeten een koprij met kolomnamen hebben.
- De eerste kolom wordt gebruikt als categorielabel; de tweede kolom moet numeriek zijn en levert de datawaarden. Slechts twee kolommen worden gebruikt.
- JSON-invoer moet een array van `{label, value}`-objecten zijn, of een gewoon object waarvan de sleutels labels worden en de waarden datapunten.
- Maximaal 100 datapunten. Alle waarden moeten nul of groter zijn.
- De uitvoer is altijd een PNG-afbeelding, ongeacht het invoerformaat.
