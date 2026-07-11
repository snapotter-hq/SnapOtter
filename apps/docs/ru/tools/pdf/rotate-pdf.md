---
description: "Поворот страниц PDF на 90, 180 или 270 градусов."
i18n_source_hash: cc2acd091427
i18n_provenance: human
i18n_output_hash: 721a7cb8c4e2
---

# Rotate PDF {#rotate-pdf}

Поверните все или выбранные страницы PDF на указанный угол.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/rotate-pdf`

Принимает данные multipart form с PDF-файлом и JSON-полем `settings`.

## Parameters {#parameters}

| Параметр | Тип | Обязательный | По умолчанию | Описание |
|-----------|------|----------|---------|-------------|
| angle | integer | Нет | `90` | Угол поворота: `90`, `180` или `270` |
| range | string | Нет | `"1-z"` | Диапазон страниц в синтаксисе qpdf, например `"1-5,8"` (`"1-z"` = все страницы) |

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

- Поворот выполняется по часовой стрелке.
- Диапазоны страниц используют синтаксис qpdf: `1-5` для страниц с 1 по 5, `z` для последней страницы, а запятые для объединения диапазонов.
- Диапазон по умолчанию `"1-z"` поворачивает все страницы.
