---
description: "Konvertiert Tabellenkalkulationen in PDF."
i18n_source_hash: 4dbe2a810ea6
i18n_provenance: human
i18n_output_hash: faf8c85d9895
---

# Excel to PDF {#excel-to-pdf}

Konvertiert Excel-, OpenDocument- oder CSV-Tabellenkalkulationen in PDF. Breite Blätter können über mehrere Seiten paginiert werden.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/excel-to-pdf`

Akzeptiert Multipart-Formulardaten mit einer Excel-/ODS-/CSV-Datei.

## Parameters {#parameters}

Dieses Tool hat keine konfigurierbaren Parameter. Lade eine Tabellenkalkulation hoch, und sie wird in PDF konvertiert.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/excel-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@budget.xlsx"
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
- Breite Blätter können im resultierenden PDF über mehrere Seiten aufgeteilt werden.
- Diagramme und bedingte Formatierungen werden in der PDF-Ausgabe gerendert.
- Die Konvertierung wird von LibreOffice im Headless-Modus auf dem Server durchgeführt.
