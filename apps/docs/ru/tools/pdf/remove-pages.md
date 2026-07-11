---
description: "Удаление определённых страниц из PDF."
i18n_source_hash: 003e460a047c
i18n_provenance: human
i18n_output_hash: 4970420c2a80
---

# Remove Pages {#remove-pages}

Удалите определённые страницы из PDF, сохранив все остальные страницы нетронутыми.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/remove-pages`

Принимает данные multipart form с PDF-файлом и JSON-полем `settings`.

## Parameters {#parameters}

| Параметр | Тип | Обязательный | По умолчанию | Описание |
|-----------|------|----------|---------|-------------|
| pages | string | Да | - | Диапазон страниц для удаления в синтаксисе qpdf, например `"3,5-7"` |

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

- Нельзя удалить все страницы документа; хотя бы одна страница должна остаться.
- Диапазоны страниц используют синтаксис qpdf: `3` для одной страницы, `5-7` для диапазона, а запятые для объединения (например, `1,3,5-7`).
