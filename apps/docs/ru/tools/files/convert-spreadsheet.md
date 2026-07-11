---
description: "Конвертация между форматами Excel, OpenDocument и CSV."
i18n_source_hash: b813b1b06962
i18n_provenance: human
i18n_output_hash: f78d09466949
---

# Конвертация таблицы {#convert-spreadsheet}

Конвертация таблиц между форматами Excel (XLSX), OpenDocument Spreadsheet (ODS) и CSV. Из книг с несколькими листами при конвертации в CSV экспортируется первый лист.

## Эндпоинт API {#api-endpoint}

`POST /api/v1/tools/files/convert-spreadsheet`

Принимает multipart form data с файлом Excel/ODS/CSV и JSON-полем `settings`.

## Параметры {#parameters}

| Параметр | Тип | Обязательный | По умолчанию | Описание |
|-----------|------|----------|---------|-------------|
| format | string | Да | - | Формат вывода: `xlsx`, `ods`, `csv` |

## Пример запроса {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-spreadsheet \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@data.xlsx" \
  -F 'settings={"format": "csv"}'
```

## Пример ответа {#example-response}

Возвращает `202 Accepted`. Отслеживайте прогресс через SSE по адресу `/api/v1/jobs/{jobId}/progress`.

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Примечания {#notes}

- Принимаемые входные форматы: `.xlsx`, `.xls`, `.ods`, `.csv`.
- При конвертации книги с несколькими листами в CSV экспортируется только первый лист.
- Формулы вычисляются и экспортируются как статические значения в выводе CSV.
- Выходной формат должен отличаться от входного.
