---
description: "Остаточне видалення входжень тексту з PDF (перевірене справжнє редагування)."
i18n_source_hash: 296ad2a701b2
i18n_provenance: human
i18n_output_hash: 6eafca085bc5
---

# Redact PDF {#redact-pdf}

Остаточно видаляйте вказані входження тексту з PDF за допомогою перевіреного справжнього редагування. Відредагований текст повністю видаляється з файлу, а не просто закривається чорним прямокутником.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/redact-pdf`

Приймає багаточастинні (multipart) дані форми з файлом PDF та полем JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| terms | string[] | Yes | - | Текстові рядки для редагування (1-50 термінів, кожен до 200 символів) |
| caseSensitive | boolean | No | `false` | Чи враховується регістр під час зіставлення |

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

- Прийнятний формат вхідних даних: `.pdf`.
- Це швидкий (синхронний) інструмент, який повертає результат напряму.
- Виконується справжнє редагування: зіставлений текст видаляється з потоку вмісту PDF, а не просто візуально приховується.
- Поле `found` у відповіді вказує, скільки входжень було відредаговано.
- В одному запиті можна відредагувати до 50 термінів.
