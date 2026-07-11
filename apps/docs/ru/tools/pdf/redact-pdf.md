---
description: "Безвозвратное удаление вхождений текста из PDF (проверенная настоящая редакция)."
i18n_source_hash: 296ad2a701b2
i18n_provenance: human
i18n_output_hash: 65b7ea7ba721
---

# Redact PDF {#redact-pdf}

Безвозвратно удаляйте указанные вхождения текста из PDF с помощью проверенной настоящей редакции. Отредактированный текст полностью удаляется из файла, а не просто закрывается чёрным прямоугольником.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/redact-pdf`

Принимает данные multipart form с PDF-файлом и JSON-полем `settings`.

## Parameters {#parameters}

| Параметр | Тип | Обязательный | По умолчанию | Описание |
|-----------|------|----------|---------|-------------|
| terms | string[] | Да | - | Текстовые строки для редакции (1-50 терминов, каждый до 200 символов) |
| caseSensitive | boolean | Нет | `false` | Учитывается ли регистр при сопоставлении |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/redact-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@contract.pdf" \
  -F 'settings={"terms": ["John Doe", "555-0123"], "caseSensitive": false}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/contract.pdf",
  "originalSize": 245000,
  "processedSize": 243000,
  "found": 7
}
```

## Notes {#notes}

- Принимаемый входной формат: `.pdf`.
- Это быстрый (синхронный) инструмент, который возвращает результат напрямую.
- Выполняется настоящая редакция: совпавший текст удаляется из потока содержимого PDF, а не просто скрывается визуально.
- Поле `found` в ответе указывает, сколько вхождений было отредактировано.
- В одном запросе можно отредактировать до 50 терминов.
