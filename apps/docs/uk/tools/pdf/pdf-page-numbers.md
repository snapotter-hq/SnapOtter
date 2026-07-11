---
description: "Додавання номерів сторінок на кожну сторінку PDF."
i18n_source_hash: 58342d6ac8d2
i18n_provenance: human
i18n_output_hash: 6e8b122c6dc2
---

# PDF Page Numbers {#pdf-page-numbers}

Додавайте номери сторінок у форматі «Page N of M» на кожну сторінку PDF.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-page-numbers`

Приймає багаточастинні (multipart) дані форми з файлом PDF та полем JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| position | string | No | `"bc"` | Розміщення номера сторінки: `bl`, `bc`, `br`, `tl`, `tc`, `tr` |
| fontSize | integer | No | `10` | Розмір шрифту в пунктах (6-24) |

### Position Values {#position-values}

- `tl` угорі ліворуч, `tc` угорі по центру, `tr` угорі праворуч
- `bl` внизу ліворуч, `bc` внизу по центру, `br` внизу праворуч

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-page-numbers \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"position": "bc", "fontSize": 12}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2470000
}
```

## Notes {#notes}

- Номери сторінок відображаються у форматі «Page 1 of 10».
- Номери додаються на кожну сторінку, включно з будь-якими наявними титульними або обкладинковими сторінками.
- Позиція за замовчуванням `"bc"` розміщує номери внизу по центру кожної сторінки.
