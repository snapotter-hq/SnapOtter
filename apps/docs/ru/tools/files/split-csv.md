---
description: "Разделение CSV на файлы меньшего размера по количеству строк."
i18n_source_hash: a35dce4a99a3
i18n_provenance: human
i18n_output_hash: bf4258d7aa38
---

# Разделение CSV {#split-csv}

Разделите большой файл CSV или TSV на файлы меньшего размера по количеству строк. Возвращает ZIP-архив с частями.

## Конечная точка API {#api-endpoint}

`POST /api/v1/tools/files/split-csv`

Принимает multipart form data с файлом CSV и полем JSON `settings`.

## Параметры {#parameters}

| Параметр | Тип | Обязательный | По умолчанию | Описание |
|-----------|------|----------|---------|-------------|
| rowsPerFile | integer | Нет | `1000` | Количество строк данных на выходной файл (1–1 000 000) |
| keepHeader | boolean | Нет | `true` | Повторять строку заголовка в каждом выходном файле |

## Пример запроса {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/split-csv \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@large-dataset.csv" \
  -F 'settings={"rowsPerFile": 500, "keepHeader": true}'
```

## Пример ответа {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/large-dataset_parts.zip",
  "originalSize": 1048576,
  "processedSize": 1050000
}
```

## Примечания {#notes}

- Вывод всегда представляет собой ZIP-архив с разделёнными частями CSV, названными последовательно (например, `part-1.csv`, `part-2.csv`).
- Когда `keepHeader` имеет значение `true`, каждая часть включает исходную строку заголовка, поэтому каждый файл можно использовать независимо.
- В качестве ввода принимаются как файлы CSV, так и TSV.
- Количество строк относится только к строкам данных; строка заголовка не учитывается.
