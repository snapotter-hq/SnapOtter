---
description: "Конвертація між форматами Excel, OpenDocument та CSV."
i18n_source_hash: b813b1b06962
i18n_provenance: human
i18n_output_hash: 586f6b3bc56f
---

# Convert Spreadsheet {#convert-spreadsheet}

Конвертація електронних таблиць між форматами Excel (XLSX), OpenDocument Spreadsheet (ODS) та CSV. Багатоаркушеві книги експортують перший аркуш під час конвертації в CSV.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/convert-spreadsheet`

Приймає дані форми multipart з файлом Excel/ODS/CSV та JSON-полем `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | Yes | - | Формат виводу: `xlsx`, `ods`, `csv` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-spreadsheet \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@data.xlsx" \
  -F 'settings={"format": "csv"}'
```

## Example Response {#example-response}

Повертає `202 Accepted`. Відстежуйте прогрес через SSE за адресою `/api/v1/jobs/{jobId}/progress`.

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Прийнятні вхідні формати: `.xlsx`, `.xls`, `.ods`, `.csv`.
- Під час конвертації багатоаркушевої книги в CSV експортується лише перший аркуш.
- Формули обчислюються та експортуються як статичні значення у виводі CSV.
- Формат виводу має відрізнятися від вхідного формату.
