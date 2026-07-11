---
description: "Объединение нескольких файлов CSV или TSV с совпадающими столбцами в один."
i18n_source_hash: 109b5f399ac8
i18n_provenance: human
i18n_output_hash: 1e7be7503f4d
---

# Объединение CSV {#merge-csvs}

Объедините несколько файлов CSV или TSV с совпадающими столбцами в один общий файл. Все входные файлы должны иметь одинаковые заголовки столбцов.

## Конечная точка API {#api-endpoint}

`POST /api/v1/tools/files/merge-csvs`

Принимает multipart form data с двумя или более файлами CSV. Поле настроек не требуется.

## Параметры {#parameters}

У этого инструмента нет настраиваемых параметров. Загрузите от 2 до 20 файлов CSV или TSV с совпадающими заголовками столбцов.

## Пример запроса {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/merge-csvs \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@january.csv" \
  -F "file=@february.csv" \
  -F "file=@march.csv"
```

## Пример ответа {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/merged.csv",
  "originalSize": 30000,
  "processedSize": 28500
}
```

## Примечания {#notes}

- Требуется от 2 до 20 входных файлов.
- Все файлы должны иметь одинаковые заголовки столбцов. Объединение завершится ошибкой, если столбцы не совпадают.
- Строка заголовка включается в вывод один раз; строки данных из всех файлов объединяются в порядке загрузки.
- Принимаются как файлы CSV, так и TSV, но все файлы в одном запросе должны использовать один и тот же разделитель.
