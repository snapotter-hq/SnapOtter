---
description: "Объединение нескольких файлов в один ZIP-архив."
i18n_source_hash: 9ff1250dbd36
i18n_provenance: human
i18n_output_hash: a94db426c454
---

# Создание ZIP {#create-zip}

Объединение нескольких файлов любого типа в один ZIP-архив. Повторяющиеся имена файлов автоматически устраняются.

## Эндпоинт API {#api-endpoint}

`POST /api/v1/tools/files/create-zip`

Принимает multipart form data с двумя или более файлами. Поле настроек не требуется.

## Параметры {#parameters}

У этого инструмента нет настраиваемых параметров. Загрузите от 2 до 50 файлов любого типа для объединения.

## Пример запроса {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/create-zip \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf" \
  -F "file=@data.csv" \
  -F "file=@photo.jpg"
```

## Пример ответа {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/archive.zip",
  "originalSize": 3500000,
  "processedSize": 2800000
}
```

## Примечания {#notes}

- Требуется от 2 до 50 входных файлов.
- Принимается любой тип файла; ограничений на входной формат нет.
- Если несколько файлов имеют одинаковое имя, они автоматически различаются числовыми суффиксами.
- Выходной архив использует стандартное сжатие ZIP (deflate).
