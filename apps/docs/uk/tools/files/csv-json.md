---
description: "Конвертація між CSV та JSON в обох напрямках."
i18n_source_hash: 978c08ad46d3
i18n_provenance: human
i18n_output_hash: 46a595a41439
---

# CSV to JSON {#csv-to-json}

Конвертація між форматами CSV та JSON в обох напрямках. Завантажте файл CSV чи TSV, щоб отримати масив об'єктів JSON, або завантажте масив JSON, щоб отримати файл CSV.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/csv-json`

Приймає дані форми multipart з файлом CSV, TSV чи JSON та JSON-полем `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| pretty | boolean | No | `true` | Форматований вивід JSON з відступами |

## Example Request {#example-request}

CSV у JSON:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/csv-json \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@users.csv" \
  -F 'settings={"pretty": true}'
```

JSON у CSV:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/csv-json \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@users.json" \
  -F 'settings={}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/users.json",
  "originalSize": 1500,
  "processedSize": 2200
}
```

## Notes {#notes}

- Напрямок конвертації визначається автоматично з розширення вхідного файлу: `.csv` або `.tsv` дає `.json`, а `.json` дає `.csv`.
- Параметр `pretty` впливає лише на вивід JSON. Коли встановлено `false`, вивід є компактним однорядковим рядком JSON.
- Вхідні дані JSON мають бути масивом об'єктів із узгодженими ключами. Кожен об'єкт стає рядком, а кожен ключ стає заголовком стовпця.
- Файли TSV (значення, розділені табуляцією) підтримуються поряд із CSV.
