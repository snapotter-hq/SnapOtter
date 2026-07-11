---
description: "Переупорядочивание страниц PDF с явным порядком страниц."
i18n_source_hash: e961fc895b4b
i18n_provenance: human
i18n_output_hash: 5b8332f75c03
---

# Organize PDF {#organize-pdf}

Переупорядочьте страницы PDF, указав нужную последовательность страниц.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/organize-pdf`

Принимает данные multipart form с PDF-файлом и JSON-полем `settings`.

## Parameters {#parameters}

| Параметр | Тип | Обязательный | По умолчанию | Описание |
|-----------|------|----------|---------|-------------|
| order | string | Да | - | Нужный порядок страниц в синтаксисе qpdf, например `"3,1,2,5-z"` |

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

- Диапазоны страниц используют синтаксис qpdf: `3,1,2` переупорядочивает первые три страницы, а `5-z` добавляет страницы с 5 по последнюю.
- Страницы можно дублировать, перечислив их более одного раза (например, `"1,1,2,3"` дублирует страницу 1).
- Страницы, не указанные в строке порядка, исключаются из вывода.
