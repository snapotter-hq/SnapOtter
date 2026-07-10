---
description: "Перетворення всіх кольорів у PDF на відтінки сірого."
i18n_source_hash: f327addb32d6
i18n_provenance: human
i18n_output_hash: cf42301b6a5b
---

# Grayscale PDF {#grayscale-pdf}

Перетворюйте всі кольори в PDF на відтінки сірого, отримуючи чорно-білу версію документа.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/grayscale-pdf`

Приймає багаточастинні (multipart) дані форми з файлом PDF. Поле `settings` не потрібне.

## Parameters {#parameters}

Цей інструмент не має параметрів налаштувань. Завантажте файл PDF напряму.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/grayscale-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 3200000,
  "processedSize": 2800000
}
```

## Notes {#notes}

- Усі колірні простори (RGB, CMYK) перетворюються на відтінки сірого, включно з вбудованими зображеннями, векторною графікою та текстом.
- Вихідний файл часто менший за оригінал, оскільки дані у відтінках сірого потребують менше байтів на піксель.
