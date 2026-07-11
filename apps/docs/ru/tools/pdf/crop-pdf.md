---
description: "Обрезка всех страниц PDF с равномерным полем."
i18n_source_hash: ffa1a2cee08d
i18n_provenance: human
i18n_output_hash: 5320aac7a3f2
---

# Crop PDF {#crop-pdf}

Обрежьте все страницы PDF, применив равномерное поле и отсекая содержимое от каждого края одинаково.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/crop-pdf`

Принимает данные multipart form с PDF-файлом и JSON-полем `settings`.

## Parameters {#parameters}

| Параметр | Тип | Обязательный | По умолчанию | Описание |
|-----------|------|----------|---------|-------------|
| margin | number | Нет | `20` | Равномерное поле обрезки в пунктах (0-2000) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/crop-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"margin": 50}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2440000
}
```

## Notes {#notes}

- Значение поля задаётся в пунктах PDF (1 пункт = 1/72 дюйма).
- Одно и то же поле применяется ко всем четырём краям каждой страницы.
- Поле, равное `0`, убирает все существующие поля обрезки, показывая полный media box.
