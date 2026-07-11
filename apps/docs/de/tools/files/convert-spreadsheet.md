---
description: "Konvertiert zwischen Excel-, OpenDocument- und CSV-Formaten."
i18n_source_hash: b813b1b06962
i18n_provenance: human
i18n_output_hash: bd9adfbc6a69
---

# Convert Spreadsheet {#convert-spreadsheet}

Konvertiert Tabellenkalkulationen zwischen den Formaten Excel (XLSX), OpenDocument Spreadsheet (ODS) und CSV. Bei Arbeitsmappen mit mehreren Blättern wird beim Konvertieren nach CSV das erste Blatt exportiert.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/convert-spreadsheet`

Akzeptiert Multipart-Formulardaten mit einer Excel-/ODS-/CSV-Datei und einem JSON-Feld `settings`.

## Parameters {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| format | string | Ja | - | Ausgabeformat: `xlsx`, `ods`, `csv` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-spreadsheet \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@data.xlsx" \
  -F 'settings={"format": "csv"}'
```

## Example Response {#example-response}

Gibt `202 Accepted` zurück. Verfolge den Fortschritt per SSE unter `/api/v1/jobs/{jobId}/progress`.

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Akzeptierte Eingabeformate: `.xlsx`, `.xls`, `.ods`, `.csv`.
- Beim Konvertieren einer Arbeitsmappe mit mehreren Blättern nach CSV wird nur das erste Blatt exportiert.
- Formeln werden ausgewertet und als statische Werte in die CSV-Ausgabe exportiert.
- Das Ausgabeformat muss sich vom Eingabeformat unterscheiden.
