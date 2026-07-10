---
description: "Konvertera kalkylblad till PDF."
i18n_source_hash: 4dbe2a810ea6
i18n_provenance: human
i18n_output_hash: 9f5c976a7251
---

# Excel to PDF {#excel-to-pdf}

Konvertera Excel-, OpenDocument- eller CSV-kalkylblad till PDF. Breda blad kan delas upp över flera sidor.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/excel-to-pdf`

Tar emot multipart-formulärdata med en Excel/ODS/CSV-fil.

## Parameters {#parameters}

Detta verktyg har inga konfigurerbara parametrar. Ladda upp ett kalkylblad så konverteras det till PDF.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/excel-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@budget.xlsx"
```

## Example Response {#example-response}

Returnerar `202 Accepted`. Följ förloppet via SSE på `/api/v1/jobs/{jobId}/progress`.

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Godkända indataformat: `.xlsx`, `.xls`, `.ods`, `.csv`.
- Breda blad kan delas upp över flera sidor i den resulterande PDF:en.
- Diagram och villkorsstyrd formatering renderas i PDF-utdatan.
- Konverteringen hanteras av LibreOffice som körs utan grafiskt gränssnitt på servern.
