---
description: "Витягання простого тексту з PDF."
i18n_source_hash: 15a7bc1cdf8f
i18n_provenance: human
i18n_output_hash: e4df6199638b
---

# PDF to Text {#pdf-to-text}

Витягайте весь читабельний простий текст із документа PDF у текстовий файл.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-to-text`

Приймає багаточастинні (multipart) дані форми з файлом PDF.

## Parameters {#parameters}

Цей інструмент не має налаштовуваних параметрів. Завантажте PDF, і його текстовий вміст буде витягнуто.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-text \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/report.txt",
  "originalSize": 520000,
  "processedSize": 14300,
  "chars": 14300
}
```

## Notes {#notes}

- Прийнятний формат вхідних даних: `.pdf`.
- Це швидкий (синхронний) інструмент, який повертає результат напряму.
- Поле `chars` у відповіді вказує кількість витягнутих символів.
- Витягається лише цифровий вбудований текст. Для сканованих документів або PDF на основі зображень використовуйте натомість інструмент [PDF OCR](./ocr-pdf).
