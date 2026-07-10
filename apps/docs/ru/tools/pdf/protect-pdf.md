---
description: "Добавление защиты паролем с шифрованием AES-256 к PDF."
i18n_source_hash: 869cfbc739ef
i18n_provenance: human
i18n_output_hash: 2323b2502c4a
---

# Protect PDF {#protect-pdf}

Добавьте защиту паролем к PDF с помощью шифрования AES-256.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/protect-pdf`

Принимает данные multipart form с PDF-файлом и JSON-полем `settings`.

## Parameters {#parameters}

| Параметр | Тип | Обязательный | По умолчанию | Описание |
|-----------|------|----------|---------|-------------|
| userPassword | string | Да | - | Пароль, необходимый для открытия PDF (1-256 символов) |
| ownerPassword | string | Нет | Тот же, что `userPassword` | Пароль владельца для разрешений (1-256 символов) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/protect-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"userPassword": "s3cret", "ownerPassword": "0wn3r"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2500000
}
```

## Notes {#notes}

- Шифрование использует AES-256.
- Если `ownerPassword` пропущен, он по умолчанию принимает то же значение, что и `userPassword`.
- Пароли редактируются из журналов аудита.
- Зашифрованный PDF требует пароль пользователя для открытия и пароль владельца (если он отличается) для полных разрешений.
