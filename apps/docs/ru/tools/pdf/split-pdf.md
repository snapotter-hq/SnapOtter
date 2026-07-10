---
description: "Извлечение страниц или разделение PDF на части."
i18n_source_hash: 5c8d8041d219
i18n_provenance: human
i18n_output_hash: c7f633488dad
---

# Split PDF {#split-pdf}

Извлеките диапазон страниц в новый PDF или разделите документ на части по N страниц.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/split-pdf`

Принимает данные multipart form с PDF-файлом и JSON-полем `settings`.

## Parameters {#parameters}

| Параметр | Тип | Обязательный | По умолчанию | Описание |
|-----------|------|----------|---------|-------------|
| mode | string | Нет | `"range"` | Режим разделения: `range` или `every` |
| range | string | Когда режим `range` | - | Диапазон страниц в синтаксисе qpdf, например `"1-5,8,10-z"` |
| everyN | integer | Когда режим `every` | - | Разделить на части по N страниц (1-500) |

## Example Request {#example-request}

Извлечение определённых страниц:

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/split-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"mode": "range", "range": "1-5,8"}'
```

Разделение на части по 10 страниц:

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

- В режиме `range` возвращается один PDF, содержащий выбранные страницы.
- В режиме `every` результатом является ZIP-архив, содержащий отдельные части.
- Диапазоны страниц используют синтаксис qpdf: `1-5` для страниц с 1 по 5, `z` для последней страницы, а запятые для объединения диапазонов (например, `1-3,7,10-z`).
