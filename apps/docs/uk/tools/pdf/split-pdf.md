---
description: "Витягання сторінок або розділення PDF на частини."
i18n_source_hash: 5c8d8041d219
i18n_provenance: human
i18n_output_hash: 27ef41b009c3
---

# Split PDF {#split-pdf}

Витягуйте діапазон сторінок у новий PDF або розділяйте документ на частини по N сторінок.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/split-pdf`

Приймає багаточастинні (multipart) дані форми з файлом PDF та полем JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | No | `"range"` | Режим розділення: `range` або `every` |
| range | string | Коли режим `range` | - | Діапазон сторінок у синтаксисі qpdf, наприклад `"1-5,8,10-z"` |
| everyN | integer | Коли режим `every` | - | Розділити на частини по N сторінок (1-500) |

## Example Request {#example-request}

Витягання конкретних сторінок:

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/split-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"mode": "range", "range": "1-5,8"}'
```

Розділення на частини по 10 сторінок:

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/split-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"mode": "every", "everyN": 10}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 980000
}
```

## Notes {#notes}

- У режимі `range` повертається один PDF, що містить вибрані сторінки.
- У режимі `every` результатом є архів ZIP, що містить окремі частини.
- Діапазони сторінок використовують синтаксис qpdf: `1-5` для сторінок з 1 по 5, `z` для останньої сторінки, а коми поєднують діапазони (наприклад `1-3,7,10-z`).
