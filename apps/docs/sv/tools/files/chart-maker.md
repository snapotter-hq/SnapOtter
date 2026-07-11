---
description: "Skapa stapel-, linje- eller cirkeldiagram från CSV- eller JSON-data."
i18n_source_hash: d3c39384457b
i18n_provenance: human
i18n_output_hash: 7f34b37730f0
---

# Chart Maker {#chart-maker}

Skapa stapel-, linje- eller cirkeldiagram från CSV- eller JSON-data. Returnerar en PNG-bild av det renderade diagrammet.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/chart-maker`

Tar emot multipart-formulärdata med en CSV- eller JSON-fil och ett JSON-fält `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| kind | string | No | `"bar"` | Diagramtyp: `bar`, `line`, `pie` |
| title | string | No | - | Diagramtitel (max 120 tecken) |
| width | integer | No | `960` | Diagrambredd i pixlar (320-2048) |
| height | integer | No | `540` | Diagramhöjd i pixlar (240-1536) |

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

- Indata måste vara en `.csv`- eller `.json`-fil. CSV-filer bör ha en rubrikrad med kolumnnamn.
- Den första kolumnen används som kategorietikett; den andra kolumnen måste vara numerisk och tillhandahåller datavärdena. Endast två kolumner används.
- JSON-indata bör vara en array av `{label, value}`-objekt, eller ett enkelt objekt vars nycklar blir etiketter och vars värden blir datapunkter.
- Högst 100 datapunkter. Alla värden måste vara noll eller större.
- Utdata är alltid en PNG-bild oavsett indataformat.
