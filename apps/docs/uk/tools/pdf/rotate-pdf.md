---
description: "Обертання сторінок у PDF на 90, 180 або 270 градусів."
i18n_source_hash: cc2acd091427
i18n_provenance: human
i18n_output_hash: 4a0c3ff42584
---

# Rotate PDF {#rotate-pdf}

Обертайте всі або вибрані сторінки в PDF на вказаний кут.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/rotate-pdf`

Приймає багаточастинні (multipart) дані форми з файлом PDF та полем JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| angle | integer | No | `90` | Кут обертання: `90`, `180` або `270` |
| range | string | No | `"1-z"` | Діапазон сторінок у синтаксисі qpdf, наприклад `"1-5,8"` (`"1-z"` = усі сторінки) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/rotate-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"angle": 90, "range": "1-3"}'
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

- Обертання виконується за годинниковою стрілкою.
- Діапазони сторінок використовують синтаксис qpdf: `1-5` для сторінок з 1 по 5, `z` для останньої сторінки, а коми поєднують діапазони.
- Діапазон за замовчуванням `"1-z"` обертає всі сторінки.
