---
description: "Розміщення кількох сторінок PDF на аркуші (2-up, 4-up тощо)."
i18n_source_hash: 9dd82737cb72
i18n_provenance: human
i18n_output_hash: e73fe9651fd8
---

# N-up PDF {#n-up-pdf}

Розміщуйте кілька сторінок на аркуші, щоб заощадити папір під час друку, наприклад у розкладках 2-up або 4-up.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/nup-pdf`

Приймає багаточастинні (multipart) дані форми з файлом PDF та полем JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| perSheet | integer | No | `2` | Сторінок на аркуш: `2`, `3`, `4`, `8`, `9`, `12` або `16` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/nup-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"perSheet": 4}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2300000
}
```

## Notes {#notes}

- Сторінки розміщуються в порядку читання (зліва направо, зверху вниз).
- Розмір вихідної сторінки відповідає оригіналу; окремі сторінки масштабуються, щоб вкластися в сітку.
- 20-сторінковий документ з `perSheet: 4` дає 5-сторінковий результат.
