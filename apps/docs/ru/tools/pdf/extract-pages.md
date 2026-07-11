---
description: "Извлечение выбранных страниц из PDF в новый документ."
i18n_source_hash: e4a8fad31e0f
i18n_provenance: human
i18n_output_hash: 2ae6117eebfd
---

# Extract Pages {#extract-pages}

Извлеките выбранные страницы из PDF в новый, меньший по размеру документ.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/extract-pages`

Принимает данные multipart form с PDF-файлом и JSON-полем `settings`.

## Parameters {#parameters}

| Параметр | Тип | Обязательный | По умолчанию | Описание |
|-----------|------|----------|---------|-------------|
| range | string | Да | - | Диапазон страниц в синтаксисе qpdf, например `"1-5,8,10-z"` |

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

- Диапазоны страниц используют синтаксис qpdf: `1-5` для страниц с 1 по 5, `z` для последней страницы, а запятые объединяют диапазоны (например, `1-3,7,10-z`).
- Извлечённые страницы сохраняют исходное форматирование, аннотации и ссылки.
