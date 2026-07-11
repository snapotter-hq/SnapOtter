---
description: "Перевпорядкування сторінок у PDF з явним порядком сторінок."
i18n_source_hash: e961fc895b4b
i18n_provenance: human
i18n_output_hash: e114c27d621e
---

# Organize PDF {#organize-pdf}

Перевпорядковуйте сторінки в PDF, вказавши бажану послідовність сторінок.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/organize-pdf`

Приймає багаточастинні (multipart) дані форми з файлом PDF та полем JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| order | string | Yes | - | Бажаний порядок сторінок у синтаксисі qpdf, наприклад `"3,1,2,5-z"` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/organize-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"order": "3,1,2,5-z"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2450000
}
```

## Notes {#notes}

- Діапазони сторінок використовують синтаксис qpdf: `3,1,2` перевпорядковує перші три сторінки, а `5-z` додає сторінки з 5 по останню.
- Сторінки можна дублювати, перелічивши їх кілька разів (наприклад `"1,1,2,3"` дублює сторінку 1).
- Сторінки, не перелічені в рядку порядку, пропускаються у вихідному файлі.
