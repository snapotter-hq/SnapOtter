---
description: "Розділення CSV на менші файли за кількістю рядків."
i18n_source_hash: a35dce4a99a3
i18n_provenance: human
i18n_output_hash: 833bd35c2eca
---

# Розділення CSV {#split-csv}

Розділення великого файлу CSV або TSV на менші файли за кількістю рядків. Повертає архів ZIP із частинами.

## Кінцева точка API {#api-endpoint}

`POST /api/v1/tools/files/split-csv`

Приймає дані форми у форматі multipart із файлом CSV та полем JSON `settings`.

## Параметри {#parameters}

| Параметр | Тип | Обов'язковий | Типове значення | Опис |
|-----------|------|----------|---------|-------------|
| rowsPerFile | integer | Ні | `1000` | Кількість рядків даних на вихідний файл (1-1 000 000) |
| keepHeader | boolean | Ні | `true` | Повторювати рядок заголовка в кожному вихідному файлі |

## Приклад запиту {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/split-csv \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@large-dataset.csv" \
  -F 'settings={"rowsPerFile": 500, "keepHeader": true}'
```

## Приклад відповіді {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/large-dataset_parts.zip",
  "originalSize": 1048576,
  "processedSize": 1050000
}
```

## Примітки {#notes}

- Вихідні дані завжди є архівом ZIP, що містить розділені частини CSV, названі послідовно (наприклад, `part-1.csv`, `part-2.csv`).
- Коли `keepHeader` має значення `true`, кожна частина включає початковий рядок заголовка, тому кожен файл можна використовувати незалежно.
- Як вхідні дані приймаються файли CSV та TSV.
- Кількість рядків стосується лише рядків даних; рядок заголовка не враховується.
