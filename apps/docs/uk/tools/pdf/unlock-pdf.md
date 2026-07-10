---
description: "Видалення парольного захисту з PDF."
i18n_source_hash: 14f5165d185c
i18n_provenance: human
i18n_output_hash: 024ae10ec494
---

# Unlock PDF {#unlock-pdf}

Видаляйте парольний захист із зашифрованого PDF, надавши правильний пароль.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/unlock-pdf`

Приймає багаточастинні (multipart) дані форми з файлом PDF та полем JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| password | string | Yes | - | Пароль для розшифрування PDF (1-256 символів) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/unlock-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"password": "s3cret"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2500000,
  "processedSize": 2450000
}
```

## Notes {#notes}

- Потрібно надати правильний пароль; неправильний пароль повертає помилку 400.
- Для розшифрування підійде або пароль користувача, або пароль власника.
- Паролі приховуються в журналах аудиту.
