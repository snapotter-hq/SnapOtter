---
description: "Видалення конкретних сторінок з PDF."
i18n_source_hash: 003e460a047c
i18n_provenance: human
i18n_output_hash: 7115e2ab1265
---

# Remove Pages {#remove-pages}

Видаляйте конкретні сторінки з PDF, зберігаючи всі інші сторінки недоторканими.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/remove-pages`

Приймає багаточастинні (multipart) дані форми з файлом PDF та полем JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| pages | string | Yes | - | Діапазон сторінок для видалення в синтаксисі qpdf, наприклад `"3,5-7"` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/remove-pages \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"pages": "3,5-7"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 1800000
}
```

## Notes {#notes}

- Ви не можете видалити кожну сторінку з документа; має залишитися щонайменше одна сторінка.
- Діапазони сторінок використовують синтаксис qpdf: `3` для однієї сторінки, `5-7` для діапазону, а коми поєднують (наприклад `1,3,5-7`).
