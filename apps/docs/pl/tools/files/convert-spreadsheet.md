---
description: "Konwertuje między formatami Excel, OpenDocument i CSV."
i18n_source_hash: b813b1b06962
i18n_provenance: human
i18n_output_hash: 08805f0ab779
---

# Convert Spreadsheet {#convert-spreadsheet}

Konwertuje arkusze kalkulacyjne między formatami Excel (XLSX), OpenDocument Spreadsheet (ODS) i CSV. Skoroszyty wieloarkuszowe eksportują pierwszy arkusz podczas konwersji do CSV.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/convert-spreadsheet`

Przyjmuje dane formularza multipart z plikiem Excel/ODS/CSV oraz polem JSON `settings`.

## Parameters {#parameters}

| Parametr | Typ | Wymagany | Domyślny | Opis |
|-----------|------|----------|---------|-------------|
| format | string | Tak | - | Format wyjściowy: `xlsx`, `ods`, `csv` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-spreadsheet \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@data.xlsx" \
  -F 'settings={"format": "csv"}'
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
- Podczas konwersji skoroszytu wieloarkuszowego do CSV eksportowany jest tylko pierwszy arkusz.
- Formuły są obliczane i eksportowane jako wartości statyczne w wyniku CSV.
- Format wyjściowy musi różnić się od formatu wejściowego.
