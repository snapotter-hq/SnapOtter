---
description: "Чтение и запись метаданных документа PDF."
i18n_source_hash: b2eaebf7467f
i18n_provenance: human
i18n_output_hash: f97c82766a73
---

# PDF Metadata {#pdf-metadata}

Читайте и обновляйте поля метаданных документа PDF, такие как заголовок, автор, тема и ключевые слова. Если настройки не переданы, существующие метаданные возвращаются без изменений.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-metadata`

Принимает данные multipart form с PDF-файлом и необязательным JSON-полем `settings`.

## Parameters {#parameters}

| Параметр | Тип | Обязательный | По умолчанию | Описание |
|-----------|------|----------|---------|-------------|
| title | string | Нет | - | Заголовок документа (не более 500 символов) |
| author | string | Нет | - | Автор документа (не более 500 символов) |
| subject | string | Нет | - | Тема документа (не более 500 символов) |
| keywords | string | Нет | - | Ключевые слова документа (не более 500 символов) |

Все параметры необязательны. Пропущенные поля остаются без изменений.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf" \
  -F 'settings={"title": "Q2 Report", "author": "Finance Team"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/report.pdf",
  "originalSize": 245000,
  "processedSize": 245200,
  "metadata": {
    "title": "Q2 Report",
    "author": "Finance Team",
    "subject": "",
    "keywords": ""
  }
}
```

## Notes {#notes}

- Принимаемый входной формат: `.pdf`.
- Это быстрый (синхронный) инструмент, который возвращает результат напрямую.
- Поле `metadata` в ответе содержит итоговые метаданные после всех обновлений.
- Чтобы прочитать метаданные без изменения, пропустите поле `settings` или отправьте пустой объект.
- Каждое поле метаданных ограничено 500 символами.
