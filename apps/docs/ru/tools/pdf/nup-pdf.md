---
description: "Размещение нескольких страниц PDF на одном листе (2-up, 4-up и т. д.)."
i18n_source_hash: 972bf997c95c
i18n_provenance: human
i18n_output_hash: d435e250f7fc
---

# Страниц на листе (N-up) {#n-up-pdf}

Разместите несколько страниц на одном листе, чтобы экономить бумагу при печати, например в раскладках 2-up или 4-up.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/nup-pdf`

Принимает данные multipart form с PDF-файлом и JSON-полем `settings`.

## Parameters {#parameters}

| Параметр | Тип | Обязательный | По умолчанию | Описание |
|-----------|------|----------|---------|-------------|
| perSheet | integer | Нет | `2` | Страниц на лист: `2`, `3`, `4`, `8`, `9`, `12` или `16` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/nup-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"perSheet": 4}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2300000
}
```

## Notes {#notes}

- Страницы располагаются в порядке чтения (слева направо, сверху вниз).
- Размер выходной страницы совпадает с исходным; отдельные страницы масштабируются для размещения в сетке.
- Документ из 20 страниц с `perSheet: 4` даёт вывод из 5 страниц.
