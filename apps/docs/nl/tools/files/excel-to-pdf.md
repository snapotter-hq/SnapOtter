---
description: "Converteer spreadsheets naar PDF."
i18n_source_hash: 4dbe2a810ea6
i18n_provenance: human
i18n_output_hash: e1f0fb6c6432
---

# Excel to PDF {#excel-to-pdf}

Converteer Excel-, OpenDocument- of CSV-spreadsheets naar PDF. Brede bladen kunnen over meerdere pagina's worden gepagineerd.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/excel-to-pdf`

Accepteert multipart-formulierdata met een Excel-/ODS-/CSV-bestand.

## Parameters {#parameters}

Deze tool heeft geen instelbare parameters. Upload een spreadsheet en deze wordt naar PDF geconverteerd.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/excel-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@budget.xlsx"
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
- Brede bladen kunnen over meerdere pagina's worden opgesplitst in de resulterende PDF.
- Diagrammen en voorwaardelijke opmaak worden in de PDF-uitvoer weergegeven.
- De conversie wordt uitgevoerd door LibreOffice dat headless op de server draait.
