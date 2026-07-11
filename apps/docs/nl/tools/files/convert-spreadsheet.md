---
description: "Converteer tussen Excel-, OpenDocument- en CSV-formaten."
i18n_source_hash: b813b1b06962
i18n_provenance: human
i18n_output_hash: 0ba897028f70
---

# Convert Spreadsheet {#convert-spreadsheet}

Converteer spreadsheets tussen Excel (XLSX), OpenDocument Spreadsheet (ODS) en CSV-formaten. Werkmappen met meerdere bladen exporteren het eerste blad bij conversie naar CSV.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/convert-spreadsheet`

Accepteert multipart-formulierdata met een Excel-/ODS-/CSV-bestand en een JSON-veld `settings`.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| format | string | Ja | - | Uitvoerformaat: `xlsx`, `ods`, `csv` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-spreadsheet \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@data.xlsx" \
  -F 'settings={"format": "csv"}'
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

- Geaccepteerde invoerformaten: `.xlsx`, `.xls`, `.ods`, `.csv`.
- Bij conversie van een werkmap met meerdere bladen naar CSV wordt alleen het eerste blad geëxporteerd.
- Formules worden geëvalueerd en als statische waarden geëxporteerd in de CSV-uitvoer.
- Het uitvoerformaat moet verschillen van het invoerformaat.
