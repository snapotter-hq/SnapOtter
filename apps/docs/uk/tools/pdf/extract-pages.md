---
description: "Витягання вибраних сторінок з PDF у новий документ."
i18n_source_hash: e4a8fad31e0f
i18n_provenance: human
i18n_output_hash: 765f61375149
---

# Extract Pages {#extract-pages}

Витягайте вибрані сторінки з PDF у новий, менший документ.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/extract-pages`

Приймає багаточастинні (multipart) дані форми з файлом PDF та полем JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| range | string | Yes | - | Діапазон сторінок у синтаксисі qpdf, наприклад `"1-5,8,10-z"` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/extract-pages \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"range": "1-5,8,10-z"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 3200000,
  "processedSize": 1100000
}
```

## Notes {#notes}

- Діапазони сторінок використовують синтаксис qpdf: `1-5` для сторінок з 1 по 5, `z` для останньої сторінки, а коми поєднують діапазони (наприклад `1-3,7,10-z`).
- Витягнуті сторінки зберігають своє початкове форматування, анотації та посилання.
