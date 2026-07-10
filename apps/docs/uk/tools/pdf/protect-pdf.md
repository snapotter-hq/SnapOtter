---
description: "Додавання парольного захисту з шифруванням AES-256 до PDF."
i18n_source_hash: 869cfbc739ef
i18n_provenance: human
i18n_output_hash: 734c22101670
---

# Protect PDF {#protect-pdf}

Додавайте парольний захист до PDF за допомогою шифрування AES-256.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/protect-pdf`

Приймає багаточастинні (multipart) дані форми з файлом PDF та полем JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| userPassword | string | Yes | - | Пароль, необхідний для відкриття PDF (1-256 символів) |
| ownerPassword | string | No | Той самий, що й `userPassword` | Пароль власника для дозволів (1-256 символів) |

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

- Шифрування використовує AES-256.
- Якщо `ownerPassword` пропущено, він за замовчуванням дорівнює тому самому значенню, що й `userPassword`.
- Паролі приховуються в журналах аудиту.
- Зашифрований PDF вимагає пароля користувача для відкриття та пароля власника (якщо він відрізняється) для повних дозволів.
