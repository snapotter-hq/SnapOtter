---
description: "Обрізання всіх сторінок PDF з рівномірним полем."
i18n_source_hash: ffa1a2cee08d
i18n_provenance: human
i18n_output_hash: 441ee85292cb
---

# Crop PDF {#crop-pdf}

Обрізайте всі сторінки PDF, застосовуючи рівномірне поле, яке однаково обтинає вміст з кожного краю.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/crop-pdf`

Приймає багаточастинні (multipart) дані форми з файлом PDF та полем JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| margin | number | No | `20` | Рівномірне поле обрізки в пунктах (0-2000) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/crop-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"margin": 50}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2440000
}
```

## Notes {#notes}

- Значення поля вказується в пунктах PDF (1 пункт = 1/72 дюйма).
- Однакове поле застосовується до всіх чотирьох країв кожної сторінки.
- Поле `0` видаляє всі наявні поля обрізки, показуючи повний медіабокс.
