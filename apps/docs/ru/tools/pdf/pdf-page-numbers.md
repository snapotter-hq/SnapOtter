---
description: "Добавление номеров страниц на каждую страницу PDF."
i18n_source_hash: 58342d6ac8d2
i18n_provenance: human
i18n_output_hash: fa6d6a202ce4
---

# PDF Page Numbers {#pdf-page-numbers}

Добавьте номера страниц вида «Page N of M» на каждую страницу PDF.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-page-numbers`

Принимает данные multipart form с PDF-файлом и JSON-полем `settings`.

## Parameters {#parameters}

| Параметр | Тип | Обязательный | По умолчанию | Описание |
|-----------|------|----------|---------|-------------|
| position | string | Нет | `"bc"` | Расположение номера страницы: `bl`, `bc`, `br`, `tl`, `tc`, `tr` |
| fontSize | integer | Нет | `10` | Размер шрифта в пунктах (6-24) |

### Position Values {#position-values}

- `tl` вверху слева, `tc` вверху по центру, `tr` вверху справа
- `bl` внизу слева, `bc` внизу по центру, `br` внизу справа

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

- Номера страниц отображаются в формате «Page 1 of 10».
- Номера добавляются на каждую страницу, включая любые существующие титульные или обложечные страницы.
- Положение по умолчанию `"bc"` размещает номера внизу по центру каждой страницы.
