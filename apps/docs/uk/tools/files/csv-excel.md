---
description: "Конвертація між CSV та Excel (XLSX) в обох напрямках."
i18n_source_hash: 213297311e36
i18n_provenance: human
i18n_output_hash: ea756ad786ed
---

# CSV to Excel {#csv-to-excel}

Конвертація між форматами CSV та Excel (XLSX) в обох напрямках. Завантажте файл CSV чи TSV, щоб отримати XLSX, або завантажте файл XLSX, щоб отримати CSV.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/csv-excel`

Приймає дані форми multipart з файлом CSV, TSV чи XLSX та JSON-полем `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| sheet | integer | No | `1` | Номер аркуша для експорту під час конвертації з XLSX (мінімум 1) |

## Example Request {#example-request}

CSV у Excel:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/csv-excel \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@data.csv" \
  -F 'settings={"sheet": 1}'
```

Excel у CSV:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/csv-excel \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.xlsx" \
  -F 'settings={"sheet": 2}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/data.xlsx",
  "originalSize": 2048,
  "processedSize": 5120
}
```

## Notes {#notes}

- Напрямок конвертації визначається автоматично з розширення вхідного файлу: `.csv` або `.tsv` дає `.xlsx`, а `.xlsx` дає `.csv`.
- Параметр `sheet` застосовується лише під час конвертації з XLSX. Він вибирає, який аркуш експортувати.
- Файли TSV (значення, розділені табуляцією) підтримуються поряд із CSV.
