---
description: "Конвертация между CSV и JSON в обоих направлениях."
i18n_source_hash: 978c08ad46d3
i18n_provenance: human
i18n_output_hash: f6973b0d850a
---

# CSV в JSON {#csv-to-json}

Конвертация между форматами CSV и JSON в обоих направлениях. Загрузите файл CSV или TSV, чтобы получить массив объектов JSON, или загрузите массив JSON, чтобы получить файл CSV.

## Эндпоинт API {#api-endpoint}

`POST /api/v1/tools/files/csv-json`

Принимает multipart form data с файлом CSV, TSV или JSON и JSON-полем `settings`.

## Параметры {#parameters}

| Параметр | Тип | Обязательный | По умолчанию | Описание |
|-----------|------|----------|---------|-------------|
| pretty | boolean | Нет | `true` | Форматированный вывод JSON с отступами |

## Пример запроса {#example-request}

CSV в JSON:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/csv-json \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@users.csv" \
  -F 'settings={"pretty": true}'
```

JSON в CSV:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/csv-json \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@users.json" \
  -F 'settings={}'
```

## Пример ответа {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/users.json",
  "originalSize": 1500,
  "processedSize": 2200
}
```

## Примечания {#notes}

- Направление конвертации автоматически определяется по расширению входного файла: `.csv` или `.tsv` производит `.json`, а `.json` производит `.csv`.
- Параметр `pretty` влияет только на вывод JSON. При значении `false` выводом является компактная однострочная строка JSON.
- Входные данные JSON должны быть массивом объектов с согласованными ключами. Каждый объект становится строкой, а каждый ключ становится заголовком столбца.
- Файлы TSV (значения, разделённые табуляцией) поддерживаются наряду с CSV.
