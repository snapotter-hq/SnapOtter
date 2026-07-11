---
description: "Konwertuje arkusze kalkulacyjne na PDF."
i18n_source_hash: 4dbe2a810ea6
i18n_provenance: human
i18n_output_hash: 70e724345947
---

# Excel to PDF {#excel-to-pdf}

Konwertuje arkusze kalkulacyjne Excel, OpenDocument lub CSV na PDF. Szerokie arkusze mogą być dzielone na wiele stron.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/excel-to-pdf`

Przyjmuje dane formularza multipart z plikiem Excel/ODS/CSV.

## Parameters {#parameters}

To narzędzie nie ma konfigurowalnych parametrów. Prześlij arkusz kalkulacyjny, a zostanie on przekonwertowany na PDF.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/excel-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@budget.xlsx"
```

## Example Response {#example-response}

Zwraca `202 Accepted`. Śledź postęp przez SSE pod `/api/v1/jobs/{jobId}/progress`.

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Akceptowane formaty wejściowe: `.xlsx`, `.xls`, `.ods`, `.csv`.
- Szerokie arkusze mogą zostać podzielone na wiele stron w wynikowym PDF.
- Wykresy i formatowanie warunkowe są renderowane w wyniku PDF.
- Konwersję obsługuje LibreOffice działający w trybie headless na serwerze.
