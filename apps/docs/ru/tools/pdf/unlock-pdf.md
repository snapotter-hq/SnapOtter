---
description: "Удаление защиты паролем из PDF."
i18n_source_hash: 14f5165d185c
i18n_provenance: human
i18n_output_hash: 0d70f319dab0
---

# Unlock PDF {#unlock-pdf}

Удалите защиту паролем из зашифрованного PDF, указав правильный пароль.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/unlock-pdf`

Принимает данные multipart form с PDF-файлом и JSON-полем `settings`.

## Parameters {#parameters}

| Параметр | Тип | Обязательный | По умолчанию | Описание |
|-----------|------|----------|---------|-------------|
| password | string | Да | - | Пароль для расшифровки PDF (1-256 символов) |

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

- Необходимо указать правильный пароль; неверный пароль вернёт ошибку 400.
- Для расшифровки подойдёт пароль пользователя или пароль владельца.
- Пароли редактируются из журналов аудита.
