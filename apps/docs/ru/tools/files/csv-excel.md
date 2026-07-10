---
description: "Конвертация между CSV и Excel (XLSX) в обоих направлениях."
i18n_source_hash: 213297311e36
i18n_provenance: human
i18n_output_hash: c7ca7450f501
---

# CSV в Excel {#csv-to-excel}

Конвертация между форматами CSV и Excel (XLSX) в обоих направлениях. Загрузите файл CSV или TSV, чтобы получить XLSX, или загрузите файл XLSX, чтобы получить CSV.

## Эндпоинт API {#api-endpoint}

`POST /api/v1/tools/files/csv-excel`

Принимает multipart form data с файлом CSV, TSV или XLSX и JSON-полем `settings`.

## Параметры {#parameters}

| Параметр | Тип | Обязательный | По умолчанию | Описание |
|-----------|------|----------|---------|-------------|
| sheet | integer | Нет | `1` | Номер листа для экспорта при конвертации из XLSX (минимум 1) |

## Пример запроса {#example-request}

CSV в Excel:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/csv-excel \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@data.csv" \
  -F 'settings={"sheet": 1}'
```

Excel в CSV:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/csv-excel \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.xlsx" \
  -F 'settings={"sheet": 2}'
```

## Пример ответа {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/data.xlsx",
  "originalSize": 2048,
  "processedSize": 5120
}
```

## Примечания {#notes}

- Направление конвертации автоматически определяется по расширению входного файла: `.csv` или `.tsv` производит `.xlsx`, а `.xlsx` производит `.csv`.
- Параметр `sheet` применяется только при конвертации из XLSX. Он выбирает, какой лист экспортировать.
- Файлы TSV (значения, разделённые табуляцией) поддерживаются наряду с CSV.
