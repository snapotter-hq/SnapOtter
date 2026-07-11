---
description: "Об'єднання кількох PDF в один документ."
i18n_source_hash: e82e389cb8b6
i18n_provenance: human
i18n_output_hash: 99ec6a975387
---

# Merge PDFs {#merge-pdfs}

Об'єднуйте два або більше файлів PDF в один документ, зберігаючи порядок сторінок кожного вхідного файлу.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/merge-pdf`

Приймає багаточастинні (multipart) дані форми з двома або більше файлами PDF. Поле `settings` не потрібне.

## Parameters {#parameters}

Цей інструмент не має параметрів налаштувань. Просто завантажте два або більше файлів PDF.

| Constraint | Value |
|------------|-------|
| Minimum files | 2 |
| Maximum files | 20 |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/merge-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document1.pdf" \
  -F "file=@document2.pdf" \
  -F "file=@document3.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/merged.pdf",
  "originalSize": 4500000,
  "processedSize": 4200000
}
```

## Notes {#notes}

- Файли об'єднуються в тому порядку, в якому їх завантажено.
- Потрібно щонайменше два файли PDF; запит завершиться помилкою 400, якщо надано менше.
- Максимальна кількість вхідних файлів становить 20.
- Зашифровані PDF потрібно розблокувати перед об'єднанням.
